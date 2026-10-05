import { appendMessage } from './chat.js'

export function chatDisplayName(chat) {
  if (typeof chat.name === 'string' && chat.name.trim()) return chat.name.trim()
  return chat.phoneNumber ? `+${chat.phoneNumber}` : 'Новый контакт'
}

export function addChat(chats, chat) {
  return chats.some((current) => current.id === chat.id)
    ? chats.map((current) => current.id === chat.id ? { ...current, ...chat } : current)
    : [...chats, chat]
}

export function recordMessage(state, message) {
  const messages = appendMessage(state.messages, message)
  if (messages === state.messages) return state
  const current = state.chats.find((chat) => chat.id === message.chatId)
  // Уведомления имеют точность до секунды; внутри секунды сохраняем порядок получения.
  const previousSecond = Math.floor(current?.lastMessage?.timestamp / 1000)
  const messageSecond = Math.floor(message.timestamp / 1000)
  const chat = {
    id: message.chatId,
    lastMessage: previousSecond > messageSecond ? current.lastMessage : message,
  }
  if (message.chatName) chat.name = message.chatName
  if (message.phoneNumber) chat.phoneNumber = message.phoneNumber
  return { chats: addChat(state.chats, chat), messages }
}
