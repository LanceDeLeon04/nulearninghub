import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { defaultHotspot } from '../../lib/blockTypes'
import { X, MapPinPlus, Crosshair } from 'lucide-react'

const BUCKET = 'module-images'

export default function HotspotsEditor({ data, onChange, context }) {
  const hotspots = data.hotspots ?? []
  const [placing, setPlacing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    const ext = file.name.split('.').pop()
    const path = `${context?.moduleId ?? 'misc'}/${context?.blockId ?? 'block'}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
    if (error) {
      setUploadError(`Upload failed: ${error.message}. You can also paste an image URL below.`)
      setUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    onChange({ ...data, imageUrl: pub.publicUrl })
    setUploading(false)
  }

  function handleImageClick(e) {
    if (!placing) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10
    onChange({ ...data, hotspots: [...hotspots, defaultHotspot(x, y)] })
    setPlacing(false)
  }

  function updateHotspot(i, patch) {
    const next = [...hotspots]
    next[i] = { ...next[i], ...patch }
    onChange({ ...data, hotspots: next })
  }

  function removeHotspot(i) {
    onChange({ ...data, hotspots: hotspots.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="block-editor">
      <label>
        Image URL
        <input
          value={data.imageUrl ?? ''}
          onChange={(e) => onChange({ ...data, imageUrl: e.target.value })}
          placeholder="https://... or upload below"
        />
      </label>
      <label>
        Or Upload an Image
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
      </label>
      {uploading && <p className="muted small">Uploading…</p>}
      {uploadError && <p className="muted small" style={{ color: 'var(--danger)' }}>{uploadError}</p>}

      {data.imageUrl && (
        <div>
          <div className="row-actions" style={{ marginBottom: '0.5rem' }}>
            <button type="button" className={`btn${placing ? '' : ' btn-approve'}`} onClick={() => setPlacing((p) => !p)}>
              {placing ? <><Crosshair size={15} /> Click the image to place a hotspot…</> : <><MapPinPlus size={15} /> Add Hotspot</>}
            </button>
          </div>
          <div className="hotspot-image-wrap" onClick={handleImageClick} style={{ cursor: placing ? 'crosshair' : 'default' }}>
            <img src={data.imageUrl} alt="" className="hotspot-image" />
            {hotspots.map((h) => (
              <div key={h.id} className="hotspot-pin" style={{ left: `${h.x}%`, top: `${h.y}%` }} title={h.label || 'Untitled hotspot'} />
            ))}
          </div>
        </div>
      )}

      {hotspots.length > 0 && (
        <div className="option-list">
          <p className="muted small">Hotspots</p>
          {hotspots.map((h, i) => (
            <div key={h.id} className="hotspot-editor-row">
              <input value={h.label} onChange={(e) => updateHotspot(i, { label: e.target.value })} placeholder="Hotspot label" />
              <input value={h.description} onChange={(e) => updateHotspot(i, { description: e.target.value })} placeholder="Description shown when clicked" />
              <label className="points-input">
                X% <input type="number" min="0" max="100" value={h.x} onChange={(e) => updateHotspot(i, { x: Number(e.target.value) })} />
              </label>
              <label className="points-input">
                Y% <input type="number" min="0" max="100" value={h.y} onChange={(e) => updateHotspot(i, { y: Number(e.target.value) })} />
              </label>
              <button type="button" className="btn btn-reject btn-sm" onClick={() => removeHotspot(i)}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
      {data.imageUrl && hotspots.length === 0 && <p className="muted small">No hotspots yet — click "Add Hotspot" then click on the image.</p>}
    </div>
  )
}
