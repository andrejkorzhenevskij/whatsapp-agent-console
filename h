[1mdiff --git a/README.md b/README.md[m
[1mindex f9012e8..7844be8 100644[m
[1m--- a/README.md[m
[1m+++ b/README.md[m
[36m@@ -2,8 +2,11 @@[m
 [m
 Основа будущего чат-клиента GREEN-API на React + JavaScript, созданная через[m
 официальный шаблон Vite `react`. TypeScript не используется.[m
[31m-Сейчас приложение показывает стартовую страницу; подключение к API и обмен[m
[31m-сообщениями ещё не реализованы.[m
[32m+[m[32mСначала приложение показывает форму авторизации. После ввода `idInstance`[m
[32m+[m[32m(цифры) и `apiTokenInstance` открывается окно чата. Это локальный демо-режим:[m
[32m+[m[32mданные не проверяются сервером, UI пока не вызывает GREEN-API.[m
[32m+[m[32mСообщения добавляются только на странице. Выход или перезагрузка очищает[m
[32m+[m[32mданные подключения и переписку.[m
 [m
 ## Запуск[m
 [m
[36m@@ -25,6 +28,7 @@[m [mnpm run dev[m
 [m
 ```bash[m
 npm run lint     # Проверить JavaScript и JSX через Oxlint[m
[32m+[m[32mnpm run check    # Проверить компоненты и API-слой с подменённым fetch[m
 npm run build    # Собрать приложение в dist/[m
 npm run preview  # Локально посмотреть готовую сборку после build[m
 ```[m
[36m@@ -36,9 +40,17 @@[m [mnpm run preview  # Локально посмотреть готовую сбор[m
 ```text[m
 react/[m
 ├── src/[m
[31m-│   ├── App.jsx          # Главный компонент будущего чата[m
[32m+[m[32m│   ├── api/[m
[32m+[m[32m│   │   └── greenApi.js  # Запросы и обработка ошибок GREEN-API[m
[32m+[m[32m│   ├── components/[m
[32m+[m[32m│   │   ├── AuthForm.jsx[m
[32m+[m[32m│   │   ├── ChatWindow.jsx[m
[32m+[m[32m│   │   ├── MessageList.jsx[m
[32m+[m[32m│   │   └── MessageInput.jsx[m
[32m+[m[32m│   ├── App.jsx          # Состояние подключения и переключение экранов[m
 │   ├── main.jsx         # Точка входа React[m
 │   └── index.css        # Стили приложения[m
[32m+[m[32m├── scripts/check.mjs    # Проверка компонентов и API без дополнительных библиотек[m
 ├── index.html[m
 ├── vite.config.js[m
 ├── .oxlintrc.json[m
[36m@@ -48,14 +60,62 @@[m [mreact/[m
 └── README.md[m
 ```[m
 [m
[31m-## Дальнейшая реализация[m
[32m+[m[32m## API-слой[m
 [m
[31m-Начните с формы подключения в `src/App.jsx`, затем добавьте диалоги и отправку[m
[31m-и получение сообщений. Когда появятся запросы к GREEN-API, их можно вынести[m
[31m-в `src/greenApi.js`, используя встроенный `fetch`. Отдельные компоненты[m
[31m-выделяйте по мере роста интерфейса.[m
[32m+[m[32m`src/api/greenApi.js` экспортирует три асинхронные функции:[m
[32m+[m
[32m+[m[32m| Функция | Запрос | Результат |[m
[32m+[m[32m| --- | --- | --- |[m
[32m+[m[32m| `sendMessage(idInstance, apiTokenInstance, chatId, message)` | `POST /waInstance{idInstance}/sendMessage/{apiTokenInstance}` с JSON `{chatId, message}` | `{idMessage}` — сообщение принято в очередь, доставка ещё не подтверждена |[m
[32m+[m[32m| `receiveNotification(idInstance, apiTokenInstance)` | `GET /waInstance{idInstance}/receiveNotification/{apiTokenInstance}?receiveTimeout=5` | `{receiptId, body}` либо `null`, если очередь пуста |[m
[32m+[m[32m| `deleteNotification(idInstance, apiTokenInstance, receiptId)` | `DELETE /waInstance{idInstance}/deleteNotification/{apiTokenInstance}/{receiptId}` | `{result: true}`; `result: false` вызывает ошибку |[m
[32m+[m
[32m+[m[32mБазовый адрес — `https://api.greenapi.com`, официальный универсальный хост.[m
[32m+[m[32mGREEN-API рекомендует `apiUrl` конкретного инстанса из личного кабинета;[m
[32m+[m[32mпри переходе на выделенный сервер замените `API_URL` в модуле на этот адрес.[m
[32m+[m[32m[Рекомендации по хостам](https://green-api.com/en/docs/api/recommendations/using-green-api-hosts/).[m
[32m+[m
[32m+[m[32m`idInstance` и `receiptId` принимаются как положительное безопасное целое число[m
[32m+[m[32mили строка цифр, `apiTokenInstance` — непустая строка. `chatId` — идентификатор[m
[32m+[m[32mчата, например `79001234567@c.us` или `120363043968066561@g.us`.[m
[32m+[m[32mТекст сообщения сохраняет пробелы и переносы; пустой текст и текст длиннее[m
[32m+[m[32m20000 символов отклоняются до запроса.[m
[32m+[m
[32m+[m[32mПолучение — один HTTP long-poll до 5 секунд. Пустое тело ответа также возвращает[m
[32m+[m[32m`null`. Постоянный опрос не запускается. Общий сетевой таймаут — 15 секунд.[m
[32m+[m[32mДля HTTP API в настройках инстанса нужно включить нужные уведомления и очистить[m
[32m+[m[32m`webhookUrl`; модуль не изменяет эти настройки.[m
[32m+[m
[32m+[m[32mУведомление удаляется **только после успешной обработки** вызывающим кодом:[m
[32m+[m
[32m+[m[32m```js[m
[32m+[m[32mimport { receiveNotification, deleteNotification } from './src/api/greenApi.js'[m
[32m+[m
[32m+[m[32mconst notification = await receiveNotification(idInstance, apiTokenInstance)[m
[32m+[m[32mif (notification !== null) {[m
[32m+[m[32m  await handleNotification(notification.body) // Ваша обработка или сохранение[m
[32m+[m[32m  await deleteNotification(idInstance, apiTokenInstance, notification.receiptId)[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32mЕсли обработка завершится ошибкой, удаление не выполняется и уведомление[m
[32m+[m[32mостанется в очереди. Сам `receiveNotification` ничего не удаляет.[m
[32m+[m
[32m+[m[32mСетевые сбои, HTTP-ошибки (с кодом), невалидный JSON, ошибки API и неожиданные[m
[32m+[m[32mформаты ответа отклоняют Promise с `Error`. Ошибки не содержат URL с токеном[m
[32m+[m[32mили исходное тело ответа. Автоматических повторов нет, чтобы не дублировать[m
[32m+[m[32mотправку сообщения. Credentials передаются аргументами, не логируются и не[m
[32m+[m[32mсохраняются в `localStorage`/`sessionStorage`.[m
[32m+[m
[32m+[m[32m`npm run check` подменяет `fetch`: проверяет методы и адреса, JSON отправки,[m
[32m+[m[32mпустую очередь, отдельное удаление, валидацию и ошибки. Реальные сообщения[m
[32m+[m[32mне отправляются. UI остаётся локальным демо; подключение API к компонентам —[m
[32m+[m[32mследующий этап.[m
[32m+[m
[32m+[m[32mОфициальная документация:[m
[32m+[m[32m[SendMessage](https://green-api.com/docs/api/sending/SendMessage/),[m
[32m+[m[32m[ReceiveNotification](https://green-api.com/docs/api/receiving/technology-http-api/ReceiveNotification/),[m
[32m+[m[32m[DeleteNotification](https://green-api.com/docs/api/receiving/technology-http-api/DeleteNotification/).[m
 [m
 Токены доступа не добавляйте в исходники или Git. Переменные `VITE_*` доступны[m
 в браузере и не подходят для хранения серверных секретов.[m
[31m-[m
[31m-Документация сборщика: [Vite](https://vite.dev/guide/).[m
[1mdiff --git a/package.json b/package.json[m
[1mindex b24dcfa..e56de36 100644[m
[1m--- a/package.json[m
[1m+++ b/package.json[m
[36m@@ -7,6 +7,7 @@[m
     "dev": "vite",[m
     "build": "vite build",[m
     "lint": "oxlint",[m
[32m+[m[32m    "check": "node scripts/check.mjs",[m
     "preview": "vite preview"[m
   },[m
   "dependencies": {[m
[1mdiff --git a/scripts/check.mjs b/scripts/check.mjs[m
[1mnew file mode 100644[m
[1mindex 0000000..3461b7c[m
[1m--- /dev/null[m
[1m+++ b/scripts/check.mjs[m
[36m@@ -0,0 +1,142 @@[m
[32m+[m[32mimport assert from 'node:assert/strict'[m
[32m+[m[32mimport { createElement } from 'react'[m
[32m+[m[32mimport { renderToStaticMarkup } from 'react-dom/server'[m
[32m+[m[32mimport { createServer } from 'vite'[m
[32m+[m[32mimport { sendMessage, receiveNotification, deleteNotification } from '../src/api/greenApi.js'[m
[32m+[m
[32m+[m[32mconst server = await createServer({ server: { middlewareMode: true } })[m
[32m+[m[32mtry {[m
[32m+[m[32m  const { default: App } = await server.ssrLoadModule('/src/App.jsx')[m
[32m+[m[32m  const { default: ChatWindow } = await server.ssrLoadModule('/src/components/ChatWindow.jsx')[m
[32m+[m[32m  const { default: MessageList } = await server.ssrLoadModule('/src/components/MessageList.jsx')[m
[32m+[m
[32m+[m[32m  const auth = renderToStaticMarkup(createElement(App))[m
[32m+[m[32m  assert.match(auth, /name="idInstance"/)[m
[32m+[m[32m  assert.match(auth, /type="password"/)[m
[32m+[m[32m  assert.match(auth, /<button[^>]*disabled/)[m
[32m+[m[32m  assert.doesNotMatch(auth, /role="log"/)[m
[32m+[m
[32m+[m[32m  const chat = renderToStaticMarkup(createElement(ChatWindow, { idInstance: '123' }))[m
[32m+[m[32m  assert.match(chat, /Чат · 123/)[m
[32m+[m[32m  assert.match(chat, /Сообщений пока нет/)[m
[32m+[m[32m  assert.match(chat, /name="message"/)[m
[32m+[m[32m  assert.match(chat, /<button type="submit" disabled/)[m
[32m+[m
[32m+[m[32m  const messages = renderToStaticMarkup(createElement(MessageList, {[m
[32m+[m[32m    messages: [{ id: '1', text: '<script>alert("test")</script>' }],[m
[32m+[m[32m  }))[m
[32m+[m[32m  assert.match(messages, /&lt;script&gt;/)[m
[32m+[m[32m  assert.doesNotMatch(messages, /<script>/)[m
[32m+[m[32m  console.log('Component checks passed: auth, empty chat, input, safe message text.')[m
[32m+[m[32m} finally {[m
[32m+[m[32m  await server.close()[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m// Все API-запросы подменяются: настоящие credentials и доступ к GREEN-API не нужны.[m
[32m+[m[32mconst originalFetch = globalThis.fetch[m
[32m+[m[32mconst calls = [][m
[32m+[m[32mconst idInstance = '1101000001'[m
[32m+[m[32mconst token = 'test-token/not-a-secret'[m
[32m+[m[32mconst base = `https://api.greenapi.com/waInstance${idInstance}`[m
[32m+[m[32mlet reply = () => new Response('null')[m
[32m+[m[32mglobalThis.fetch = async (url, options) => {[m
[32m+[m[32m  calls.push({ url, options })[m
[32m+[m[32m  return reply()[m
[32m+[m[32m}[m
[32m+[m[32mconst respond = (body, status = 200) => {[m
[32m+[m[32m  reply = () => new Response(body, { status })[m
[32m+[m[32m}[m
[32m+[m[32mconst send = () => sendMessage(idInstance, token, '79001234567@c.us', '  Привет! 😃\n ')[m
[32m+[m[32mconst receive = () => receiveNotification(idInstance, token)[m
[32m+[m[32mconst remove = () => deleteNotification(idInstance, token, 123)[m
[32m+[m
[32m+[m[32mtry {[m
[32m+[m[32m  respond('{"idMessage":"message-1"}')[m
[32m+[m[32m  assert.deepEqual(await send(), { idMessage: 'message-1' })[m
[32m+[m[32m  assert.equal(calls[0].url, `${base}/sendMessage/${encodeURIComponent(token)}`)[m
[32m+[m[32m  assert.equal(calls[0].options.method, 'POST')[m
[32m+[m[32m  assert.equal(calls[0].options.headers['Content-Type'], 'application/json')[m
[32m+[m[32m  assert.equal(calls[0].options.cache, 'no-store')[m
[32m+[m[32m  assert.equal(calls[0].options.credentials, 'omit')[m
[32m+[m[32m  assert.ok(calls[0].options.signal instanceof AbortSignal)[m
[32m+[m[32m  assert.deepEqual(JSON.parse(calls[0].options.body), {[m
[32m+[m[32m    chatId: '79001234567@c.us', message: '  Привет! 😃\n ',[m
[32m+[m[32m  })[m
[32m+[m
[32m+[m[32m  for (const empty of ['null', '', '  ']) {[m
[32m+[m[32m    respond(empty)[m
[32m+[m[32m    const before = calls.length[m
[32m+[m[32m    assert.equal(await receive(), null)[m
[32m+[m[32m    assert.equal(calls.length, before + 1)[m
[32m+[m[32m    assert.equal(calls.at(-1).url, `${base}/receiveNotification/${encodeURIComponent(token)}?receiveTimeout=5`)[m
[32m+[m[32m    assert.equal(calls.at(-1).options.method, 'GET')[m
[32m+[m[32m    assert.equal(calls.at(-1).options.body, undefined)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  // Даже событие об ошибке внутри body — уведомление, а не ошибка самого запроса.[m
[32m+[m[32m  const notification = { receiptId: 123, body: { typeWebhook: 'incomingMessageReceived', message: 'hi', error: 'event data' } }[m
[32m+[m[32m  respond(JSON.stringify(notification))[m
[32m+[m[32m  const beforeReceive = calls.length[m
[32m+[m[32m  assert.deepEqual(await receive(), notification)[m
[32m+[m[32m  assert.equal(calls.length, beforeReceive + 1, 'Receiving must not delete before processing')[m
[32m+[m[32m  respond('{"result":true}')[m
[32m+[m[32m  assert.deepEqual(await remove(), { result: true })[m
[32m+[m[32m  assert.equal(calls.at(-1).url, `${base}/deleteNotification/${encodeURIComponent(token)}/123`)[m
[32m+[m[32m  assert.equal(calls.at(-1).options.method, 'DELETE')[m
[32m+[m[32m  assert.equal(calls.at(-1).options.body, undefined)[m
[32m+[m
[32m+[m[32m  for (const action of [send, receive, remove]) {[m
[32m+[m[32m    for (const status of [400, 401, 403, 429, 500]) {[m
[32m+[m[32m      respond(`<html>${token}</html>`, status)[m
[32m+[m[32m      await assert.rejects(action, new RegExp(`HTTP ${status}`))[m
[32m+[m[32m    }[m
[32m+[m[32m    respond(`invalid json ${token}`)[m
[32m+[m[32m    await assert.rejects(action, /некорректный JSON/)[m
[32m+[m[32m    for (const error of [{ status: 'error', code: 'INVALID_PARAM', message: token }, { error: token }]) {[m
[32m+[m[32m      respond(JSON.stringify(error))[m
[32m+[m[32m      await assert.rejects(action, (error) => {[m
[32m+[m[32m        assert.match(error.message, /API вернул ошибку/)[m
[32m+[m[32m        assert.ok(!String(error).includes(token))[m
[32m+[m[32m        assert.equal(error.cause, undefined)[m
[32m+[m[32m        return true[m
[32m+[m[32m      })[m
[32m+[m[32m    }[m
[32m+[m[32m    for (const body of ['{}', '[]', 'true']) {[m
[32m+[m[32m      respond(body)[m
[32m+[m[32m      await assert.rejects(action)[m
[32m+[m[32m    }[m
[32m+[m[32m    reply = () => { throw new TypeError(`Failed to fetch ${base}/${token}`) }[m
[32m+[m[32m    const before = calls.length[m
[32m+[m[32m    await assert.rejects(action, (error) => {[m
[32m+[m[32m      assert.match(error.message, /ошибка сети или таймаут/)[m
[32m+[m[32m      assert.ok(!String(error).includes(token))[m
[32m+[m[32m      assert.equal(error.cause, undefined)[m
[32m+[m[32m      return true[m
[32m+[m[32m    })[m
[32m+[m[32m    assert.equal(calls.length, before + 1, 'No automatic retries')[m
[32m+[m[32m  }[m
[32m+[m[32m  for (const receiptId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '123']) {[m
[32m+[m[32m    respond(JSON.stringify({ receiptId, body: {} }))[m
[32m+[m[32m    await assert.rejects(receive, /receiptId или body/)[m
[32m+[m[32m  }[m
[32m+[m[32m  respond('{"receiptId":123,"body":null}')[m
[32m+[m[32m  await assert.rejects(receive, /receiptId или body/)[m
[32m+[m[32m  respond('{"result":false}')[m
[32m+[m[32m  await assert.rejects(remove, /result: false/)[m
[32m+[m[32m  respond('null')[m
[32m+[m[32m  await assert.rejects(send, /idMessage/)[m
[32m+[m[32m  await assert.rejects(remove, /результат удаления/)[m
[32m+[m
[32m+[m[32m  const beforeValidation = calls.length[m
[32m+[m[32m  await assert.rejects(() => sendMessage(idInstance, token, '', 'hi'), /chatId/)[m
[32m+[m[32m  for (const message of ['', '   ', 'x'.repeat(20001)]) {[m
[32m+[m[32m    await assert.rejects(() => sendMessage(idInstance, token, 'chat@c.us', message), /message/)[m
[32m+[m[32m  }[m
[32m+[m[32m  await assert.rejects(() => receiveNotification('../bad', token), /idInstance/)[m
[32m+[m[32m  await assert.rejects(() => receiveNotification(idInstance, ' '), /apiTokenInstance/)[m
[32m+[m[32m  await assert.rejects(() => deleteNotification(idInstance, token, '../bad'), /receiptId/)[m
[32m+[m[32m  assert.equal(calls.length, beforeValidation, 'Invalid input must not reach fetch')[m
[32m+[m[32m  console.log('API checks passed: requests, notifications, validation, HTTP/JSON/API/network errors.')[m
[32m+[m[32m} finally {[m
[32m+[m[32m  globalThis.fetch = originalFetch[m
[32m+[m[32m}[m
[1mdiff --git a/src/App.jsx b/src/App.jsx[m
[1mindex a4659ff..4109efd 100644[m
[1m--- a/src/App.jsx[m
[1m+++ b/src/App.jsx[m
[36m@@ -1,11 +1,22 @@[m
[32m+[m[32mimport { useState } from 'react'[m
[32m+[m[32mimport AuthForm from './components/AuthForm.jsx'[m
[32m+[m[32mimport ChatWindow from './components/ChatWindow.jsx'[m
[32m+[m
 export default function App() {[m
[32m+[m[32m  const [connection, setConnection] = useState(null)[m
[32m+[m
   return ([m
     <main className="app">[m
       <p className="brand">GREEN-API</p>[m
       <h1>Чат-клиент</h1>[m
[31m-      <p>[m
[31m-        Здесь появятся подключение к аккаунту, список диалогов и обмен сообщениями.[m
[31m-      </p>[m
[32m+[m[32m      {connection ? ([m
[32m+[m[32m        <ChatWindow[m
[32m+[m[32m          idInstance={connection.idInstance}[m
[32m+[m[32m          onDisconnect={() => setConnection(null)}[m
[32m+[m[32m        />[m
[32m+[m[32m      ) : ([m
[32m+[m[32m        <AuthForm onConnect={setConnection} />[m
[32m+[m[32m      )}[m
     </main>[m
   )[m
 }[m
[1mdiff --git a/src/api/greenApi.js b/src/api/greenApi.js[m
[1mnew file mode 100644[m
[1mindex 0000000..4488f17[m
[1m--- /dev/null[m
[1m+++ b/src/api/greenApi.js[m
[36m@@ -0,0 +1,99 @@[m
[32m+[m[32m// ponytail: универсальный хост; для выделенного сервера заменить на apiUrl инстанса.[m
[32m+[m[32mconst API_URL = 'https://api.greenapi.com'[m
[32m+[m
[32m+[m[32mfunction isPositiveInteger(value) {[m
[32m+[m[32m  return (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||[m
[32m+[m[32m    (Number.isSafeInteger(value) && value > 0)[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mfunction isNonEmptyString(value) {[m
[32m+[m[32m  return typeof value === 'string' && value.trim().length > 0[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32masync function request(idInstance, apiTokenInstance, method, httpMethod, suffix = '', body) {[m
[32m+[m[32m  if (!isPositiveInteger(idInstance)) {[m
[32m+[m[32m    throw new Error('idInstance должен быть положительным целым числом.')[m
[32m+[m[32m  }[m
[32m+[m[32m  if (!isNonEmptyString(apiTokenInstance)) {[m
[32m+[m[32m    throw new Error('apiTokenInstance обязателен.')[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const url = `${API_URL}/waInstance${idInstance}/${method}/${encodeURIComponent(apiTokenInstance.trim())}${suffix}`[m
[32m+[m[32m  let response[m
[32m+[m[32m  let text[m
[32m+[m[32m  try {[m
[32m+[m[32m    response = await fetch(url, {[m
[32m+[m[32m      method: httpMethod,[m
[32m+[m[32m      headers: { 'Content-Type': 'application/json' },[m
[32m+[m[32m      body: body === undefined ? undefined : JSON.stringify(body),[m
[32m+[m[32m      cache: 'no-store',[m
[32m+[m[32m      credentials: 'omit',[m
[32m+[m[32m      signal: AbortSignal.timeout(15000),[m
[32m+[m[32m    })[m
[32m+[m[32m    if (response.ok) text = await response.text()[m
[32m+[m[32m  } catch {[m
[32m+[m[32m    // Ошибки fetch могут содержать URL с токеном: не передаём их наружу.[m
[32m+[m[32m    throw new Error(`GREEN-API ${method}: ошибка сети или таймаут.`)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (!response.ok) {[m
[32m+[m[32m    throw new Error(`GREEN-API ${method}: HTTP ${response.status}.`)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  let data[m
[32m+[m[32m  try {[m
[32m+[m[32m    data = text.trim() ? JSON.parse(text) : null[m
[32m+[m[32m  } catch {[m
[32m+[m[32m    throw new Error(`GREEN-API ${method}: некорректный JSON в ответе.`)[m
[32m+[m[32m  }[m
[32m+[m[32m  if (data?.status === 'error' || data?.error || data?.errorCode) {[m
[32m+[m[32m    // Не включаем тело ответа: сервер может вернуть в нём credentials.[m
[32m+[m[32m    throw new Error(`GREEN-API ${method}: API вернул ошибку.`)[m
[32m+[m[32m  }[m
[32m+[m[32m  return data[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mexport async function sendMessage(idInstance, apiTokenInstance, chatId, message) {[m
[32m+[m[32m  if (!isNonEmptyString(chatId)) throw new Error('chatId обязателен.')[m
[32m+[m[32m  if (!isNonEmptyString(message) || message.length > 20000) {[m
[32m+[m[32m    throw new Error('message должен содержать от 1 до 20000 символов, не только пробелы.')[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const data = await request(idInstance, apiTokenInstance, 'sendMessage', 'POST', '', {[m
[32m+[m[32m    chatId: chatId.trim(),[m
[32m+[m[32m    message,[m
[32m+[m[32m  })[m
[32m+[m[32m  if (!isNonEmptyString(data?.idMessage)) {[m
[32m+[m[32m    throw new Error('GREEN-API sendMessage: в ответе отсутствует idMessage.')[m
[32m+[m[32m  }[m
[32m+[m[32m  return data[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m// Один long-poll (до 5 секунд). Подтверждение выполняется отдельно после обработки.[m
[32m+[m[32mexport async function receiveNotification(idInstance, apiTokenInstance) {[m
[32m+[m[32m  const data = await request([m
[32m+[m[32m    idInstance, apiTokenInstance, 'receiveNotification', 'GET', '?receiveTimeout=5',[m
[32m+[m[32m  )[m
[32m+[m[32m  if (data === null) return null[m
[32m+[m[32m  if (!Number.isSafeInteger(data?.receiptId) || data.receiptId <= 0 ||[m
[32m+[m[32m      !data.body || typeof data.body !== 'object' || Array.isArray(data.body)) {[m
[32m+[m[32m    throw new Error('GREEN-API receiveNotification: некорректные receiptId или body.')[m
[32m+[m[32m  }[m
[32m+[m[32m  return data[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mexport async function deleteNotification(idInstance, apiTokenInstance, receiptId) {[m
[32m+[m[32m  if (!isPositiveInteger(receiptId)) {[m
[32m+[m[32m    throw new Error('receiptId должен быть положительным целым числом.')[m
[32m+[m[32m  }[m
[32m+[m[32m  const data = await request([m
[32m+[m[32m    idInstance, apiTokenInstance, 'deleteNotification', 'DELETE', `/${receiptId}`,[m
[32m+[m[32m  )[m
[32m+[m[32m  if (data?.result === false) {[m
[32m+[m[32m    throw new Error('GREEN-API deleteNotification: уведомление не удалено (result: false).')[m
[32m+[m[32m  }[m
[32m+[m[32m  if (data?.result !== true) {[m
[32m+[m[32m    throw new Error('GREEN-API deleteNotification: некорректный результат удаления.')[m
[32m+[m[32m  }[m
[32m+[m[32m  return data[m
[32m+[m[32m}[m
[1mdiff --git a/src/components/AuthForm.jsx b/src/components/AuthForm.jsx[m
[1mnew file mode 100644[m
[1mindex 0000000..472411e[m
[1m--- /dev/null[m
[1m+++ b/src/components/AuthForm.jsx[m
[36m@@ -0,0 +1,53 @@[m
[32m+[m[32mimport { useState } from 'react'[m
[32m+[m
[32m+[m[32mexport default function AuthForm({ onConnect }) {[m
[32m+[m[32m  const [idInstance, setIdInstance] = useState('')[m
[32m+[m[32m  const [apiTokenInstance, setApiTokenInstance] = useState('')[m
[32m+[m
[32m+[m[32m  function handleSubmit(event) {[m
[32m+[m[32m    event.preventDefault()[m
[32m+[m[32m    const credentials = {[m
[32m+[m[32m      idInstance: idInstance.trim(),[m
[32m+[m[32m      apiTokenInstance: apiTokenInstance.trim(),[m
[32m+[m[32m    }[m
[32m+[m[32m    if (!/^\d+$/.test(credentials.idInstance) || !credentials.apiTokenInstance) return[m
[32m+[m[32m    onConnect(credentials)[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  return ([m
[32m+[m[32m    <section className="panel" aria-labelledby="auth-title">[m
[32m+[m[32m      <h2 id="auth-title">Авторизация</h2>[m
[32m+[m[32m      <p className="hint">[m
[32m+[m[32m        Демо-режим: API не подключён, данные не проверяются сервером[m
[32m+[m[32m        и хранятся только в памяти этой страницы.[m
[32m+[m[32m      </p>[m
[32m+[m[32m      <form className="form" onSubmit={handleSubmit}>[m
[32m+[m[32m        <label htmlFor="id-instance">idInstance</label>[m
[32m+[m[32m        <input[m
[32m+[m[32m          id="id-instance"[m
[32m+[m[32m          name="idInstance"[m
[32m+[m[32m          value={idInstance}[m
[32m+[m[32m          onChange={(event) => setIdInstance(event.target.value)}[m
[32m+[m[32m          inputMode="numeric"[m
[32m+[m[32m          pattern="[0-9]+"[m
[32m+[m[32m          title="Введите идентификатор из цифр"[m
[32m+[m[32m          autoComplete="off"[m
[32m+[m[32m          required[m
[32m+[m[32m        />[m
[32m+[m[32m        <label htmlFor="api-token-instance">apiTokenInstance</label>[m
[32m+[m[32m        <input[m
[32m+[m[32m          id="api-token-instance"[m
[32m+[m[32m          name="apiTokenInstance"[m
[32m+[m[32m          type="password"[m
[32m+[m[32m          value={apiTokenInstance}[m
[32m+[m[32m          onChange={(event) => setApiTokenInstance(event.target.value)}[m
[32m+[m[32m          autoComplete="off"[m
[32m+[m[32m          required[m
[32m+[m[32m        />[m
[32m+[m[32m        <button type="submit" disabled={!idInstance.trim() || !apiTokenInstance.trim()}>[m
[32m+[m[32m          Открыть чат[m
[32m+[m[32m        </button>[m
[32m+[m[32m      </form>[m
[32m+[m[32m    </section>[m
[32m+[m[32m  )[m
[32m+[m[32m}[m
[1mdiff --git a/src/components/ChatWindow.jsx b/src/components/ChatWindow.jsx[m
[1mnew file mode 100644[m
[1mindex 0000000..4417078[m
[1m--- /dev/null[m
[1m+++ b/src/components/ChatWindow.jsx[m
[36m@@ -0,0 +1,28 @@[m
[32m+[m[32mimport { useState } from 'react'[m
[32m+[m[32mimport MessageList from './MessageList.jsx'[m
[32m+[m[32mimport MessageInput from './MessageInput.jsx'[m
[32m+[m
[32m+[m[32mexport default function ChatWindow({ idInstance, onDisconnect }) {[m
[32m+[m[32m  const [messages, setMessages] = useState([])[m
[32m+[m
[32m+[m[32m  function addMessage(text) {[m
[32m+[m[32m    setMessages((current) => [...current, { id: crypto.randomUUID(), text }])[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  return ([m
[32m+[m[32m    <section className="panel" aria-labelledby="chat-title">[m
[32m+[m[32m      <header className="chat-header">[m
[32m+[m[32m        <h2 id="chat-title">Чат · {idInstance}</h2>[m
[32m+[m[32m        <button type="button" className="secondary" onClick={onDisconnect}>[m
[32m+[m[32m          Выйти[m
[32m+[m[32m        </button>[m
[32m+[m[32m      </header>[m
[32m+[m[32m      <p className="hint">[m
[32m+[m[32m        API не подключён. Сообщения видны только здесь и исчезнут после выхода[m
[32m+[m[32m        или обновления страницы.[m
[32m+[m[32m      </p>[m
[32m+[m[32m      <MessageList messages={messages} />[m
[32m+[m[32m      <MessageInput onSend={addMessage} />[m
[32m+[m[32m    </section>[m
[32m+[m[32m  )[m
[32m+[m[32m}[m
[1mdiff --git a/src/components/MessageInput.jsx b/src/components/MessageInput.jsx[m
[1mnew file mode 100644[m
[1mindex 0000000..f0d7fe8[m
[1m--- /dev/null[m
[1m+++ b/src/components/MessageInput.jsx[m
[36m@@ -0,0 +1,28 @@[m
[32m+[m[32mimport { useState } from 'react'[m
[32m+[m
[32m+[m[32mexport default function MessageInput({ onSend }) {[m
[32m+[m[32m  const [text, setText] = useState('')[m
[32m+[m
[32m+[m[32m  function handleSubmit(event) {[m
[32m+[m[32m    event.preventDefault()[m
[32m+[m[32m    const message = text.trim()[m
[32m+[m[32m    if (!message) return[m
[32m+[m[32m    onSend(message)[m
[32m+[m[32m    setText('')[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  return ([m
[32m+[m[32m    <form className="form" onSubmit={handleSubmit}>[m
[32m+[m[32m      <label htmlFor="message">Сообщение</label>[m
[32m+[m[32m      <textarea[m
[32m+[m[32m        id="message"[m
[32m+[m[32m        name="message"[m
[32m+[m[32m        rows={3}[m
[32m+[m[32m        value={text}[m
[32m+[m[32m        onChange={(event) => setText(event.target.value)}[m
[32m+[m[32m        required[m
[32m+[m[32m      />[m
[32m+[m[32m      <button type="submit" disabled={!text.trim()}>Добавить сообщение</button>[m
[32m+[m[32m    </form>[m
[32m+[m[32m  )[m
[32m+[m[32m}[m
[1mdiff --git a/src/components/MessageList.jsx b/src/components/MessageList.jsx[m
[1mnew file mode 100644[m
[1mindex 0000000..5541e6e[m
[1m--- /dev/null[m
[1m+++ b/src/components/MessageList.jsx[m
[36m@@ -0,0 +1,15 @@[m
[32m+[m[32mexport default function MessageList({ messages }) {[m
[32m+[m[32m  return ([m
[32m+[m[32m    <div className="messages" role="log" aria-label="Сообщения" aria-live="polite">[m
[32m+[m[32m      {messages.length === 0 ? ([m
[32m+[m[32m        <p className="hint">Сообщений пока нет.</p>[m
[32m+[m[32m      ) : ([m
[32m+[m[32m        <ul className="message-list">[m
[32m+[m[32m          {messages.map((message) => ([m
[32m+[m[32m            <li className="message" key={message.id}>{message.text}</li>[m
[32m+[m[32m          ))}[m
[32m+[m[32m        </ul>[m
[32m+[m[32m      )}[m
[32m+[m[32m    </div>[m
[32m+[m[32m  )[m
[32m+[m[32m}[m
[1mdiff --git a/src/index.css b/src/index.css[m
[1mindex 50b1c78..08d71bc 100644[m
[1m--- a/src/index.css[m
[1m+++ b/src/index.css[m
[36m@@ -17,7 +17,7 @@[m [mbody {[m
 [m
 .app {[m
   max-width: 720px;[m
[31m-  margin: 10vh auto;[m
[32m+[m[32m  margin: 4vh auto;[m
   padding: 32px 24px;[m
 }[m
 [m
[36m@@ -31,3 +31,101 @@[m [mh1 {[m
   font-size: clamp(2rem, 6vw, 3rem);[m
   line-height: 1.2;[m
 }[m
[32m+[m
[32m+[m[32mh2 {[m
[32m+[m[32m  margin: 0;[m
[32m+[m[32m  overflow-wrap: anywhere;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.panel {[m
[32m+[m[32m  padding: 24px;[m
[32m+[m[32m  background: #fff;[m
[32m+[m[32m  border: 1px solid #cbdcd1;[m
[32m+[m[32m  border-radius: 12px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.hint {[m
[32m+[m[32m  color: #506358;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.form {[m
[32m+[m[32m  display: grid;[m
[32m+[m[32m  gap: 12px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32minput,[m
[32m+[m[32mtextarea,[m
[32m+[m[32mbutton {[m
[32m+[m[32m  font: inherit;[m
[32m+[m[32m  border-radius: 6px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32minput,[m
[32m+[m[32mtextarea {[m
[32m+[m[32m  width: 100%;[m
[32m+[m[32m  min-width: 0;[m
[32m+[m[32m  padding: 10px 12px;[m
[32m+[m[32m  border: 1px solid #829b8b;[m
[32m+[m[32m  color: inherit;[m
[32m+[m[32m  background: #fff;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mtextarea {[m
[32m+[m[32m  resize: vertical;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mbutton {[m
[32m+[m[32m  padding: 10px 16px;[m
[32m+[m[32m  border: 1px solid #217548;[m
[32m+[m[32m  color: #fff;[m
[32m+[m[32m  background: #217548;[m
[32m+[m[32m  cursor: pointer;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mbutton:disabled {[m
[32m+[m[32m  opacity: 0.5;[m
[32m+[m[32m  cursor: not-allowed;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mbutton.secondary {[m
[32m+[m[32m  color: #217548;[m
[32m+[m[32m  background: #fff;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m:focus-visible {[m
[32m+[m[32m  outline: 3px solid #217548;[m
[32m+[m[32m  outline-offset: 3px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.chat-header {[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  justify-content: space-between;[m
[32m+[m[32m  flex-wrap: wrap;[m
[32m+[m[32m  gap: 12px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.messages {[m
[32m+[m[32m  min-height: 180px;[m
[32m+[m[32m  max-height: 40vh;[m
[32m+[m[32m  overflow-y: auto;[m
[32m+[m[32m  margin: 20px 0;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.message-list {[m
[32m+[m[32m  display: grid;[m
[32m+[m[32m  gap: 10px;[m
[32m+[m[32m  padding: 0;[m
[32m+[m[32m  margin: 0;[m
[32m+[m[32m  list-style: none;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.message {[m
[32m+[m[32m  justify-self: end;[m
[32m+[m[32m  max-width: 90%;[m
[32m+[m[32m  padding: 10px 14px;[m
[32m+[m[32m  border-radius: 10px;[m
[32m+[m[32m  background: #e2f3e9;[m
[32m+[m[32m  white-space: pre-wrap;[m
[32m+[m[32m  overflow-wrap: anywhere;[m
[32m+[m[32m}[m
