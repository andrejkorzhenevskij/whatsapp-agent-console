import { useEffect, useRef, useState } from 'react'
import { getStateInstance } from '../api/greenApi.js'

export default function AuthForm({ onConnect }) {
  const [idInstance, setIdInstance] = useState('')
  const [apiTokenInstance, setApiTokenInstance] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)

  useEffect(() => () => request.current?.abort(), [])

  async function handleSubmit(event) {
    event.preventDefault()
    if (request.current) return
    const credentials = {
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
    }
    if (!/^[1-9]\d*$/.test(credentials.idInstance) || !credentials.apiTokenInstance) {
      setError('Введите ID инстанса из цифр и токен доступа.')
      return
    }
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const { stateInstance } = await getStateInstance(
        credentials.idInstance, credentials.apiTokenInstance, controller.signal,
      )
      if (controller.signal.aborted) return
      if (stateInstance !== 'authorized') {
        const reasons = {
          notAuthorized: 'Сначала авторизуйте WhatsApp в личном кабинете GREEN-API.',
          starting: 'Подключение ещё запускается. Попробуйте чуть позже.',
          blocked: 'Аккаунт заблокирован. Проверьте личный кабинет GREEN-API.',
          suspended: 'Подключение приостановлено. Проверьте личный кабинет GREEN-API.',
        }
        setError(reasons[stateInstance] || 'Аккаунт пока недоступен. Попробуйте подключиться позже.')
        return
      }
      onConnect(credentials)
    } catch {
      if (!controller.signal.aborted) setError('Не удалось подключиться. Проверьте данные и соединение с интернетом.')
    } finally {
      request.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <h1 id="auth-title">Вход в чат</h1>
      <p className="auth-intro">Подключите WhatsApp и продолжите общение.</p>
      <form className="form" onSubmit={handleSubmit} aria-busy={loading}>
        <label htmlFor="id-instance">ID инстанса</label>
        <input
          id="id-instance"
          name="idInstance"
          value={idInstance}
          onChange={(event) => setIdInstance(event.target.value)}
          inputMode="numeric"
          pattern="[1-9][0-9]*"
          title="Введите положительный идентификатор из цифр"
          autoComplete="off"
          disabled={loading}
          required
        />
        <label htmlFor="api-token-instance">Токен доступа</label>
        <input
          id="api-token-instance"
          name="apiTokenInstance"
          type="password"
          value={apiTokenInstance}
          onChange={(event) => setApiTokenInstance(event.target.value)}
          autoComplete="off"
          disabled={loading}
          required
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={loading || !idInstance.trim() || !apiTokenInstance.trim()}>
          {loading ? 'Проверяем подключение…' : 'Открыть чат'}
        </button>
      </form>
      <p className="auth-note">Данные подключения хранятся только в памяти страницы.</p>
    </section>
  )
}
