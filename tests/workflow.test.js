import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentWorkflow } from '../src/services/agentWorkflow.js'
import { requestAgentDecision } from '../src/services/agentApi.js'

const safeDecision = (overrides = {}) => ({
  action: 'reply',
  reply: 'Friday works. What time would you prefer?',
  leadScore: 72,
  confidence: 0.91,
  reason: 'The customer wants to book.',
  requiresApproval: false,
  ...overrides,
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function setup({ decide = async () => safeDecision(), send } = {}) {
  const sent = []
  const changes = []
  const workflow = new AgentWorkflow({
    decide,
    send: send ?? (async (chatId, reply) => {
      sent.push({ chatId, reply })
      return true
    }),
    onChange: (...args) => changes.push(args),
  })
  return { workflow, sent, changes }
}

const incoming = (id = 'incoming-1', chatId = '15550000001@c.us', text = "I'd like to book it for Friday.") => ({ id, chatId, text })

test('a conversation starts Ready, with no pending decision or human takeover', () => {
  const { workflow } = setup()
  assert.deepEqual(workflow.getState('new-chat'), {
    status: 'Ready',
    decision: null,
    pending: false,
    humanControlled: false,
    entryId: null,
    error: '',
  })
  assert.deepEqual(workflow.getAudit('new-chat'), [])
})

for (const action of ['reply', 'qualify', 'ask_more']) {
  test(`Approve sends an allowed ${action} suggestion exactly once`, async () => {
    const decision = safeDecision({ action })
    const { workflow, sent } = setup({ decide: async () => decision })
    const message = incoming()
    await workflow.receive(message)

    assert.equal(workflow.getState(message.chatId).status, 'Awaiting approval')
    assert.equal(sent.length, 0, 'receiving a decision must not send a reply')
    assert.equal(await workflow.approve(message.chatId), true)
    assert.equal(workflow.getState(message.chatId).status, 'Approved')
    assert.deepEqual(sent, [{ chatId: message.chatId, reply: decision.reply }])
    assert.equal(await workflow.approve(message.chatId), false)
    assert.equal(sent.length, 1)

    const entry = workflow.getAudit(message.chatId)[0]
    assert.equal(entry.operatorAction, 'approve')
    assert.equal(entry.resultingAction, 'sent')
  })
}

for (const [scenario, decision] of [
  ['handoff', safeDecision({ action: 'handoff', requiresApproval: true })],
  ['invalid action', safeDecision({ action: 'send_money' })],
  ['low confidence', safeDecision({ confidence: 0.74 })],
  ['requires approval', safeDecision({ requiresApproval: true })],
  ['missing reply', safeDecision({ reply: '' })],
]) {
  test(`${scenario} never becomes an approvable outgoing reply`, async () => {
    const { workflow, sent } = setup({ decide: async () => decision })
    const message = incoming()
    await workflow.receive(message)
    const state = workflow.getState(message.chatId)
    assert.equal(state.status, 'Handoff')
    assert.equal(state.decision.action, 'handoff')
    assert.equal(state.decision.requiresApproval, true)
    assert.equal(await workflow.approve(message.chatId), false)
    assert.deepEqual(sent, [])
  })
}

test('risky incoming topics require handoff even when a service supplies a safe-looking reply', async () => {
  const { workflow, sent } = setup()
  const message = incoming('risky-1', 'risky-chat', "Refund me immediately or I'll sue.")
  await workflow.receive(message)
  assert.equal(workflow.getState(message.chatId).status, 'Handoff')
  assert.equal(await workflow.approve(message.chatId), false)
  assert.deepEqual(sent, [])
})

test('Take over records human control and sends nothing, including on future incoming messages', async () => {
  let decisions = 0
  const { workflow, sent } = setup({
    decide: async () => {
      decisions += 1
      return safeDecision()
    },
  })
  const message = incoming()
  await workflow.receive(message)
  workflow.takeOver(message.chatId)

  assert.equal(workflow.getState(message.chatId).status, 'Human takeover')
  assert.equal(workflow.getState(message.chatId).humanControlled, true)
  assert.equal(await workflow.approve(message.chatId), false)
  await workflow.receive(incoming('incoming-2', message.chatId, 'Are you there?'))
  assert.equal(decisions, 1)
  assert.equal(workflow.getState(message.chatId).status, 'Human takeover')
  assert.deepEqual(sent, [])

  const entry = workflow.getAudit(message.chatId)[0]
  assert.equal(entry.operatorAction, 'take_over')
  assert.equal(entry.resultingAction, 'human_controlled')
})

test('Take over cancels a pending decision and ignores its later completion', async () => {
  const pending = deferred()
  let decisionSignal
  const { workflow, sent } = setup({ decide: (_request, signal) => {
    decisionSignal = signal
    return pending.promise
  } })
  const message = incoming()
  const receiving = workflow.receive(message)
  assert.equal(workflow.getState(message.chatId).pending, true)
  workflow.takeOver(message.chatId)
  assert.equal(decisionSignal.aborted, true)
  pending.resolve(safeDecision())
  await receiving
  assert.equal(workflow.getState(message.chatId).status, 'Human takeover')
  assert.equal(workflow.getState(message.chatId).pending, false)
  assert.equal(await workflow.approve(message.chatId), false)
  assert.deepEqual(sent, [])
})

test('chat state, approvals, and human control remain isolated by chatId', async () => {
  const { workflow, sent } = setup()
  await workflow.receive(incoming('one', 'chat-a'))
  await workflow.receive(incoming('one', 'chat-b'))
  workflow.takeOver('chat-a')
  assert.equal(await workflow.approve('chat-b'), true)
  assert.equal(workflow.getState('chat-a').status, 'Human takeover')
  assert.equal(workflow.getState('chat-b').status, 'Approved')
  assert.deepEqual(sent, [{ chatId: 'chat-b', reply: safeDecision().reply }])
  assert.equal(workflow.getAudit('chat-a').length, 1)
  assert.equal(workflow.getAudit('chat-b').length, 1)
})

test('duplicate GREEN-API message ids do not request another decision or add audit records', async () => {
  let calls = 0
  const { workflow } = setup({ decide: async () => {
    calls += 1
    return safeDecision()
  } })
  const message = incoming()
  await workflow.receive(message)
  await workflow.receive(message)
  assert.equal(calls, 1)
  assert.equal(workflow.getAudit(message.chatId).length, 1)
})

test('the latest incoming message invalidates an earlier suggestion while its decision is pending', async () => {
  const second = deferred()
  const { workflow, sent } = setup({ decide: async ({ message }) => {
    return message === 'Second question' ? second.promise : safeDecision({ reply: 'Old reply' })
  } })
  const chatId = 'latest-chat'
  await workflow.receive(incoming('first', chatId, 'First question'))
  const receiving = workflow.receive(incoming('second', chatId, 'Second question'))
  assert.equal(workflow.getState(chatId).pending, true)
  assert.equal(workflow.getState(chatId).decision, null)
  assert.equal(await workflow.approve(chatId), false)
  assert.deepEqual(sent, [])
  second.resolve(safeDecision({ reply: 'Newest reply' }))
  await receiving
  assert.equal(await workflow.approve(chatId), true)
  assert.deepEqual(sent, [{ chatId, reply: 'Newest reply' }])
  assert.equal(workflow.getAudit(chatId).length, 2)
})

test('out-of-order decisions cannot replace the latest message decision', async () => {
  const first = deferred()
  const second = deferred()
  const { workflow } = setup({ decide: ({ message }) => message === 'First' ? first.promise : second.promise })
  const chatId = 'race-chat'
  const receivingFirst = workflow.receive(incoming('first', chatId, 'First'))
  const receivingSecond = workflow.receive(incoming('second', chatId, 'Second'))
  second.resolve(safeDecision({ reply: 'Second response' }))
  await receivingSecond
  first.resolve(safeDecision({ reply: 'First response' }))
  await receivingFirst
  assert.equal(workflow.getState(chatId).decision.reply, 'Second response')
  assert.equal(workflow.getState(chatId).status, 'Awaiting approval')
  assert.equal(workflow.getAudit(chatId).length, 2, 'superseded decisions remain auditable')
})

test('a pending approval prevents a double click from sending twice', async () => {
  const sending = deferred()
  let sends = 0
  const { workflow } = setup({ send: () => {
    sends += 1
    return sending.promise
  } })
  const message = incoming()
  await workflow.receive(message)
  const firstApproval = workflow.approve(message.chatId)
  assert.equal(await workflow.approve(message.chatId), false)
  assert.equal(sends, 1)
  sending.resolve(true)
  assert.equal(await firstApproval, true)
  assert.equal(workflow.getState(message.chatId).status, 'Approved')
})

test('Take over cannot retroactively cancel a reply already submitted for approval', async () => {
  const sending = deferred()
  const { workflow } = setup({ send: () => sending.promise })
  const message = incoming()
  await workflow.receive(message)
  const approving = workflow.approve(message.chatId)
  workflow.takeOver(message.chatId)
  assert.equal(workflow.getState(message.chatId).humanControlled, false)
  sending.resolve(true)
  await approving
  assert.equal(workflow.getState(message.chatId).status, 'Approved')
})

test('a rejected send can be retried only by another explicit approval', async () => {
  let sends = 0
  const { workflow } = setup({ send: async () => {
    sends += 1
    return sends > 1
  } })
  const message = incoming()
  await workflow.receive(message)
  assert.equal(await workflow.approve(message.chatId), false)
  assert.equal(workflow.getState(message.chatId).status, 'Awaiting approval')
  assert.equal(sends, 1)
  assert.notEqual(workflow.getAudit(message.chatId)[0].resultingAction, 'sent')
  assert.equal(await workflow.approve(message.chatId), true)
  assert.equal(sends, 2)
  assert.equal(workflow.getAudit(message.chatId)[0].resultingAction, 'sent')
  assert.equal(workflow.getAudit(message.chatId)[0].operatorActions.length, 2)
})

test('a thrown send failure does not mark the decision approved', async () => {
  const { workflow } = setup({ send: async () => { throw new Error('GREEN-API unavailable') } })
  const message = incoming()
  await workflow.receive(message)
  assert.equal(await workflow.approve(message.chatId), false)
  assert.equal(workflow.getState(message.chatId).status, 'Awaiting approval')
  assert.notEqual(workflow.getAudit(message.chatId)[0].resultingAction, 'sent')
})

test('manual reply invalidates an agent suggestion without invoking the agent sender', async () => {
  const { workflow, sent } = setup()
  const message = incoming()
  await workflow.receive(message)
  workflow.manualReply(message.chatId)
  assert.equal(workflow.getState(message.chatId).status, 'Ready')
  assert.equal(workflow.getState(message.chatId).decision, null)
  assert.equal(await workflow.approve(message.chatId), false)
  assert.deepEqual(sent, [])
  assert.equal(workflow.getAudit(message.chatId)[0].operatorAction, 'manual_reply')
  assert.equal(workflow.getAudit(message.chatId)[0].resultingAction, 'manual_reply')
})

test('manual reply cancels pending analysis and preserves an existing human takeover', async () => {
  const pending = deferred()
  let decisionSignal
  const { workflow } = setup({ decide: (_request, signal) => {
    decisionSignal = signal
    return pending.promise
  } })
  const message = incoming()
  const receiving = workflow.receive(message)
  workflow.manualReply(message.chatId)
  assert.equal(decisionSignal.aborted, true)
  pending.resolve(safeDecision())
  await receiving
  assert.equal(workflow.getState(message.chatId).status, 'Ready')
  assert.equal(workflow.getState(message.chatId).decision, null)

  workflow.takeOver(message.chatId)
  workflow.manualReply(message.chatId)
  assert.equal(workflow.getState(message.chatId).status, 'Human takeover')
  assert.equal(workflow.getState(message.chatId).humanControlled, true)
})

test('decision service failures produce a safe handoff and never send', async () => {
  const { workflow, sent } = setup({ decide: async () => { throw new Error('Agent service unavailable') } })
  const message = incoming()
  await workflow.receive(message)
  const state = workflow.getState(message.chatId)
  assert.equal(state.status, 'Handoff')
  assert.equal(state.decision.action, 'handoff')
  assert.equal(state.decision.requiresApproval, true)
  assert.equal(state.pending, false)
  assert.equal(await workflow.approve(message.chatId), false)
  assert.deepEqual(sent, [])
})

test('audit records contain decision and operator details with a parseable timestamp', async () => {
  const decision = safeDecision({ action: 'qualify' })
  const conversation = [{ text: 'Hello', direction: 'incoming' }]
  let receivedRequest
  const { workflow, changes } = setup({ decide: async (request) => {
    receivedRequest = request
    return decision
  } })
  const message = incoming()
  await workflow.receive(message, conversation)
  assert.deepEqual(receivedRequest, { message: message.text, chatId: message.chatId, conversation })
  const entry = workflow.getAudit(message.chatId)[0]
  assert.equal(Number.isNaN(Date.parse(entry.timestamp)), false)
  assert.equal(entry.chatId, message.chatId)
  assert.equal(entry.incomingMessage, message.text)
  assert.deepEqual(entry.decision, decision)
  assert.equal(entry.confidence, decision.confidence)
  assert.equal(entry.action, decision.action)
  assert.equal(entry.reason, decision.reason)
  assert.equal(entry.requiresApproval, decision.requiresApproval)
  assert.equal(Array.isArray(entry.operatorActions), true)
  assert.equal(typeof entry.operatorAction, 'string')
  assert.equal(typeof entry.resultingAction, 'string')
  assert.ok(changes.length > 0)
})

test('agent API forwards only message context and omits GREEN-API credentials', async (t) => {
  let captured
  const decision = safeDecision()
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    captured = { url, options }
    return { ok: true, json: async () => decision }
  })
  const conversation = Array.from({ length: 105 }, (_, index) => ({
    direction: index % 2 ? 'incoming' : 'outgoing',
    text: `Message ${index}`,
    apiTokenInstance: 'must-not-be-forwarded',
    idInstance: 'must-not-be-forwarded',
  }))
  assert.deepEqual(await requestAgentDecision({
    message: 'Hello', chatId: 'api-chat', conversation,
    apiTokenInstance: 'must-not-be-forwarded', idInstance: 'must-not-be-forwarded',
  }), decision)
  assert.equal(captured.url, '/api/agent/decide')
  assert.equal(captured.options.method, 'POST')
  assert.equal(captured.options.headers['Content-Type'], 'application/json')
  assert.equal(captured.options.credentials, 'omit')
  assert.equal(captured.options.cache, 'no-store')
  assert.deepEqual(JSON.parse(captured.options.body), {
    message: 'Hello', chatId: 'api-chat',
    conversation: conversation.slice(-100).map(({ direction, text }) => ({ direction, text })),
  })
  assert.equal(captured.options.body.includes('must-not-be-forwarded'), false)
})

