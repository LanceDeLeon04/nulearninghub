import { Users, UserCheck, UserPlus, Check, X, Clock } from 'lucide-react'
import { haptic } from '../lib/haptics'

// Shown inside ActivityView in place of the questions, while a pair-mode
// activity's two students haven't both agreed on a partner yet. `pairing`
// is assembled by ModulePlayer (it owns the pair_requests fetch/mutations
// since a request can affect blocks other than the one on screen).
export default function PairRequestPanel({ pairing }) {
  const { classmates, incoming, outgoing, onSend, onAccept, onDecline, onCancel, busy } = pairing

  if (incoming.length > 0) {
    const req = incoming[0]
    return (
      <div className="pair-panel">
        <div className="pair-panel-icon"><UserPlus size={22} /></div>
        <h4>Pair request from {req.requesterName}</h4>
        <p className="muted small">Accept to work on this activity together — you'll both be submitted and graded as a pair.</p>
        <div className="row-actions">
          <button
            className="btn btn-approve"
            disabled={busy}
            onClick={() => { haptic('success'); onAccept(req.id) }}
          >
            <Check size={15} /> Accept
          </button>
          <button
            className="btn btn-reject"
            disabled={busy}
            onClick={() => { haptic('tap'); onDecline(req.id) }}
          >
            <X size={15} /> Decline
          </button>
        </div>
      </div>
    )
  }

  if (outgoing.length > 0) {
    const req = outgoing[0]
    return (
      <div className="pair-panel">
        <div className="pair-panel-icon pair-panel-icon-pending"><Clock size={22} /></div>
        <h4>Waiting for {req.partnerName} to accept</h4>
        <p className="muted small">You'll be able to start the activity as soon as they accept your pair request.</p>
        <div className="row-actions">
          <button className="btn" disabled={busy} onClick={() => { haptic('tap'); onCancel(req.id) }}>
            Cancel Request
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pair-panel">
      <div className="pair-panel-icon"><Users size={22} /></div>
      <h4>This is a Pair Activity</h4>
      <p className="muted small">Choose a classmate to work with. They'll need to accept before you can start.</p>

      {classmates.length === 0 && (
        <p className="muted small">No classmates available to pair with yet.</p>
      )}

      {classmates.length > 0 && (
        <div className="student-list" style={{ marginTop: '0.6rem' }}>
          {classmates.map((c) => (
            <div key={c.id} className="student-row">
              <span>{c.full_name}</span>
              <button
                className="btn btn-sm"
                disabled={busy}
                onClick={() => { haptic('tap'); onSend(c.id) }}
                style={{ marginLeft: 'auto' }}
              >
                <UserPlus size={13} /> Request Pair
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Small persistent banner shown above the questions once a pair is locked in.
export function PairedBanner({ partnerName }) {
  return (
    <div className="pair-banner">
      <UserCheck size={15} /> Paired with <strong>{partnerName}</strong> — you'll both be graded together on this activity.
    </div>
  )
}
