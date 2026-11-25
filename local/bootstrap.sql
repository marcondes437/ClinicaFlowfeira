-- ============================================================
-- Compatibilidade de identidade para as migrations no banco local
-- PostgreSQL local. Login e sessões são implementados pela aplicação.
--
-- Cria os papéis anon/authenticated/service_role, o schema auth com
-- auth.users, auth.uid() e auth.jwt() lendo request.jwt.claims,
-- exatamente como o PostgREST faz.
-- ============================================================
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema auth, extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt()->>'sub', '')::uuid
$$;

grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

-- Privilégios padrão parecidos com os do Supabase para objetos novos em public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
