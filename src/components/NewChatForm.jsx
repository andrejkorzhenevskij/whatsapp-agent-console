import { useState } from 'react'
import { normalizePhoneNumber } from '../api/greenApi.js'
import { phoneToChatId } from '../chat.js'

export default function NewChatForm({ onOpen, onCancel }) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const number = normalizePhoneNumber(phone)
    if (!number) {
      setError('Введите номер с кодом страны, например +380501234567.')
      return
    }
    setError('')
    onOpen({ chatId: phoneToChatId(number) }, number)
  }

  return (
    <section className="new-chat-form" aria-labelledby="new-chat-title">
      <div className="form-heading">
        <h2 id="new-chat-title">Новый чат</h2>
        <button type="button" className="secondary" onClick={onCancel}>Отмена</button>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label htmlFor="recipient">Номер получателя</label>
        <input
          id="recipient" name="recipient" type="tel" placeholder="+380501234567"
          autoComplete="tel" value={phone}
          onChange={(event) => { setPhone(event.target.value); setError('') }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'number-error' : undefined} required
        />
        {error && <p className="error" id="number-error" role="alert">{error}</p>}
        <button type="submit" disabled={!phone.trim()}>
          Открыть чат
        </button>
      </form>
    </section>
  )
}
