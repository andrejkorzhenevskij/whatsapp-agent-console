export const ALLOWED_ACTIONS = Object.freeze(['reply', 'qualify', 'ask_more', 'handoff'])

const MAX_REPLY_LENGTH = 20000
const MAX_REASON_LENGTH = 2000

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function validateDecision(value) {
  let candidate = value
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate)
    } catch {
      return { valid: false, errors: ['decision must contain valid JSON'], decision: null }
    }
  }

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: ['decision must be a JSON object'], decision: null }
  }

  const errors = []
  if (!ALLOWED_ACTIONS.includes(candidate.action)) errors.push('action must be reply, qualify, ask_more, or handoff')
  if (typeof candidate.reply !== 'string' || candidate.reply.length > MAX_REPLY_LENGTH) {
    errors.push('reply must be a string of at most 20000 characters')
  } else if (candidate.action !== 'handoff' && !candidate.reply.trim()) {
    errors.push('reply must be nonempty for an actionable decision')
  }
  if (!Number.isInteger(candidate.leadScore) || candidate.leadScore < 0 || candidate.leadScore > 100) {
    errors.push('leadScore must be an integer from 0 to 100')
  }
  if (typeof candidate.confidence !== 'number' || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) {
    errors.push('confidence must be a finite number from 0 to 1')
  }
  if (typeof candidate.reason !== 'string' || !candidate.reason.trim() || candidate.reason.length > MAX_REASON_LENGTH) {
    errors.push('reason must be a nonempty string of at most 2000 characters')
  }
  if (typeof candidate.requiresApproval !== 'boolean') errors.push('requiresApproval must be a boolean')

  if (errors.length) return { valid: false, errors, decision: null }

  return {
    valid: true,
    errors: [],
    decision: {
      action: candidate.action,
      reply: candidate.reply,
      leadScore: candidate.leadScore,
      confidence: candidate.confidence,
      reason: candidate.reason,
      requiresApproval: candidate.requiresApproval,
    },
  }
}
