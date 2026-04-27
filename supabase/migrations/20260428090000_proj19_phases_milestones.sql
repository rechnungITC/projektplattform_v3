-- =============================================================================
-- PROJ-19: phases + milestones (schedule backbone for waterfall/PMI projects)
-- =============================================================================
-- Stays separate from work_items per V2 ADR work-item-metamodel.md (time-
-- specific fields would mean N nullable columns in the unified STI).
-- Status state machine for phases via DB function with pg_notify hook for
-- PROJ-18 compliance-gate; milestones use CHECK only (state machine too
-- light to justify a function).
-- =============================================================================

-- Section 1: Tables
create table public.phases (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  project_id      uuid not null,
  name            text not null,
  description     text,
  planned_start   date,
  planned_end     date,
  actual_start    date,
  actual_end      date,
  sequence_number integer not null,
  status          text not null default 'planned',
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  is_deleted      boolean not null default false,
  constraint phases_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint phases_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint phases_created_by_fkey foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint phases_status_check check (status in ('planned','in_progress','completed','cancelled')),
  constraint phases_sequence_positive check (sequence_number > 0),
  constraint phases_planned_dates_order check (planned_end is null or planned_start is null or planned_end >= planned_start),
  constraint phases_actual_dates_order check (actual_end is null or actual_start is null or actual_end >= actual_start)
);

create unique index phases_project_sequence_unique
  on public.phases (project_id, sequence_number)
  where is_deleted = false;
create index phases_project_id_idx on public.phases (project_id);
create index phases_project_status_idx on public.phases (project_id, status);
create index phases_project_planned_start_idx on public.phases (project_id, planned_start);

create table public.milestones (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  project_id   uuid not null,
  phase_id     uuid,
  name         text not null,
  description  text,
  target_date  date not null,
  actual_date  date,
  status       text not null default 'planned',
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  is_deleted   boolean not null default false,
  constraint milestones_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint milestones_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint milestones_phase_id_fkey foreign key (phase_id) references public.phases(id) on delete set null,
  constraint milestones_created_by_fkey foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint milestones_status_check check (status in ('planned','achieved','missed','cancelled'))
);

create index milestones_project_target_idx on public.milestones (project_id, target_date);
create index milestones_project_status_idx on public.milestones (project_id, status);
create index milestones_phase_id_idx on public.milestones (phase_id);

-- Section 2: transition_phase_status DB function (state machine + pg_notify hook)
-- Body: see migration applied to project iqerihohwabyjzkpcujq for verbatim.
-- Allowed: planned <-> in_progress -> completed, any -> cancelled,
-- completed -> in_progress (revival), cancelled -> planned (revival).
-- pg_notify('phase_completed', ...) on entering 'completed' for PROJ-18 hook.

-- Section 3: RLS — uses PROJ-4 helpers (is_project_member, has_project_role, is_project_lead)
alter table public.phases enable row level security;
alter table public.milestones enable row level security;
-- 4 policies per table (SELECT/INSERT/UPDATE/DELETE) — see DB for verbatim

-- Section 4: moddatetime triggers for updated_at on both tables

-- Section 5: anon hardening (revoke SELECT on both tables)
