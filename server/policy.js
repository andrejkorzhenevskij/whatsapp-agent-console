import { validateDecision } from './validator.js'

const RISKY_TOPIC = /\b(refunds?|sue|suing|lawsuits?|lawyer|legal action|chargebacks?|kill|suicide|suicidal|self[- ]harm|medical emergency)\b/i

export function hasRiskyTopic(text) {
  return typeof text === 'string' && RISKY_TOPIC.test(text)
}

export function applyPolicy(value, { message = '', conversation = [] } = {}) {
  const validation = validateDecision(value)
  if (!validation.valid) {
    return {
      action: 'handoff',
      reply: '',
      leadScore: 0,
      confidence: 0,
      reason: `Decision validation failed: ${validation.errors.join('; ')}. Human review is required.`,
      requiresApproval: true,
    }
  }

  const decision = validation.decision
  const riskyContext = hasRiskyTopic(message) || (Array.isArray(conversation) && conversation.some((entry) => hasRiskyTopic(entry?.text)))
  const riskyReply = hasRiskyTopic(decision.reply)
  const gates = []
  if (decision.confidence < 0.75) gates.push('confidence is below 0.75')
  if (decision.requiresApproval) gates.push('the agent requested human review')
  if (decision.action === 'handoff') gates.push('the agent requested a handoff')
  if (riskyContext || riskyReply) gates.push('a risky topic was detected')

  if (!gates.length) return decision

  return {
    ...decision,
    action: 'handoff',
    reply: riskyContext || riskyReply ? '' : decision.reply,
    reason: `Policy handoff: ${gates.join('; ')}. ${decision.reason}`.slice(0, 2000),
    requiresApproval: true,
  }
}
