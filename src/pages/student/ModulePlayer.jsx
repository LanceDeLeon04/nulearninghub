import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import { BLOCK_TYPES } from '../../lib/blockTypes'
import LectureView from '../../components/blocks/LectureView'
import ActivityView from '../../components/blocks/ActivityView'
import InteractiveView from '../../components/blocks/InteractiveView'
import BlockIcon from '../../components/BlockIcon'
import TeacherIntro from '../../components/TeacherIntro'
import { haptic } from '../../lib/haptics'
import { celebrate } from '../../lib/confetti'
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from 'lucide-react'

// Preliminaries is the very first module every student sees, so it's the
// one place we show a short "meet your teacher" welcome before the content.
function isPreliminariesModule(title) {
  return (title ?? '').toLowerCase().includes('preliminar')
}

const VIEWS = {
  lecture: LectureView,
  activity: ActivityView,
  interactive: InteractiveView,
}

const BLOCK_META = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b]))

export default function ModulePlayer() {
  const { assignmentId } = useParams()
  const { user } = useAuth()
  const [assignment, setAssignment] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [progressByBlock, setProgressByBlock] = useState({}) // content_id -> row
  const [highlightsByBlock, setHighlightsByBlock] = useState({}) // content_id -> array
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [teacherName, setTeacherName] = useState('Your Teacher')
  const [showIntro, setShowIntro] = useState(false)

  // Pair Activities: classmates in this assignment's class (to pick a
  // partner from) and every pair_requests row involving the current
  // student, for any block in this module.
  const [classmates, setClassmates] = useState([]) // [{ id, full_name }]
  const [pairRequests, setPairRequests] = useState([])
  const [pairBusy, setPairBusy] = useState(false)

  // Wall-clock start time for whichever block is currently open, so we can
  // report time_spent_seconds when it's completed/submitted — this is what
  // the server-side scoring formula uses for the speed component of points.
  // Resets whenever the student navigates to a different block.
  const blockStartRef = useRef(Date.now())
  useEffect(() => {
    blockStartRef.current = Date.now()
  }, [current, blocks])

  function elapsedSeconds() {
    return Math.max(1, Math.round((Date.now() - blockStartRef.current) / 1000))
  }

  async function loadAll() {
    setLoading(true)
    const { data: a } = await supabase
      .from('module_assignments')
      .select('id, due_date, module_id, class_id, modules ( id, title, subject, description, teacher_id ), classes ( name )')
      .eq('id', assignmentId)
      .single()
    setAssignment(a)

    if (a?.modules?.teacher_id) {
      const { data: teacherProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', a.modules.teacher_id)
        .single()
      if (teacherProfile?.full_name) setTeacherName(teacherProfile.full_name)
    }

    if (a?.module_id && isPreliminariesModule(a.modules?.title)) {
      const introKey = `intro_seen_${assignmentId}`
      if (!localStorage.getItem(introKey)) {
        setShowIntro(true)
      }
    }

    if (a?.module_id) {
      const { data: b } = await supabase
        .from('module_content')
        .select('*')
        .eq('module_id', a.module_id)
        .order('order_index', { ascending: true })
      setBlocks(b ?? [])

      const { data: p } = await supabase
        .from('student_progress')
        .select('*')
        .eq('assignment_id', assignmentId)
        .eq('student_id', user.id)
      const map = {}
      for (const row of p ?? []) map[row.content_id] = row
      setProgressByBlock(map)

      const { data: h } = await supabase
        .from('lecture_highlights')
        .select('*')
        .eq('assignment_id', assignmentId)
        .eq('student_id', user.id)
        .order('start_offset', { ascending: true })
      const hMap = {}
      for (const row of h ?? []) {
        if (!hMap[row.content_id]) hMap[row.content_id] = []
        hMap[row.content_id].push(row)
      }
      setHighlightsByBlock(hMap)
    }
    setLoading(false)
  }

  async function loadPairData(classId) {
    if (!classId) return
    const { data: mates } = await supabase
      .from('class_students')
      .select('student_id, profiles ( id, full_name )')
      .eq('class_id', classId)
    setClassmates(
      (mates ?? [])
        .map((m) => m.profiles)
        .filter((p) => p && p.id !== user.id)
    )

    const { data: reqs } = await supabase
      .from('pair_requests')
      .select('*, requester:requester_id ( id, full_name ), partner:partner_id ( id, full_name )')
      .eq('assignment_id', assignmentId)
      .or(`requester_id.eq.${user.id},partner_id.eq.${user.id}`)
    setPairRequests(reqs ?? [])
  }

  useEffect(() => {
    if (user) loadAll()
  }, [assignmentId, user])

  useEffect(() => {
    if (user && assignment?.class_id) loadPairData(assignment.class_id)
  }, [user, assignment?.class_id])

  // Live-refresh pair requests: so the invited partner sees a new request
  // appear, and the requester sees the moment it's accepted, without a
  // manual reload.
  useEffect(() => {
    if (!user || !assignmentId) return
    const channel = supabase
      .channel(`pair_requests_${assignmentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pair_requests', filter: `assignment_id=eq.${assignmentId}` },
        () => { if (assignment?.class_id) loadPairData(assignment.class_id) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, assignmentId, assignment?.class_id])

  const totalBlocks = blocks.length
  const completedCount = useMemo(
    () => blocks.filter((b) => progressByBlock[b.id]?.completed).length,
    [blocks, progressByBlock]
  )
  const celebratedModuleRef = useRef(false)

  useEffect(() => {
    if (totalBlocks > 0 && completedCount === totalBlocks && !celebratedModuleRef.current) {
      celebratedModuleRef.current = true
      celebrate({ big: true })
    }
  }, [completedCount, totalBlocks])

  async function saveProgress(block, patch) {
    const existing = progressByBlock[block.id]
    const payload = {
      content_id: block.id,
      assignment_id: assignmentId,
      student_id: user.id,
      ...patch,
    }
    let error
    if (existing) {
      ;({ error } = await supabase.from('student_progress').update(patch).eq('id', existing.id))
    } else {
      ;({ error } = await supabase.from('student_progress').insert(payload))
    }
    if (!error) await loadAll()
  }

  // Pair-request info for one activity block, in the shape PairRequestPanel
  // expects. Built fresh per block since each pair-mode activity in the
  // module has its own independent pairing.
  function pairingForBlock(block) {
    if (!block || block.type !== 'activity' || block.data?.mode !== 'pair') return null
    const forBlock = pairRequests.filter((r) => r.content_id === block.id)
    const accepted = forBlock.find((r) => r.status === 'accepted')
    const incoming = forBlock.filter((r) => r.status === 'pending' && r.partner_id === user.id)
    const outgoing = forBlock.filter((r) => r.status === 'pending' && r.requester_id === user.id)
    return {
      classmates,
      partner: accepted ? (accepted.requester_id === user.id ? accepted.partner : accepted.requester) : null,
      incoming: incoming.map((r) => ({ id: r.id, requesterName: r.requester?.full_name ?? 'Classmate' })),
      outgoing: outgoing.map((r) => ({ id: r.id, partnerName: r.partner?.full_name ?? 'Classmate' })),
      busy: pairBusy,
      onSend: (partnerId) => sendPairRequest(block, partnerId),
      onAccept: (requestId) => respondPairRequest(requestId, 'accepted'),
      onDecline: (requestId) => respondPairRequest(requestId, 'declined'),
      onCancel: (requestId) => respondPairRequest(requestId, 'cancelled'),
    }
  }

  async function sendPairRequest(block, partnerId) {
    setPairBusy(true)
    haptic('tap')
    await supabase.from('pair_requests').insert({
      content_id: block.id,
      assignment_id: assignmentId,
      requester_id: user.id,
      partner_id: partnerId,
    })
    await loadPairData(assignment.class_id)
    setPairBusy(false)
  }

  async function respondPairRequest(requestId, status) {
    setPairBusy(true)
    await supabase.from('pair_requests').update({ status }).eq('id', requestId)
    await loadPairData(assignment.class_id)
    setPairBusy(false)
  }

  async function addHighlight(block, { start_offset, end_offset, quote, note }) {
    const { data, error } = await supabase
      .from('lecture_highlights')
      .insert({
        content_id: block.id,
        assignment_id: assignmentId,
        student_id: user.id,
        start_offset,
        end_offset,
        quote,
        note,
      })
      .select()
      .single()
    if (!error) {
      setHighlightsByBlock((prev) => ({
        ...prev,
        [block.id]: [...(prev[block.id] ?? []), data].sort((a, b) => a.start_offset - b.start_offset),
      }))
    }
  }

  async function deleteHighlight(block, highlightId) {
    const { error } = await supabase.from('lecture_highlights').delete().eq('id', highlightId)
    if (!error) {
      setHighlightsByBlock((prev) => ({
        ...prev,
        [block.id]: (prev[block.id] ?? []).filter((h) => h.id !== highlightId),
      }))
    }
  }

  function handleLectureComplete(block) {
    haptic('success')
    saveProgress(block, { completed: true, completed_at: new Date().toISOString(), time_spent_seconds: elapsedSeconds() })
  }

  async function handleActivitySubmit(block, response, score, maxScore) {
    // Celebrate every graded submission — bigger burst for a perfect score.
    const perfect = maxScore > 0 && score === maxScore
    celebrate({ big: perfect })

    if (block.data?.mode === 'pair') {
      // Pair activities write both students' progress rows in one RPC call
      // (student_progress RLS only lets each student write their own row).
      const { error } = await supabase.rpc('submit_pair_activity_progress', {
        p_content_id: block.id,
        p_assignment_id: assignmentId,
        p_response: response,
        p_score: score,
        p_max_score: maxScore,
        p_time_spent_seconds: elapsedSeconds(),
      })
      if (!error) await loadAll()
      return
    }

    saveProgress(block, {
      response,
      score,
      max_score: maxScore,
      completed: true,
      completed_at: new Date().toISOString(),
      time_spent_seconds: elapsedSeconds(),
    })
  }

  function dismissIntro() {
    localStorage.setItem(`intro_seen_${assignmentId}`, '1')
    setShowIntro(false)
  }

  function handleInteractiveComplete(block) {
    haptic('success')
    saveProgress(block, { completed: true, completed_at: new Date().toISOString(), time_spent_seconds: elapsedSeconds() })
  }

  if (loading) {
    return (
      <div>
        <Navbar />
        <main className="page"><p className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Loader2 size={16} className="spin" /> Loading…</p></main>
      </div>
    )
  }

  if (!assignment) {
    return (
      <div>
        <Navbar />
        <main className="page"><p>Module not found.</p></main>
      </div>
    )
  }

  const block = blocks[current]
  const View = block ? VIEWS[block.type] : null
  const progress = block ? progressByBlock[block.id] : null

  const preliminaries = isPreliminariesModule(assignment.modules?.title)

  return (
    <div>
      <Navbar />
      {showIntro && (
        <TeacherIntro teacherName={teacherName} onFinish={dismissIntro} />
      )}
      <main className="page">
        <div className="page-header">
          <div>
            <h1><BlockIcon type="lecture" size={22} /> {assignment.modules?.title}</h1>
            <p className="subtitle">{assignment.modules?.subject} — {assignment.classes?.name}</p>
          </div>
          <Link className="btn" to="/student/my-modules"><ArrowLeft size={15} /> Back to My Modules</Link>
        </div>

        {preliminaries && !showIntro && (
          <button type="button" className="teacher-intro-replay" onClick={() => setShowIntro(true)}>
            <Sparkles size={13} /> Meet {teacherName.split(' ')[0]} again
          </button>
        )}

        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: totalBlocks ? `${(completedCount / totalBlocks) * 100}%` : '0%' }} />
        </div>
        <p className="muted small">{completedCount} / {totalBlocks} blocks complete</p>

        {totalBlocks === 0 && <p className="muted">This module has no content yet.</p>}

        {totalBlocks > 0 && (
          <>
            <div className="stepper">
              {blocks.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  className={`stepper-btn${i === current ? ' stepper-btn-active' : ''}${progressByBlock[b.id]?.completed ? ' stepper-btn-done' : ''}`}
                  onClick={() => { haptic('tap'); setCurrent(i) }}
                >
                  <BlockIcon type={b.type} size={13} /> {i + 1}
                </button>
              ))}
            </div>

            <div className="module-card" style={{ marginTop: '1rem' }}>
              <h3><BlockIcon type={block.type} size={18} /> {block.title}</h3>
              {View && (
                <View
                  // Without a key, React reuses the same component instance
                  // when moving between two blocks of the same type, so an
                  // ActivityView carries its `responses`/`result` state over
                  // to the next activity — which renders it already graded
                  // and permanently locked. Keying on the block id forces a
                  // fresh mount per block.
                  key={block.id}
                  data={block.data}
                  progress={progress}
                  onComplete={() => (block.type === 'lecture' ? handleLectureComplete(block) : handleInteractiveComplete(block))}
                  onSubmit={(response, score, maxScore) => handleActivitySubmit(block, response, score, maxScore)}
                  highlights={block.type === 'lecture' ? (highlightsByBlock[block.id] ?? []) : []}
                  onAddHighlight={block.type === 'lecture' ? (h) => addHighlight(block, h) : undefined}
                  onDeleteHighlight={block.type === 'lecture' ? (id) => deleteHighlight(block, id) : undefined}
                  pairing={block.type === 'activity' ? pairingForBlock(block) : undefined}
                />
              )}
            </div>

            <div className="row-actions" style={{ marginTop: '1rem' }}>
              <button className="btn" disabled={current === 0} onClick={() => { haptic('tap'); setCurrent((c) => c - 1) }}><ArrowLeft size={15} /> Previous</button>
              <button className="btn" disabled={current === blocks.length - 1} onClick={() => { haptic('tap'); setCurrent((c) => c + 1) }}>Next <ArrowRight size={15} /></button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
