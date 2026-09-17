-- ==========================================================
-- One-time backfill: assign sequence_order to existing modules
-- ==========================================================
-- The Add Module form previously had no field for sequence_order, so
-- every module ever submitted was inserted with the column's default
-- of 0. That's why students saw modules in an arbitrary order: they
-- were all tied on the value the app was supposed to sort by.
--
-- This gives each teacher's modules a sequence based on the order
-- they were originally created in (oldest = Preliminaries = 0, next
-- = 1, ...) as a reasonable starting point. Run once, then have
-- teachers double check / adjust from the Add Module page, since
-- created_at reflects upload order, not necessarily the intended
-- curriculum order.
-- ==========================================================

with ranked as (
  select
    id,
    row_number() over (partition by teacher_id order by created_at asc) - 1 as new_order
  from modules
  where sequence_order = 0
)
update modules
set sequence_order = ranked.new_order
from ranked
where modules.id = ranked.id;
