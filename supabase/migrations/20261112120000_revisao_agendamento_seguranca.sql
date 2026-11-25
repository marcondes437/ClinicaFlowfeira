-- ============================================================
-- ClinicaFlow — revisão de agendamento, agenda médica e segurança
-- (novembro/2026)
--
-- Segura para rodar sobre todas as migrations anteriores e sobre o
-- banco atual do Supabase (que tem colunas e tabelas a mais).
-- Não apaga dados.
--
--  1. Funções auxiliares (CPF, cargos, auditoria)
--  2. Agenda médica: duração, fim do horário, sem sobreposição
--  3. Bloqueios, férias, afastamentos e intervalos
--  4. Consultas: sem duplicidade, escrita só por funções
--  5. RLS revisada (médico só vê os próprios pacientes; LGPD)
--  6. Agendamento por especialidade (concorrência, remarcação)
--  7. Cancelamento e mudança de status com permissões
--  8. Gestão da agenda (liberar, remover, bloquear, listar)
--  9. Indicadores e vínculo de acesso do médico
-- 10. Tarefas internas (integração opcional com o Trello)
-- 11. RPCs públicas e permissões
-- ============================================================

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ------------------------------------------------------------
-- 1. FUNÇÕES AUXILIARES
-- ------------------------------------------------------------

