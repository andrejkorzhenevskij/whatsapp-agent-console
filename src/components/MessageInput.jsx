import { useState } from 'react'

export default function MessageInput({ onSend, sending = false }) {
  const [text, setText] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (sending || !text.trim()) return
    if (await onSend(text)) setText('')
  }

  return (
    <form className="composer" onSubmit={handleSubmit} aria-busy={sending}>
      <label className="sr-only" htmlFor="message">Сообщение</label>
      <textarea
        id="message"
        name="message"
        rows={2}
        placeholder="Написать сообщение…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={20000}
        disabled={sending}
        required
      />
      <button type="submit" disabled={sending || !text.trim()}>
        {sending ? 'Отправляем…' : 'Отправить'}
      </button>
    </form>
  )
}
