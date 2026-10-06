import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { fakeAgent } from '../server/agent.js'
import { createApp } from '../server/index.js'
import { applyPolicy } from '../server/policy.js'
import { validateDecision } from '../server/validator.js'

const validDecision = {
  action: 'reply',
  reply: 'Hello! How can we help?',
  leadScore: 72,
  confidence: 0.91,
  reason: 'The request is clear.',
  requiresApproval: false,
}

const requestBody = {
  message: "I'd like to book it for Friday.",
  chatId: '1234567890@c.us',
  conversation: [],
}

function decide(message) {
  const input = { ...requestBody, message }
  return applyPolicy(fakeAgent(input), input)
}

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/api/agent/decide`
  try {
    await callback(url)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('normal booking lead qualifies deterministically', () => {
  const result = decide("I'd like to book it for Friday.")
  assert.equal(result.action, 'qualify')
  assert.equal(result.leadScore, 72)
  assert.equal(result.confidence, 0.91)
  assert.equal(result.requiresApproval, false)
  assert.ok(result.reply)
  assert.deepEqual(result, decide("I'd like to book it for Friday."))
})

test('ambiguous lead asks for more information', () => {
  const result = decide('Maybe. How does this work?')
  assert.equal(result.action, 'ask_more')
  assert.ok(result.confidence >= 0.75)
  assert.equal(result.requiresApproval, false)
})

test('risky lead hands off without a suggested reply', () => {
  const result = decide("Refund me immediately or I'll sue.")
  assert.equal(result.action, 'handoff')
  assert.equal(result.requiresApproval, true)
  assert.equal(result.reply, '')
})

test('additional demo phrases exercise pricing, greeting, low confidence, review, and invalid action', () => {
  assert.equal(decide('What does it cost?').action, 'reply')
  assert.equal(decide('Hello!').action, 'reply')
  const unsure = decide('I am not sure what I need.')
  assert.equal(unsure.action, 'handoff')
  assert.equal(unsure.confidence, 0.6)
  assert.match(unsure.reason, /confidence is below/)
  const discount = decide('Can you give me a special discount?')
  assert.equal(discount.action, 'handoff')
  assert.match(discount.reason, /human review/)
  const invalid = decide('demo:invalid-action')
  assert.equal(invalid.action, 'handoff')
  assert.equal(invalid.reply, '')
  assert.match(invalid.reason, /validation failed/)
})

test('validator accepts a JSON object or JSON string and strips extra fields', () => {
  for (const value of [validDecision, JSON.stringify(validDecision), { ...validDecision, internal: 'omit' }]) {
    const result = validateDecision(value)
    assert.equal(result.valid, true)
    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.decision, validDecision)
  }
})

test('validator accepts all four actions and allows an empty handoff reply', () => {
  for (const action of ['reply', 'qualify', 'ask_more', 'handoff']) {
    assert.equal(validateDecision({ ...validDecision, action }).valid, true)
  }
  assert.equal(validateDecision({ ...validDecision, action: 'handoff', reply: '' }).valid, true)
})

test('validator rejects non-JSON/non-object values and invalid JSON', () => {
  for (const value of [undefined, null, [], 1, true, '', '{', '[]', 'null', new Date(), Object.create({ action: 'reply' })]) {
    assert.equal(validateDecision(value).valid, false)
  }
})

test('validator rejects missing fields and wrong types or out-of-range values', async (t) => {
  const invalidFields = {
    action: [undefined, null, '', 'send', 'REPLY', 1, {}],
    reply: [undefined, null, 1, true, {}, '', '  ', 'x'.repeat(20001)],
    leadScore: [undefined, null, '72', -1, 101, 72.5, Infinity, NaN],
    confidence: [undefined, null, '0.91', -0.01, 1.01, Infinity, NaN],
    reason: [undefined, null, 1, {}, '', '  ', 'x'.repeat(2001)],
    requiresApproval: [undefined, null, 'false', 0, 1, {}],
  }
  for (const [field, values] of Object.entries(invalidFields)) {
    await t.test(field, () => {
      for (const value of values) {
        const result = validateDecision({ ...validDecision, [field]: value })
        assert.equal(result.valid, false, `${field}: ${String(value).slice(0, 50)}`)
        assert.equal(result.decision, null)
        assert.ok(result.errors.some((error) => error.includes(field)))
      }
    })
  }
})

test('validator accepts range boundaries', () => {
  for (const leadScore of [0, 100]) {
    for (const confidence of [0, 1]) {
      assert.equal(validateDecision({ ...validDecision, leadScore, confidence }).valid, true)
    }
  }
})

test('invalid action is a safe policy handoff', () => {
  const result = applyPolicy({ ...validDecision, action: 'send' })
  assert.equal(result.action, 'handoff')
  assert.equal(result.requiresApproval, true)
  assert.equal(result.reply, '')
  assert.equal(result.confidence, 0)
  assert.match(result.reason, /action/)
  assert.equal(validateDecision(result).valid, true)
})

test('low confidence is a handoff while threshold confidence is allowed', () => {
  assert.equal(applyPolicy({ ...validDecision, confidence: 0.749 }).action, 'handoff')
  assert.equal(applyPolicy({ ...validDecision, confidence: 0.75 }).action, 'reply')
})

test('requiresApproval causes a handoff', () => {
  const result = applyPolicy({ ...validDecision, requiresApproval: true })
  assert.equal(result.action, 'handoff')
  assert.equal(result.requiresApproval, true)
})

test('explicit handoff always requires human review', () => {
  const result = applyPolicy({ ...validDecision, action: 'handoff' })
  assert.equal(result.action, 'handoff')
  assert.equal(result.requiresApproval, true)
})

test('policy catches risky incoming messages, conversation history, and suggested replies', () => {
  for (const context of [
    { message: 'I want a refund.' },
    { conversation: [{ direction: 'incoming', text: 'I will sue.' }] },
    { conversation: [{ direction: 'outgoing', text: 'A lawyer will respond.' }] },
  ]) {
    const result = applyPolicy(validDecision, context)
    assert.equal(result.action, 'handoff')
    assert.equal(result.reply, '')
    assert.match(result.reason, /risky topic/)
  }
  const result = applyPolicy({ ...validDecision, reply: 'You can sue them.' })
  assert.equal(result.action, 'handoff')
  assert.equal(result.reply, '')
})

test('policy reasons stay bounded and handoffs stay safe on repeated evaluation', () => {
  const result = applyPolicy({ ...validDecision, confidence: 0.6, reason: 'x'.repeat(2000) })
  assert.equal(result.reason.length, 2000)
  assert.match(result.reason, /^Policy handoff:/)
  assert.equal(validateDecision(result).valid, true)
  assert.equal(applyPolicy(result).action, 'handoff')
  assert.equal(applyPolicy(result).requiresApproval, true)
})

test('HTTP endpoint returns a policy-approved decision and records memory audit', async () => {
  const app = createApp()
  await withServer(app, async (url) => {
    const response = await post(url, requestBody)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const result = await response.json()
    assert.equal(result.action, 'qualify')
    assert.equal(app.locals.auditTrail.length, 1)
    assert.deepEqual(app.locals.auditTrail[0], {
      timestamp: app.locals.auditTrail[0].timestamp,
      chatId: requestBody.chatId,
      incomingMessage: requestBody.message,
      decision: result,
      confidence: result.confidence,
      action: result.action,
      reason: result.reason,
      requiresApproval: result.requiresApproval,
      operatorAction: 'pending',
      resultingAction: 'suggested',
    })
    assert.ok(Number.isFinite(Date.parse(app.locals.auditTrail[0].timestamp)))
  })
})

test('HTTP endpoint applies policy to risky input even when injected agent returns a normal reply', async () => {
  const app = createApp({ decide: () => validDecision })
  await withServer(app, async (url) => {
    const response = await post(url, { ...requestBody, message: 'Refund me immediately.' })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.action, 'handoff')
    assert.equal(result.requiresApproval, true)
    assert.equal(result.reply, '')
    assert.equal(app.locals.auditTrail[0].resultingAction, 'handoff')
  })
})

test('HTTP endpoint safely hands off invalid agent output and service exceptions', async () => {
  for (const decideService of [() => ({ ...validDecision, action: 'send' }), () => { throw new Error('private internal information') }]) {
    await withServer(createApp({ decide: decideService }), async (url) => {
      const response = await post(url, requestBody)
      assert.equal(response.status, 200)
      const result = await response.json()
      assert.equal(result.action, 'handoff')
      assert.equal(result.reply, '')
      assert.equal(result.requiresApproval, true)
      assert.doesNotMatch(result.reason, /private internal information/)
    })
  }
})

test('HTTP endpoint rejects invalid requests before running the decision service', async () => {
  let calls = 0
  const app = createApp({ decide: () => { calls += 1; return validDecision } })
  const badBodies = [
    {}, null, [],
    { ...requestBody, message: '' },
    { ...requestBody, message: 42 },
    { ...requestBody, message: 'x'.repeat(20001) },
    { ...requestBody, chatId: '' },
    { ...requestBody, chatId: 'x'.repeat(201) },
    { ...requestBody, conversation: undefined },
    { ...requestBody, conversation: 'history' },
    { ...requestBody, conversation: Array.from({ length: 101 }, () => ({ direction: 'incoming', text: 'Hi' })) },
    { ...requestBody, conversation: [null] },
    { ...requestBody, conversation: [{ direction: 'unknown', text: 'Hi' }] },
    { ...requestBody, conversation: [{ direction: 'incoming', text: '' }] },
    { ...requestBody, conversation: [{ direction: 'incoming', text: 'x'.repeat(20001) }] },
  ]
  await withServer(app, async (url) => {
    for (const body of badBodies) {
      const response = await post(url, body)
      assert.equal(response.status, 400)
      assert.ok((await response.json()).error)
    }
  })
  assert.equal(calls, 0)
  assert.equal(app.locals.auditTrail.length, 0)
})

test('HTTP endpoint rejects malformed JSON and oversized payloads as JSON errors', async () => {
  await withServer(createApp(), async (url) => {
    const malformed = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
    assert.equal(malformed.status, 400)
    assert.match((await malformed.json()).error, /valid JSON/)
    const oversized = await post(url, { ...requestBody, message: 'x'.repeat(600000) })
    assert.equal(oversized.status, 413)
    assert.match((await oversized.json()).error, /512kb/)
  })
})

test('decision service receives only allowed message fields, never client credentials', async () => {
  let received
  const app = createApp({ decide: (input) => { received = input; return validDecision } })
  const conversation = [{ direction: 'incoming', text: 'Hello', id: 'existing-message-id', timestamp: 123, token: 'must-not-forward' }]
  await withServer(app, async (url) => {
    const response = await post(url, { ...requestBody, conversation, idInstance: 'must-not-forward', apiTokenInstance: 'must-not-forward' })
    assert.equal(response.status, 200)
  })
  assert.deepEqual(received, { ...requestBody, conversation: [{ direction: 'incoming', text: 'Hello' }] })
})
