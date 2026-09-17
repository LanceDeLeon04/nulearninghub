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
import { groupBySubModule } from '../../lib/subModules'
import { ArrowLeft, ArrowUp, ArrowDown, X, Wrench, ListPlus, FolderPlus, Layers, Pencil, Check, ImagePlus } from 'lucide-react'

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
  const [subModules, setSubModules] = useState([])
  const [newSubTitle, setNewSubTitle] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null) // { title, data } for the selected block
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)

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

  async function loadSubModules() {
    const { data } = await supabase
      .from('sub_modules')
      .select('*')
      .eq('module_id', moduleId)
      .order('order_index', { ascending: true })
    setSubModules(data ?? [])
  }

  useEffect(() => {
    loadModule()
    loadBlocks()
    loadSubModules()
  }, [moduleId])

  // ===== Module cover photo =====
  // Stored on the module itself (modules.cover_image_url) rather than in a
  // content block, so it can head the module card, the player, and preview
  // without being a step students have to walk through.
  async function handleCoverUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${moduleId}/cover-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('module-images').upload(path, file, { upsert: true })
    if (upErr) {
      setMessage(`Upload failed: ${upErr.message}`)
      setCoverUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from('module-images').getPublicUrl(path)
    await saveCover(pub.publicUrl)
    setCoverUploading(false)
  }

  async function saveCover(url) {
    const { error } = await supabase.from('modules').update({ cover_image_url: url || null }).eq('id', moduleId)
    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }
    await loadModule()
  }

  // ===== Sub-modules (sub-topics) =====

  async function handleAddSubModule() {
    const title = newSubTitle.trim()
    if (!title) return
    const { error } = await supabase.from('sub_modules').insert({
      module_id: moduleId,
      title,
      order_index: subModules.length,
    })
    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }
    setNewSubTitle('')
    await loadSubModules()
  }

  async function handleRenameSubModule(id) {
    const title = renameValue.trim()
    if (!title) return
    await supabase.from('sub_modules').update({ title }).eq('id', id)
    setRenamingId(null)
    await loadSubModules()
  }

  // Deleting a sub-topic never deletes its content: the FK is ON DELETE SET
  // NULL, so the blocks drop back into "Other content" and can be re-filed.
  async function handleDeleteSubModule(id) {
    const { error } = await supabase.from('sub_modules').delete().eq('id', id)
    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }
    setMessage('Sub-topic removed — its blocks moved to "Other content".')
    await Promise.all([loadSubModules(), loadBlocks()])
  }

  async function handleMoveSubModule(index, direction) {
    const target = index + direction
    if (target < 0 || target >= subModules.length) return
    const a = subModules[index]
    const b = subModules[target]
    await Promise.all([
      supabase.from('sub_modules').update({ order_index: b.order_index }).eq('id', a.id),
      supabase.from('sub_modules').update({ order_index: a.order_index }).eq('id', b.id),
    ])
    await loadSubModules()
  }

  // Which sub-topic a block belongs to. Saved immediately (rather than with
  // the block draft) so filing a block never depends on remembering to hit
  // Save Block afterwards.
  async function handleAssignSubModule(blockId, subModuleId) {
    const { error } = await supabase
      .from('module_content')
      .update({ sub_module_id: subModuleId || null })
      .eq('id', blockId)
    if (error) {
      setMessage(`Error: ${error.message}`)
      return
    }
    await loadBlocks()
  }

  function selectBlock(block) {
    setSelectedId(block.id)
    setDraft({
      title: block.title,
      data: block.data,
      requireCompletion: block.require_completion ?? true,
      subModuleId: block.sub_module_id ?? '',
    })
    setMessage('')
  }

  async function handleAddBlock(type) {
    const meta = BLOCK_META[type]
    // File the new block into whichever sub-topic the teacher is currently
    // working in (or the last one, if nothing's selected) — that's almost
    // always what's meant, and it can be moved from the dropdown anyway.
    const selected = blocks.find((b) => b.id === selectedId)
    const defaultSub =
      selected?.sub_module_id ?? (subModules.length ? subModules[subModules.length - 1].id : null)
    const { data, error } = await supabase
      .from('module_content')
      .insert({
        module_id: moduleId,
        type,
        title: `New ${meta.label}`,
        data: defaultBlockData(type),
        order_index: blocks.length,
        sub_module_id: defaultSub,
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
      .update({ title: draft.title, data: draft.data, require_completion: draft.requireCompletion })
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
  const selectedType = selectedId ? blocks.find((b) => b.id === selectedId)?.type : null
  const REQUIRE_LABEL = {
    lecture: 'Student must mark this as read before moving on',
    activity: 'Student must submit this activity before moving on',
    interactive: 'Student must complete this before moving on',
  }

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

        <div className="module-cover-editor">
          <div className="module-cover-preview">
            {mod?.cover_image_url
              ? <img src={mod.cover_image_url} alt="Module cover" />
              : <span className="muted small">No module photo yet</span>}
          </div>
          <div className="module-cover-controls">
            <h4><ImagePlus size={15} /> Module photo</h4>
            <p className="muted small">Shown on the student's module card and at the top of the module.</p>
            <input type="file" accept="image/*" onChange={handleCoverUpload} disabled={coverUploading} />
            <input
              placeholder="…or paste an image URL"
              defaultValue={mod?.cover_image_url ?? ''}
              onBlur={(e) => { if (e.target.value !== (mod?.cover_image_url ?? '')) saveCover(e.target.value.trim()) }}
            />
            {mod?.cover_image_url && (
              <button type="button" className="btn btn-reject btn-sm" onClick={() => saveCover('')}><X size={13} /> Remove photo</button>
            )}
            {coverUploading && <p className="muted small">Uploading…</p>}
          </div>
        </div>

        <div className="builder-layout">
          <div className="builder-sidebar">
            <h3><Layers size={16} /> Sub-topics</h3>
            <p className="muted small" style={{ marginTop: '-0.4rem' }}>
              Group this module's blocks into sub-topics. Students work through
              them in order — each one unlocks only when the previous is done.
            </p>
            <ul className="submodule-admin-list">
              {subModules.map((sm, i) => (
                <li key={sm.id}>
                  {renamingId === sm.id ? (
                    <div className="submodule-admin-rename">
                      <input
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubModule(sm.id) }}
                      />
                      <button type="button" className="btn btn-sm" onClick={() => handleRenameSubModule(sm.id)}><Check size={13} /></button>
                    </div>
                  ) : (
                    <>
                      <span className="submodule-admin-title">
                        <span className="submodule-index">{i + 1}</span> {sm.title}
                      </span>
                      <div className="block-list-actions">
                        <button type="button" className="btn btn-sm" onClick={() => { setRenamingId(sm.id); setRenameValue(sm.title) }}><Pencil size={13} /></button>
                        <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => { haptic('tap'); handleMoveSubModule(i, -1) }}><ArrowUp size={13} /></button>
                        <button type="button" className="btn btn-sm" disabled={i === subModules.length - 1} onClick={() => { haptic('tap'); handleMoveSubModule(i, 1) }}><ArrowDown size={13} /></button>
                        <button type="button" className="btn btn-reject btn-sm" onClick={() => { haptic('warning'); handleDeleteSubModule(sm.id) }}><X size={13} /></button>
                      </div>
                    </>
                  )}
                </li>
              ))}
              {subModules.length === 0 && <li className="muted small">No sub-topics yet — every block sits in "Other content".</li>}
            </ul>
            <div className="submodule-admin-add">
              <input
                placeholder="New sub-topic title"
                value={newSubTitle}
                onChange={(e) => setNewSubTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubModule() }}
              />
              <button type="button" className="btn" onClick={() => { haptic('select'); handleAddSubModule() }}>
                <FolderPlus size={14} /> Add
              </button>
            </div>

            <h3 style={{ marginTop: '1.2rem' }}><Wrench size={16} /> Content Blocks</h3>
            {groupBySubModule(blocks, subModules).map((g) => (
              <div key={g.id ?? 'unsorted'} className="block-group">
                <p className="block-group-label">{g.title}</p>
                <ul className="block-list">
                  {g.blocks.map((b) => {
                    // Reordering is still module-wide (order_index is global),
                    // so the up/down arrows use the block's index in the flat
                    // list, not its position inside this group.
                    const i = blocks.findIndex((x) => x.id === b.id)
                    return (
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
                    )
                  })}
                  {g.blocks.length === 0 && <li className="muted small">Empty — add a block while this sub-topic is selected.</li>}
                </ul>
              </div>
            ))}
            {blocks.length === 0 && <p className="muted small">No content yet — add a block below.</p>}

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
                <label>
                  Sub-topic
                  <select
                    value={draft.subModuleId}
                    onChange={(e) => {
                      setDraft({ ...draft, subModuleId: e.target.value })
                      handleAssignSubModule(selectedId, e.target.value)
                    }}
                  >
                    <option value="">Other content (no sub-topic)</option>
                    {subModules.map((sm) => (
                      <option key={sm.id} value={sm.id}>{sm.title}</option>
                    ))}
                  </select>
                </label>
                {Editor && <Editor data={draft.data} onChange={(data) => setDraft({ ...draft, data })} context={{ moduleId, blockId: selectedId }} />}
                <label className="checkbox-row" style={{ marginTop: '0.75rem' }}>
                  <input
                    type="checkbox"
                    checked={draft.requireCompletion}
                    onChange={(e) => setDraft({ ...draft, requireCompletion: e.target.checked })}
                  />
                  {REQUIRE_LABEL[selectedType] ?? 'Student must complete this before moving on'}
                </label>
                {!draft.requireCompletion && (
                  <p className="muted small" style={{ marginTop: '0.25rem' }}>
                    Students will be able to click Next without finishing this block.
                  </p>
                )}
                <button onClick={handleSaveDraft} disabled={saving}>{saving ? 'Saving…' : 'Save Block'}</button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
