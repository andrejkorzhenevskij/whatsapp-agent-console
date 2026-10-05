import { useEffect, useRef } from 'react'

export default function MessageList({ messages }) {
  const container = useRef(null)
  const messageCount = messages.length
  const lastMessageId = messages.at(-1)?.id
  const lastChatId = messages.at(-1)?.chatId

  useEffect(() => {
    container.current.scrollTop = container.current.scrollHeight
  }, [messageCount, lastMessageId, lastChatId])

  return (
    <div className="messages" ref={container} role="log" aria-label="Сообщения" aria-live="polite" tabIndex={0}>
      {messages.length === 0 ? (
        <p className="hint">Сообщений пока нет.</p>
      ) : (
        <ul className="message-list">
          {messages.map((message) => {
            const date = Number.isFinite(message.timestamp) ? new Date(message.timestamp) : null
            const validDate = date && !Number.isNaN(date.getTime())
            return (
              <li className={`message ${message.direction}`} key={`${message.chatId}:${message.id}`}>
                <span className="message-text">{message.text}</span>
                {validDate && (
                  <time className="message-time" dateTime={date.toISOString()} title={date.toLocaleString()}>
                    {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
