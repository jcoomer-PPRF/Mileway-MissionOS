-- ============================================================================
-- Mileway — Phase 2 (0006): enum changes
--
-- Enum value changes must be committed before any function/policy/DML uses the
-- new labels, so they live in their own migration (run this before 0007+).
-- ============================================================================

-- Role model: RENAME preserves every existing row's value (and therefore its
-- access) in place — existing 'administrator' rows become 'owner', 'staff' rows
-- become 'contributor'. 'auditor' is unchanged. Then add the two new tiers.
alter type public.user_role rename value 'administrator' to 'owner';
alter type public.user_role rename value 'staff' to 'contributor';
alter type public.user_role add value if not exists 'manager';
alter type public.user_role add value if not exists 'accountant';

-- Trips may now derive distance from GPS (in addition to manual / odometer).
alter type public.distance_source add value if not exists 'gps';
