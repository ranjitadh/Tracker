-- ─────────────────────────────────────────────────────────────
-- Time Tracker — Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables.
-- ─────────────────────────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Profiles (linked to auth.users) ─────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'member',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'member'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Workspaces Table ─────────────────────────────────────────

create table if not exists public.workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  logo_url text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  allow_screenshot_deletion boolean not null default true,
  auto_pause_on_idle boolean not null default true,
  require_manual_notes boolean not null default false,
  screenshot_frequency_minutes integer not null default 5,
  created_at timestamptz not null default now()
);

-- ── Workspace Members Table ──────────────────────────────────

create table if not exists public.workspace_members (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

-- Helper functions with SECURITY DEFINER to avoid RLS recursion
create or replace function public.is_workspace_member(ws_id uuid, u_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = u_id
  );
$$;

create or replace function public.is_workspace_owner(ws_id uuid, u_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.workspaces
    where id = ws_id and owner_id = u_id
  );
$$;

-- Workspaces RLS & Policies
alter table public.workspaces enable row level security;

drop policy if exists "Owners can manage workspaces" on public.workspaces;
drop policy if exists "Users can view workspaces they belong to" on public.workspaces;
drop policy if exists "Users can insert workspaces" on public.workspaces;
drop policy if exists "Owners can update workspaces" on public.workspaces;
drop policy if exists "Owners can delete workspaces" on public.workspaces;

create policy "Users can view workspaces they belong to"
  on public.workspaces for select
  using (
    owner_id = auth.uid()
    or public.is_workspace_member(id, auth.uid())
  );

create policy "Users can insert workspaces"
  on public.workspaces for insert
  with check (true);

create policy "Owners can update workspaces"
  on public.workspaces for update
  using (owner_id = auth.uid());

create policy "Owners can delete workspaces"
  on public.workspaces for delete
  using (owner_id = auth.uid());

-- Workspace Members RLS & Policies
alter table public.workspace_members enable row level security;

drop policy if exists "Members can view own membership" on public.workspace_members;
drop policy if exists "Workspace owners can manage members" on public.workspace_members;
drop policy if exists "Users can insert workspace members" on public.workspace_members;
drop policy if exists "Workspace owners can update members" on public.workspace_members;
drop policy if exists "Workspace owners can delete members" on public.workspace_members;

create policy "Members can view own membership"
  on public.workspace_members for select
  using (user_id = auth.uid() or public.is_workspace_owner(workspace_id, auth.uid()));

create policy "Users can insert workspace members"
  on public.workspace_members for insert
  with check (true);

create policy "Workspace owners can update members"
  on public.workspace_members for update
  using (user_id = auth.uid() or public.is_workspace_owner(workspace_id, auth.uid()));

create policy "Workspace owners can delete members"
  on public.workspace_members for delete
  using (user_id = auth.uid() or public.is_workspace_owner(workspace_id, auth.uid()));

-- ── Projects ────────────────────────────────────────────────

create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  client text,
  color text not null default '#4F8CFF',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "Users can view projects in their workspaces" on public.projects;
drop policy if exists "Users can manage projects in their workspaces" on public.projects;
drop policy if exists "Users can insert projects in their workspaces" on public.projects;
drop policy if exists "Users can update projects in their workspaces" on public.projects;
drop policy if exists "Users can delete projects in their workspaces" on public.projects;

create policy "Users can view projects in their workspaces"
  on public.projects for select
  using (
    public.is_workspace_owner(workspace_id, auth.uid())
    or public.is_workspace_member(workspace_id, auth.uid())
  );

create policy "Users can insert projects in their workspaces"
  on public.projects for insert
  with check (true);

create policy "Users can update projects in their workspaces"
  on public.projects for update
  using (
    public.is_workspace_owner(workspace_id, auth.uid())
    or public.is_workspace_member(workspace_id, auth.uid())
  );

create policy "Users can delete projects in their workspaces"
  on public.projects for delete
  using (
    public.is_workspace_owner(workspace_id, auth.uid())
    or public.is_workspace_member(workspace_id, auth.uid())
  );

-- ── Tasks ───────────────────────────────────────────────────

create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

drop policy if exists "Users can view tasks in their projects" on public.tasks;
drop policy if exists "Users can manage tasks in their projects" on public.tasks;
drop policy if exists "Users can insert tasks in their projects" on public.tasks;

create policy "Users can view tasks in their projects"
  on public.tasks for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and (
        public.is_workspace_owner(p.workspace_id, auth.uid())
        or public.is_workspace_member(p.workspace_id, auth.uid())
      )
    )
  );

