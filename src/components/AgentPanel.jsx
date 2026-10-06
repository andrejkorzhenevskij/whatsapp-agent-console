import { canApprove } from '../services/agentWorkflow.js'

export default function AgentPanel({ state, audit = [], onApprove, onTakeOver, sending = false }) {
  const decision = state.decision
  return (
    <aside className="agent-panel" aria-label="Agent decision">
      <header className="agent-header">
        <h2>AGENT DECISION</h2>
        <span className="agent-status" role="status">{state.status}</span>
      </header>
      <p className="hint">Fake agent · Every reply needs an operator click.</p>
      <dl className="agent-metrics">
        <div><dt>Lead score</dt><dd>{decision ? `${decision.leadScore} / 100` : '—'}</dd></div>
        <div><dt>Confidence</dt><dd>{decision ? `${Math.round(decision.confidence * 100)}%` : '—'}</dd></div>
        <div><dt>Action</dt><dd>{decision?.action || '—'}</dd></div>
      </dl>
      <div className="agent-copy">
        <h3>Reason</h3>
        <p>{decision?.reason || (state.pending ? 'Evaluating incoming message…' :
          state.humanControlled ? 'This conversation is controlled by the operator.' : 'Waiting for an incoming message.')}</p>
        <h3>Suggested reply</h3>
        <p className="agent-reply">{decision?.reply || '—'}</p>
      </div>
      {state.status === 'Handoff' && <p className="agent-handoff">Policy requires human handling. Suggested replies cannot be approved.</p>}
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <div className="agent-actions">
        <button type="button" onClick={onApprove} disabled={sending || !canApprove(state)}>
          {state.pending && decision ? 'Sending…' : 'Approve'}
        </button>
        <button type="button" className="secondary" onClick={onTakeOver} disabled={sending || state.humanControlled}>
          Take over
        </button>
      </div>
      <details className="agent-audit">
        <summary>Audit trail ({audit.length})</summary>
        {audit.length === 0 ? <p className="hint">No decisions in this conversation yet.</p> :
          <ol>{audit.map((entry) => <li key={entry.id}>
            <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString()}</time>
            <p className="agent-audit-message">{entry.incomingMessage}</p>
            <p>{entry.action || 'pending'} · {entry.operatorAction} → {entry.resultingAction}</p>
            <details><summary>Decision details</summary><pre>{JSON.stringify(entry, null, 2)}</pre></details>
          </li>)}</ol>}
      </details>
    </aside>
  )
}
