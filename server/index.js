import express from 'express'
import { pathToFileURL } from 'node:url'
import { fakeAgent } from './agent.js'
import { applyPolicy } from './policy.js'
import { isPlainObject } from './validator.js'

function validateRequest(body) {
  if (!isPlainObject(body)) return ['request must be a JSON object']
  const errors = []
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 20000) {
    errors.push('message must be a nonempty string of at most 20000 characters')
  }
  if (typeof body.chatId !== 'string' || !body.chatId.trim() || body.chatId.length > 200) {
    errors.push('chatId must be a nonempty string of at most 200 characters')
  }
  if (!Array.isArray(body.conversation) || body.conversation.length > 100) {
    errors.push('conversation must be an array of at most 100 messages')
  } else if (body.conversation.some((entry) => !isPlainObject(entry)
    || !['incoming', 'outgoing'].includes(entry.direction)
    || typeof entry.text !== 'string'
    || !entry.text.trim()
    || entry.text.length > 20000)) {
    errors.push('conversation messages require an incoming/outgoing direction and nonempty text of at most 20000 characters')
  }
  return errors
}

export function createApp({ decide = fakeAgent } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.locals.auditTrail = []
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '512kb', strict: true }))

  app.post('/api/agent/decide', async (request, response) => {
    const errors = validateRequest(request.body)
    if (errors.length) return response.status(400).json({ error: 'Invalid agent request', details: errors })

    // Deliberately pass only conversation content, never GREEN-API credentials.
    const input = {
      message: request.body.message,
      chatId: request.body.chatId,
      conversation: request.body.conversation.map(({ direction, text }) => ({ direction, text })),
    }
    let rawDecision
    try {
      rawDecision = await decide(input)
    } catch {
      rawDecision = null
    }
    const decision = applyPolicy(rawDecision, input)
    app.locals.auditTrail.push({
      timestamp: new Date().toISOString(),
      chatId: input.chatId,
      incomingMessage: input.message,
      decision: { ...decision },
      confidence: decision.confidence,
      action: decision.action,
      reason: decision.reason,
      requiresApproval: decision.requiresApproval,
      operatorAction: 'pending',
      resultingAction: decision.action === 'handoff' ? 'handoff' : 'suggested',
    })
    return response.json(decision)
  })

  app.use('/api', (_request, response) => response.status(404).json({ error: 'API endpoint not found' }))
  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error)
    if (error.type === 'entity.too.large') return response.status(413).json({ error: 'Request body exceeds 512kb' })
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Request body must contain valid JSON' })
    return response.status(500).json({ error: 'Unable to process request' })
  })
  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3001)
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`Fake agent API listening on http://127.0.0.1:${port}`)
  })
}
