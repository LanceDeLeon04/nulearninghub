import { useEffect, useRef, useState } from 'react'
import ReadAloud from '../ReadAloud'
import { CheckCircle2, BookCheck, Highlighter, MessageSquarePlus, Trash2 } from 'lucide-react'
import { haptic } from '../../lib/haptics'
import { parseLectureBody, applyHighlights } from '../../lib/lectureFormat'

// Renders data.body as a typeset document — bold headings, indented
// paragraphs, list items, inline bold — with any saved highlights drawn as
// <mark> spans on top. See src/lib/lectureFormat.js: the parser guarantees
// every character of the raw body is still in the DOM, in order, so the
// plain character offsets highlights are stored as stay valid.
const LINE_TAG = { heading: 'h3', subheading: 'h4', list: 'p', para: 'p', blank: 'div' }
const LINE_CLASS = {
  heading: 'lecture-heading',
  subheading: 'lecture-subheading',
  list: 'lecture-list-item',
  para: 'lecture-para',
  blank: 'lecture-blank',
}

function Piece({ piece, activeId, onMarkClick }) {
  const className = piece.style === 'syntax' ? 'lecture-syntax' : undefined
  const inner = piece.style === 'bold' ? <strong>{piece.text}</strong> : piece.text
  if (piece.h) {
    return (
      <mark
        className={`lecture-mark${piece.h.note ? ' lecture-mark-noted' : ''}${activeId === piece.h.id ? ' lecture-mark-active' : ''}`}
        onClick={() => onMarkClick(piece.h.id)}
      >
        {inner}
      </mark>
    )
  }
  return <span className={className}>{inner}</span>
}

function FormattedBody({ text, highlights, activeId, onMarkClick }) {
  const lines = parseLectureBody(text)
  return (
    <div className="lecture-body lecture-body-selectable">
      {lines.map((line, i) => {
        const Tag = LINE_TAG[line.kind] ?? 'p'
        const pieces = applyHighlights(line.segments, highlights)
        return (
          <Tag
            key={i}
            className={LINE_CLASS[line.kind]}
            // The Table of Contents leans on leading spaces for depth;
            // padding keeps that nesting readable once the raw spaces are
            // no longer doing the work visually.
            style={line.indent ? { paddingLeft: `${line.indent * 0.6}rem` } : undefined}
          >
            {pieces.map((p, j) => (
              <Piece key={j} piece={p} activeId={activeId} onMarkClick={onMarkClick} />
            ))}
          </Tag>
        )
      })}
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
      {/* Read-aloud gets the prose without the ** bold markers, which would
          otherwise be spoken as "star star". */}
      {data.readAloudEnabled !== false && <ReadAloud text={bodyText.replace(/\*\*/g, '')} />}

      {data.imageUrl && (
        <figure className={`lecture-figure lecture-figure-${data.imageSize ?? 'medium'}`}>
          <img src={data.imageUrl} alt={data.imageCaption || 'Lecture image'} />
          {data.imageCaption && <figcaption>{data.imageCaption}</figcaption>}
        </figure>
      )}

      <div ref={bodyRef} onMouseUp={handleMouseUp}>
        <FormattedBody
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
