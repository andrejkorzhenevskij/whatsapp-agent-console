import { chatDisplayName } from '../chatState.js'

export default function ChatList({ chats, activeChatId, onSelect }) {
  if (chats.length === 0) {
    return <p className="sidebar-empty hint">Здесь появятся ваши диалоги.</p>
  }
  const sortedChats = [...chats].sort((a, b) =>
    (b.lastMessage?.timestamp || b.createdAt || 0) - (a.lastMessage?.timestamp || a.createdAt || 0))
  return (
    <ul className="chat-list" aria-label="Список чатов">
      {sortedChats.map((chat) => {
        const name = chatDisplayName(chat)
        const date = chat.lastMessage?.timestamp ? new Date(chat.lastMessage.timestamp) : null
        return (
          <li key={chat.id}>
            <button type="button" className="chat-item" aria-current={chat.id === activeChatId} onClick={() => onSelect(chat.id)}>
              <span className="avatar" aria-hidden="true">
                {name.startsWith('+') ? name.slice(-2) : name.slice(0, 1).toUpperCase()}
              </span>
              <div className="chat-copy">
                <div className="chat-row">
                  <span className="chat-name">{name}</span>
                  {date && <time className="chat-time" dateTime={date.toISOString()}>
                    {date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </time>}
                </div>
                <p className="chat-preview">{chat.lastMessage?.text || 'Начните диалог'}</p>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
