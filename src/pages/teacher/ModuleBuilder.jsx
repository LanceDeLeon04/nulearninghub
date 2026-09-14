import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Navbar from '../../components/Navbar'
import { BLOCK_TYPES, defaultBlockData } from '../../lib/blockTypes'
import LectureEditor from '../../components/blocks/LectureEditor'
import ActivityEditor from '../../components/blocks/ActivityEditor'
import InteractiveEditor from '../../components/blocks/InteractiveEditor'
import BlockIcon from '../../components/BlockIcon'
import { haptic } from '../../lib/haptics'
import { ArrowLeft, ArrowUp, ArrowDown, X, Wrench, ListPlus } from 'lucide-react'

const EDITORS = {
  lecture: LectureEditor,
  activity: ActivityEditor,
  interactive: InteractiveEditor,
}

const BLOCK_META = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b]))

export default function ModuleBuilder() {
  const { moduleId } = useParams()
  const [mod, setMod] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null) // { title, data } for the selected block
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadModule() {
    const { data } = await supabase.from('modules').select('*').eq('id', moduleId).single()
    setMod(data)
  }

  async function loadBlocks() {
    const { data } = await supabase
      .from('module_content')
      .select('*')
      .eq('module_id', moduleId)
      .order('order_index', { ascending: true })
    setBlocks(data ?? [])
  }

  useEffect(() => {
    loadModule()
    loadBlocks()
  }, [moduleId])

  function selectBlock(block) {
    setSelectedId(block.id)
    setDraft({ title: block.title, data: block.data })
    setMessage('')
  }

  async function handleAddBlock(type) {
    const meta = BLOCK_META[type]
    const { data, error } = await supabase
      .from('module_content')
      .insert({
        module_id: moduleId,
        type,
        title: `New ${meta.label}`,
        data: defaultBlockData(type),
        order_index: blocks.length,
      })
      .select()
      .single()
    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }
    await loadBlocks()
    selectBlock(data)
  }

  async function handleSaveDraft() {
    if (!selectedId || !draft) return
    setSaving(true)
    const { error } = await supabase
      .from('module_content')
      .update({ title: draft.title, data: draft.data })
      .eq('id', selectedId)
    setSaving(false)
    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }
    setMessage('Saved.')
    await loadBlocks()
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('module_content').delete().eq('id', id)
    if (!error) {
      if (selectedId === id) {
        setSelectedId(null)
        setDraft(null)
      }
      await loadBlocks()
    }
  }

  async function handleMove(index, direction) {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    const a = blocks[index]
    const b = blocks[target]
    await Promise.all([
      supabase.from('module_content').update({ order_index: b.order_index }).eq('id', a.id),
      supabase.from('module_content').update({ order_index: a.order_index }).eq('id', b.id),
    ])
    await loadBlocks()
  }

  const Editor = draft && selectedId ? EDITORS[blocks.find((b) => b.id === selectedId)?.type] : null

  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <div>
            <h1><Wrench size={22} /> {mod?.title ?? 'Module'}</h1>
            <p className="subtitle">Build the self-contained content students will go through — lectures, activities, and interactive blocks, in order.</p>
          </div>
          <Link className="btn" to="/teacher/add-module"><ArrowLeft size={15} /> Back to My Submissions</Link>
        </div>

        <div className="builder-layout">
          <div className="builder-sidebar">
            <h3><Wrench size={16} /> Content Blocks</h3>
            <ul className="block-list">
              {blocks.map((b, i) => (
                <li key={b.id} className={selectedId === b.id ? 'block-list-item-active' : ''}>
                  <button type="button" className="block-list-btn" onClick={() => selectBlock(b)}>
                    <BlockIcon type={b.type} /> {b.title}
                  </button>
                  <div className="block-list-actions">
                    <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => { haptic('tap'); handleMove(i, -1) }}><ArrowUp size={13} /></button>
                    <button type="button" className="btn btn-sm" disabled={i === blocks.length - 1} onClick={() => { haptic('tap'); handleMove(i, 1) }}><ArrowDown size={13} /></button>
                    <button type="button" className="btn btn-reject btn-sm" onClick={() => { haptic('warning'); handleDelete(b.id) }}><X size={13} /></button>
                  </div>
                </li>
              ))}
              {blocks.length === 0 && <li className="muted small">No content yet — add a block below.</li>}
            </ul>

            <h3 style={{ marginTop: '1.2rem' }}><ListPlus size={16} /> Add Block</h3>
            <div className="add-block-list">
              {BLOCK_TYPES.map((t) => (
                <button key={t.type} type="button" className="btn" onClick={() => { haptic('select'); handleAddBlock(t.type) }}>
                  <BlockIcon type={t.type} /> {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="builder-main">
            {message && <div className="info-banner">{message}</div>}
            {!draft && <p className="muted">Select a block to edit, or add a new one.</p>}
            {draft && (
              <div className="form-card" style={{ maxWidth: 'none' }}>
                <label>
                  Block Title
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </label>
                {Editor && <Editor data={draft.data} onChange={(data) => setDraft({ ...draft, data })} context={{ moduleId, blockId: selectedId }} />}
                <button onClick={handleSaveDraft} disabled={saving}>{saving ? 'Saving…' : 'Save Block'}</button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
