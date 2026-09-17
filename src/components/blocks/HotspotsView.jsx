import { useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { haptic } from '../../lib/haptics'
import ReadAloud from '../ReadAloud'

export default function HotspotsView({ data, progress, onComplete }) {
  const hotspots = data.hotspots ?? []
  const alreadyCompleted = progress?.completed ?? false
  const [viewedIds, setViewedIds] = useState(() => new Set(alreadyCompleted ? hotspots.map((h) => h.id) : []))
  const [active, setActive] = useState(null)
  const firedRef = useRef(alreadyCompleted)

  useEffect(() => {
    if (!firedRef.current && hotspots.length > 0 && viewedIds.size === hotspots.length) {
      firedRef.current = true
      onComplete()
    }
  }, [viewedIds, hotspots.length])

  if (!data.imageUrl || hotspots.length === 0) {
    return <p className="muted">No hotspots in this block yet.</p>
  }

  function handlePinClick(h) {
    haptic('select')
    setActive(h)
    setViewedIds((prev) => new Set(prev).add(h.id))
  }

  return (
    <>
      <p className="muted small">Click each marker to reveal what it is. {viewedIds.size} / {hotspots.length} viewed.</p>
      <div className="hotspot-image-wrap">
        <img src={data.imageUrl} alt="" className="hotspot-image" />
        {hotspots.map((h) => (
          <button
            key={h.id}
            type="button"
            className={`hotspot-pin hotspot-pin-clickable${viewedIds.has(h.id) ? ' hotspot-pin-viewed' : ''}`}
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
            onClick={() => handlePinClick(h)}
            aria-label={h.label || 'Hotspot'}
          />
        ))}
      </div>
      {active && (
        <div className="hotspot-popup">
          <strong>{active.label || 'Untitled'}</strong>
          <p>{active.description}</p>
          {active.description && <ReadAloud key={active.id} text={active.description} />}
        </div>
      )}
      <div className="block-view-footer">
        {viewedIds.size === hotspots.length && <span className="badge status-approved"><CheckCircle2 size={13} /> All hotspots viewed</span>}
      </div>
    </>
  )
}
