// Turns a lecture's plain-text `data.body` into a structured, typeset
// document: headings in bold, indented paragraphs, list items, and inline
// **bold** — without ever adding, removing, or reordering a single
// character of the original string.
//
// That last constraint is the whole design. Lecture highlights are stored
// as plain character offsets into `data.body` (see the lecture_highlights
// table), so any character the renderer invents or swallows would silently
// shift every highlight a student has ever saved. So:
//
//   * every character of the body ends up in exactly one segment, in order;
//   * the markup characters we don't want to show (the ** of bold, the \n
//     at the end of a line) are still rendered, in a `syntax` segment that
//     CSS hides with font-size: 0 — present for the DOM TreeWalker that
//     computes offsets, invisible to the reader.
//
// parseLectureBody(text) -> [{ start, end, kind, indent, segments }]
//   kind:  'heading' | 'subheading' | 'list' | 'para' | 'blank'
//   indent: leading-space depth (the Table of Contents uses it)
//   segments: [{ start, end, text, style }], style: 'text'|'bold'|'syntax'

const LIST_RE = /^\s*(\d+[.)]|[-–•*])\s+/
const MAJOR_RE = /^\s*(MODULE|Module)\s*\d+/
const SECTION_RE = /^\s*(Section|SECTION)\s*\d+\.\d+/
const ACTIVITY_RE = /^\s*(Activity|ACTIVITY)\s*\d+/
const NAMED_HEADINGS = /^\s*(Learning Outcomes|Closing Section|Closing|Reflection Prompt|Optional Task|Areas? (in|of) Focus|Directions|Overview|Objectives|Key Points|Summary|References)\b/
// A leading "Label:" at the start of a paragraph — "Reflection Prompt: How
// has…", "Optional: Submit a…" — reads as a run-in subheading, so the label
// (and its colon) is bolded in place.
const RUNIN_LABEL_RE = /^(\s*)([A-Z][A-Za-z'’ -]{0,30}:)(\s)/

function isAllCaps(s) {
  const t = s.trim()
  return t.length > 2 && /[A-Z]/.test(t) && t === t.toUpperCase() && /^[A-Z0-9 ,.&'’()\-–:/]+$/.test(t)
}

function classifyLine(line) {
  const t = line.trim()
  if (!t) return 'blank'
  if (MAJOR_RE.test(line) || isAllCaps(line)) return 'heading'
  if (SECTION_RE.test(line) || ACTIVITY_RE.test(line)) return 'subheading'
  // A named heading only counts as a heading when it's the whole line.
  // "Reflection Prompt: How has technology helped…" is a paragraph with a
  // run-in label, not a heading, so it shouldn't be bolded end to end.
  if (NAMED_HEADINGS.test(line) && t.length <= 45) return 'subheading'
  if (LIST_RE.test(line)) return 'list'
  // Short, unpunctuated, not a continuation — the shape of a hand-written
  // heading in a Word document. Em-dash openers ("— The Author") are
  // signatures, not headings.
  if (
    t.length <= 70 &&
    !/[.!?,;]$/.test(t) &&
    !/^[—–-]/.test(t) &&
    t.split(/\s+/).length <= 9
  ) {
    return 'subheading'
  }
  return 'para'
}

// Split one line's text into text/bold/syntax segments, with absolute
// offsets. Handles **inline bold** and the run-in "Label:" case.
function segmentLine(line, lineStart, kind) {
  const segments = []
  const push = (from, to, style) => {
    if (to > from) segments.push({ start: lineStart + from, end: lineStart + to, text: line.slice(from, to), style })
  }

  // Pass 1: **bold** markers, whose ** characters become hidden syntax.
  const bolded = []
  const re = /\*\*([\s\S]+?)\*\*/g
  let cursor = 0
  let m
  while ((m = re.exec(line)) !== null) {
    if (m.index > cursor) bolded.push({ from: cursor, to: m.index, style: 'text' })
    bolded.push({ from: m.index, to: m.index + 2, style: 'syntax' })
    bolded.push({ from: m.index + 2, to: m.index + 2 + m[1].length, style: 'bold' })
    bolded.push({ from: re.lastIndex - 2, to: re.lastIndex, style: 'syntax' })
    cursor = re.lastIndex
  }
  if (cursor < line.length) bolded.push({ from: cursor, to: line.length, style: 'text' })

  const hasExplicitBold = bolded.some((b) => b.style === 'bold')

  // Pass 2: a run-in "Label:" at the very start of a plain paragraph, only
  // when the author hasn't already marked bold by hand.
  if (!hasExplicitBold && kind === 'para') {
    const label = RUNIN_LABEL_RE.exec(line)
    if (label) {
      const labelEnd = label[1].length + label[2].length
      push(0, label[1].length, 'text')
      push(label[1].length, labelEnd, 'bold')
      push(labelEnd, line.length, 'text')
      return segments
    }
  }

  for (const b of bolded) push(b.from, b.to, b.style)
  if (segments.length === 0) push(0, line.length, 'text')
  return segments
}

export function parseLectureBody(text = '') {
  const lines = []
  let start = 0
  // Walk the raw string so the "\n" between lines is kept and attached to
  // the line it terminates — nothing is dropped.
  const rawLines = text.split('\n')
  rawLines.forEach((line, i) => {
    const kind = classifyLine(line)
    const indent = (line.match(/^ */)?.[0].length ?? 0)
    const segments = kind === 'blank' ? [] : segmentLine(line, start, kind)
    let end = start + line.length
    if (i < rawLines.length - 1) {
      // The newline itself: hidden, but present for offset arithmetic.
      segments.push({ start: end, end: end + 1, text: '\n', style: 'syntax' })
      end += 1
    }
    lines.push({ start, end, kind, indent, segments })
    start = end
  })
  return lines
}

/**
 * Split a line's segments further at highlight boundaries, so a saved
 * highlight can start mid-word and still render as a <mark>.
 * Returns [{ text, style, h }] where `h` is the highlight row or undefined.
 */
export function applyHighlights(segments, highlights = []) {
  if (highlights.length === 0) return segments.map((s) => ({ ...s }))
  const sorted = [...highlights].sort((a, b) => a.start_offset - b.start_offset)
  const out = []

  for (const seg of segments) {
    let cursor = seg.start
    for (const h of sorted) {
      if (h.end_offset <= cursor || h.start_offset >= seg.end) continue
      const from = Math.max(cursor, h.start_offset)
      const to = Math.min(seg.end, h.end_offset)
      if (from > cursor) out.push({ ...seg, start: cursor, end: from, text: seg.text.slice(cursor - seg.start, from - seg.start) })
      out.push({ ...seg, start: from, end: to, text: seg.text.slice(from - seg.start, to - seg.start), h })
      cursor = to
    }
    if (cursor < seg.end) out.push({ ...seg, start: cursor, end: seg.end, text: seg.text.slice(cursor - seg.start) })
  }
  return out
}