-- CPF com dígitos verificadores (mesma regra de src/lib/validacao.ts).
create or replace function private.cpf_valido(_cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  soma int;
  resto int;
  i int;
begin
  if length(d) <> 11 or d = repeat(substr(d, 1, 1), 11) then
    return false;
  end if;

  soma := 0;
  for i in 1..9 loop
    soma := soma + substr(d, i, 1)::int * (11 - i);
  end loop;
  resto := (soma * 10) % 11;
  if resto = 10 then resto := 0; end if;
  if resto <> substr(d, 10, 1)::int then
    return false;
  end if;

  soma := 0;
  for i in 1..10 loop
    soma := soma + substr(d, i, 1)::int * (12 - i);
  end loop;
  resto := (soma * 10) % 11;
  if resto = 10 then resto := 0; end if;
  return resto = substr(d, 11, 1)::int;
end;
$$;

-- Cargos. Ficam no schema private (não viram RPC pública).
create or replace function private.tem_cargo(_user_id uuid, _cargos text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = _user_id and r.role::text = any(_cargos)
  )
$$;

-- Admin, gestão, recepção e enfermagem: visão operacional de toda a clínica.
create or replace function private.is_equipe_operacional(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tem_cargo(_user_id, array['admin', 'gestor', 'recepcionista', 'enfermeiro'])
$$;

-- Quem pode marcar consulta em nome de outro paciente.
create or replace function private.pode_agendar_por_outro(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tem_cargo(_user_id, array['admin', 'gestor', 'recepcionista'])
$$;

-- O médico logado atende (ou atendeu) este paciente?
create or replace function private.medico_atende_paciente(_user_id uuid, _paciente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _user_id is not null and exists (
    select 1
    from public.consultas c
    join public.profissionais p on p.id = c.profissional_id
    where c.paciente_id = _paciente_id
      and p.user_id = _user_id
  )
$$;

-- CPF/endereço (LGPD): o próprio paciente, recepção, enfermagem e o médico que o atende.
create or replace function private.pode_ver_dados_sensiveis(_user_id uuid, _paciente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tem_cargo(_user_id, array['recepcionista', 'enfermeiro'])
      or private.medico_atende_paciente(_user_id, _paciente_id)
$$;

-- O usuário pode alterar a agenda deste profissional? (admin/gestor ou o próprio)
create or replace function private.pode_gerir_agenda(_profissional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.is_admin_gestor(auth.uid())
    or exists (
      select 1 from public.profissionais p
      where p.id = _profissional_id and p.user_id = auth.uid()
    )
  )
$$;

-- Trilha de auditoria (sem CPF nem dados clínicos nos detalhes).
create table if not exists public.audit_logs (
  id bigserial primary key,
  user_id uuid,
  acao text not null,
  entidade text not null,
  registro_id text,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
drop policy if exists "staff_all" on public.audit_logs;
drop policy if exists "audit_logs_select_gestao" on public.audit_logs;
create policy "audit_logs_select_gestao" on public.audit_logs
  for select to authenticated
  using (public.is_admin_gestor((select auth.uid())));
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

create or replace function private.auditar(_acao text, _entidade text, _registro_id text, _detalhes jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (user_id, acao, entidade, registro_id, detalhes)
  values (auth.uid(), _acao, _entidade, _registro_id, coalesce(_detalhes, '{}'::jsonb))
$$;

-- ------------------------------------------------------------
-- 2. AGENDA MÉDICA: DURAÇÃO E SEM SOBREPOSIÇÃO
-- ------------------------------------------------------------
alter table public.agenda_medica add column if not exists duracao_minutos integer not null default 30;
alter table public.agenda_medica add column if not exists data_fim timestamptz;

update public.agenda_medica
set data_fim = data_hora + make_interval(mins => duracao_minutos)
where data_fim is null;

alter table public.agenda_medica alter column data_fim set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_medica_duracao_valida') then
    alter table public.agenda_medica
      add constraint agenda_medica_duracao_valida check (duracao_minutos between 5 and 240);
  end if;
end
$$;

create or replace function private.agenda_calcular_fim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.data_fim := new.data_hora + make_interval(mins => new.duracao_minutos);
  return new;
end;
$$;

drop trigger if exists trg_agenda_calcular_fim on public.agenda_medica;
create trigger trg_agenda_calcular_fim
before insert or update of data_hora, duracao_minutos on public.agenda_medica
for each row execute function private.agenda_calcular_fim();

-- Um profissional não pode ter dois horários que se sobrepõem (em nenhuma unidade).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_medica_sem_sobreposicao') then
    alter table public.agenda_medica
      add constraint agenda_medica_sem_sobreposicao
      exclude using gist (profissional_id with =, tstzrange(data_hora, data_fim) with &&);
  end if;
exception when exclusion_violation then
  raise warning 'Há horários sobrepostos na agenda_medica; a restrição de sobreposição não foi criada. Corrija e rode de novo.';
end
$$;

-- O navegador do paciente não lê mais a agenda (usa resumo_vagas/previsualizar_vaga).
drop policy if exists "agenda_select_safe" on public.agenda_medica;
drop policy if exists "agenda_select_equipe" on public.agenda_medica;
create policy "agenda_select_equipe" on public.agenda_medica
  for select to authenticated
  using (public.is_staff((select auth.uid())));

-- Escrita na agenda só pelas funções (liberar/remover/bloquear), que validam tudo.
drop policy if exists "agenda_insert_staff" on public.agenda_medica;
drop policy if exists "agenda_update_staff" on public.agenda_medica;
drop policy if exists "agenda_delete_staff" on public.agenda_medica;
revoke insert, update, delete on public.agenda_medica from anon, authenticated;

-- ------------------------------------------------------------
-- 3. BLOQUEIOS, FÉRIAS, AFASTAMENTOS E INTERVALOS
-- ------------------------------------------------------------
create table if not exists public.agenda_bloqueios (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profissionais(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  tipo text not null default 'bloqueio'
    check (tipo in ('bloqueio', 'ferias', 'afastamento', 'intervalo')),
  motivo text check (motivo is null or char_length(motivo) <= 200),
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists idx_agenda_bloqueios_periodo
  on public.agenda_bloqueios using gist (profissional_id, tstzrange(inicio, fim));

alter table public.agenda_bloqueios enable row level security;
revoke all on public.agenda_bloqueios from anon, authenticated;
grant select on public.agenda_bloqueios to authenticated;
grant all on public.agenda_bloqueios to service_role;

drop policy if exists "bloqueios_select_equipe" on public.agenda_bloqueios;
create policy "bloqueios_select_equipe" on public.agenda_bloqueios
  for select to authenticated
  using (public.is_staff((select auth.uid())));

-- ------------------------------------------------------------
-- 4. CONSULTAS: SEM DUPLICIDADE E ESCRITA SÓ POR FUNÇÕES
-- ------------------------------------------------------------
do $$
begin
  create unique index if not exists consultas_profissional_horario_unico
    on public.consultas (profissional_id, data_hora)
    where profissional_id is not null and status in ('agendada', 'confirmada', 'em_atendimento');
exception when unique_violation then
  raise warning 'Há consultas ativas duplicadas para o mesmo profissional e horário; índice não criado.';
end
$$;

do $$
begin
  create unique index if not exists consultas_paciente_horario_unico
    on public.consultas (paciente_id, data_hora)
    where status in ('agendada', 'confirmada', 'em_atendimento');
exception when unique_violation then
  raise warning 'Há consultas ativas duplicadas para o mesmo paciente e horário; índice não criado.';
end
$$;

create index if not exists idx_consultas_especialidade on public.consultas (especialidade_id, data_hora);

-- Inserir e mudar status/médico/horário: só pelas funções. A equipe ainda edita observações e valor.
revoke insert, update on public.consultas from anon, authenticated;
grant update (observacoes, valor) on public.consultas to authenticated;
drop policy if exists "consultas_insert" on public.consultas;

-- Um registro de paciente por usuário.
do $$
begin
  create unique index if not exists pacientes_user_id_unico
    on public.pacientes (user_id) where user_id is not null;
exception when unique_violation then
  raise warning 'Há usuários com mais de um registro de paciente; índice não criado.';
end
$$;

-- ------------------------------------------------------------
-- 5. RLS REVISADA
-- ------------------------------------------------------------

-- consultas: equipe operacional vê tudo; médico só as dele; paciente só as próprias.
drop policy if exists "consultas_select" on public.consultas;
create policy "consultas_select" on public.consultas
  for select to authenticated
  using (
    private.is_equipe_operacional((select auth.uid()))
    or exists (
      select 1 from public.profissionais p
      where p.id = consultas.profissional_id and p.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.pacientes p
      where p.id = consultas.paciente_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "consultas_update" on public.consultas;
create policy "consultas_update" on public.consultas
  for update to authenticated
  using (
    private.is_equipe_operacional((select auth.uid()))
    or exists (
      select 1 from public.profissionais p
      where p.id = consultas.profissional_id and p.user_id = (select auth.uid())
    )
  )
  with check (
    private.is_equipe_operacional((select auth.uid()))
    or exists (
      select 1 from public.profissionais p
      where p.id = consultas.profissional_id and p.user_id = (select auth.uid())
    )
  );

-- pacientes: remove políticas duplicadas/antigas e o cadastro anônimo (não usado pelo app).
drop policy if exists "pacientes_public_request" on public.pacientes;
drop policy if exists "paciente_proprio_insert_fix" on public.pacientes;
drop policy if exists "paciente_proprio_select_fix" on public.pacientes;
drop policy if exists "paciente_proprio_update_fix" on public.pacientes;
drop policy if exists "pacientes_select" on public.pacientes;
drop policy if exists "pacientes_insert" on public.pacientes;
drop policy if exists "pacientes_update" on public.pacientes;
revoke insert on public.pacientes from anon;

create policy "pacientes_select" on public.pacientes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_equipe_operacional((select auth.uid()))
    or private.medico_atende_paciente((select auth.uid()), id)
  );

create policy "pacientes_insert" on public.pacientes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or private.is_equipe_operacional((select auth.uid()))
  );

create policy "pacientes_update" on public.pacientes
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_equipe_operacional((select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    or private.is_equipe_operacional((select auth.uid()))
  );

-- O paciente edita os próprios dados, mas não muda vínculo, situação, observações da equipe
-- nem a marcação de cadastro completo. CPF (se existir a coluna antiga) precisa ser válido.
create or replace function private.proteger_paciente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_cpf text := nullif(regexp_replace(coalesce(to_jsonb(new)->>'cpf', ''), '\D', '', 'g'), '');
begin
  if v_cpf is not null
     and v_cpf is distinct from nullif(regexp_replace(coalesce(to_jsonb(old)->>'cpf', ''), '\D', '', 'g'), '')
     and not private.cpf_valido(v_cpf) then
    raise exception 'CPF inválido.';
  end if;

  -- Sem usuário (SQL Editor, service_role, migrations) ou equipe: sem restrição extra.
  if v_usuario is null or public.is_staff(v_usuario) then
    return new;
  end if;

  new.user_id := old.user_id;
  new.status := old.status;
  new.observacoes := old.observacoes;
  new.cadastro_completo_em := old.cadastro_completo_em;
  return new;
end;
$$;

-- Cadastro completo = celular + nascimento + CPF válido salvo.
-- (Antes bastavam celular e nascimento, e o paciente conseguia "completar" sem CPF.)
create or replace function private.marcar_cadastro_completo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cpf text;
begin
  if new.cadastro_completo_em is null
     and new.data_nascimento is not null
     and coalesce(new.celular, new.telefone) is not null then
    select s.cpf into v_cpf from public.pacientes_dados_sensiveis s where s.paciente_id = new.id;
    v_cpf := coalesce(v_cpf, to_jsonb(new)->>'cpf');
    if private.cpf_valido(v_cpf) then
      new.cadastro_completo_em := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pacientes_a_proteger on public.pacientes;
create trigger trg_pacientes_a_proteger
before update on public.pacientes
for each row execute function private.proteger_paciente();

-- pacientes_dados_sensiveis (LGPD): recria as políticas sem duplicidades.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pacientes_dados_sensiveis'
  loop
    execute format('drop policy %I on public.pacientes_dados_sensiveis', pol.policyname);
  end loop;
end
$$;

create policy "dados_sensiveis_select" on public.pacientes_dados_sensiveis
  for select to authenticated
  using (
    exists (
      select 1 from public.pacientes p
      where p.id = pacientes_dados_sensiveis.paciente_id and p.user_id = (select auth.uid())
    )
    or private.pode_ver_dados_sensiveis((select auth.uid()), paciente_id)
  );

create policy "dados_sensiveis_insert" on public.pacientes_dados_sensiveis
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pacientes p
      where p.id = pacientes_dados_sensiveis.paciente_id and p.user_id = (select auth.uid())
    )
    or private.pode_ver_dados_sensiveis((select auth.uid()), paciente_id)
  );

create policy "dados_sensiveis_update" on public.pacientes_dados_sensiveis
  for update to authenticated
  using (
    exists (
      select 1 from public.pacientes p
      where p.id = pacientes_dados_sensiveis.paciente_id and p.user_id = (select auth.uid())
    )
    or private.pode_ver_dados_sensiveis((select auth.uid()), paciente_id)
  )
  with check (
    exists (
      select 1 from public.pacientes p
      where p.id = pacientes_dados_sensiveis.paciente_id and p.user_id = (select auth.uid())
    )
    or private.pode_ver_dados_sensiveis((select auth.uid()), paciente_id)
  );

revoke delete on public.pacientes_dados_sensiveis from authenticated;

-- CPF sempre só com dígitos e válido, venha de onde vier.
create or replace function private.validar_dados_sensiveis()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cpf := nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '');
  if new.cpf is not null and not private.cpf_valido(new.cpf) then
    raise exception 'CPF inválido.';
  end if;
  new.cep := nullif(regexp_replace(coalesce(new.cep, ''), '\D', '', 'g'), '');
  if new.cep is not null and length(new.cep) <> 8 then
    raise exception 'CEP inválido.';
  end if;
  new.estado := nullif(upper(trim(coalesce(new.estado, ''))), '');
  return new;
end;
$$;

drop trigger if exists trg_dados_sensiveis_validar on public.pacientes_dados_sensiveis;
create trigger trg_dados_sensiveis_validar
before insert or update of cpf, cep, estado on public.pacientes_dados_sensiveis
for each row execute function private.validar_dados_sensiveis();

-- evolucoes (prontuário): só o paciente, a enfermagem e o médico que atende.
drop policy if exists "evolucoes_select" on public.evolucoes;
create policy "evolucoes_select" on public.evolucoes
  for select to authenticated
  using (
    exists (
      select 1 from public.pacientes p
      where p.id = evolucoes.paciente_id and p.user_id = (select auth.uid())
    )
    or private.tem_cargo((select auth.uid()), array['enfermeiro'])
    or private.medico_atende_paciente((select auth.uid()), paciente_id)
  );

drop policy if exists "evolucoes_write" on public.evolucoes;
create policy "evolucoes_write" on public.evolucoes
  for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and (
      private.tem_cargo((select auth.uid()), array['enfermeiro'])
      or private.medico_atende_paciente((select auth.uid()), paciente_id)
    )
  );

-- profiles: cada um vê o seu; gestão e recepção veem a equipe.
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.tem_cargo((select auth.uid()), array['admin', 'gestor', 'recepcionista'])
  );

-- profissionais: o público vê só o necessário (nunca CPF, telefone ou e-mail pessoais).
revoke select on public.profissionais from anon, authenticated;
grant select (id, nome, registro_profissional, especialidade_id, unidade_id, descricao, foto_url, status)
  on public.profissionais to anon;
grant select (id, user_id, nome, registro_profissional, especialidade_id, unidade_id, telefone, email,
              descricao, foto_url, status, created_at)
  on public.profissionais to authenticated;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profissionais' and column_name = 'horario_trabalho') then
    execute 'grant select (horario_trabalho) on public.profissionais to authenticated';
  end if;
end
$$;

-- O fluxo antigo deixava o paciente escolher o horário exato. Fica só para uso interno.
do $$
begin
  if to_regprocedure('public.agendar_consulta_automaticamente(uuid, uuid, uuid, timestamptz, text)') is not null then
    execute 'revoke execute on function public.agendar_consulta_automaticamente(uuid, uuid, uuid, timestamptz, text) from public, anon, authenticated';
  end if;
  if to_regprocedure('private.agendar_consulta_automaticamente(uuid, uuid, uuid, timestamptz, text)') is not null then
    execute 'revoke execute on function private.agendar_consulta_automaticamente(uuid, uuid, uuid, timestamptz, text) from public, anon, authenticated';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 6. AGENDAMENTO POR ESPECIALIDADE
-- ------------------------------------------------------------

-- Horários que podem ser atribuídos, já na ordem de escolha:
-- primeiro horário; em empate, o médico com menos consultas no dia.
create or replace function private.vagas_candidatas(
  _especialidade_id uuid,
  _unidade_id uuid,
  _periodo text,
  _inicio timestamptz,
  _paciente_id uuid,
  _ignorar_consulta uuid
)
returns table (
  agenda_id uuid,
  especialidade_id uuid,
  unidade_id uuid,
  data_hora timestamptz,
  ordem bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.especialidade_id,
    a.unidade_id,
    a.data_hora,
    row_number() over (order by a.data_hora, carga.total, p.nome, a.id)
  from public.agenda_medica a
  join public.profissionais p on p.id = a.profissional_id
  join public.unidades u on u.id = a.unidade_id
  join public.especialidades e on e.id = a.especialidade_id
  cross join lateral (
    select count(*) as total
    from public.agenda_medica x
    where x.profissional_id = a.profissional_id
      and x.status = 'reservado'
      and (x.data_hora at time zone 'America/Sao_Paulo')::date
          = (a.data_hora at time zone 'America/Sao_Paulo')::date
  ) carga
  where (_especialidade_id is null or a.especialidade_id = _especialidade_id)
    and a.status = 'disponivel'
    and a.consulta_id is null
    and a.data_hora >= _inicio
    and (_unidade_id is null or a.unidade_id = _unidade_id)
    and p.status = 'ativo'
    and p.especialidade_id = a.especialidade_id
    and p.unidade_id = a.unidade_id
    and u.status = 'ativo'
    and e.status = 'ativo'
    and (
      _periodo is null
      or (_periodo = 'manha' and extract(hour from a.data_hora at time zone 'America/Sao_Paulo') < 12)
      or (_periodo = 'tarde' and extract(hour from a.data_hora at time zone 'America/Sao_Paulo') between 12 and 17)
      or (_periodo = 'noite' and extract(hour from a.data_hora at time zone 'America/Sao_Paulo') >= 18)
    )
    -- férias, afastamentos, bloqueios e intervalos
    and not exists (
      select 1 from public.agenda_bloqueios b
      where b.profissional_id = a.profissional_id
        and b.inicio < a.data_fim
        and b.fim > a.data_hora
    )
    -- defesa extra: o médico não tem outra consulta valendo nesse horário
    and not exists (
      select 1 from public.consultas c
      where c.profissional_id = a.profissional_id
        and c.data_hora = a.data_hora
        and c.status in ('agendada', 'confirmada', 'em_atendimento')
    )
    -- o paciente não fica com duas consultas que se sobrepõem
    and (
      _paciente_id is null
      or not exists (
        select 1
        from public.consultas c
        left join public.agenda_medica x on x.consulta_id = c.id
        where c.paciente_id = _paciente_id
          and c.status in ('agendada', 'confirmada', 'em_atendimento')
          and c.id is distinct from _ignorar_consulta
          and c.data_hora < a.data_fim
          and coalesce(x.data_fim, c.data_hora + interval '30 minutes') > a.data_hora
      )
    )
$$;

-- Descobre o paciente de quem está agendando e valida o acesso.
create or replace function private.resolver_paciente(_paciente_id uuid, _exigir_cadastro boolean default true)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_paciente record;
  v_cpf text;
begin
  if v_usuario is null then
    raise exception 'Faça login para agendar uma consulta.';
  end if;

  if _paciente_id is not null and private.pode_agendar_por_outro(v_usuario) then
    select p.id, p.status into v_paciente from public.pacientes p where p.id = _paciente_id;
    if not found or v_paciente.status <> 'ativo' then
      raise exception 'Paciente inválido ou inativo.';
    end if;
    return v_paciente.id;
  end if;

  select p.id, p.status, p.cadastro_completo_em, p.data_nascimento,
         coalesce(p.celular, p.telefone) as contato,
         to_jsonb(p)->>'cpf' as cpf_antigo
    into v_paciente
  from public.pacientes p
  where p.user_id = v_usuario
  limit 1;

  if not found or (_paciente_id is not null and _paciente_id <> v_paciente.id) then
    raise exception 'Paciente inválido para este usuário.';
  end if;
  if v_paciente.status <> 'ativo' then
    raise exception 'Seu cadastro está inativo. Fale com a recepção.';
  end if;

  if _exigir_cadastro then
    select s.cpf into v_cpf from public.pacientes_dados_sensiveis s where s.paciente_id = v_paciente.id;
    v_cpf := coalesce(v_cpf, v_paciente.cpf_antigo);
    if v_paciente.cadastro_completo_em is null
       or v_paciente.data_nascimento is null
       or v_paciente.contato is null
       or not private.cpf_valido(v_cpf) then
      raise exception 'Complete seus dados (celular, nascimento e CPF) antes de agendar.'
        using hint = 'cadastro_incompleto';
    end if;
  end if;

  return v_paciente.id;
end;
$$;

-- Prévia do primeiro horário que o sistema atribuiria (sem revelar o médico).
create or replace function private.previsualizar_vaga(
  _especialidade_id uuid,
  _unidade_id uuid default null,
  _periodo text default null,
  _a_partir_de date default null,
  _paciente_id uuid default null,
  _remarcar_consulta_id uuid default null
)
returns table (data_hora timestamptz, unidade_id uuid, unidade_nome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_paciente uuid;
  v_inicio timestamptz;
begin
  if _periodo is not null and _periodo not in ('manha', 'tarde', 'noite') then
    raise exception 'Período inválido.';
  end if;

  v_paciente := private.resolver_paciente(_paciente_id, false);
  v_inicio := greatest(
    now() + interval '1 hour',
    coalesce(_a_partir_de::timestamp at time zone 'America/Sao_Paulo', now())
  );

  return query
  select v.data_hora, v.unidade_id, u.nome
  from private.vagas_candidatas(_especialidade_id, _unidade_id, _periodo, v_inicio, v_paciente, _remarcar_consulta_id) v
  join public.unidades u on u.id = v.unidade_id
  order by v.ordem
  limit 1;
end;
$$;

-- Resumo para a tela: vagas por especialidade e unidade (sem médico, sem horário a escolher).
create or replace function private.resumo_vagas()
returns table (especialidade_id uuid, unidade_id uuid, total bigint, primeira timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.especialidade_id, v.unidade_id, count(*), min(v.data_hora)
  from private.vagas_candidatas(null, null, null, now() + interval '1 hour', null, null) v
  where auth.uid() is not null
  group by v.especialidade_id, v.unidade_id
$$;

create or replace function private.agendar_por_especialidade(
  _especialidade_id uuid,
  _unidade_id uuid default null,
  _periodo text default null,
  _a_partir_de date default null,
  _motivo text default null,
  _paciente_id uuid default null,
  _remarcar_consulta_id uuid default null
)
returns table (
  id_consulta uuid,
  data_hora timestamptz,
  nome_profissional text,
  nome_especialidade text,
  nome_unidade text,
  endereco_unidade text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_paciente uuid;
  v_especialidade text;
  v_inicio timestamptz;
  v_agenda record;
  v_consulta uuid;
  v_existente timestamptz;
  v_antiga record;
  v_motivo text := nullif(trim(coalesce(_motivo, '')), '');
begin
  v_paciente := private.resolver_paciente(_paciente_id, true);

  select e.nome into v_especialidade
  from public.especialidades e
  where e.id = _especialidade_id and e.status = 'ativo';
  if v_especialidade is null then
    raise exception 'Especialidade indisponível.';
  end if;

  if _periodo is not null and _periodo not in ('manha', 'tarde', 'noite') then
    raise exception 'Período inválido.';
  end if;
  if _a_partir_de is not null and _a_partir_de > current_date + 365 then
    raise exception 'Escolha uma data dentro dos próximos 12 meses.';
  end if;
  if v_motivo is not null and char_length(v_motivo) > 200 then
    raise exception 'O motivo deve ter até 200 caracteres.';
  end if;

  -- Serializa os agendamentos do MESMO paciente (duplo clique, duas abas...).
  -- Pacientes diferentes continuam em paralelo.
  perform pg_advisory_xact_lock(hashtextextended('clinicaflow:agendamento:' || v_paciente::text, 0));

  if _remarcar_consulta_id is not null then
    select c.id, c.especialidade_id, c.data_hora into v_antiga
    from public.consultas c
    where c.id = _remarcar_consulta_id
      and c.paciente_id = v_paciente
      and c.status in ('agendada', 'confirmada')
      and c.data_hora > now()
    for update;

    if not found then
      raise exception 'Consulta para remarcar não encontrada.';
    end if;
    if v_antiga.especialidade_id is distinct from _especialidade_id then
      raise exception 'A remarcação precisa ser na mesma especialidade.';
    end if;
  end if;

  -- Uma consulta futura por especialidade (para trocar, use "remarcar").
  select c.data_hora into v_existente
  from public.consultas c
  where c.paciente_id = v_paciente
    and c.especialidade_id = _especialidade_id
    and c.status in ('agendada', 'confirmada')
    and c.data_hora > now()
    and c.id is distinct from _remarcar_consulta_id
  order by c.data_hora
  limit 1;

  if v_existente is not null then
    raise exception 'Já existe uma consulta de % marcada para %. Remarque ou cancele a atual.',
      v_especialidade,
      to_char(v_existente at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
      using hint = 'ja_agendada';
  end if;

  -- Antecedência mínima de 1 hora.
  v_inicio := greatest(
    now() + interval '1 hour',
    coalesce(_a_partir_de::timestamp at time zone 'America/Sao_Paulo', now())
  );

  -- Primeiro horário livre. SKIP LOCKED: duas pessoas nunca recebem a mesma vaga;
  -- quem chega em segundo recebe o próximo horário livre.
  select a.id, a.profissional_id, a.unidade_id, a.data_hora,
         p.nome as profissional_nome, u.nome as unidade_nome,
         nullif(concat_ws(', ', u.endereco, u.cidade), '') as unidade_endereco
    into v_agenda
  from private.vagas_candidatas(_especialidade_id, _unidade_id, _periodo, v_inicio, v_paciente, _remarcar_consulta_id) v
  join public.agenda_medica a on a.id = v.agenda_id
  join public.profissionais p on p.id = a.profissional_id
  join public.unidades u on u.id = a.unidade_id
  where a.status = 'disponivel'
    and a.consulta_id is null
  order by v.ordem
  limit 1
  for update of a skip locked;

  if not found then
    raise exception 'Não há horários livres de % com essas preferências. Tente outra unidade, outro período ou outra data.',
      v_especialidade
      using hint = 'sem_vagas';
  end if;

  begin
    insert into public.consultas (
      paciente_id, profissional_id, especialidade_id, unidade_id,
      data_hora, motivo, created_by
    ) values (
      v_paciente, v_agenda.profissional_id, _especialidade_id, v_agenda.unidade_id,
      v_agenda.data_hora, v_motivo, v_usuario
    )
    returning id into v_consulta;
  exception when unique_violation then
    raise exception 'Esse horário acabou de ser ocupado. Tente novamente.' using hint = 'concorrencia';
  end;

  update public.agenda_medica
  set status = 'reservado', consulta_id = v_consulta
  where id = v_agenda.id;

  -- Remarcação: a antiga só é cancelada depois que a nova vaga está garantida.
  -- Se algo falhar acima, a transação inteira volta e a consulta original fica intacta.
  if _remarcar_consulta_id is not null then
    update public.consultas
    set status = 'cancelada',
        observacoes = concat_ws(' · ', nullif(observacoes, ''),
          'Remarcada em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'))
    where id = _remarcar_consulta_id;
  end if;

  perform private.auditar(
    case when _remarcar_consulta_id is null then 'agendar' else 'remarcar' end,
    'consultas',
    v_consulta::text,
    jsonb_build_object('consulta_anterior', _remarcar_consulta_id, 'especialidade_id', _especialidade_id)
  );

  return query
  select v_consulta, v_agenda.data_hora, v_agenda.profissional_nome,
         v_especialidade, v_agenda.unidade_nome, v_agenda.unidade_endereco;
end;
$$;

-- ------------------------------------------------------------
-- 7. CANCELAMENTO E STATUS
-- ------------------------------------------------------------
create or replace function private.pode_alterar_consulta(_consulta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    private.is_equipe_operacional(auth.uid())
    or exists (
      select 1
      from public.consultas c
      join public.profissionais p on p.id = c.profissional_id
      where c.id = _consulta_id and p.user_id = auth.uid()
    )
  )
$$;

create or replace function private.cancelar_consulta(_consulta_id uuid, _motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_consulta record;
  v_motivo text := nullif(trim(coalesce(_motivo, '')), '');
begin
  if v_usuario is null then
    raise exception 'Faça login para cancelar a consulta.';
  end if;
  if v_motivo is not null and char_length(v_motivo) > 200 then
    raise exception 'O motivo deve ter até 200 caracteres.';
  end if;

  select c.id, c.status, c.data_hora, pa.user_id as paciente_user
    into v_consulta
  from public.consultas c
  join public.pacientes pa on pa.id = c.paciente_id
  where c.id = _consulta_id
  for update of c;

  if not found then
    raise exception 'Consulta não encontrada.';
  end if;

  if not (
    private.pode_alterar_consulta(_consulta_id)
    or (v_consulta.paciente_user = v_usuario and v_consulta.data_hora > now())
  ) then
    raise exception 'Esta consulta não pode ser cancelada por você.';
  end if;

  if v_consulta.status not in ('agendada', 'confirmada') then
    raise exception 'Esta consulta não pode mais ser cancelada.';
  end if;

  update public.consultas c
  set status = 'cancelada',
      observacoes = concat_ws(' · ', nullif(c.observacoes, ''),
        case when v_motivo is not null then 'Cancelamento: ' || v_motivo end)
  where c.id = _consulta_id;

  perform private.auditar('cancelar', 'consultas', _consulta_id::text, '{}'::jsonb);
end;
$$;

create or replace function private.alterar_status_consulta(_consulta_id uuid, _status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consulta record;
begin
  if auth.uid() is null then
    raise exception 'Faça login.';
  end if;
  if _status is null or _status not in ('agendada', 'confirmada', 'em_atendimento', 'concluida', 'cancelada', 'faltou') then
    raise exception 'Status inválido.';
  end if;
  if not private.pode_alterar_consulta(_consulta_id) then
    raise exception 'Sem permissão para alterar esta consulta.';
  end if;

  select c.status::text as status, c.data_hora into v_consulta
  from public.consultas c where c.id = _consulta_id
  for update;
  if not found then
    raise exception 'Consulta não encontrada.';
  end if;

  if v_consulta.status = _status then
    return;
  end if;
  if v_consulta.status in ('cancelada', 'concluida') then
    raise exception 'Consulta % não pode mudar de situação.',
      case v_consulta.status when 'cancelada' then 'cancelada' else 'concluída' end;
  end if;
  if _status in ('em_atendimento', 'concluida', 'faltou') and v_consulta.data_hora > now() + interval '1 hour' then
    raise exception 'Só é possível marcar atendimento, conclusão ou falta no horário da consulta.';
  end if;
  if _status = 'agendada' and v_consulta.status <> 'confirmada' then
    raise exception 'Só uma consulta confirmada pode voltar para "agendada".';
  end if;

  update public.consultas set status = _status::public.status_consulta where id = _consulta_id;
  perform private.auditar('status:' || _status, 'consultas', _consulta_id::text, '{}'::jsonb);
end;
$$;

-- Ao cancelar/excluir, o horário volta para a agenda (se ainda for útil).
create or replace function private.consultas_sincronizar_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.agenda_medica a
    set status = case
          when a.data_hora > now()
               and not exists (select 1 from public.agenda_bloqueios b
                               where b.profissional_id = a.profissional_id
                                 and b.inicio < a.data_fim and b.fim > a.data_hora)
          then 'disponivel' else 'bloqueado' end,
        consulta_id = null
    where a.consulta_id = old.id;
    return old;
  end if;

  if new.status is distinct from old.status then
    -- Uma consulta cancelada não volta a valer: a vaga já pode ter outro paciente.
    if old.status = 'cancelada' then
      raise exception 'Consulta cancelada não pode ser reativada. Faça um novo agendamento.';
    end if;

    if new.status = 'cancelada' then
      update public.agenda_medica a
      set status = case
            when a.data_hora > now()
                 and not exists (select 1 from public.agenda_bloqueios b
                                 where b.profissional_id = a.profissional_id
                                   and b.inicio < a.data_fim and b.fim > a.data_hora)
            then 'disponivel' else 'bloqueado' end,
          consulta_id = null
      where a.consulta_id = new.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_consultas_sincronizar_agenda on public.consultas;
create trigger trg_consultas_sincronizar_agenda
before update of status or delete on public.consultas
for each row execute function private.consultas_sincronizar_agenda();

-- ------------------------------------------------------------
-- 8. GESTÃO DA AGENDA
-- ------------------------------------------------------------
drop function if exists public.liberar_agenda(uuid, date, date, int[], time, time, int);
drop function if exists private.liberar_agenda(uuid, date, date, int[], time, time, int);

create or replace function private.liberar_agenda(
  _profissional_id uuid,
  _data_inicio date,
  _data_fim date,
  _dias_semana int[],          -- 0 = domingo ... 6 = sábado
  _hora_inicio time,
  _hora_fim time,
  _duracao_minutos int default 30,
  _pausa_inicio time default null,  -- intervalo (ex.: almoço)
  _pausa_fim time default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prof record;
  v_total integer;
begin
  if not private.pode_gerir_agenda(_profissional_id) then
    raise exception 'Sem permissão para alterar a agenda deste profissional.';
  end if;

  select p.id, p.especialidade_id, p.unidade_id into v_prof
  from public.profissionais p
  where p.id = _profissional_id and p.status = 'ativo';

  if not found or v_prof.especialidade_id is null or v_prof.unidade_id is null then
    raise exception 'O profissional precisa estar ativo e ter especialidade e unidade cadastradas.';
  end if;
  if _data_inicio is null or _data_fim is null or _data_fim < _data_inicio then
    raise exception 'Período de datas inválido.';
  end if;
  if _data_fim - _data_inicio > 92 then
    raise exception 'Libere no máximo 3 meses por vez.';
  end if;
  if _hora_inicio is null or _hora_fim is null or _hora_fim <= _hora_inicio then
    raise exception 'O horário final deve ser depois do inicial.';
  end if;
  if _duracao_minutos is null or _duracao_minutos not between 10 and 240 then
    raise exception 'A duração da consulta deve ficar entre 10 e 240 minutos.';
  end if;
  if _dias_semana is null or cardinality(_dias_semana) = 0
     or exists (select 1 from unnest(_dias_semana) d where d not between 0 and 6) then
    raise exception 'Escolha pelo menos um dia da semana válido.';
  end if;
  if (_pausa_inicio is null) <> (_pausa_fim is null) then
    raise exception 'Informe o início e o fim do intervalo.';
  end if;
  if _pausa_inicio is not null and (_pausa_fim <= _pausa_inicio or _pausa_inicio < _hora_inicio or _pausa_fim > _hora_fim) then
    raise exception 'O intervalo precisa ficar dentro do horário de atendimento.';
  end if;

  with horarios as (
    select h.local at time zone 'America/Sao_Paulo' as inicio,
           h.local::time as hora_local
    from generate_series(_data_inicio, _data_fim, interval '1 day') as d(dia)
    cross join lateral generate_series(
      d.dia::date + _hora_inicio,
      d.dia::date + _hora_fim - make_interval(mins => _duracao_minutos),
      make_interval(mins => _duracao_minutos)
    ) as h(local)
    where extract(dow from d.dia)::int = any(_dias_semana)
  )
  insert into public.agenda_medica (profissional_id, especialidade_id, unidade_id, data_hora, duracao_minutos)
  select v_prof.id, v_prof.especialidade_id, v_prof.unidade_id, h.inicio, _duracao_minutos
  from horarios h
  where h.inicio > now()
    -- pula o intervalo
    and (
      _pausa_inicio is null
      or not (h.hora_local < _pausa_fim and h.hora_local + make_interval(mins => _duracao_minutos) > _pausa_inicio)
    )
    -- pula férias, afastamentos e bloqueios
    and not exists (
      select 1 from public.agenda_bloqueios b
      where b.profissional_id = v_prof.id
        and b.inicio < h.inicio + make_interval(mins => _duracao_minutos)
        and b.fim > h.inicio
    )
    -- pula horários que se sobrepõem aos já existentes
    and not exists (
      select 1 from public.agenda_medica x
      where x.profissional_id = v_prof.id
        and x.data_hora < h.inicio + make_interval(mins => _duracao_minutos)
        and x.data_fim > h.inicio
    )
  on conflict do nothing;

  get diagnostics v_total = row_count;
  perform private.auditar('liberar_agenda', 'agenda_medica', _profissional_id::text,
    jsonb_build_object('horarios', v_total, 'de', _data_inicio, 'ate', _data_fim));
  return v_total;
end;
$$;

create or replace function private.remover_horario(_agenda_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot record;
begin
  select a.id, a.profissional_id, a.status, a.consulta_id into v_slot
  from public.agenda_medica a where a.id = _agenda_id
  for update;

  if not found then
    raise exception 'Horário não encontrado.';
  end if;
  if not private.pode_gerir_agenda(v_slot.profissional_id) then
    raise exception 'Sem permissão para alterar a agenda deste profissional.';
  end if;
  if v_slot.status = 'reservado' or v_slot.consulta_id is not null then
    raise exception 'Este horário tem consulta marcada. Remarque ou cancele a consulta antes.';
  end if;

  delete from public.agenda_medica where id = _agenda_id;
end;
$$;

-- Bloqueia um período. Sem horas: dias inteiros. Com horas: a mesma faixa em cada dia
-- (serve para intervalos recorrentes). Não deixa bloquear por cima de consultas marcadas.
create or replace function private.criar_bloqueio(
  _profissional_id uuid,
  _data_inicio date,
  _data_fim date,
  _hora_inicio time default null,
  _hora_fim time default null,
  _tipo text default 'bloqueio',
  _motivo text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflitos integer;
  v_primeira timestamptz;
  v_bloqueados integer;
  v_faixas tstzrange[];
  v_motivo text := nullif(trim(coalesce(_motivo, '')), '');
begin
  if not private.pode_gerir_agenda(_profissional_id) then
    raise exception 'Sem permissão para alterar a agenda deste profissional.';
  end if;
  if not exists (select 1 from public.profissionais where id = _profissional_id) then
    raise exception 'Profissional não encontrado.';
  end if;
  if _tipo is null or _tipo not in ('bloqueio', 'ferias', 'afastamento', 'intervalo') then
    raise exception 'Tipo de bloqueio inválido.';
  end if;
  if _data_inicio is null or _data_fim is null or _data_fim < _data_inicio then
    raise exception 'Período de datas inválido.';
  end if;
  if _data_fim - _data_inicio > 366 then
    raise exception 'Bloqueie no máximo 1 ano por vez.';
  end if;
  if (_hora_inicio is null) <> (_hora_fim is null) then
    raise exception 'Informe as duas horas ou deixe as duas em branco (dia inteiro).';
  end if;
  if _hora_inicio is not null and _hora_fim <= _hora_inicio then
    raise exception 'O horário final deve ser depois do inicial.';
  end if;
  if v_motivo is not null and char_length(v_motivo) > 200 then
    raise exception 'O motivo deve ter até 200 caracteres.';
  end if;

  if _hora_inicio is null then
    v_faixas := array[tstzrange(
      _data_inicio::timestamp at time zone 'America/Sao_Paulo',
      (_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
    )];
  else
    select array_agg(tstzrange(
             (d.dia::date + _hora_inicio) at time zone 'America/Sao_Paulo',
             (d.dia::date + _hora_fim) at time zone 'America/Sao_Paulo'))
      into v_faixas
    from generate_series(_data_inicio, _data_fim, interval '1 day') as d(dia);
  end if;

  select count(*), min(c.data_hora) into v_conflitos, v_primeira
  from public.consultas c
  left join public.agenda_medica a on a.consulta_id = c.id
  where c.profissional_id = _profissional_id
    and c.status in ('agendada', 'confirmada', 'em_atendimento')
    and exists (
      select 1 from unnest(v_faixas) f
      where tstzrange(c.data_hora, coalesce(a.data_fim, c.data_hora + interval '30 minutes')) && f
    );

  if v_conflitos > 0 then
    raise exception 'Há % consulta(s) marcada(s) nesse período (a primeira em %). Remarque ou cancele antes de bloquear.',
      v_conflitos, to_char(v_primeira at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
      using hint = 'conflito_consultas';
  end if;

  insert into public.agenda_bloqueios (profissional_id, inicio, fim, tipo, motivo, criado_por)
  select _profissional_id, lower(f), upper(f), _tipo, v_motivo, auth.uid()
  from unnest(v_faixas) f;

  update public.agenda_medica a
  set status = 'bloqueado'
  where a.profissional_id = _profissional_id
    and a.status = 'disponivel'
    and exists (select 1 from unnest(v_faixas) f where tstzrange(a.data_hora, a.data_fim) && f);
  get diagnostics v_bloqueados = row_count;

  perform private.auditar('bloquear_agenda', 'agenda_bloqueios', _profissional_id::text,
    jsonb_build_object('tipo', _tipo, 'de', _data_inicio, 'ate', _data_fim, 'horarios', v_bloqueados));
  return v_bloqueados;
end;
$$;

create or replace function private.remover_bloqueio(_bloqueio_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bloq record;
  v_liberados integer;
begin
  select b.* into v_bloq from public.agenda_bloqueios b where b.id = _bloqueio_id for update;
  if not found then
    raise exception 'Bloqueio não encontrado.';
  end if;
  if not private.pode_gerir_agenda(v_bloq.profissional_id) then
    raise exception 'Sem permissão para alterar a agenda deste profissional.';
  end if;

  delete from public.agenda_bloqueios where id = _bloqueio_id;

  -- Devolve os horários futuros que não estão cobertos por outro bloqueio.
  update public.agenda_medica a
  set status = 'disponivel'
  where a.profissional_id = v_bloq.profissional_id
    and a.status = 'bloqueado'
    and a.consulta_id is null
    and a.data_hora > now()
    and a.data_hora < v_bloq.fim
    and a.data_fim > v_bloq.inicio
    and not exists (
      select 1 from public.agenda_bloqueios b
      where b.profissional_id = a.profissional_id
        and b.inicio < a.data_fim and b.fim > a.data_hora
    );
  get diagnostics v_liberados = row_count;

  perform private.auditar('remover_bloqueio', 'agenda_bloqueios', _bloqueio_id::text, '{}'::jsonb);
  return v_liberados;
end;
$$;

drop function if exists public.listar_agenda(uuid, int);
drop function if exists private.listar_agenda(uuid, int);

create or replace function private.listar_agenda(
  _profissional_id uuid default null,
  _dias int default 14,
  _especialidade_id uuid default null,
  _unidade_id uuid default null,
  _a_partir_de date default null
)
returns table (
  id uuid,
  data_hora timestamptz,
  data_fim timestamptz,
  status text,
  profissional_id uuid,
  profissional_nome text,
  especialidade_nome text,
  unidade_nome text,
  paciente_nome text,
  consulta_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_inicio timestamptz;
begin
  if v_usuario is null then
    raise exception 'Faça login.';
  end if;

  -- Sem cargo de gestão/recepção: só a própria agenda.
  if not private.tem_cargo(v_usuario, array['admin', 'gestor', 'recepcionista']) then
    select p.id into _profissional_id from public.profissionais p where p.user_id = v_usuario limit 1;
    if _profissional_id is null then
      return;
    end if;
  end if;

  v_inicio := coalesce(_a_partir_de::timestamp at time zone 'America/Sao_Paulo', now() - interval '1 hour');

  return query
  select a.id, a.data_hora, a.data_fim, a.status, a.profissional_id, p.nome, e.nome, u.nome,
         pa.nome_completo, c.status::text
  from public.agenda_medica a
  join public.profissionais p on p.id = a.profissional_id
  left join public.especialidades e on e.id = a.especialidade_id
  left join public.unidades u on u.id = a.unidade_id
  left join public.consultas c on c.id = a.consulta_id
  left join public.pacientes pa on pa.id = c.paciente_id
  where a.data_hora >= v_inicio
    and a.data_hora < v_inicio + make_interval(days => least(greatest(coalesce(_dias, 14), 1), 92))
    and (_profissional_id is null or a.profissional_id = _profissional_id)
    and (_especialidade_id is null or a.especialidade_id = _especialidade_id)
    and (_unidade_id is null or a.unidade_id = _unidade_id)
  order by a.data_hora, p.nome
  limit 1000;
end;
$$;

-- ------------------------------------------------------------
-- 9. INDICADORES E VÍNCULO DO MÉDICO
-- ------------------------------------------------------------
create or replace function private.indicadores_agenda(_inicio date default null, _fim date default null)
returns table (
  especialidade_id uuid,
  especialidade_nome text,
  vagas_total bigint,
  vagas_livres bigint,
  vagas_reservadas bigint,
  vagas_bloqueadas bigint,
  consultas bigint,
  canceladas bigint,
  faltas bigint,
  concluidas bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ini timestamptz := coalesce(_inicio, (now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (coalesce(_fim, (now() at time zone 'America/Sao_Paulo')::date + 30) + 1)::timestamp at time zone 'America/Sao_Paulo';
begin
  if not private.tem_cargo(auth.uid(), array['admin', 'gestor', 'recepcionista']) then
    raise exception 'Sem permissão para ver os indicadores.';
  end if;
  if v_fim <= v_ini or v_fim - v_ini > interval '400 days' then
    raise exception 'Período inválido.';
  end if;

  return query
  select e.id, e.nome,
         coalesce(ag.total, 0), coalesce(ag.livres, 0), coalesce(ag.reservadas, 0), coalesce(ag.bloqueadas, 0),
         coalesce(co.total, 0), coalesce(co.canceladas, 0), coalesce(co.faltas, 0), coalesce(co.concluidas, 0)
  from public.especialidades e
  left join lateral (
    select count(*) as total,
           count(*) filter (where a.status = 'disponivel') as livres,
           count(*) filter (where a.status = 'reservado') as reservadas,
           count(*) filter (where a.status = 'bloqueado') as bloqueadas
    from public.agenda_medica a
    where a.especialidade_id = e.id and a.data_hora >= v_ini and a.data_hora < v_fim
  ) ag on true
  left join lateral (
    select count(*) as total,
           count(*) filter (where c.status = 'cancelada') as canceladas,
           count(*) filter (where c.status = 'faltou') as faltas,
           count(*) filter (where c.status = 'concluida') as concluidas
    from public.consultas c
    where c.especialidade_id = e.id and c.data_hora >= v_ini and c.data_hora < v_fim
  ) co on true
  where e.status = 'ativo' or coalesce(ag.total, 0) + coalesce(co.total, 0) > 0
  order by e.nome;
end;
$$;

-- Ao vincular um usuário a um profissional, ele recebe o cargo de médico.
create or replace function private.vincular_acesso_medico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null then
    insert into public.user_roles (user_id, role) values (new.user_id, 'medico') on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists profissional_acesso_medico on public.profissionais;
create trigger profissional_acesso_medico
after insert or update of user_id on public.profissionais
for each row execute function private.vincular_acesso_medico();

-- O admin vincula o acesso pelo e-mail de uma conta já criada.
create or replace function private.vincular_acesso_profissional(_profissional_id uuid, _email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_nome text;
begin
  if not public.is_admin_gestor(auth.uid()) then
    raise exception 'Somente administradores podem vincular acessos.';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(coalesce(_email, '')));
  if v_user is null then
    raise exception 'Nenhuma conta com esse e-mail. Peça para o profissional se cadastrar primeiro.';
  end if;
  if exists (select 1 from public.profissionais where user_id = v_user and id <> _profissional_id) then
    raise exception 'Essa conta já está vinculada a outro profissional.';
  end if;

  update public.profissionais set user_id = v_user where id = _profissional_id returning nome into v_nome;
  if v_nome is null then
    raise exception 'Profissional não encontrado.';
  end if;

  perform private.auditar('vincular_acesso', 'profissionais', _profissional_id::text, '{}'::jsonb);
  return v_nome;
end;
$$;

-- Dados adicionais do paciente (2ª etapa do cadastro).
create or replace function private.salvar_meus_dados(
  _celular text,
  _data_nascimento date,
  _cpf text,
  _cep text default null,
  _cidade text default null,
  _estado text default null,
  _contato_emergencia text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_paciente uuid;
  v_cpf text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  v_celular text := regexp_replace(coalesce(_celular, ''), '\D', '', 'g');
  v_cep text := nullif(regexp_replace(coalesce(_cep, ''), '\D', '', 'g'), '');
  v_estado text := nullif(upper(trim(coalesce(_estado, ''))), '');
  v_email text;
  v_nome text;
begin
  if v_usuario is null then
    raise exception 'Faça login para salvar seus dados.';
  end if;
  if length(v_celular) <> 11 or substr(v_celular, 3, 1) <> '9' or substr(v_celular, 1, 1) = '0' then
    raise exception 'Informe um celular válido com DDD (11 dígitos).';
  end if;
  if _data_nascimento is null or _data_nascimento > current_date or _data_nascimento < current_date - interval '130 years' then
    raise exception 'Informe uma data de nascimento válida.';
  end if;
  if not private.cpf_valido(v_cpf) then
    raise exception 'CPF inválido. Confira os números.';
  end if;
  if v_cep is not null and length(v_cep) <> 8 then
    raise exception 'CEP inválido.';
  end if;
  if v_estado is not null and v_estado !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida.';
  end if;
  if char_length(coalesce(_cidade, '')) > 80 or char_length(coalesce(_contato_emergencia, '')) > 120 then
    raise exception 'Texto muito longo.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('clinicaflow:meus-dados:' || v_usuario::text, 0));

  select id into v_paciente from public.pacientes where user_id = v_usuario limit 1;

  if v_paciente is null then
    select u.email, coalesce(nullif(pr.nome, ''), u.email)
      into v_email, v_nome
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    where u.id = v_usuario;

    insert into public.pacientes (user_id, nome_completo, email)
    values (v_usuario, coalesce(v_nome, 'Paciente'), v_email)
    returning id into v_paciente;
  end if;

  if exists (
    select 1 from public.pacientes_dados_sensiveis
    where cpf = v_cpf and paciente_id <> v_paciente
  ) then
    raise exception 'Este CPF já está cadastrado em outra conta. Fale com a recepção.' using hint = 'cpf_duplicado';
  end if;

  -- Primeiro o CPF; depois celular/nascimento (o gatilho marca o cadastro como completo).
  begin
    insert into public.pacientes_dados_sensiveis (paciente_id, cpf, cep, cidade, estado, contato_emergencia)
    values (
      v_paciente, v_cpf, v_cep,
      nullif(trim(coalesce(_cidade, '')), ''),
      v_estado,
      nullif(trim(coalesce(_contato_emergencia, '')), '')
    )
    on conflict (paciente_id) do update
      set cpf = excluded.cpf,
          cep = excluded.cep,
          cidade = excluded.cidade,
          estado = excluded.estado,
          contato_emergencia = excluded.contato_emergencia;
  exception when unique_violation then
    raise exception 'Este CPF já está cadastrado em outra conta. Fale com a recepção.' using hint = 'cpf_duplicado';
  end;

  update public.pacientes
  set celular = v_celular,
      data_nascimento = _data_nascimento
  where id = v_paciente;

  update public.profiles set telefone = v_celular, updated_at = now() where id = v_usuario;

  perform private.auditar('salvar_meus_dados', 'pacientes', v_paciente::text, '{}'::jsonb);
  return v_paciente;
end;
$$;

-- ------------------------------------------------------------
-- 10. TAREFAS INTERNAS (integração opcional com o Trello)
-- Nunca guarde aqui CPF, dados clínicos ou nomes de pacientes.
-- ------------------------------------------------------------
create table if not exists public.tarefas_internas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 3 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 2000),
  categoria text not null check (categoria in ('administrativa', 'tecnica', 'manutencao')),
  status text not null default 'aberta' check (status in ('aberta', 'em_andamento', 'concluida')),
  responsavel text check (responsavel is null or char_length(responsavel) <= 80),
  trello_card_id text,
  trello_url text,
  sincronizado_em timestamptz,
  erro_sincronizacao text,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Defesa contra CPF digitado por engano (o app também bloqueia).
  constraint tarefas_sem_cpf check (
    titulo !~ '\d{3}\.?\d{3}\.?\d{3}-?\d{2}'
    and coalesce(descricao, '') !~ '\d{3}\.?\d{3}\.?\d{3}-?\d{2}'
  )
);
create index if not exists idx_tarefas_internas_status on public.tarefas_internas (status, created_at desc);

alter table public.tarefas_internas enable row level security;
revoke all on public.tarefas_internas from anon, authenticated;
grant select, insert, update on public.tarefas_internas to authenticated;
grant all on public.tarefas_internas to service_role;

drop policy if exists "tarefas_select" on public.tarefas_internas;
create policy "tarefas_select" on public.tarefas_internas
  for select to authenticated
  using (private.tem_cargo((select auth.uid()), array['admin', 'gestor', 'recepcionista']));

drop policy if exists "tarefas_insert" on public.tarefas_internas;
create policy "tarefas_insert" on public.tarefas_internas
  for insert to authenticated
  with check (
    private.tem_cargo((select auth.uid()), array['admin', 'gestor', 'recepcionista'])
    and criado_por = (select auth.uid())
  );

drop policy if exists "tarefas_update" on public.tarefas_internas;
create policy "tarefas_update" on public.tarefas_internas
  for update to authenticated
  using (
    public.is_admin_gestor((select auth.uid()))
    or criado_por = (select auth.uid())
  )
  with check (
    public.is_admin_gestor((select auth.uid()))
    or criado_por = (select auth.uid())
  );

-- ------------------------------------------------------------
-- 11. RPCs PÚBLICAS (sem privilégio; só encaminham para o schema private)
-- ------------------------------------------------------------
create or replace function public.agendar_por_especialidade(
  _especialidade_id uuid,
  _unidade_id uuid default null,
  _periodo text default null,
  _a_partir_de date default null,
  _motivo text default null,
  _paciente_id uuid default null,
  _remarcar_consulta_id uuid default null
)
returns table (
  id_consulta uuid, data_hora timestamptz, nome_profissional text,
  nome_especialidade text, nome_unidade text, endereco_unidade text
)
language sql security invoker set search_path = '' as $$
  select * from private.agendar_por_especialidade(
    _especialidade_id, _unidade_id, _periodo, _a_partir_de, _motivo, _paciente_id, _remarcar_consulta_id
  )
$$;

create or replace function public.previsualizar_vaga(
  _especialidade_id uuid,
  _unidade_id uuid default null,
  _periodo text default null,
  _a_partir_de date default null,
  _paciente_id uuid default null,
  _remarcar_consulta_id uuid default null
)
returns table (data_hora timestamptz, unidade_id uuid, unidade_nome text)
language sql stable security invoker set search_path = '' as $$
  select * from private.previsualizar_vaga(
    _especialidade_id, _unidade_id, _periodo, _a_partir_de, _paciente_id, _remarcar_consulta_id
  )
$$;

create or replace function public.resumo_vagas()
returns table (especialidade_id uuid, unidade_id uuid, total bigint, primeira timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from private.resumo_vagas()
$$;

create or replace function public.cancelar_consulta(_consulta_id uuid, _motivo text default null)
returns void language sql security invoker set search_path = '' as $$
  select private.cancelar_consulta(_consulta_id, _motivo)
$$;

create or replace function public.alterar_status_consulta(_consulta_id uuid, _status text)
returns void language sql security invoker set search_path = '' as $$
  select private.alterar_status_consulta(_consulta_id, _status)
$$;

create or replace function public.liberar_agenda(
  _profissional_id uuid, _data_inicio date, _data_fim date, _dias_semana int[],
  _hora_inicio time, _hora_fim time, _duracao_minutos int default 30,
  _pausa_inicio time default null, _pausa_fim time default null
)
returns integer language sql security invoker set search_path = '' as $$
  select private.liberar_agenda(_profissional_id, _data_inicio, _data_fim, _dias_semana,
    _hora_inicio, _hora_fim, _duracao_minutos, _pausa_inicio, _pausa_fim)
$$;

create or replace function public.remover_horario(_agenda_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.remover_horario(_agenda_id)
$$;

create or replace function public.criar_bloqueio(
  _profissional_id uuid, _data_inicio date, _data_fim date,
  _hora_inicio time default null, _hora_fim time default null,
  _tipo text default 'bloqueio', _motivo text default null
)
returns integer language sql security invoker set search_path = '' as $$
  select private.criar_bloqueio(_profissional_id, _data_inicio, _data_fim, _hora_inicio, _hora_fim, _tipo, _motivo)
$$;

create or replace function public.remover_bloqueio(_bloqueio_id uuid)
returns integer language sql security invoker set search_path = '' as $$
  select private.remover_bloqueio(_bloqueio_id)
$$;

create or replace function public.listar_agenda(
  _profissional_id uuid default null, _dias int default 14,
  _especialidade_id uuid default null, _unidade_id uuid default null, _a_partir_de date default null
)
returns table (
  id uuid, data_hora timestamptz, data_fim timestamptz, status text, profissional_id uuid,
  profissional_nome text, especialidade_nome text, unidade_nome text, paciente_nome text, consulta_status text
)
language sql stable security invoker set search_path = '' as $$
  select * from private.listar_agenda(_profissional_id, _dias, _especialidade_id, _unidade_id, _a_partir_de)
$$;

create or replace function public.indicadores_agenda(_inicio date default null, _fim date default null)
returns table (
  especialidade_id uuid, especialidade_nome text, vagas_total bigint, vagas_livres bigint,
  vagas_reservadas bigint, vagas_bloqueadas bigint, consultas bigint, canceladas bigint,
  faltas bigint, concluidas bigint
)
language sql stable security invoker set search_path = '' as $$
  select * from private.indicadores_agenda(_inicio, _fim)
$$;

create or replace function public.vincular_acesso_profissional(_profissional_id uuid, _email text)
returns text language sql security invoker set search_path = '' as $$
  select private.vincular_acesso_profissional(_profissional_id, _email)
$$;

create or replace function public.salvar_meus_dados(
  _celular text, _data_nascimento date, _cpf text,
  _cep text default null, _cidade text default null, _estado text default null,
  _contato_emergencia text default null
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.salvar_meus_dados(_celular, _data_nascimento, _cpf, _cep, _cidade, _estado, _contato_emergencia)
$$;

-- Permissões: tudo fechado por padrão; só "authenticated" executa o que precisa.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, n.nspname, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
       or (n.nspname = 'public' and p.proname in (
         'agendar_por_especialidade', 'previsualizar_vaga', 'resumo_vagas', 'cancelar_consulta',
         'alterar_status_consulta', 'liberar_agenda', 'remover_horario', 'criar_bloqueio',
         'remover_bloqueio', 'listar_agenda', 'indicadores_agenda', 'vincular_acesso_profissional',
         'salvar_meus_dados'))
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
  end loop;
end
$$;

-- Funções de gatilho e de uso interno: ninguém chama diretamente.
revoke all on function private.agenda_calcular_fim() from authenticated;
revoke all on function private.proteger_paciente() from authenticated;
revoke all on function private.validar_dados_sensiveis() from authenticated;
revoke all on function private.consultas_sincronizar_agenda() from authenticated;
revoke all on function private.vincular_acesso_medico() from authenticated;
revoke all on function private.marcar_cadastro_completo() from authenticated;
revoke all on function private.auditar(text, text, text, jsonb) from authenticated;
revoke all on function private.vagas_candidatas(uuid, uuid, text, timestamptz, uuid, uuid) from authenticated;
revoke all on function private.resolver_paciente(uuid, boolean) from authenticated;

-- Usadas pelas políticas RLS (respondem só true/false).
grant execute on function private.tem_cargo(uuid, text[]) to authenticated;
grant execute on function private.is_equipe_operacional(uuid) to authenticated;
grant execute on function private.pode_agendar_por_outro(uuid) to authenticated;
grant execute on function private.medico_atende_paciente(uuid, uuid) to authenticated;
grant execute on function private.pode_ver_dados_sensiveis(uuid, uuid) to authenticated;
grant execute on function private.pode_gerir_agenda(uuid) to authenticated;
grant execute on function private.pode_alterar_consulta(uuid) to authenticated;
grant execute on function private.cpf_valido(text) to authenticated;

-- Chamadas pelas RPCs públicas (security invoker).
grant execute on function private.agendar_por_especialidade(uuid, uuid, text, date, text, uuid, uuid) to authenticated;
grant execute on function private.previsualizar_vaga(uuid, uuid, text, date, uuid, uuid) to authenticated;
grant execute on function private.resumo_vagas() to authenticated;
grant execute on function private.cancelar_consulta(uuid, text) to authenticated;
grant execute on function private.alterar_status_consulta(uuid, text) to authenticated;
grant execute on function private.liberar_agenda(uuid, date, date, int[], time, time, int, time, time) to authenticated;
grant execute on function private.remover_horario(uuid) to authenticated;
grant execute on function private.criar_bloqueio(uuid, date, date, time, time, text, text) to authenticated;
grant execute on function private.remover_bloqueio(uuid) to authenticated;
grant execute on function private.listar_agenda(uuid, int, uuid, uuid, date) to authenticated;
grant execute on function private.indicadores_agenda(date, date) to authenticated;
grant execute on function private.vincular_acesso_profissional(uuid, text) to authenticated;
grant execute on function private.salvar_meus_dados(text, date, text, text, text, text, text) to authenticated;

grant execute on function public.agendar_por_especialidade(uuid, uuid, text, date, text, uuid, uuid) to authenticated;
grant execute on function public.previsualizar_vaga(uuid, uuid, text, date, uuid, uuid) to authenticated;
grant execute on function public.resumo_vagas() to authenticated;
grant execute on function public.cancelar_consulta(uuid, text) to authenticated;
grant execute on function public.alterar_status_consulta(uuid, text) to authenticated;
grant execute on function public.liberar_agenda(uuid, date, date, int[], time, time, int, time, time) to authenticated;
grant execute on function public.remover_horario(uuid) to authenticated;
grant execute on function public.criar_bloqueio(uuid, date, date, time, time, text, text) to authenticated;
grant execute on function public.remover_bloqueio(uuid) to authenticated;
grant execute on function public.listar_agenda(uuid, int, uuid, uuid, date) to authenticated;
grant execute on function public.indicadores_agenda(date, date) to authenticated;
grant execute on function public.vincular_acesso_profissional(uuid, text) to authenticated;
grant execute on function public.salvar_meus_dados(text, date, text, text, text, text, text) to authenticated;
