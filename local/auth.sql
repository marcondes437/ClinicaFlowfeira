alter table auth.users add column if not exists password_hash text;
create table auth.local_sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '12 hours'
);
create index on auth.local_sessions(expires_at);
revoke all on auth.local_sessions from public, anon, authenticated;
revoke all on auth.users from public, anon, authenticated;
