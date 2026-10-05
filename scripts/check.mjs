import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { normalizePhoneNumber, getStateInstance, sendMessage, receiveNotification, deleteNotification } from '../src/api/greenApi.js'
import { phoneToChatId, messageFromNotification, appendMessage, pollNotifications } from '../src/chat.js'
import { addChat, recordMessage, chatDisplayName } from '../src/chatState.js'

const server = await createServer({ server: { middlewareMode: true } })
try {
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  const { default: ChatWindow } = await server.ssrLoadModule('/src/components/ChatWindow.jsx')
  const { default: ChatList } = await server.ssrLoadModule('/src/components/ChatList.jsx')
  const { default: NewChatForm } = await server.ssrLoadModule('/src/components/NewChatForm.jsx')
  const { default: MessageInput } = await server.ssrLoadModule('/src/components/MessageInput.jsx')
  const { default: MessageList } = await server.ssrLoadModule('/src/components/MessageList.jsx')

  const auth = renderToStaticMarkup(createElement(App))
  assert.match(auth, /name="idInstance"/)
  assert.match(auth, /type="password"/)
  assert.match(auth, /<button[^>]*disabled/)
  assert.doesNotMatch(auth, /role="log"/)

  const chat = renderToStaticMarkup(createElement(ChatWindow, { idInstance: '123', apiTokenInstance: 'test-token' }))
  assert.match(chat, /Чаты/)
  assert.match(chat, /Новый чат/)
  assert.match(chat, /Выберите чат/)
  assert.doesNotMatch(chat, /123|test-token|принято API|@c\.us/)

  const newChat = renderToStaticMarkup(createElement(NewChatForm, {
    idInstance: '123', apiTokenInstance: 'test-token', onOpen() {}, onCancel() {},
  }))
  assert.match(newChat, /Номер получателя/)
  assert.match(newChat, /name="recipient"/)
  assert.match(newChat, /type="tel"/)
  assert.doesNotMatch(newChat, /test-token|@c\.us/)

  const input = renderToStaticMarkup(createElement(MessageInput, { onSend() {} }))
  assert.match(input, /name="message"/)
  assert.match(input, /maxLength="20000"/i)
  assert.match(input, /<button[^>]*disabled/)

  const list = renderToStaticMarkup(createElement(ChatList, {
    chats: [
      { id: '1234567890@c.us', name: 'Анна', lastMessage: { text: 'До встречи!', timestamp: 1791050000000 } },
      { id: '380501234567@c.us', phoneNumber: '380501234567' },
    ],
    activeChatId: '1234567890@c.us', onSelect() {},
  }))
  assert.match(list, /Анна/)
  assert.match(list, /До встречи!/)
  assert.match(list, /380501234567/)
  assert.match(list, /aria-current="true"/)
  assert.doesNotMatch(list, /1234567890|@c\.us/)

  const messages = renderToStaticMarkup(createElement(MessageList, {
    messages: [
      { id: '1', chatId: '1234567890@c.us', direction: 'incoming', text: '<script>alert("test")</script>' },
      { id: '2', chatId: '1234567890@c.us', direction: 'outgoing', text: 'Ответ', timestamp: 1791050000000 },
    ],
  }))
  assert.match(messages, /&lt;script&gt;/)
  assert.doesNotMatch(messages, /<script>/)
  assert.match(messages, /incoming/)
  assert.match(messages, /outgoing/)
  assert.doesNotMatch(messages, /1234567890|принято API|GREEN-API/)
  console.log('Component checks passed: auth, chat list, new-chat form, message input and safe bubbles.')
} finally {
  await server.close()
}

// Все API-запросы подменяются: настоящие credentials и доступ к GREEN-API не нужны.
const originalFetch = globalThis.fetch
const calls = []
const idInstance = '1101000001'
const token = 'test-token/not-a-secret'
const base = `https://api.greenapi.com/waInstance${idInstance}`
let reply = () => new Response('null')
globalThis.fetch = async (url, options) => {
  calls.push({ url, options })
  return reply(url, options)
}
const respond = (body, status = 200) => {
  reply = () => new Response(body, { status })
}
const getState = () => getStateInstance(idInstance, token)
const send = () => sendMessage(idInstance, token, '79001234567@c.us', '  Привет! 😃\n ')
const receive = () => receiveNotification(idInstance, token)
const remove = () => deleteNotification(idInstance, token, 123)