create policy "Users can insert tasks in their projects"
  on public.tasks for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and (
        public.is_workspace_owner(p.workspace_id, auth.uid())
        or public.is_workspace_member(p.workspace_id, auth.uid())
      )
    )
  );

-- ── Tracking Sessions ───────────────────────────────────────

create table if not exists public.tracking_sessions (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  note text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  paused_at timestamptz,
  status text not null default 'running',
  total_active_seconds integer not null default 0,
  total_idle_seconds integer not null default 0,
  total_paused_seconds integer not null default 0,
  is_manual boolean not null default false,
  is_private boolean not null default false,
  sync_status text not null default 'synced',
  sync_error text
);

alter table public.tracking_sessions enable row level security;

drop policy if exists "Users can view own sessions" on public.tracking_sessions;
drop policy if exists "Users can manage own sessions" on public.tracking_sessions;
drop policy if exists "Users can insert own sessions" on public.tracking_sessions;
drop policy if exists "Users can update own sessions" on public.tracking_sessions;

create policy "Users can view own sessions"
  on public.tracking_sessions for select
  using (user_id = auth.uid());

create policy "Users can insert own sessions"
  on public.tracking_sessions for insert
  with check (user_id = auth.uid());

create policy "Users can update own sessions"
  on public.tracking_sessions for update
  using (user_id = auth.uid());

-- ── Activity Blocks ─────────────────────────────────────────

