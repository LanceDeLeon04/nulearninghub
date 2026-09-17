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
import RingProgress from '../../components/RingProgress'
import { haptic } from '../../lib/haptics'
import { celebrate } from '../../lib/confetti'
import { groupBySubModule, flattenGroups, groupProgress, unlockedThrough } from '../../lib/subModules'
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Lock, ChevronDown, CheckCircle2 } from 'lucide-react'
import maamLinPortrait from '../../assets/maam-lin-portrait.png'

// Preliminaries always introduces itself as Miss Lin, regardless of which
// teacher actually authored or assigned the module — she's the face of the
// onboarding experience for every class, not a per-teacher thing.
const PRELIMINARIES_TEACHER_NAME = 'Miss Lin'

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
  const [rawBlocks, setRawBlocks] = useState([])
  const [subModules, setSubModules] = useState([])
  const [openGroup, setOpenGroup] = useState(0)
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
    // Depends on rawBlocks rather than the derived `blocks`, which is
    // declared further down and would still be in the temporal dead zone
    // when this dependency array is evaluated during render.
  }, [current, rawBlocks])

  function elapsedSeconds() {
    return Math.max(1, Math.round((Date.now() - blockStartRef.current) / 1000))
  }

  // True when the block at `index` still requires the student to finish it
  // (mark as read / submit / complete) before moving to anything ahead of it.
  // require_completion defaults to true at the database level, so a block
  // with no value set (e.g. rows created before this feature) is still
  // treated as required — the safer default for "don't let students skip".
  function requiresCompletionGate(index) {
    const b = blocks[index]
    if (!b) return false
    const required = b.require_completion ?? true
    return required && !progressByBlock[b.id]?.completed
  }

  async function loadAll() {
    setLoading(true)
    const { data: a } = await supabase
      .from('module_assignments')
      .select('id, due_date, module_id, class_id, modules ( id, title, subject, description, teacher_id, cover_image_url ), classes ( name )')
      .eq('id', assignmentId)
      .single()
    setAssignment(a)

    if (a?.modules?.teacher_id && !isPreliminariesModule(a.modules?.title)) {
      const { data: teacherProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', a.modules.teacher_id)
        .single()
      if (teacherProfile?.full_name) setTeacherName(teacherProfile.full_name)
    } else if (isPreliminariesModule(a?.modules?.title)) {
      setTeacherName(PRELIMINARIES_TEACHER_NAME)
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
      setRawBlocks(b ?? [])

      // Sub-topics of this module. A module that has never been organised
      // into sub-modules returns an empty list here, and groupBySubModule
      // then yields one "Other content" group — so the player keeps working
      // exactly as it did before this feature existed.
      const { data: sm } = await supabase
        .from('sub_modules')
        .select('*')
        .eq('module_id', a.module_id)
        .order('order_index', { ascending: true })
      setSubModules(sm ?? [])

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

  // The sub-topic structure, and the flat walk-through order derived from
  // it. `current` indexes `blocks` (the flattened list) so Previous/Next
  // still move one block at a time and roll over sub-topic boundaries.
  const groups = useMemo(() => groupBySubModule(rawBlocks, subModules), [rawBlocks, subModules])
  const blocks = useMemo(() => flattenGroups(groups), [groups])

  // Furthest sub-topic the student may open: everything up to and including
  // the first one with required work left. Sub-topics beyond that are locked,
  // which is what makes sub-modules a real progression rather than just
  // visual grouping.
  const openThrough = useMemo(() => unlockedThrough(groups, progressByBlock), [groups, progressByBlock])

  const totalBlocks = blocks.length
  const completedCount = useMemo(
    () => blocks.filter((b) => progressByBlock[b.id]?.completed).length,
    [blocks, progressByBlock]
  )
  const celebratedModuleRef = useRef(false)

  // Keep the expanded sub-topic in sync with wherever the student actually is,
  // so Next-ing off the end of a section opens the next one automatically.
  const currentGroupIndex = blocks[current]?.groupIndex ?? 0
  useEffect(() => {
    setOpenGroup(currentGroupIndex)
  }, [currentGroupIndex])

  // Finishing a sub-topic is its own small milestone, so it gets its own
  // (smaller) confetti burst — once per sub-topic, tracked by id so a
  // reload or a revisit doesn't re-fire it.
  const celebratedGroupsRef = useRef(new Set())
  // First pass after load only records what's *already* finished, so
  // re-opening a module the student finished last week doesn't replay a
  // burst of confetti for every sub-topic.
  const groupsPrimedRef = useRef(false)
  useEffect(() => {
    if (groups.length === 0) return
    const priming = !groupsPrimedRef.current
    for (const g of groups) {
      if (!g.id || celebratedGroupsRef.current.has(g.id)) continue
      if (groupProgress(g, progressByBlock).finished) {
        celebratedGroupsRef.current.add(g.id)
        if (!priming && completedCount < totalBlocks) celebrate({ big: false })
      }
    }
    groupsPrimedRef.current = true
  }, [groups, progressByBlock, completedCount, totalBlocks])

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

  async function handleActivitySubmit(block, response, score, maxScore, subjectiveMax = 0) {
    // An activity with written, teacher-scored questions is saved "for
    // review": no points, no badges, until a teacher reads it. Celebrating a
    // perfect auto-score there would be premature, so hold the confetti.
    const pendingReview = subjectiveMax > 0
    const perfect = !pendingReview && maxScore > 0 && score === maxScore
    if (!pendingReview) celebrate({ big: perfect })

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
        p_subjective_max: subjectiveMax,
      })
      if (!error) await loadAll()
      return
    }

    saveProgress(block, {
      response,
      score,
      max_score: maxScore,
      subjective_max: subjectiveMax,
      pending_review: pendingReview,
      // A resubmission starts the review over rather than keeping a score
      // that was given for different words.
      teacher_score: null,
      teacher_feedback: null,
      reviewed_at: null,
      reviewed_by: null,
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
        <TeacherIntro
          teacherName={teacherName}
          portraitSrc={preliminaries ? maamLinPortrait : null}
          onFinish={dismissIntro}
        />
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
            <Sparkles size={13} /> Meet {teacherName} again
          </button>
        )}

        {assignment.modules?.cover_image_url && (
          <img className="module-cover-banner" src={assignment.modules.cover_image_url} alt="" />
        )}

        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: totalBlocks ? `${(completedCount / totalBlocks) * 100}%` : '0%' }} />
        </div>
        <p className="muted small">
          {completedCount} / {totalBlocks} blocks complete
          {groups.length > 1 && ` · ${groups.filter((g) => groupProgress(g, progressByBlock).finished).length} / ${groups.length} sub-topics done`}
        </p>

        {totalBlocks === 0 && <p className="muted">This module has no content yet.</p>}

        {totalBlocks > 0 && (
          <>
            {/* Sub-topic navigator. Each sub-module is a collapsible row with
                its own progress ring; expanding it reveals the blocks inside.
                A sub-topic past the first one with unfinished required work
                is locked, so students work through the sub-topics in order
                instead of jumping to the Self-Check. */}
            <div className="submodule-nav">
              {groups.map((g, gi) => {
                const gp = groupProgress(g, progressByBlock)
                const locked = gi > openThrough
                const expanded = openGroup === gi && !locked
                return (
                  <div
                    key={g.id ?? 'unsorted'}
                    className={`submodule-item${expanded ? ' submodule-item-open' : ''}${locked ? ' submodule-item-locked' : ''}${gp.finished ? ' submodule-item-done' : ''}`}
                  >
                    <button
                      type="button"
                      className="submodule-head"
                      disabled={locked}
                      onClick={() => { if (!locked) { haptic('tap'); setOpenGroup(expanded ? -1 : gi) } }}
                      title={locked ? 'Finish the earlier sub-topics first' : undefined}
                    >
                      <span className="submodule-index">{gi + 1}</span>
                      <span className="submodule-head-text">
                        <span className="submodule-title">{g.title}</span>
                        <span className="muted small">{gp.completed} / {gp.total} blocks</span>
                      </span>
                      {locked
                        ? <Lock size={15} className="submodule-lock" />
                        : gp.finished
                          ? <CheckCircle2 size={18} className="submodule-check" />
                          : <RingProgress percent={gp.percent} size={34} stroke={4} />}
                      {!locked && <ChevronDown size={15} className="submodule-chevron" />}
                    </button>

                    {expanded && (
                      <div className="stepper submodule-stepper">
                        {g.blocks.map((b) => {
                          const i = blocks.findIndex((x) => x.id === b.id)
                          // Inside an unlocked sub-topic a student can still
                          // revisit anything they've reached, but can't skip
                          // forward past an unfinished required block.
                          const isLocked = i > current && requiresCompletionGate(current)
                          return (
                            <button
                              key={b.id}
                              type="button"
                              className={`stepper-btn${i === current ? ' stepper-btn-active' : ''}${progressByBlock[b.id]?.completed ? ' stepper-btn-done' : ''}${isLocked ? ' stepper-btn-locked' : ''}`}
                              onClick={() => { if (!isLocked) { haptic('tap'); setCurrent(i) } }}
                              disabled={isLocked}
                              title={isLocked ? 'Finish the current activity first' : b.title}
                            >
                              <BlockIcon type={b.type} size={13} /> {i + 1}
                            </button>
                          )
                        })}
                        {g.blocks.length === 0 && <p className="muted small">Nothing in this sub-topic yet.</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="module-card" style={{ marginTop: '1rem' }}>
              <p className="submodule-breadcrumb">
                {groups[block.groupIndex]?.title} · block {block.indexInGroup + 1} of {groups[block.groupIndex]?.blocks.length}
              </p>
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
                  onSubmit={(response, score, maxScore, subjectiveMax) => handleActivitySubmit(block, response, score, maxScore, subjectiveMax)}
                  highlights={block.type === 'lecture' ? (highlightsByBlock[block.id] ?? []) : []}
                  onAddHighlight={block.type === 'lecture' ? (h) => addHighlight(block, h) : undefined}
                  onDeleteHighlight={block.type === 'lecture' ? (id) => deleteHighlight(block, id) : undefined}
                  pairing={block.type === 'activity' ? pairingForBlock(block) : undefined}
                />
              )}
            </div>

            <div className="row-actions" style={{ marginTop: '1rem' }}>
              <button className="btn" disabled={current === 0} onClick={() => { haptic('tap'); setCurrent((c) => c - 1) }}><ArrowLeft size={15} /> Previous</button>
              <button
                className="btn"
                disabled={current === blocks.length - 1 || requiresCompletionGate(current)}
                onClick={() => { haptic('tap'); setCurrent((c) => c + 1) }}
              >
                {blocks[current + 1] && blocks[current + 1].groupIndex !== block.groupIndex ? 'Next sub-topic' : 'Next'} <ArrowRight size={15} />
              </button>
            </div>
            {requiresCompletionGate(current) && current < blocks.length - 1 && (
              <p className="muted small" style={{ marginTop: '0.4rem' }}>
                {block.type === 'lecture'
                  ? 'Mark this as read to continue to the next section.'
                  : block.type === 'activity'
                    ? 'Submit this activity to continue to the next section.'
                    : 'Complete this to continue to the next section.'}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
