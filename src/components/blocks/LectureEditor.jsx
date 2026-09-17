import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { ImagePlus, X } from 'lucide-react'

const BUCKET = 'module-images'

export default function LectureEditor({ data, onChange, context }) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Same bucket and public-URL flow the Image Hotspots editor already uses,
  // so a photo added to a lecture needs no extra storage setup.
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

  return (
    <div className="block-editor">
      <label>
        Lecture Content
        <textarea
          rows={12}
          value={data.body ?? ''}
          onChange={(e) => onChange({ ...data, body: e.target.value })}
          placeholder="Write the lecture content students will read."
        />
      </label>
      <p className="muted small" style={{ marginTop: '-0.4rem' }}>
        Formatting: blank line between paragraphs (each one is indented for
        students). Headings, section titles and short unpunctuated lines are
        bolded automatically — wrap anything else in <code>**double
        asterisks**</code> to bold it yourself.
      </p>

      <h4 className="block-editor-heading"><ImagePlus size={15} /> Photo (optional)</h4>
      <label>
        Image URL
        <input
          value={data.imageUrl ?? ''}
          onChange={(e) => onChange({ ...data, imageUrl: e.target.value })}
          placeholder="https://... or upload below"
        />
      </label>
      <label>
        Upload an image
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
      </label>
      {uploading && <p className="muted small">Uploading…</p>}
      {uploadError && <p className="error-text small">{uploadError}</p>}
      {data.imageUrl && (
        <>
          <div className="lecture-image-preview">
            <img src={data.imageUrl} alt="" />
            <button type="button" className="btn btn-reject btn-sm" onClick={() => onChange({ ...data, imageUrl: '', imageCaption: '' })}>
              <X size={13} /> Remove
            </button>
          </div>
          <label>
            Caption
            <input
              value={data.imageCaption ?? ''}
              onChange={(e) => onChange({ ...data, imageCaption: e.target.value })}
              placeholder="Shown under the photo"
            />
          </label>
          <label>
            Size
            <select value={data.imageSize ?? 'medium'} onChange={(e) => onChange({ ...data, imageSize: e.target.value })}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="full">Full width</option>
            </select>
          </label>
        </>
      )}

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={data.readAloudEnabled ?? true}
          onChange={(e) => onChange({ ...data, readAloudEnabled: e.target.checked })}
        />
        Enable read-aloud for this lecture
      </label>
    </div>
  )
}
