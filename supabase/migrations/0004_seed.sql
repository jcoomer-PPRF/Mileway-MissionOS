-- ============================================================================
-- Mileway — seed data
-- The two legal entities, default trip & expense categories, and IRS rates.
-- Safe to re-run (idempotent via ON CONFLICT).
-- ============================================================================

-- ---- Entities (update legal_name / ein in the app after first login) -------
insert into public.entities (name, legal_name, entity_type, is_primary, ein) values
  ('Foundation',    'Foundation — set legal name',    'nonprofit_501c3', true,  null),
  ('Operating LLC', 'Operating LLC — set legal name', 'llc',             false, null)
on conflict do nothing;

-- ---- Trip categories (editable; irs_rate_type drives the deduction math) ----
-- NOTE: the rate-type mapping below is a sensible default. Confirm the
-- business/medical/charitable classification of each category with your tax
-- advisor; admins can change it in Settings at any time.
insert into public.trip_categories (name, irs_rate_type, sort_order) values
  ('Business',              'business',   1),
  ('Medical Appointment',   'medical',    2),
  ('Pharmacy',              'medical',    3),
  ('Day Program',           'charitable', 4),
  ('Community Integration', 'charitable', 5),
  ('Administrative',        'business',   6),
  ('Supply Pickup',         'business',   7),
  ('Fundraising',           'charitable', 8),
  ('Board Activity',        'charitable', 9)
on conflict (name) do nothing;

-- ---- Expense categories -----------------------------------------------------
insert into public.expense_categories (key, name, sort_order) values
  ('fuel',        'Fuel',        1),
  ('repairs',     'Repairs',     2),
  ('maintenance', 'Maintenance', 3),
  ('parking',     'Parking',     4),
  ('tolls',       'Tolls',       5),
  ('supplies',    'Supplies',    6)
on conflict (key) do nothing;

-- ---- IRS standard mileage rates (USD per mile) ------------------------------
-- IMPORTANT: charitable is statutory (14¢). Business/medical rates change
-- annually — the 2026 rows are placeholders (copied from 2025). Verify against
-- current IRS guidance and edit in Settings before relying on the estimate.
insert into public.mileage_rates (rate_type, rate_per_mile, effective_date) values
  ('business',   0.670, '2024-01-01'),
  ('medical',    0.210, '2024-01-01'),
  ('charitable', 0.140, '2024-01-01'),
  ('business',   0.700, '2025-01-01'),
  ('medical',    0.210, '2025-01-01'),
  ('charitable', 0.140, '2025-01-01'),
  ('business',   0.700, '2026-01-01'),  -- placeholder: confirm 2026 rate
  ('medical',    0.210, '2026-01-01'),  -- placeholder: confirm 2026 rate
  ('charitable', 0.140, '2026-01-01')
on conflict (rate_type, effective_date) do nothing;
