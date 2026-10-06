import { hasRiskyTopic } from './policy.js'

function decision(action, reply, leadScore, confidence, reason, requiresApproval = false) {
  return { action, reply, leadScore, confidence, reason, requiresApproval }
}

export function fakeAgent({ message }) {
  const text = message.trim().toLowerCase()

  if (text === 'demo:invalid-action') {
    return decision('unsupported_action', 'This intentionally invalid result must be blocked.', 50, 0.9, 'Demonstration of invalid output.')
  }
  if (hasRiskyTopic(text)) {
    return decision('handoff', '', 0, 0.99, 'Refunds, legal threats, or other risky topics require an operator.', true)
  }
  if (/\b(discount|special offer|exception)\b/.test(text)) {
    return decision('reply', 'An operator can review your request for a special discount.', 65, 0.88, 'Pricing exceptions require human review.', true)
  }
  if (/\b(not sure|unsure|no idea|do not know|don.t know)\b/.test(text)) {
    return decision('ask_more', 'Could you tell us what you are looking for?', 35, 0.6, 'There is not enough information to understand the request confidently.')
  }
  if (/\b(maybe|how does (this|it) work|how it works)\b/.test(text)) {
    return decision('ask_more', 'We can help you choose an option and arrange a booking. What would you like to book?', 45, 0.82, 'The customer is interested but needs more information.')
  }
  if (/\b(book|booking|reserve|reservation|friday)\b/.test(text)) {
    return decision('qualify', 'Happy to help with your booking. What time would you prefer, and how many people should we expect?', 72, 0.91, 'The customer expressed clear booking intent.')
  }
  if (/\b(cost|price|pricing|how much)\b/.test(text)) {
    return decision('reply', 'Pricing depends on the option you choose. Which service or booking are you interested in?', 60, 0.88, 'The customer asked a straightforward pricing question.')
  }
  if (/\b(hello|hi|hey)\b/.test(text)) {
    return decision('reply', 'Hello! How can we help you today?', 20, 0.94, 'The customer sent a greeting.')
  }

  return decision('ask_more', 'Could you share a little more detail about what you need?', 30, 0.8, 'A clarification is needed before suggesting a specific next step.')
}
