import { useEffect, useRef, useState } from 'react'
import { sendMessage } from '../api/greenApi.js'
import { pollNotifications } from '../chat.js'
import { addChat, chatDisplayName, recordMessage } from '../chatState.js'
import ChatList from './ChatList.jsx'
import NewChatForm from './NewChatForm.jsx'
import MessageList from './MessageList.jsx'
import MessageInput from './MessageInput.jsx'
import AgentPanel from './AgentPanel.jsx'
import { requestAgentDecision } from '../services/agentApi.js'
import { AgentWorkflow } from '../services/agentWorkflow.js'

export default function ChatWindow({ idInstance, apiTokenInstance, onDisconnect }) {
  const [history, setHistory] = useState({ chats: [], messages: [] })
  const historyRef = useRef(history)
  const [activeChatId, setActiveChatId] = useState(null)
  const [creatingChat, setCreatingChat] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [receiveError, setReceiveError] = useState('')
  const [receiveNotice, setReceiveNotice] = useState('')
  const [sendingChatId, setSendingChatId] = useState(null)
  const [pollAttempt, setPollAttempt] = useState(0)
  const session = useRef(null)
  const sendingRequest = useRef(false)
  const [, redrawAgent] = useState(0)
  const [workflow] = useState(() => new AgentWorkflow({
    decide: requestAgentDecision,
    send: sendToChat,
    onChange: () => redrawAgent((version) => version + 1),
  }))
  const activeChat = history.chats.find((chat) => chat.id === activeChatId)
  const visibleMessages = history.messages.filter((message) => message.chatId === activeChatId)

  useEffect(() => {
    const controller = new AbortController()
    session.current = controller
    pollNotifications(idInstance, apiTokenInstance, (message) => {
      const previous = historyRef.current
      updateHistory((current) => recordMessage(current, {
        ...message, timestamp: message.timestamp || Date.now(),
      }))
      if (historyRef.current !== previous) {
        // Agent work must not block GREEN-API processing/acknowledgement/polling.
        void workflow.receive(message,
          historyRef.current.messages.filter((item) => item.chatId === message.chatId), controller.signal)
      }
    }, controller.signal, (notice) => {
      if (!controller.signal.aborted) setReceiveNotice(notice)
    }).catch(() => {
      if (!controller.signal.aborted) {
        setReceiveNotice('')
        setReceiveError('Не удалось получить сообщения. Попробуйте ещё раз.')
      }
    })
    return () => controller.abort()
  }, [idInstance, apiTokenInstance, pollAttempt, workflow])

  function updateHistory(update) {
    historyRef.current = update(historyRef.current)
    setHistory(historyRef.current)
  }

  function openChat({ chatId }, phoneNumber) {
    updateHistory((current) => {
      const existing = current.chats.find((chat) => chat.id === chatId)
      const name = existing?.name || `+${phoneNumber}`
      return {
        ...current,
        chats: addChat(current.chats, { id: chatId, name, phoneNumber, createdAt: existing?.createdAt || Date.now() }),
      }
    })
    selectChat(chatId)
    setCreatingChat(false)
  }

  function selectChat(chatId) {
    setActiveChatId(chatId)
    setSendError(null)
  }

  async function handleSend(text) {
    if (sendingRequest.current || !activeChat) return false
    if (!session.current || session.current.signal.aborted) return false
    const chatId = activeChat.id
    workflow.manualReply(chatId)
    const sent = await sendToChat(chatId, text)
    if (sent && workflow.getState(chatId).entryId) workflow.manualReply(chatId)
    return sent
  }

  async function sendToChat(chatId, text) {
    if (sendingRequest.current) return false
    const signal = session.current?.signal
    if (!signal || signal.aborted) return false
    sendingRequest.current = true
    setSendingChatId(chatId)
    setSendError(null)
    try {
      const { idMessage } = await sendMessage(idInstance, apiTokenInstance, chatId, text, signal)
      if (signal.aborted) return false
      updateHistory((current) => recordMessage(current, {
        id: idMessage, chatId, text, direction: 'outgoing', timestamp: Date.now(),
      }))
      return true
    } catch {
      if (!signal.aborted) setSendError({ chatId, text: 'Не удалось отправить сообщение. Попробуйте ещё раз.' })
      return false
    } finally {
      sendingRequest.current = false
      if (!signal.aborted) setSendingChatId(null)
    }
  }

  function disconnect() {
    session.current?.abort()
    onDisconnect()
  }

  const name = activeChat ? chatDisplayName(activeChat) : ''
  return (
    <section className="messenger" aria-label="Мессенджер">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1>Чаты</h1>
          <button type="button" className="new-chat-button" onClick={() => setCreatingChat(true)}>
            Новый чат
          </button>
        </header>
        {creatingChat && <NewChatForm
          onOpen={openChat}
          onCancel={() => setCreatingChat(false)}
        />}
        <ChatList chats={history.chats} activeChatId={activeChatId} onSelect={selectChat} />
        <footer className="sidebar-footer">
          <button type="button" className="secondary" onClick={disconnect}>Выйти</button>
        </footer>
      </aside>
      <section className="dialog" aria-label="Текущий диалог">
        {activeChat && <header className="dialog-header">
          <span className="avatar" aria-hidden="true">
            {name.startsWith('+') ? name.slice(-2) : name.slice(0, 1).toUpperCase()}
          </span>
          <div className="dialog-title">
            <h2>{name}</h2>
            <p className="dialog-subtitle">{activeChat.id.endsWith('@g.us') ? 'Групповой чат' : 'WhatsApp'}</p>
          </div>
        </header>}
        {receiveNotice && <p className="status-notice" role="status">{receiveNotice}</p>}
        {receiveError && <div className="error-notice" role="alert">
          <span>{receiveError}</span>
          <button type="button" className="secondary" disabled={Boolean(sendingChatId)} onClick={() => {
            setReceiveError('')
            setPollAttempt((attempt) => attempt + 1)
          }}>Повторить</button>
        </div>}
        {activeChat ? <>
          <MessageList messages={visibleMessages} />
          {sendError?.chatId === activeChatId && <p className="error-notice" role="alert">{sendError.text}</p>}
          <MessageInput key={activeChatId} onSend={handleSend} sending={Boolean(sendingChatId)} />
        </> : <div className="empty-dialog">
          <h2>Выберите чат</h2>
          <p>Откройте диалог слева или начните новую переписку.</p>
          <button type="button" onClick={() => setCreatingChat(true)}>Новый чат</button>
        </div>}
      </section>
      {activeChat && <AgentPanel
        state={workflow.getState(activeChatId)}
        audit={workflow.getAudit(activeChatId)}
        sending={Boolean(sendingChatId)}
        onApprove={() => void workflow.approve(activeChatId)}
        onTakeOver={() => workflow.takeOver(activeChatId)}
      />}
    </section>
  )
}
