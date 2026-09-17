// Helpers for the sub-module (sub-topic) layer that sits between a module
// and its content blocks.
//
// A module owns an ordered list of sub_modules; every content block points
// at one of them via sub_module_id. Blocks with no sub-module (a brand new
// block, or one whose sub-module was deleted) are collected into a single
// trailing "unsorted" group rather than being hidden — losing a block
// because nobody filed it would be much worse than showing it last.

export const UNSORTED_TITLE = 'Other content'

/**
 * Group blocks under their sub-modules, in teaching order.
 *
 * @param {Array} blocks     module_content rows, any order
 * @param {Array} subModules sub_modules rows, any order
 * @returns {Array} [{ id, title, description, blocks: [...] }] — sub-modules
 *   in order_index order, then (only if non-empty) the unsorted group.
 *   Empty sub-modules are kept: a teacher who just created one needs to see
 *   it in the builder before there's anything in it.
 */
export function groupBySubModule(blocks = [], subModules = []) {
  const ordered = [...subModules].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  )
  const byId = new Map(
    ordered.map((sm) => [
      sm.id,
      { id: sm.id, title: sm.title, description: sm.description, blocks: [] },
    ])
  )
  const unsorted = { id: null, title: UNSORTED_TITLE, description: null, blocks: [] }

  const sortedBlocks = [...blocks].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  )
  for (const b of sortedBlocks) {
    const group = (b.sub_module_id && byId.get(b.sub_module_id)) || unsorted
    group.blocks.push(b)
  }

  const groups = [...byId.values()]
  if (unsorted.blocks.length > 0) groups.push(unsorted)
  return groups
}

/**
 * Flatten grouped blocks back into the single sequence the player walks
 * through, so "Next" crosses a sub-topic boundary naturally instead of
 * dead-ending at the last block of a section.
 *
 * Returns the blocks themselves, annotated with where they sit:
 *   groupIndex   — which sub-topic (index into `groups`)
 *   indexInGroup — position within that sub-topic
 */
export function flattenGroups(groups = []) {
  const out = []
  groups.forEach((g, groupIndex) => {
    g.blocks.forEach((b, indexInGroup) => {
      out.push({ ...b, groupIndex, indexInGroup })
    })
  })
  return out
}

/**
 * Per-sub-topic completion counts, from a content_id -> progress row map.
 * `required` counts only blocks the student can't skip — that's what
 * decides whether the next sub-topic unlocks, since an optional block
 * left unread shouldn't hold the whole section hostage.
 */
export function groupProgress(group, progressByBlock = {}) {
  const total = group.blocks.length
  const completed = group.blocks.filter((b) => progressByBlock[b.id]?.completed).length
  const requiredOutstanding = group.blocks.filter(
    (b) => (b.require_completion ?? true) && !progressByBlock[b.id]?.completed
  ).length
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    finished: total > 0 && completed === total,
    requiredOutstanding,
  }
}

/**
 * Index of the first sub-topic that still has required work outstanding —
 * i.e. the furthest point the student is allowed to jump to. Everything
 * after it is locked. Returns groups.length when everything is done.
 */
export function unlockedThrough(groups = [], progressByBlock = {}) {
  for (let i = 0; i < groups.length; i += 1) {
    if (groupProgress(groups[i], progressByBlock).requiredOutstanding > 0) return i
  }
  return groups.length
}
