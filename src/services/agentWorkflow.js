import { applyPolicy } from '../../server/policy.js'

const actionable = new Set(['reply', 'qualify', 'ask_more'])

export function canApprove(state) {
  const decision = state?.decision
  return state?.status === 'Awaiting approval' && !state.pending && !state.humanControlled &&
    actionable.has(decision?.action) && decision.requiresApproval === false &&
    typeof decision.reply === 'string' && decision.reply.trim().length > 0 &&
    decision.confidence >= 0.75
}

function readyState() {
  return { status: 'Ready', decision: null, pending: false, humanControlled: false, entryId: null, error: '' }
}

// One in-memory workflow per connected browser session; state is isolated by chat.
export class AgentWorkflow {
  constructor({ decide, send, onChange = () => {} }) {
    this.decide = decide
    this.send = send
    this.onChange = onChange
    this.states = new Map()
    this.requests = new Map()
    this.seenMessages = new Set()
    this.auditTrail = []
    this.approvals = new Set()
  }

  getState(chatId) {
    return this.states.get(chatId) || readyState()
  }

  getAudit(chatId) {
    return this.auditTrail.filter((entry) => entry.chatId === chatId)
  }

  update(chatId, state) {
    this.states.set(chatId, state)
    this.onChange()
  }

  entry(id) {
    return this.auditTrail.find((entry) => entry.id === id)
  }

  recordOperator(entry, action, resultingAction) {
    if (!entry) return
    entry.operatorAction = action
    entry.resultingAction = resultingAction
    entry.operatorActions.push({ timestamp: new Date().toISOString(), action, resultingAction })
  }

  cancelRequest(chatId, resultingAction) {
    const request = this.requests.get(chatId)
    if (request) {
      this.requests.delete(chatId)
      request.controller.abort()
    }
    const state = this.getState(chatId)
    const previous = this.entry(state.entryId)
    if (previous && (state.pending || state.status === 'Awaiting approval' || state.status === 'Handoff')) {
      previous.resultingAction = resultingAction
    }
  }

  async receive(incoming, conversation = [], signal) {
    const { chatId, id, text } = incoming
    const key = JSON.stringify([chatId, id])
    if (this.seenMessages.has(key) || signal?.aborted) return
    this.seenMessages.add(key)
    const current = this.getState(chatId)
    if (current.humanControlled) return
    this.cancelRequest(chatId, 'superseded')
    const entry = {
      id: key,
      timestamp: new Date().toISOString(),
      chatId,
      incomingMessage: text,
      decision: null,
      confidence: null,
      action: null,
      reason: '',
      requiresApproval: true,
      operatorAction: 'pending',
      resultingAction: 'pending',
      operatorActions: [],
    }
    this.auditTrail.push(entry)
    const controller = new AbortController()
    const requestSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
    const request = { controller, entryId: key }
    this.requests.set(chatId, request)
    this.update(chatId, { ...readyState(), pending: true, entryId: key })
    let decision
    try {
      const result = await this.decide({ message: text, chatId, conversation }, requestSignal)
      decision = applyPolicy(result, { message: text, conversation })
    } catch {
      if (requestSignal.aborted && this.requests.get(chatId) !== request) return
      decision = {
        action: 'handoff', reply: '', leadScore: 0, confidence: 0,
        reason: 'Agent service unavailable or returned unreadable JSON. A human must handle this conversation.',
        requiresApproval: true,
      }
    }
    if (requestSignal.aborted && this.requests.get(chatId) === request) {
      decision = {
        action: 'handoff', reply: '', leadScore: 0, confidence: 0,
        reason: 'Agent request was cancelled. A human must handle this conversation.',
        requiresApproval: true,
      }
    }
    Object.assign(entry, {
      decision,
      confidence: decision.confidence,
      action: decision.action,
      reason: decision.reason,
      requiresApproval: decision.requiresApproval,
    })
    // An older result may finish after takeover, a manual reply or a newer message.
    if (this.requests.get(chatId) !== request) return
    this.requests.delete(chatId)
    entry.resultingAction = decision.action === 'handoff' ? 'handoff' : 'suggested'
    this.update(chatId, {
      ...readyState(), entryId: key, decision,
      status: decision.action === 'handoff' ? 'Handoff' : 'Awaiting approval',
    })
  }

  async approve(chatId) {
    const current = this.getState(chatId)
    if (!canApprove(current) || this.approvals.has(chatId)) return false
    const entry = this.entry(current.entryId)
    const checked = applyPolicy(current.decision, { message: entry.incomingMessage })
    if (!actionable.has(checked.action) || checked.requiresApproval || !checked.reply.trim()) {
      entry.decision = checked
      Object.assign(entry, {
        action: checked.action, confidence: checked.confidence, reason: checked.reason,
        requiresApproval: checked.requiresApproval, resultingAction: 'handoff',
      })
      this.update(chatId, { ...current, decision: checked, status: 'Handoff' })
      return false
    }
    this.approvals.add(chatId)
    this.recordOperator(entry, 'approve', 'sending')
    this.update(chatId, { ...current, pending: true, error: '' })
    let sent = false
    try {
      sent = await this.send(chatId, checked.reply) === true
    } catch {
      sent = false
    } finally {
      this.approvals.delete(chatId)
    }
    const resultingAction = sent ? 'sent' : 'send_failed'
    // Complete the approval event without overwriting a subsequent takeover event.
    const approvalEvent = entry.operatorActions.findLast((event) => event.action === 'approve')
    approvalEvent.resultingAction = resultingAction
    if (entry.operatorAction === 'approve') entry.resultingAction = resultingAction
    const latest = this.getState(chatId)
    if (latest.entryId !== current.entryId || latest.humanControlled) {
      this.onChange()
      return sent
    }
    this.update(chatId, {
      ...latest, pending: false,
      status: sent ? 'Approved' : 'Awaiting approval',
      error: sent ? '' : 'Reply was not sent. Retry approval or send a message manually.',
    })
    return sent
  }

  takeOver(chatId) {
    const current = this.getState(chatId)
    if (current.humanControlled || this.approvals.has(chatId)) return
    this.cancelRequest(chatId, 'human_controlled')
    this.recordOperator(this.entry(current.entryId), 'take_over', 'human_controlled')
    this.update(chatId, { ...current, humanControlled: true, pending: false, status: 'Human takeover', error: '' })
  }

  manualReply(chatId) {
    const current = this.getState(chatId)
    this.cancelRequest(chatId, 'manual_reply')
    this.recordOperator(this.entry(current.entryId), 'manual_reply', 'manual_reply')
    this.update(chatId, {
      ...readyState(), humanControlled: current.humanControlled,
      status: current.humanControlled ? 'Human takeover' : 'Ready',
    })
  }
}