try {
  respond('{"idMessage":"message-1"}')
  assert.deepEqual(await send(), { idMessage: 'message-1' })
  assert.equal(calls[0].url, `${base}/sendMessage/${encodeURIComponent(token)}`)
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
  assert.equal(calls[0].options.cache, 'no-store')
  assert.equal(calls[0].options.credentials, 'omit')
  assert.ok(calls[0].options.signal instanceof AbortSignal)
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    chatId: '79001234567@c.us', message: '  Привет! 😃\n ',
  })

  for (const empty of ['null', '', '  ']) {
    respond(empty)
    const before = calls.length
    assert.equal(await receive(), null)
    assert.equal(calls.length, before + 1)
    assert.equal(calls.at(-1).url, `${base}/receiveNotification/${encodeURIComponent(token)}?receiveTimeout=5`)
    assert.equal(calls.at(-1).options.method, 'GET')
    assert.equal(calls.at(-1).options.body, undefined)
  }

  // Даже событие об ошибке внутри body — уведомление, а не ошибка самого запроса.
  const notification = { receiptId: 123, body: { typeWebhook: 'incomingMessageReceived', message: 'hi', error: 'event data' } }
  respond(JSON.stringify(notification))
  const beforeReceive = calls.length
  assert.deepEqual(await receive(), notification)
  assert.equal(calls.length, beforeReceive + 1, 'Receiving must not delete before processing')
  respond('{"result":true}')
  assert.deepEqual(await remove(), { result: true })
  assert.equal(calls.at(-1).url, `${base}/deleteNotification/${encodeURIComponent(token)}/123`)
  assert.equal(calls.at(-1).options.method, 'DELETE')
  assert.equal(calls.at(-1).options.body, undefined)

  for (const stateInstance of ['authorized', 'notAuthorized', 'blocked', 'starting']) {
    respond(JSON.stringify({ stateInstance }))
    assert.deepEqual(await getState(), { stateInstance })
    assert.equal(calls.at(-1).url, `${base}/getStateInstance/${encodeURIComponent(token)}`)
    assert.equal(calls.at(-1).options.method, 'GET')
  }
  for (const stateInstance of ['', null, 123]) {
    respond(JSON.stringify({ stateInstance }))
    await assert.rejects(getState, /getStateInstance/)
  }

  for (const action of [getState, send, receive, remove]) {
    for (const status of [400, 401, 403, 429, 500]) {
      respond(`<html>${token}</html>`, status)
      await assert.rejects(action, (error) => {
        assert.match(error.message, new RegExp(`HTTP ${status}`))
        assert.equal(error.status, status, 'Polling needs the HTTP status to distinguish temporary failures')
        assert.ok(!String(error).includes(token))
        return true
      })
    }
    respond(`invalid json ${token}`)
    await assert.rejects(action, /некорректный JSON/)
    for (const error of [{ status: 'error', code: 'INVALID_PARAM', message: token }, { status: false, message: token }, { error: token }]) {
      respond(JSON.stringify(error))
      await assert.rejects(action, (error) => {
        assert.match(error.message, /API вернул ошибку/)
        assert.ok(!String(error).includes(token))
        assert.equal(error.cause, undefined)
        return true
      })
    }
    for (const body of ['{}', '[]', 'true']) {
      respond(body)
      await assert.rejects(action)
    }
    reply = () => { throw new TypeError(`Failed to fetch ${base}/${token}`) }
    const before = calls.length
    await assert.rejects(action, (error) => {
      assert.match(error.message, /ошибка сети или таймаут/)
      assert.equal(error.retryable, true)
      assert.ok(!String(error).includes(token))
      assert.equal(error.cause, undefined)
      return true
    })
    assert.equal(calls.length, before + 1, 'No automatic retries')
  }
  for (const receiptId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '123']) {
    respond(JSON.stringify({ receiptId, body: {} }))
    await assert.rejects(receive, /receiptId или body/)
  }
  respond('{"receiptId":123,"body":null}')
  await assert.rejects(receive, /receiptId или body/)
  respond('{"result":false}')
  await assert.rejects(remove, /result: false/)
  respond('null')
  await assert.rejects(send, /idMessage/)
  await assert.rejects(remove, /результат удаления/)

  const beforeValidation = calls.length
  for (const chatId of ['', '0', 'chat@c.us', '123456@c.us', '01234567@c.us', '1234567890123456@c.us', '1234567890', '-1001234567890', '+123@c.us', '12.3', 'abc', 1234567890]) {
    await assert.rejects(() => sendMessage(idInstance, token, chatId, 'hi'), /chatId/)
  }
  for (const message of ['', '   ', 'x'.repeat(20001)]) {
    await assert.rejects(() => sendMessage(idInstance, token, '79001234567@c.us', message), /message/)
  }
  await assert.rejects(() => receiveNotification('../bad', token), /idInstance/)
  await assert.rejects(() => receiveNotification(idInstance, ' '), /apiTokenInstance/)
  await assert.rejects(() => deleteNotification(idInstance, token, '../bad'), /receiptId/)
  assert.equal(calls.length, beforeValidation, 'Invalid input must not reach fetch')
  // Отмена каждого запроса до получения ответа не раскрывает URL или токен.
  for (const action of [
    (signal) => getStateInstance(idInstance, token, signal),
    (signal) => sendMessage(idInstance, token, '79001234567@c.us', 'Привет', signal),
    (signal) => receiveNotification(idInstance, token, signal),
    (signal) => deleteNotification(idInstance, token, 123, signal),
  ]) {
    const controller = new AbortController()
    reply = (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException(token, 'AbortError')), { once: true })
    })
    const pending = action(controller.signal)
    controller.abort()
    await assert.rejects(pending, (error) => {
      assert.equal(error.name, 'AbortError')
      assert.ok(!String(error).includes(token))
      assert.equal(error.cause, undefined)
      return true
    })
  }
  console.log('API checks passed: state, requests, validation, HTTP/JSON/API/network errors and cancellation.')

  for (const [phone, normalized] of [
    ['+38 (050) 123-45-67', '380501234567'],
    [' 79001234567 ', '79001234567'],
    ['1234567', '1234567'],
    ['123456789012345', '123456789012345'],
  ]) {
    assert.equal(normalizePhoneNumber(phone), normalized)
    assert.equal(phoneToChatId(phone), `${normalized}@c.us`)
  }
  for (const phone of ['', '123456', '1234567890123456', '0123456789', 'abc1234567', '++1234567', '123+4567', '123.4567', null, 79001234567]) {
    assert.equal(normalizePhoneNumber(phone), null)
    assert.equal(phoneToChatId(phone), null)
  }

  const beforeDirectSend = calls.length
  const normalizedChatId = phoneToChatId('+7 (900) 123-45-67')
  respond('{"idMessage":"phone-message"}')
  assert.deepEqual(await sendMessage(idInstance, token, normalizedChatId, '  Привет!  '), { idMessage: 'phone-message' })
  const directSend = calls.slice(beforeDirectSend)
  assert.equal(directSend.length, 1, 'A new WhatsApp conversation needs only SendMessage')
  assert.equal(directSend[0].url, `${base}/sendMessage/${encodeURIComponent(token)}`)
  assert.deepEqual(JSON.parse(directSend[0].options.body), { chatId: '79001234567@c.us', message: '  Привет!  ' })

  for (const chatId of ['120363123456789012@g.us', '79001234567-1634567890@g.us', '123456789012345@lid']) {
    respond('{"idMessage":"group-message"}')
    await sendMessage(idInstance, token, chatId, 'x'.repeat(20000))
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), { chatId, message: 'x'.repeat(20000) })
  }

  const incoming = (id = 'incoming-1', chatId = '79001234567@c.us') => ({
    typeWebhook: 'incomingMessageReceived', idMessage: id,
    instanceData: { idInstance: 1101000001, typeInstance: 'whatsapp' },
    timestamp: 1791050000,
    senderData: { chatId, sender: chatId },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет!' } },
  })
  const firstMessage = {
    id: 'incoming-1', chatId: '79001234567@c.us', text: 'Привет!', direction: 'incoming',
    timestamp: 1791050000000, phoneNumber: '79001234567',
  }
  assert.deepEqual(messageFromNotification(incoming()), firstMessage)
  assert.deepEqual(messageFromNotification({
    ...incoming(), messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: 'https://example.com' } },
  }), { ...firstMessage, text: 'https://example.com' })
  const otherChat = messageFromNotification(incoming('incoming-2', '380501234567@c.us'))
  assert.equal(otherChat.chatId, '380501234567@c.us', 'Other chats must not be discarded before acknowledging')
  assert.equal(messageFromNotification({ typeWebhook: 'outgoingMessageStatus' }), null)
  const group = incoming('group-message', '120363123456789012@g.us')
  group.senderData = { chatId: '120363123456789012@g.us', sender: '79001234567@c.us' }
  assert.deepEqual(messageFromNotification(group), {
    id: 'group-message', chatId: '120363123456789012@g.us', text: 'Привет!', direction: 'incoming', timestamp: 1791050000000,
  })
  const unsupported = messageFromNotification({ ...incoming(), messageData: { typeMessage: 'imageMessage' } })
  assert.equal(unsupported, null, 'Only text messages are added to the conversation')
  const named = incoming('named')
  named.senderData.chatName = 'Анна'
  assert.equal(messageFromNotification(named).chatName, 'Анна')
  const withoutTimestamp = incoming('without-time')
  delete withoutTimestamp.timestamp
  assert.deepEqual(messageFromNotification(withoutTimestamp), {
    id: 'without-time', chatId: '79001234567@c.us', text: 'Привет!', direction: 'incoming', phoneNumber: '79001234567',
  })
  const groupSender = { ...group, senderData: { ...group.senderData, senderName: 'Участник', senderContactName: 'Знакомый участник' } }
  assert.equal(messageFromNotification(groupSender).chatName, undefined, 'A participant name must not become the group title')
  assert.equal(messageFromNotification(groupSender).phoneNumber, undefined, 'A participant phone must not become the group identity')
  const legacyGroup = messageFromNotification(incoming('legacy-group', '79001234567-1634567890@g.us'))
  assert.equal(legacyGroup.chatId, '79001234567-1634567890@g.us')
  assert.equal(legacyGroup.phoneNumber, undefined)
  const opaquePersonalId = messageFromNotification(incoming('opaque-contact', '123456789012345@lid'))
  assert.equal(opaquePersonalId.chatId, '123456789012345@lid', 'A WhatsApp LID remains the conversation key')
  assert.equal(opaquePersonalId.phoneNumber, undefined, 'A LID must not become a telephone number')
  for (const timestamp of [undefined, null, '1791050000', -1, 0, Infinity, 1e20]) {
    assert.equal(messageFromNotification({ ...incoming(), timestamp }).timestamp, undefined, 'Invalid dates must not reach time labels')
  }
  for (const malformed of [
    null, {}, { typeWebhook: ' ' },
    { ...incoming(), messageData: { typeMessage: '' } },
    { ...incoming(), idMessage: undefined },
    { ...incoming(), senderData: {} },
    { ...incoming(), senderData: { chatId: '79001234567' } },
    { ...incoming(), senderData: { chatId: '-1001234567890' } },
    { ...incoming(), senderData: { chatId: '123456@c.us' } },
    { ...incoming(), senderData: { chatId: 'not-an-id' } },
    { ...incoming(), senderData: { chatId: 1234567890 } },
    { ...incoming(), messageData: undefined },
    { ...incoming(), messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 123 } } },
    { ...incoming(), messageData: { typeMessage: 'extendedTextMessage' } },
    { ...incoming(), messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: '' } } },
    { ...incoming(), messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: '  ' } } },
  ]) assert.throws(() => messageFromNotification(malformed))
  const messages = appendMessage([], firstMessage)
  assert.deepEqual(messages, [firstMessage])
  assert.deepEqual(appendMessage(messages, { ...firstMessage }), messages)
  assert.deepEqual(appendMessage(messages, { ...firstMessage, chatId: otherChat.chatId }), [
    firstMessage, { ...firstMessage, chatId: otherChat.chatId },
  ])

  // Список хранит WhatsApp chatId, но показывает человеку имя или номер.
  const contact = { id: firstMessage.chatId, name: 'Анна', phoneNumber: '79001234567' }
  const createdChats = addChat([], contact)
  assert.deepEqual(createdChats, [contact])
  assert.equal(addChat(createdChats, { id: contact.id, name: 'Анна П.' }).length, 1, 'Opening an existing chat must not duplicate it')
  assert.equal(addChat(createdChats, { id: contact.id, name: 'Анна П.' })[0].phoneNumber, contact.phoneNumber)
  assert.equal(chatDisplayName(contact), 'Анна')
  assert.equal(chatDisplayName({ id: '380501234567@c.us', phoneNumber: '380501234567' }), '+380501234567')
  assert.equal(chatDisplayName({ id: '123456789012345@lid' }), 'Новый контакт')
  const emptyState = { chats: [], messages: [] }
  const stateWithIncoming = recordMessage(emptyState, firstMessage)
  assert.deepEqual(stateWithIncoming.messages, [firstMessage])
  assert.equal(stateWithIncoming.chats.length, 1, 'An incoming message automatically creates its conversation')
  assert.equal(stateWithIncoming.chats[0].id, firstMessage.chatId)
  assert.equal(stateWithIncoming.chats[0].lastMessage, firstMessage)
  assert.equal(recordMessage(stateWithIncoming, { ...firstMessage }), stateWithIncoming, 'Redelivery must preserve the whole state')
  const secondChat = recordMessage(stateWithIncoming, otherChat)
  assert.equal(secondChat.chats.length, 2)
  assert.deepEqual(secondChat.messages.filter((message) => message.chatId === firstMessage.chatId), [firstMessage])
  const knownState = { chats: createdChats, messages: [] }
  const metadataFree = { id: 'reply', chatId: contact.id, text: 'Ответ', direction: 'outgoing', timestamp: 1791050002000 }
  const knownAfterReply = recordMessage(knownState, metadataFree)
  assert.equal(knownAfterReply.chats[0].name, contact.name)
  assert.equal(knownAfterReply.chats[0].phoneNumber, contact.phoneNumber)
  const older = recordMessage(knownAfterReply, { ...firstMessage, id: 'older', timestamp: 1791050000000 })
  assert.equal(older.chats[0].lastMessage.id, metadataFree.id, 'Older queued messages must not roll back the preview')
  const sameSecondState = recordMessage(knownState, {
    ...metadataFree, id: 'sent-with-milliseconds', timestamp: 2000500,
  })
  const sameSecondReply = recordMessage(sameSecondState, {
    ...firstMessage, id: 'received-with-seconds', timestamp: 2000000,
  })
  assert.equal(sameSecondReply.chats[0].lastMessage.id, 'received-with-seconds',
    'A WhatsApp reply timestamped to seconds must update a same-second outgoing preview')

  const deferred = () => {
    let resolve
    const promise = new Promise((done) => { resolve = done })
    return { promise, resolve }
  }
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
  const waitFor = async (condition, timeout = 1000) => {
    const deadline = Date.now() + timeout
    while (!condition() && Date.now() < deadline) await tick()
    assert.ok(condition(), 'Async operation must reach the expected step')
  }
  const settleAbort = async (pending) => {
    const [result] = await Promise.allSettled([pending])
    if (result.status === 'rejected') assert.equal(result.reason.name, 'AbortError')
  }
  const abortable = (signal) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(new DOMException('Cancelled', 'AbortError'))
    else signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
  })

  // Один запрос за раз: до ответа нет обработки; до обработки нет delete;
  // до ответа delete нет следующего receive, включая пустую очередь.
  const controller = new AbortController()
  const receiveReply = deferred()
  const handled = deferred()
  const deleted = deferred()
  let polls = 0
  const trace = []
  reply = (url, { signal }) => {
    if (url.includes('/receiveNotification/')) {
      polls += 1
      trace.push('receive')
      if (polls === 1) return new Response('null')
      if (polls === 2) return receiveReply.promise
      return abortable(signal)
    }
    trace.push('delete')
    return deleted.promise
  }
  const polling = pollNotifications(idInstance, token, async (message) => {
    trace.push('handle')
    assert.deepEqual(message, firstMessage)
    await handled.promise
  }, controller.signal)
  await waitFor(() => polls === 2)
  assert.deepEqual(trace, ['receive', 'receive'])
  await tick()
  assert.deepEqual(trace, ['receive', 'receive'], 'A pending long-poll must not overlap another one')
  receiveReply.resolve(new Response(JSON.stringify({ receiptId: 123, body: incoming() })))
  await waitFor(() => trace.includes('handle'))
  assert.deepEqual(trace, ['receive', 'receive', 'handle'])
  handled.resolve()
  await waitFor(() => trace.includes('delete'))
  assert.deepEqual(trace, ['receive', 'receive', 'handle', 'delete'])
  await tick()
  assert.equal(polls, 2, 'The next receive must wait for delete')
  deleted.resolve(new Response('{"result":true}'))
  await waitFor(() => polls === 3)
  controller.abort()
  await settleAbort(polling)
  assert.deepEqual(trace, ['receive', 'receive', 'handle', 'delete', 'receive'])

  for (const body of [
    incoming('other', otherChat.chatId), { typeWebhook: 'outgoingMessageStatus' },
    { ...incoming('image'), messageData: { typeMessage: 'imageMessage' } },
  ]) {
    const controller = new AbortController()
    const observed = []
    let received = false
    const before = calls.length
    reply = (url, { signal }) => {
      if (url.includes('/deleteNotification/')) return new Response('{"result":true}')
      if (!received) {
        received = true
        return new Response(JSON.stringify({ receiptId: 124, body }))
      }
      controller.abort()
      return abortable(signal)
    }
    await settleAbort(pollNotifications(idInstance, token, (message) => observed.push(message), controller.signal))
    assert.equal(calls.slice(before).filter(({ options }) => options.method === 'DELETE').length, 1)
    const message = messageFromNotification(body)
    assert.deepEqual(observed, message ? [message] : [])
  }

  // Временный сбой receive восстанавливается без второго параллельного запроса.
  const recoveryController = new AbortController()
  const recoveryTrace = []
  const notices = []
  let recoveryPolls = 0
  const recoveryStart = Date.now()
  reply = (url, { signal }) => {
    if (url.includes('/deleteNotification/')) {
      recoveryTrace.push('delete')
      return new Response('{"result":true}')
    }
    recoveryPolls += 1
    recoveryTrace.push('receive')
    if (recoveryPolls === 1) return new Response(`temporary ${token}`, { status: 500 })
    if (recoveryPolls === 2) return new Response(JSON.stringify({ receiptId: 126, body: incoming('recovered') }))
    return abortable(signal)
  }
  const recovery = pollNotifications(idInstance, token, (message) => {
    recoveryTrace.push('handle')
    assert.equal(message.id, 'recovered')
  }, recoveryController.signal, (notice) => notices.push(notice))
  await waitFor(() => notices.length === 1)
  assert.equal(recoveryPolls, 1)
  assert.ok(notices[0].length > 0)
  assert.ok(!notices[0].includes(token), 'The recovery notice must not reveal credentials')
  await waitFor(() => recoveryPolls === 3, 2000)
  assert.ok(Date.now() - recoveryStart >= 900, 'Temporary errors need a small backoff before retrying')
  assert.deepEqual(recoveryTrace, ['receive', 'receive', 'handle', 'delete', 'receive'])
  assert.equal(notices.at(-1), '', 'A successful receive clears the temporary connection notice')
  recoveryController.abort()
  await settleAbort(recovery)

  // Ускоряем только таймеры backoff: проверяем задержки, их предел и сброс
  // после успешного receive без долгого ожидания реального времени в check.
  const originalSetTimeout = globalThis.setTimeout
  const retryDelays = []
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay >= 1000) retryDelays.push(delay)
    return originalSetTimeout(callback, delay >= 1000 ? 0 : delay, ...args)
  }
  try {
    const repeatedController = new AbortController()
    let repeatedPolls = 0
    const receivedMessages = []
    reply = (url, { signal }) => {
      if (url.includes('/deleteNotification/')) return new Response('{"result":true}')
      repeatedPolls += 1
      if (repeatedPolls === 1) return new Response('{}', { status: 503 })
      if (repeatedPolls === 2) return new Response('{}', { status: 429 })
      if (repeatedPolls === 3) throw new TypeError(`Failed to fetch ${token}`)
      if (repeatedPolls === 4) return new Response('{}', { status: 502 })
      if (repeatedPolls === 5) return new Response('{}', { status: 500 })
      if (repeatedPolls === 6) return new Response('null')
      if (repeatedPolls === 7) return new Response('{}', { status: 503 })
      if (repeatedPolls === 8) return new Response(JSON.stringify({ receiptId: 127, body: incoming('after-retries') }))
      repeatedController.abort()
      return abortable(signal)
    }
    await settleAbort(pollNotifications(idInstance, token, (message) => receivedMessages.push(message), repeatedController.signal))
    assert.deepEqual(retryDelays, [1000, 2000, 4000, 8000, 8000, 1000])
    assert.equal(receivedMessages.length, 1)
    assert.equal(receivedMessages[0].id, 'after-retries')
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }

  // Выход во время backoff отменяет таймер и весь цикл, а не только fetch.
  const backoffController = new AbortController()
  let backoffPolls = 0
  let waitingToRetry = false
  reply = () => {
    backoffPolls += 1
    return new Response('{}', { status: 503 })
  }
  const backoffPolling = pollNotifications(idInstance, token, () => assert.fail('No message before recovery'), backoffController.signal, () => {
    waitingToRetry = true
  })
  await waitFor(() => waitingToRetry)
  await tick()
  backoffController.abort()
  await settleAbort(backoffPolling)
  await tick()
  assert.equal(backoffPolls, 1, 'Aborting during backoff must prevent the next receive')

  for (const failedResponse of [
    () => new Response('{}', { status: 401 }),
    () => new Response('invalid JSON'),
    () => new Response('{}'),
  ]) {
    const permanentController = new AbortController()
    const before = calls.length
    let displayedTransient = false
    reply = failedResponse
    await assert.rejects(pollNotifications(idInstance, token, () => assert.fail('Invalid response must not be processed'), permanentController.signal, () => {
      displayedTransient = true
    }))
    assert.equal(calls.length, before + 1, 'Permanent API/JSON/schema failures must not retry forever')
    assert.equal(displayedTransient, false)
  }

  for (const scenario of ['handler-failure', 'malformed', 'abort-after-receive', 'abort-after-handler', 'delete-failure', 'receive-failure']) {
    const controller = new AbortController()
    const before = calls.length
    let handledCount = 0
    reply = (url) => {
      if (url.includes('/deleteNotification/')) return new Response('{}', { status: 503 })
      if (scenario === 'receive-failure') return new Response('{}', { status: 401 })
      if (scenario === 'abort-after-receive') controller.abort()
      return new Response(JSON.stringify({
        receiptId: 125,
        body: scenario === 'malformed' ? { ...incoming(), senderData: {} } : incoming(),
      }))
    }
    const pending = pollNotifications(idInstance, token, () => {
      handledCount += 1
      if (scenario === 'handler-failure') throw new Error('Handler failed')
      if (scenario === 'abort-after-handler') controller.abort()
    }, controller.signal)
    if (scenario.startsWith('abort-')) await settleAbort(pending)
    else await assert.rejects(pending)
    const scenarioCalls = calls.slice(before)
    assert.equal(scenarioCalls.filter(({ options }) => options.method === 'DELETE').length, scenario === 'delete-failure' ? 1 : 0, scenario)
    assert.equal(scenarioCalls.filter(({ options }) => options.method === 'GET').length, 1, `${scenario}: no automatic retry`)
    assert.equal(handledCount, ['malformed', 'abort-after-receive', 'receive-failure'].includes(scenario) ? 0 : 1)
  }
  console.log('WhatsApp checks passed: phone normalization, direct sending, text notifications, per-chat state, deduplication, sequential polling, recovery and abortable backoff.')
} finally {
  globalThis.fetch = originalFetch
}
