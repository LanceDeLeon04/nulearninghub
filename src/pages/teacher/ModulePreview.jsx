import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import LectureView from '../../components/blocks/LectureView'
import ActivityView from '../../components/blocks/ActivityView'
import InteractiveView from '../../components/blocks/InteractiveView'
import BlockIcon from '../../components/BlockIcon'
import { haptic } from '../../lib/haptics'
import { groupBySubModule, flattenGroups } from '../../lib/subModules'
import { ArrowLeft, ArrowRight, Eye, Loader2 } from 'lucide-react'

// Where "Back" goes and what it's called, per role — this page is shared
// by teachers (previewing before assigning) and admins (previewing before
// approving), reached from /teacher/module-preview/:id and
// /admin/module-preview/:id respectively.
const BACK_LINK = {
  admin: { to: '/admin/module-approval', label: 'Back to Module Approval' },
  teacher: { to: '/teacher/modules', label: 'Back to Modules' },
}

const VIEWS = {
  lecture: LectureView,
  activity: ActivityView,
  interactive: InteractiveView,
}

// Read-only walkthrough of a module's content, for teachers. Reuses the same
// block renderers students see, but nothing here is saved: no progress rows,
// no highlights, and activities can't be answered — teachers can look inside
// a module without being able to act as a student.
export default function ModulePreview() {
  const { moduleId } = useParams()
  const { role } = useAuth()
  const back = BACK_LINK[role] ?? BACK_LINK.teacher
  const [module, setModule] = useState(null)
  const [rawBlocks, setRawBlocks] = useState([])
  const [subModules, setSubModules] = useState([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: m } = await supabase
        .from('modules')
        .select('id, title, subject, description, cover_image_url, profiles:teacher_id ( full_name )')
        .eq('id', moduleId)
        .single()
      setModule(m)

      const { data: b } = await supabase
        .from('module_content')
        .select('*')
        .eq('module_id', moduleId)
        .order('order_index', { ascending: true })
      setRawBlocks(b ?? [])

      const { data: sm } = await supabase
        .from('sub_modules')
        .select('*')
        .eq('module_id', moduleId)
        .order('order_index', { ascending: true })
      setSubModules(sm ?? [])
      setLoading(false)
    }
    load()
  }, [moduleId])

  // Same sub-topic grouping students see, so a teacher previewing a module
  // is checking the real structure and not a flattened version of it.
  const groups = useMemo(() => groupBySubModule(rawBlocks, subModules), [rawBlocks, subModules])
  const blocks = useMemo(() => flattenGroups(groups), [groups])

  if (loading) {
    return (
      <div>
        <Navbar />
        <main className="page"><p className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Loader2 size={16} className="spin" /> Loading…</p></main>
      </div>
    )
  }

  if (!module) {
    return (
      <div>
        <Navbar />
        <main className="page"><p>Module not found.</p></main>
      </div>
    )
  }

  const block = blocks[current]
  const View = block ? VIEWS[block.type] : null

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <div>
            <h1><Eye size={22} /> {module.title}</h1>
            <p className="subtitle">{module.subject} — by {module.profiles?.full_name}</p>
          </div>
          <Link className="btn" to={back.to}><ArrowLeft size={15} /> {back.label}</Link>
        </div>

        <div className="info-banner">
          <Eye size={15} /> Preview mode — you're viewing this content exactly as students see it. Nothing here is saved, and activities can't be answered from this view.
        </div>

        {module.cover_image_url && <img className="module-cover-banner" src={module.cover_image_url} alt="" />}

        {module.description && <p className="muted">{module.description}</p>}

        {blocks.length === 0 && <p className="muted">This module has no content yet.</p>}

        {blocks.length > 0 && (
          <>
            {groups.map((g, gi) => (
              <div key={g.id ?? 'unsorted'} className="preview-group">
                <p className="block-group-label">{gi + 1}. {g.title}</p>
                <div className="stepper">
                  {g.blocks.map((b) => {
                    const i = blocks.findIndex((x) => x.id === b.id)
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`stepper-btn${i === current ? ' stepper-btn-active' : ''}`}
                        onClick={() => { haptic('tap'); setCurrent(i) }}
                        title={b.title}
                      >
                        <BlockIcon type={b.type} size={13} /> {i + 1}
                      </button>
                    )
                  })}
                  {g.blocks.length === 0 && <p className="muted small">No blocks in this sub-topic.</p>}
                </div>
              </div>
            ))}

            <div className="module-card" style={{ marginTop: '1rem' }}>
              <p className="submodule-breadcrumb">{groups[block.groupIndex]?.title}</p>
              <h3><BlockIcon type={block.type} size={18} /> {block.title}</h3>
              {View && <View data={block.data} progress={null} onComplete={() => {}} onSubmit={() => {}} readOnly />}
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
