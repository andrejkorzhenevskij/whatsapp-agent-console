export async function requestAgentDecision({ message, chatId, conversation = [] }, signal) {
  const requestSignal = AbortSignal.any([
    AbortSignal.timeout(10000),
    ...(signal ? [signal] : []),
  ])
  const response = await fetch('/api/agent/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
    signal: requestSignal,
    body: JSON.stringify({
      message,
      chatId,
      // Send text context only: never forward GREEN-API connection credentials.
      conversation: conversation.slice(-100).map(({ direction, text }) => ({ direction, text })),
    }),
  })
  if (!response.ok) throw new Error('Agent service is unavailable.')
  return response.json()
}