test('agent API rejects HTTP failures without exposing the response body', async (t) => {
  let parsed = false
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, json: async () => {
    parsed = true
    return { error: 'private server detail' }
  } }))
  await assert.rejects(requestAgentDecision({ message: 'Hello', chatId: 'api-chat' }), /unavailable/i)
  assert.equal(parsed, false)
})

test('agent API rejects unreadable JSON; parsed invalid decisions remain available for policy validation', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => { throw new SyntaxError('Invalid JSON') },
  }))
  await assert.rejects(requestAgentDecision({ message: 'Hello', chatId: 'api-chat' }), SyntaxError)
  fetchMock.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ action: 'invalid' }) }))
  assert.deepEqual(await requestAgentDecision({ message: 'Hello', chatId: 'api-chat' }), { action: 'invalid' })
})

test('agent API honors the caller cancellation signal', async (t) => {
  const controller = new AbortController()
  controller.abort()
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    signal.throwIfAborted()
    assert.fail('an aborted request must not produce a decision')
  })
  await assert.rejects(requestAgentDecision({ message: 'Hello', chatId: 'api-chat' }, controller.signal), { name: 'AbortError' })
})

test('agent API combines a ten-second deadline with caller cancellation', async (t) => {
  const timeoutError = new DOMException('Agent decision timed out', 'TimeoutError')
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 10000)
    return AbortSignal.abort(timeoutError)
  })
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    signal.throwIfAborted()
    assert.fail('a timed-out request must not produce a decision')
  })
  await assert.rejects(requestAgentDecision({ message: 'Hello', chatId: 'api-chat' }), { name: 'TimeoutError' })
})
