import { receiveNotification, deleteNotification, normalizePhoneNumber, isWhatsAppChatId } from './api/greenApi.js'

export function phoneToChatId(phone) {
  const number = normalizePhoneNumber(phone)
  return number ? `${number}@c.us` : null
}

export function messageFromNotification(body) {
  if (typeof body?.typeWebhook !== 'string' || !body.typeWebhook.trim()) {
    throw new Error('Некорректное входящее уведомление: отсутствует тип события.')
  }
  if (body.typeWebhook !== 'incomingMessageReceived') return null
  const { idMessage, senderData, messageData } = body
  if (typeof idMessage !== 'string' || !idMessage.trim() ||
      !isWhatsAppChatId(senderData?.chatId) ||
      typeof messageData?.typeMessage !== 'string' || !messageData.typeMessage.trim()) {
    throw new Error('Некорректное входящее уведомление: нет идентификатора, чата или типа сообщения.')
  }

  let text
  if (messageData.typeMessage === 'textMessage') {
    text = messageData.textMessageData?.textMessage
  } else if (messageData.typeMessage === 'extendedTextMessage') {
    text = messageData.extendedTextMessageData?.text
  } else {
    return null
  }
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Некорректное входящее уведомление: отсутствует текст.')
  }
  const message = { id: idMessage, chatId: senderData.chatId, text, direction: 'incoming' }
  const timestamp = typeof body.timestamp === 'number' ? body.timestamp * 1000 : NaN
  if (timestamp > 0 && Number.isFinite(new Date(timestamp).getTime())) message.timestamp = timestamp

  const isGroup = senderData.chatId.endsWith('@g.us')
  const names = isGroup ? [senderData.chatName] :
    [senderData.chatName, senderData.senderContactName, senderData.senderName]
  const chatName = names.find((name) => typeof name === 'string' && name.trim())
  if (chatName) message.chatName = chatName.trim()

  if (senderData.chatId.endsWith('@c.us')) message.phoneNumber = senderData.chatId.slice(0, -5)
  return message
}

export function appendMessage(messages, message) {
  // ponytail: линейный поиск для небольшой истории; индекс по chatId/id при больших чатах.
  return messages.some((item) => item.id === message.id && item.chatId === message.chatId)
    ? messages
    : [...messages, message]
}

function waitForRetry(delay, signal) {
  return new Promise((resolve) => {
    function finish() {
      clearTimeout(timeout)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timeout = setTimeout(finish, delay)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) finish()
  })
}

export async function pollNotifications(idInstance, apiTokenInstance, onMessage, signal, onReceiveError) {
  let retryDelay = 1000
  while (!signal.aborted) {
    let notification
    try {
      notification = await receiveNotification(idInstance, apiTokenInstance, signal)
    } catch (failure) {
      if (signal.aborted) return
      if (failure.retryable !== true && failure.status !== 429 &&
          !(failure.status >= 500 && failure.status <= 599)) throw failure
      onReceiveError?.('Связь прервана. Повторяем получение…')
      await waitForRetry(retryDelay, signal)
      retryDelay = Math.min(retryDelay * 2, 8000)
      continue
    }
    if (signal.aborted) return
    if (retryDelay !== 1000) onReceiveError?.('')
    retryDelay = 1000
    if (signal.aborted) return
    if (notification === null) continue
    const message = messageFromNotification(notification.body)
    if (message) await onMessage(message)
    if (signal.aborted) return
    await deleteNotification(idInstance, apiTokenInstance, notification.receiptId, signal)
  }
}
