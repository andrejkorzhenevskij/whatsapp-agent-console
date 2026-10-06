import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { AgentWorkflow } from '../src/services/agentWorkflow.js'

let server
let AgentPanel
before(async () => {
  server = await createServer({ server: { middlewareMode: true } })
  AgentPanel = (await server.ssrLoadModule('/src/components/AgentPanel.jsx')).default
})
after(async () => { await server?.close() })

const decision = {
  action: 'qualify', reply: 'What time would you prefer?', leadScore: 72,
  confidence: 0.91, reason: 'Clear booking intent.', requiresApproval: false,
}
const state = {
  status: 'Awaiting approval', decision, pending: false, humanControlled: false,
  entryId: 'one', error: '',
}
function render(current = state, extra = {}) {
  return renderToStaticMarkup(createElement(AgentPanel, {
    state: current, onApprove() {}, onTakeOver() {}, ...extra,
  }))
}
function button(html, text) {
  return html.match(new RegExp(`<button[^>]*>${text}</button>`))?.[0]
}

test('AgentPanel displays decision fields and allows approval of a safe suggestion', () => {
  const html = render()
  for (const text of ['AGENT DECISION', 'Lead score', '72 / 100', 'Confidence', '91%',
    'Action', 'qualify', 'Reason', 'Clear booking intent.', 'Suggested reply', decision.reply,
    'Awaiting approval']) assert.ok(html.includes(text), text)
  assert.doesNotMatch(button(html, 'Approve'), /disabled/)
  assert.doesNotMatch(button(html, 'Take over'), /disabled/)
})

test('Ready has no approvable proposal', () => {
  const workflow = new AgentWorkflow({ decide() {}, send() {} })
  const html = render(workflow.getState('new-chat'))
  assert.match(html, /Ready/)
  assert.match(button(html, 'Approve'), /disabled/)
  assert.doesNotMatch(button(html, 'Take over'), /disabled/)
})

test('handoff approval is disabled even with a high confidence and a nonempty reply', () => {
  const html = render({ ...state, status: 'Handoff',
    decision: { ...decision, action: 'handoff', confidence: 0.99, requiresApproval: true } })
  assert.match(html, /Handoff/)
  assert.match(button(html, 'Approve'), /disabled/)
  assert.doesNotMatch(button(html, 'Take over'), /disabled/)
})

test('Approved and Human takeover cannot approve the same reply again', () => {
  assert.match(button(render({ ...state, status: 'Approved' }), 'Approve'), /disabled/)
  const html = render({ ...state, status: 'Human takeover', humanControlled: true })
  assert.match(button(html, 'Approve'), /disabled/)
  assert.match(button(html, 'Take over'), /disabled/)
})

test('an outgoing request locks approval and takeover until it settles', () => {
  const html = render({ ...state, pending: true }, { sending: true })
  assert.match(button(html, 'Sending…'), /disabled/)
  assert.match(button(html, 'Take over'), /disabled/)
})

test('suggested replies, reasons, and audit messages are rendered as escaped text', () => {
  const dangerous = '<script>alert("test")</script>'
  const html = render({ ...state, decision: { ...decision, reply: dangerous, reason: dangerous } })
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})

test('memory audit is visible with the decision, operator action, and send result', async () => {
  const workflow = new AgentWorkflow({ decide: async () => decision, send: async () => true })
  const chatId = '15550000001@c.us'
  await workflow.receive({ chatId, id: 'one', text: 'Book Friday' })
  await workflow.approve(chatId)
  const html = render(workflow.getState(chatId), { audit: workflow.getAudit(chatId) })
  assert.match(html, /Audit trail \(1\)/)
  assert.match(html, /Book Friday/)
  assert.match(html, /approve.*sent/)
  for (const field of ['timestamp', 'chatId', 'incomingMessage', 'decision', 'confidence',
    'action', 'reason', 'requiresApproval', 'operatorAction', 'resultingAction']) {
    assert.ok(html.includes(field), field)
  }
})

test('cancelled analysis cannot leave the panel pending or approve its late result', async () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  const workflow = new AgentWorkflow({ decide: () => promise, send: async () => true })
  const controller = new AbortController()
  const chatId = 'cancelled-chat'
  const receiving = workflow.receive({ chatId, id: 'one', text: 'Book Friday' }, [], controller.signal)
  controller.abort()
  resolve(decision)
  await receiving
  const current = workflow.getState(chatId)
  assert.equal(current.pending, false)
  assert.equal(current.status, 'Handoff')
  assert.equal(await workflow.approve(chatId), false)
  assert.match(button(render(current), 'Approve'), /disabled/)
})
