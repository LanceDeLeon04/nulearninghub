import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Navbar from '../../components/Navbar'
import LectureView from '../../components/blocks/LectureView'
import ActivityView from '../../components/blocks/ActivityView'
import InteractiveView from '../../components/blocks/InteractiveView'
import BlockIcon from '../../components/BlockIcon'
import { haptic } from '../../lib/haptics'
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
  const [blocks, setBlocks] = useState([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: m } = await supabase
        .from('modules')
        .select('id, title, subject, description, profiles:teacher_id ( full_name )')
        .eq('id', moduleId)
        .single()
      setModule(m)

      const { data: b } = await supabase
        .from('module_content')
        .select('*')
        .eq('module_id', moduleId)
        .order('order_index', { ascending: true })
      setBlocks(b ?? [])
      setLoading(false)
    }
    load()
  }, [moduleId])

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

        {module.description && <p className="muted">{module.description}</p>}

        {blocks.length === 0 && <p className="muted">This module has no content yet.</p>}

        {blocks.length > 0 && (
          <>
            <div className="stepper">
              {blocks.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  className={`stepper-btn${i === current ? ' stepper-btn-active' : ''}`}
                  onClick={() => { haptic('tap'); setCurrent(i) }}
                >
                  <BlockIcon type={b.type} size={13} /> {i + 1}
                </button>
              ))}
            </div>

            <div className="module-card" style={{ marginTop: '1rem' }}>
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
