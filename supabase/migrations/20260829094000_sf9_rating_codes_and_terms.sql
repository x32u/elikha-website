-- DepEd SF9 alignment for kindergarten rubric observations.
--
-- The school's SF9 Kindergarten Progress Report rates each competency as
-- BG (Beginning), DV (Developing), or CO (Consistent) per term (T1/T2/T3).
-- e-Likha previously stored the same three levels as single letters B/D/C with
-- no term dimension, so its observations could not feed the report card the
-- school actually files.
--
-- This migration is additive and backwards compatible:
--   * the rating constraint accepts BOTH the legacy letters and the SF9 codes,
--     so any client build (old or new) keeps working during rollout;
--   * new writes are normalized to the SF9 codes so stored data is uniform;
--   * existing rows are renamed to their SF9 equivalent (B -> BG, D -> DV,
--     C -> CO). This is a label change only: the descriptor snapshots stored
--     alongside each row are untouched, so no assessment changes meaning;
--   * frozen rubric snapshots in public.activity_rubrics are NOT rewritten.
--     They are the historical grading basis and must stay exactly as the
--     teacher saw them. finalize_submission_review is updated to read either
--     code form out of a snapshot, which is what makes that safe.

-- 1. Accept both code sets on criterion observations.
alter table public.rubric_criterion_observations
  drop constraint if exists rubric_criterion_observations_selected_rating_check;

alter table public.rubric_criterion_observations
  add constraint rubric_criterion_observations_selected_rating_check
  check (selected_rating in ('BG', 'DV', 'CO', 'B', 'D', 'C', 'NO', 'NA'));

-- 2. Normalize the rows written before the SF9 codes existed.
update public.rubric_criterion_observations
set selected_rating = case selected_rating
      when 'B' then 'BG'
      when 'D' then 'DV'
      when 'C' then 'CO'
      else selected_rating
    end
where selected_rating in ('B', 'D', 'C');

-- 3. Record which SF9 term an observation belongs to.
--    Nullable: observations recorded before this migration predate term
--    tracking and must not be guessed at from their date.
alter table public.rubric_observations
  add column if not exists term smallint;

alter table public.rubric_observations
  drop constraint if exists rubric_observations_term_check;

alter table public.rubric_observations
  add constraint rubric_observations_term_check
  check (term is null or term in (1, 2, 3));

comment on column public.rubric_observations.term is
  'DepEd SF9 term (1, 2, or 3) this observation counts toward. Null for observations recorded before term tracking.';

create index if not exists rubric_observations_learner_term_idx
  on public.rubric_observations(learner_id, term, observation_date desc);
