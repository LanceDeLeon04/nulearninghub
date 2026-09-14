import { useEffect, useRef, useState } from 'react'
import ReadAloud from '../ReadAloud'
import { CheckCircle2, BookCheck, Highlighter, MessageSquarePlus, Trash2 } from 'lucide-react'
import { haptic } from '../../lib/haptics'

// Renders data.body with any saved highlights as <mark> spans, computed
// from plain character offsets into the raw body string.
function HighlightedBody({ text, highlights, activeId, onMarkClick }) {
  const sorted = [...highlights].sort((a, b) => a.start_offset - b.start_offset)
  const pieces = []
  let cursor = 0
  for (const h of sorted) {
    if (h.start_offset < cursor) continue // skip overlaps, keep it simple
    if (h.start_offset > cursor) pieces.push({ text: text.slice(cursor, h.start_offset) })
    pieces.push({ text: text.slice(h.start_offset, h.end_offset), h })
    cursor = h.end_offset
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) })

  return (
    <div className="lecture-body lecture-body-selectable">
      {pieces.map((p, i) =>
        p.h ? (
          <mark
            key={p.h.id}
            className={`lecture-mark${p.h.note ? ' lecture-mark-noted' : ''}${activeId === p.h.id ? ' lecture-mark-active' : ''}`}
            onClick={() => onMarkClick(p.h.id)}
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </div>
  )
}

function getOffset(root, node, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let n
  while ((n = walker.nextNode())) {
    if (n === node) return total + offset
    total += n.textContent.length
  }
  return total
}

export default function LectureView({ data, progress, onComplete, highlights = [], onAddHighlight, onDeleteHighlight, readOnly = false }) {
  const completed = progress?.completed ?? false
  const [justCompleted, setJustCompleted] = useState(false)
  const bodyText = data.body ?? ''
  const bodyRef = useRef(null)
  const [selection, setSelection] = useState(null) // { start, end, quote, x, y }
  const [noteDraft, setNoteDraft] = useState('')
  const [showNoteField, setShowNoteField] = useState(false)
  const [activeId, setActiveId] = useState(null)

  function handleMouseUp() {
    if (readOnly) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!bodyRef.current || !bodyRef.current.contains(range.commonAncestorContainer)) return
    const quote = sel.toString()
    if (!quote.trim()) return

    const start = getOffset(bodyRef.current, range.startContainer, range.startOffset)
    const end = getOffset(bodyRef.current, range.endContainer, range.endOffset)
    const rect = range.getBoundingClientRect()
    const parentRect = bodyRef.current.closest('.block-view').getBoundingClientRect()

    setSelection({
      start: Math.min(start, end),
      end: Math.max(start, end),
      quote,
      x: rect.left - parentRect.left + rect.width / 2,
      y: rect.top - parentRect.top,
    })
    setShowNoteField(false)
    setNoteDraft('')
  }

  function clearSelection() {
    setSelection(null)
    setShowNoteField(false)
    setNoteDraft('')
    window.getSelection()?.removeAllRanges()
  }

  async function confirmHighlight(withNote) {
    if (!selection || !onAddHighlight) return
    await onAddHighlight({
      start_offset: selection.start,
      end_offset: selection.end,
      quote: selection.quote,
      note: withNote ? noteDraft.trim() : '',
    })
    clearSelection()
  }

  useEffect(() => {
    function onDocMouseDown(e) {
      if (e.target.closest?.('.lecture-selection-toolbar')) return
      if (e.target.closest?.('.lecture-mark')) return
      if (selection) clearSelection()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [selection])

  return (
    <div className="block-view" style={{ position: 'relative' }}>
      {data.readAloudEnabled !== false && <ReadAloud text={bodyText} />}

      <div ref={bodyRef} onMouseUp={handleMouseUp}>
        <HighlightedBody
          text={bodyText}
          highlights={highlights}
          activeId={activeId}
          onMarkClick={(id) => setActiveId(id === activeId ? null : id)}
        />
      </div>

      {selection && (
        <div
          className="lecture-selection-toolbar"
          style={{ left: selection.x, top: Math.max(selection.y - 44, 0) }}
        >
          {!showNoteField ? (
            <>
              <button onClick={() => confirmHighlight(false)}><Highlighter size={13} /> Highlight</button>
              <button onClick={() => setShowNoteField(true)}><MessageSquarePlus size={13} /> Add note</button>
            </>
          ) : (
            <div className="lecture-note-composer">
              <textarea
                autoFocus
                rows={2}
                placeholder="What do you want your teacher to know about this part?"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <button onClick={() => confirmHighlight(true)}>Save</button>
            </div>
          )}
        </div>
      )}

      {highlights.length > 0 && (
        <div className="lecture-annotations">
          <div className="lecture-annotations-title">
            <Highlighter size={13} /> Your highlights & notes
            <span className="muted small">visible to your teacher</span>
          </div>
          {highlights.map((h) => (
            <div
              key={h.id}
              className={`lecture-annotation-item${activeId === h.id ? ' lecture-annotation-active' : ''}`}
              onClick={() => setActiveId(h.id === activeId ? null : h.id)}
            >
              <p className="lecture-annotation-quote">"{h.quote}"</p>
              {h.note && <p className="lecture-annotation-note">{h.note}</p>}
              <button
                className="lecture-annotation-delete"
                onClick={(e) => { e.stopPropagation(); onDeleteHighlight?.(h.id) }}
                aria-label="Delete highlight"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="block-view-footer">
        {readOnly ? (
          <span className="muted small">Preview only — this is a read-only view of the lecture content.</span>
        ) : completed ? (
          <span className={`badge status-approved${justCompleted ? ' score-badge-pop' : ''}`}><CheckCircle2 size={13} /> Marked as read</span>
        ) : (
          <button onClick={() => { haptic('success'); setJustCompleted(true); onComplete() }}><BookCheck size={16} /> Mark as Read</button>
        )}
      </div>
    </div>
  )
}
