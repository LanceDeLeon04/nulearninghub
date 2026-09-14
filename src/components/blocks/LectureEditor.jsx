export default function LectureEditor({ data, onChange }) {
  return (
    <div className="block-editor">
      <label>
        Lecture Content
        <textarea
          rows={10}
          value={data.body ?? ''}
          onChange={(e) => onChange({ ...data, body: e.target.value })}
          placeholder="Write the lecture content students will read. Plain paragraphs — line breaks are preserved."
        />
      </label>
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
