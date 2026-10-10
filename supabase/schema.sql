-- FacultyLens AI initial schema
-- Run once in Supabase SQL Editor. Storage stays private.

create extension if not exists pgcrypto;

create table if not exists public.lectures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_name text not null,
  faculty_name text not null,
  lecture_date date,
  audio_path text not null,
  audio_filename text not null,
  status text not null default 'uploaded' check (status in ('uploaded','processing','completed','failed')),
  transcript text,
  analysis jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lectures_user_created_idx on public.lectures(user_id, created_at desc);
create index if not exists lectures_course_faculty_idx on public.lectures(user_id, course_name, faculty_name);

alter table public.lectures enable row level security;

drop policy if exists "Users can view their own lectures" on public.lectures;
create policy "Users can view their own lectures" on public.lectures
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert their own lectures" on public.lectures;
create policy "Users can insert their own lectures" on public.lectures
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update their own lectures" on public.lectures;
create policy "Users can update their own lectures" on public.lectures
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own lectures" on public.lectures;
create policy "Users can delete their own lectures" on public.lectures
  for delete to authenticated using (auth.uid() = user_id);

-- Private audio bucket. Files are stored under {auth.uid()}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lecture-audio', 'lecture-audio', false, 524288000,
  array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/webm','audio/ogg','video/mp4','application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = 524288000;

drop policy if exists "Users upload own lecture audio" on storage.objects;
create policy "Users upload own lecture audio" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'lecture-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users read own lecture audio" on storage.objects;
create policy "Users read own lecture audio" on storage.objects
  for select to authenticated using (
    bucket_id = 'lecture-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own lecture audio" on storage.objects;
create policy "Users delete own lecture audio" on storage.objects
  for delete to authenticated using (
    bucket_id = 'lecture-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );
