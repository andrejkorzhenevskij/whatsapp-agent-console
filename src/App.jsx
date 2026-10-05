import { useState } from 'react'
import AuthForm from './components/AuthForm.jsx'
import ChatWindow from './components/ChatWindow.jsx'

export default function App() {
  const [connection, setConnection] = useState(null)

  return (
    <main className={`app ${connection ? 'app-connected' : 'app-auth'}`}>
      {connection ? (
        <ChatWindow
          idInstance={connection.idInstance}
          apiTokenInstance={connection.apiTokenInstance}
          onDisconnect={() => setConnection(null)}
        />
      ) : (
        <AuthForm onConnect={setConnection} />
      )}
    </main>
  )
}