create table if not exists public.activity_blocks (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.tracking_sessions(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  keyboard_count integer not null default 0,
  mouse_click_count integer not null default 0,
  mouse_activity_score integer not null default 0,
  active_seconds integer not null default 0,
  idle_seconds integer not null default 0,
  activity_percentage integer not null default 0,
  sync_status text not null default 'synced'
);

alter table public.activity_blocks enable row level security;

drop policy if exists "Users can view own blocks" on public.activity_blocks;
drop policy if exists "Users can manage own blocks" on public.activity_blocks;
drop policy if exists "Users can insert own blocks" on public.activity_blocks;

create policy "Users can view own blocks"
  on public.activity_blocks for select
  using (
    session_id in (select id from public.tracking_sessions where user_id = auth.uid())
  );

create policy "Users can insert own blocks"
  on public.activity_blocks for insert
  with check (
    session_id in (select id from public.tracking_sessions where user_id = auth.uid())
  );

-- ── Screenshots ─────────────────────────────────────────────

create table if not exists public.screenshots (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.tracking_sessions(id) on delete cascade,
  captured_at timestamptz not null default now(),
  local_path text,
  encrypted_path text,
  upload_status text not null default 'pending',
  screen_number integer not null default 1,
  redaction_applied boolean not null default false,
  preview_data_url text,
  created_at timestamptz not null default now()
);

alter table public.screenshots enable row level security;

drop policy if exists "Users can view own screenshots" on public.screenshots;
drop policy if exists "Users can manage own screenshots" on public.screenshots;
drop policy if exists "Users can insert own screenshots" on public.screenshots;
drop policy if exists "Users can update own screenshots" on public.screenshots;

create policy "Users can view own screenshots"
  on public.screenshots for select
  using (
    session_id in (select id from public.tracking_sessions where user_id = auth.uid())
  );

create policy "Users can insert own screenshots"
  on public.screenshots for insert
  with check (
    session_id in (select id from public.tracking_sessions where user_id = auth.uid())
  );

create policy "Users can update own screenshots"
  on public.screenshots for update
  using (
    session_id in (select id from public.tracking_sessions where user_id = auth.uid())
  );

-- ── App Usage Summaries ─────────────────────────────────────

create table if not exists public.app_usage_summaries (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.tracking_sessions(id) on delete cascade,
  app_name text not null,
  duration_seconds integer not null default 0,
  sync_status text not null default 'synced'
);

alter table public.app_usage_summaries enable row level security;

drop policy if exists "Users can view own app usage" on public.app_usage_summaries;
drop policy if exists "Users can manage own app usage" on public.app_usage_summaries;
drop policy if exists "Users can insert own app usage" on public.app_usage_summaries;

create policy "Users can view own app usage"
  on public.app_usage_summaries for select
  using (
    session_id in (select id from public.tracking_sessions where user_id = auth.uid())
  );

create policy "Users can insert own app usage"
  on public.app_usage_summaries for insert
  with check (
    session_id in (select id from public.tracking_sessions where user_id = auth.uid())
  );

-- ── Manual Time Entries ─────────────────────────────────────

create table if not exists public.manual_time_entries (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  date date not null,
  hours integer not null default 0,
  minutes integer not null default 0,
  note text,
  is_billable boolean not null default true,
  sync_status text not null default 'synced'
);

alter table public.manual_time_entries enable row level security;

drop policy if exists "Users can view own manual entries" on public.manual_time_entries;
drop policy if exists "Users can manage own manual entries" on public.manual_time_entries;
drop policy if exists "Users can insert own manual entries" on public.manual_time_entries;
drop policy if exists "Users can update own manual entries" on public.manual_time_entries;
drop policy if exists "Users can delete own manual entries" on public.manual_time_entries;

create policy "Users can view own manual entries"
  on public.manual_time_entries for select
  using (user_id = auth.uid());

create policy "Users can insert own manual entries"
  on public.manual_time_entries for insert
  with check (user_id = auth.uid());

create policy "Users can update own manual entries"
  on public.manual_time_entries for update
  using (user_id = auth.uid());

create policy "Users can delete own manual entries"
  on public.manual_time_entries for delete
  using (user_id = auth.uid());

-- ── Settings ────────────────────────────────────────────────

create table if not exists public.settings (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  screen_capture_enabled boolean not null default true,
  screenshot_frequency_minutes integer not null default 5,
  screen_capture_mode text not null default 'primary',
  screenshot_blur boolean not null default false,
  blur_amount integer not null default 18,
  idle_timeout_minutes integer not null default 5,
  auto_pause_on_idle boolean not null default true,
  track_app_usage boolean not null default true,
  excluded_apps jsonb not null default '[]'::jsonb,
  excluded_domains jsonb not null default '[]'::jsonb,
  private_mode boolean not null default false,
  data_retention_days integer not null default 180,
  encryption_enabled boolean not null default true,
  sync_enabled boolean not null default true,
  ask_before_capture_setup boolean not null default true,
  onboarding_complete boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "Users can view own settings" on public.settings;
drop policy if exists "Users can manage own settings" on public.settings;
drop policy if exists "Users can insert own settings" on public.settings;
drop policy if exists "Users can update own settings" on public.settings;

create policy "Users can view own settings"
  on public.settings for select
  using (auth.uid() = id);

create policy "Users can insert own settings"
  on public.settings for insert
  with check (auth.uid() = id);

create policy "Users can update own settings"
  on public.settings for update
  using (auth.uid() = id);

-- ── Audit Events ────────────────────────────────────────────

create table if not exists public.audit_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  timestamp timestamptz not null default now(),
  event_type text not null,
  detail text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;

drop policy if exists "Users can view own audit events" on public.audit_events;
drop policy if exists "Users can insert own audit events" on public.audit_events;

create policy "Users can view own audit events"
  on public.audit_events for select
  using (user_id = auth.uid());

create policy "Users can insert own audit events"
  on public.audit_events for insert
  with check (user_id = auth.uid());

-- ── Indexes ─────────────────────────────────────────────────

create index if not exists idx_sessions_user on public.tracking_sessions(user_id);
create index if not exists idx_sessions_project on public.tracking_sessions(project_id);
create index if not exists idx_sessions_started on public.tracking_sessions(started_at);
create index if not exists idx_sessions_status on public.tracking_sessions(status);
create index if not exists idx_blocks_session on public.activity_blocks(session_id);
create index if not exists idx_blocks_started on public.activity_blocks(started_at);
create index if not exists idx_screenshots_session on public.screenshots(session_id);
create index if not exists idx_screenshots_captured on public.screenshots(captured_at);
create index if not exists idx_manual_user on public.manual_time_entries(user_id);
create index if not exists idx_manual_date on public.manual_time_entries(date);
create index if not exists idx_audit_user on public.audit_events(user_id);
create index if not exists idx_audit_timestamp on public.audit_events(timestamp);
create index if not exists idx_projects_workspace on public.projects(workspace_id);
create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_app_usage_summaries_session on public.app_usage_summaries(session_id);

-- Storage Buckets Configuration for Screenshots (screebshots & screenshots)
insert into storage.buckets (id, name, public)
values ('screebshots', 'screebshots', true), ('screenshots', 'screenshots', true)
on conflict (id) do update set public = true;

-- Storage Objects RLS Policies
drop policy if exists "Public Access screebshots" on storage.objects;
drop policy if exists "Authenticated Upload screebshots" on storage.objects;
drop policy if exists "Authenticated Update screebshots" on storage.objects;

create policy "Public Access screebshots" on storage.objects for select using (bucket_id in ('screebshots', 'screenshots'));
create policy "Authenticated Upload screebshots" on storage.objects for insert with check (bucket_id in ('screebshots', 'screenshots') or auth.role() is not null);
create policy "Authenticated Update screebshots" on storage.objects for update using (bucket_id in ('screebshots', 'screenshots') or auth.role() is not null);
