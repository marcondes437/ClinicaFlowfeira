-- ============================================================
-- ClinicaFlow — Agendamento por especialidade + cadastro em 2 etapas
--
-- 1. Cadastro simples (nome, e-mail, senha). Os dados adicionais
--    (celular, nascimento, CPF...) são salvos no primeiro login.
-- 2. O paciente escolhe só a especialidade (e, se quiser, unidade,
--    período e data mínima). O banco marca o PRIMEIRO horário livre
--    da agenda médica e escolhe o médico. O nome do médico só é
--    revelado depois que a consulta é marcada.
-- 3. Cancelar / remarcar devolve a vaga para a agenda.
-- 4. A agenda do médico pode ser liberada em bloco.
--
-- Execute depois das migrations anteriores, no SQL Editor do Supabase.
-- ============================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ------------------------------------------------------------
-- 0. CORREÇÃO: as políticas RLS chamam estas funções com o usuário logado.
--    As migrations anteriores revogaram o EXECUTE de "authenticated", o que
--    fazia toda leitura de pacientes/consultas falhar com
--    "permission denied for function is_staff".
--    Elas só respondem true/false sobre cargos, sem expor dados.
-- ------------------------------------------------------------
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_staff(uuid) to authenticated;
grant execute on function public.is_admin_gestor(uuid) to authenticated;
do $$
begin
  if to_regprocedure('public.is_clinical_staff(uuid)') is not null then
    execute 'grant execute on function public.is_clinical_staff(uuid) to authenticated';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. CADASTRO EM DUAS ETAPAS
-- ------------------------------------------------------------
alter table public.pacientes
  add column if not exists cadastro_completo_em timestamptz;

-- Pacientes que já têm celular e nascimento (por qualquer caminho) não precisam refazer.
update public.pacientes p
set cadastro_completo_em = now()
where p.cadastro_completo_em is null
  and p.data_nascimento is not null
  and coalesce(p.celular, p.telefone) is not null;

-- Mantém a marcação em dia mesmo quando os dados chegam por outro caminho
-- (recepção, versões antigas da função salvar_meus_dados etc.).
create or replace function private.marcar_cadastro_completo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cadastro_completo_em is null
     and new.data_nascimento is not null
     and coalesce(new.celular, new.telefone) is not null then
    new.cadastro_completo_em := now();
  end if;
  return new;
end;
$$;
revoke all on function private.marcar_cadastro_completo() from public, anon, authenticated;

drop trigger if exists trg_pacientes_cadastro_completo on public.pacientes;
create trigger trg_pacientes_cadastro_completo
before insert or update of celular, telefone, data_nascimento on public.pacientes
for each row execute function private.marcar_cadastro_completo();

-- Gatilho de cadastro: aceita o nome vindo do Google (full_name / name).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome text := coalesce(
    nullif(trim(new.raw_user_meta_data->>'nome'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    ''
  );
begin
  insert into public.profiles (id, nome, email, telefone)
  values (new.id, v_nome, new.email, new.raw_user_meta_data->>'telefone')
  on conflict (id) do nothing;

  -- Segurança: todo cadastro público nasce como 'paciente'.
  insert into public.user_roles (user_id, role)
  values (new.id, 'paciente')
  on conflict do nothing;

  if not exists (select 1 from public.pacientes where user_id = new.id) then
    insert into public.pacientes (user_id, nome_completo, email, telefone)
    values (new.id, coalesce(nullif(v_nome, ''), new.email), new.email, new.raw_user_meta_data->>'telefone');
  end if;

  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Salva os dados adicionais do próprio paciente (uma única transação).
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
  v_celular text := nullif(trim(coalesce(_celular, '')), '');
  v_email text;
  v_nome text;
begin
  if v_usuario is null then
    raise exception 'Faça login para salvar seus dados.';
  end if;

  if v_celular is null or length(regexp_replace(v_celular, '\D', '', 'g')) not between 10 and 11 then
    raise exception 'Informe um celular válido com DDD.';
  end if;

  if _data_nascimento is null or _data_nascimento > current_date or _data_nascimento < date '1900-01-01' then
    raise exception 'Informe uma data de nascimento válida.';
  end if;

  if length(v_cpf) <> 11 then
    raise exception 'Informe um CPF válido.';
  end if;

  select id into v_paciente from public.pacientes where user_id = v_usuario limit 1;

  -- Conta criada antes do gatilho existir: cria o registro de paciente agora.
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
    raise exception 'Este CPF já está cadastrado em outra conta. Fale com a recepção.';
  end if;

  update public.pacientes
  set celular = v_celular,
      data_nascimento = _data_nascimento,
      cadastro_completo_em = coalesce(cadastro_completo_em, now())
  where id = v_paciente;

  update public.profiles set telefone = v_celular, updated_at = now() where id = v_usuario;

  insert into public.pacientes_dados_sensiveis (paciente_id, cpf, cep, cidade, estado, contato_emergencia)
  values (
    v_paciente,
    v_cpf,
    nullif(regexp_replace(coalesce(_cep, ''), '\D', '', 'g'), ''),
    nullif(trim(coalesce(_cidade, '')), ''),
    nullif(upper(trim(coalesce(_estado, ''))), ''),
    nullif(trim(coalesce(_contato_emergencia, '')), '')
  )
  on conflict (paciente_id) do update
    set cpf = excluded.cpf,
        cep = excluded.cep,
        cidade = excluded.cidade,
        estado = excluded.estado,
        contato_emergencia = excluded.contato_emergencia;

  return v_paciente;
end;
$$;

-- ------------------------------------------------------------
-- 2. AGENDAMENTO AUTOMÁTICO POR ESPECIALIDADE
-- ------------------------------------------------------------

-- O fluxo antigo (agendar_consulta_automaticamente) deixava escolher o horário exato.
-- O app não usa mais essa função; ela é mantida só para não quebrar versões
-- antigas do site que ainda estejam publicadas.

create or replace function private.agendar_por_especialidade(
  _especialidade_id uuid,
  _unidade_id uuid default null,      -- preferência opcional
  _periodo text default null,         -- 'manha' | 'tarde' | 'noite' | null (qualquer)
  _a_partir_de date default null,     -- preferência opcional
  _motivo text default null,
  _paciente_id uuid default null,     -- obrigatório só para a equipe
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
  v_equipe boolean;
  v_paciente uuid;
  v_cadastro_completo timestamptz;
  v_inicio timestamptz;
  v_agenda record;
  v_consulta uuid;
  v_existente timestamptz;
  v_especialidade text;
begin
  if v_usuario is null then
    raise exception 'Faça login para agendar uma consulta.';
  end if;

  v_equipe := public.is_staff(v_usuario);

  if v_equipe then
    if _paciente_id is null then
      raise exception 'Selecione o paciente.';
    end if;
    v_paciente := _paciente_id;
  else
    select p.id, p.cadastro_completo_em
      into v_paciente, v_cadastro_completo
    from public.pacientes p
    where p.user_id = v_usuario
    limit 1;

    if v_paciente is null or (_paciente_id is not null and _paciente_id <> v_paciente) then
      raise exception 'Paciente inválido para este usuário.';
    end if;

    if v_cadastro_completo is null then
      raise exception 'Complete seus dados antes de agendar.';
    end if;
  end if;

  if not exists (select 1 from public.pacientes where id = v_paciente and status = 'ativo') then
    raise exception 'Paciente inválido ou inativo.';
  end if;

  select e.nome into v_especialidade
  from public.especialidades e
  where e.id = _especialidade_id and e.status = 'ativo';

  if v_especialidade is null then
    raise exception 'Especialidade indisponível.';
  end if;

  if _periodo is not null and _periodo not in ('manha', 'tarde', 'noite') then
    raise exception 'Período inválido.';
  end if;

  if _remarcar_consulta_id is not null then
    perform 1
    from public.consultas c
    where c.id = _remarcar_consulta_id
      and c.paciente_id = v_paciente
      and c.status in ('agendada', 'confirmada')
      and c.data_hora > now()
    for update;

    if not found then
      raise exception 'Consulta para remarcar não encontrada.';
    end if;
  end if;

  -- Uma consulta futura por especialidade (use "remarcar" para trocar).
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
      to_char(v_existente at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  end if;

  -- Antecedência mínima de 1 hora.
  v_inicio := greatest(
    now() + interval '1 hour',
    coalesce((_a_partir_de::timestamp at time zone 'America/Sao_Paulo'), now())
  );

  -- Primeiro horário livre na agenda dos médicos da especialidade.
  -- Em caso de empate, vai para o médico com menos consultas no dia.
  select a.id, a.profissional_id, a.unidade_id, a.data_hora,
         p.nome as profissional_nome, u.nome as unidade_nome,
         nullif(concat_ws(', ', u.endereco, u.cidade), '') as unidade_endereco
    into v_agenda
  from public.agenda_medica a
  join public.profissionais p on p.id = a.profissional_id
  join public.unidades u on u.id = a.unidade_id
  where a.especialidade_id = _especialidade_id
    and a.status = 'disponivel'
    and a.data_hora >= v_inicio
    and (_unidade_id is null or a.unidade_id = _unidade_id)
    and p.status = 'ativo'
    and p.especialidade_id = _especialidade_id
    and p.unidade_id = a.unidade_id
    and u.status = 'ativo'
    and (
      _periodo is null
      or (_periodo = 'manha' and extract(hour from a.data_hora at time zone 'America/Sao_Paulo') < 12)
      or (_periodo = 'tarde' and extract(hour from a.data_hora at time zone 'America/Sao_Paulo') between 12 and 17)
      or (_periodo = 'noite' and extract(hour from a.data_hora at time zone 'America/Sao_Paulo') >= 18)
    )
    -- o paciente não pode ter duas consultas no mesmo horário
    and not exists (
      select 1 from public.consultas c
      where c.paciente_id = v_paciente
        and c.data_hora = a.data_hora
        and c.status in ('agendada', 'confirmada', 'em_atendimento')
        and c.id is distinct from _remarcar_consulta_id
    )
  order by
    a.data_hora,
    (
      select count(*) from public.agenda_medica x
      where x.profissional_id = a.profissional_id
        and x.status = 'reservado'
        and (x.data_hora at time zone 'America/Sao_Paulo')::date = (a.data_hora at time zone 'America/Sao_Paulo')::date
    ),
    p.nome
  limit 1
  for update of a skip locked;

  if not found then
    raise exception 'Não há horários livres de % com essas preferências. Tente outra unidade ou período.', v_especialidade;
  end if;

  insert into public.consultas (
    paciente_id, profissional_id, especialidade_id, unidade_id,
    data_hora, motivo, created_by
  ) values (
    v_paciente, v_agenda.profissional_id, _especialidade_id, v_agenda.unidade_id,
    v_agenda.data_hora, nullif(trim(coalesce(_motivo, '')), ''), v_usuario
  )
  returning id into v_consulta;

  update public.agenda_medica
  set status = 'reservado', consulta_id = v_consulta
  where id = v_agenda.id;

  -- Remarcação: só cancela a antiga depois de garantir a nova vaga.
  if _remarcar_consulta_id is not null then
    update public.consultas
    set status = 'cancelada',
        observacoes = concat_ws(' · ', nullif(observacoes, ''), 'Remarcada em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'))
    where id = _remarcar_consulta_id;
  end if;

  return query
  select v_consulta, v_agenda.data_hora, v_agenda.profissional_nome,
         v_especialidade, v_agenda.unidade_nome, v_agenda.unidade_endereco;
end;
$$;

-- ------------------------------------------------------------
-- 3. CANCELAMENTO DEVOLVE A VAGA
-- ------------------------------------------------------------
create or replace function private.cancelar_consulta(_consulta_id uuid, _motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'Faça login para cancelar a consulta.';
  end if;

  update public.consultas c
  set status = 'cancelada',
      observacoes = concat_ws(' · ', nullif(c.observacoes, ''), nullif('Cancelamento: ' || trim(coalesce(_motivo, '')), 'Cancelamento: '))
  where c.id = _consulta_id
    and c.status in ('agendada', 'confirmada')
    and (
      public.is_staff(v_usuario)
      or (
        c.data_hora > now()
        and exists (select 1 from public.pacientes p where p.id = c.paciente_id and p.user_id = v_usuario)
      )
    );

  if not found then
    raise exception 'Esta consulta não pode mais ser cancelada.';
  end if;
end;
$$;

create or replace function private.consultas_sincronizar_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.agenda_medica
    set status = 'disponivel', consulta_id = null
    where consulta_id = old.id;
    return old;
  end if;

  if new.status is distinct from old.status then
    -- Uma consulta cancelada não volta a valer: a vaga já pode ter outro paciente.
    if old.status = 'cancelada' then
      raise exception 'Consulta cancelada não pode ser reativada. Faça um novo agendamento.';
    end if;

    if new.status = 'cancelada' then
      update public.agenda_medica
      set status = case when data_hora > now() then 'disponivel' else 'bloqueado' end,
          consulta_id = null
      where consulta_id = new.id;
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
-- 4. AGENDA DO MÉDICO: LIBERAR EM BLOCO E LISTAR
-- ------------------------------------------------------------
create or replace function private.pode_gerir_agenda(_profissional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_gestor(auth.uid())
      or exists (
        select 1 from public.profissionais p
        where p.id = _profissional_id and p.user_id = auth.uid()
      )
$$;

create or replace function private.liberar_agenda(
  _profissional_id uuid,
  _data_inicio date,
  _data_fim date,
  _dias_semana int[],      -- 0 = domingo ... 6 = sábado
  _hora_inicio time,
  _hora_fim time,
  _duracao_minutos int default 30
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
  if auth.uid() is null or not private.pode_gerir_agenda(_profissional_id) then
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
  if _dias_semana is null or cardinality(_dias_semana) = 0 then
    raise exception 'Escolha pelo menos um dia da semana.';
  end if;

  insert into public.agenda_medica (profissional_id, especialidade_id, unidade_id, data_hora)
  select v_prof.id, v_prof.especialidade_id, v_prof.unidade_id, h.inicio_local at time zone 'America/Sao_Paulo'
  from generate_series(_data_inicio, _data_fim, interval '1 day') as d(dia)
  cross join lateral generate_series(
    d.dia::date + _hora_inicio,
    d.dia::date + _hora_fim - make_interval(mins => _duracao_minutos),
    make_interval(mins => _duracao_minutos)
  ) as h(inicio_local)
  where extract(dow from d.dia)::int = any(_dias_semana)
    and h.inicio_local at time zone 'America/Sao_Paulo' > now()
  on conflict (profissional_id, data_hora) do nothing;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

create or replace function private.listar_agenda(
  _profissional_id uuid default null,
  _dias int default 14
)
returns table (
  id uuid,
  data_hora timestamptz,
  status text,
  profissional_id uuid,
  profissional_nome text,
  especialidade_nome text,
  unidade_nome text,
  paciente_nome text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_proprio uuid;
begin
  if v_usuario is null then
    raise exception 'Faça login.';
  end if;

  -- Médico/enfermeiro sem cargo de gestão só enxerga a própria agenda.
  if not (public.is_admin_gestor(v_usuario) or public.has_role(v_usuario, 'recepcionista')) then
    select p.id into v_proprio from public.profissionais p where p.user_id = v_usuario limit 1;
    if v_proprio is null then
      return;
    end if;
    _profissional_id := v_proprio;
  end if;

  return query
  select a.id, a.data_hora, a.status, a.profissional_id, p.nome, e.nome, u.nome, pa.nome_completo
  from public.agenda_medica a
  join public.profissionais p on p.id = a.profissional_id
  left join public.especialidades e on e.id = a.especialidade_id
  left join public.unidades u on u.id = a.unidade_id
  left join public.consultas c on c.id = a.consulta_id
  left join public.pacientes pa on pa.id = c.paciente_id
  where a.data_hora >= now() - interval '1 hour'
    and a.data_hora < now() + make_interval(days => least(greatest(coalesce(_dias, 14), 1), 92))
    and (_profissional_id is null or a.profissional_id = _profissional_id)
  order by a.data_hora, p.nome
  limit 500;
end;
$$;

-- ------------------------------------------------------------
-- 5. RPCs PÚBLICAS (sem privilégio; só encaminham para o schema private)
-- ------------------------------------------------------------
create or replace function public.salvar_meus_dados(
  _celular text, _data_nascimento date, _cpf text,
  _cep text default null, _cidade text default null, _estado text default null,
  _contato_emergencia text default null
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.salvar_meus_dados(_celular, _data_nascimento, _cpf, _cep, _cidade, _estado, _contato_emergencia)
$$;

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

create or replace function public.cancelar_consulta(_consulta_id uuid, _motivo text default null)
returns void language sql security invoker set search_path = '' as $$
  select private.cancelar_consulta(_consulta_id, _motivo)
$$;

create or replace function public.liberar_agenda(
  _profissional_id uuid, _data_inicio date, _data_fim date, _dias_semana int[],
  _hora_inicio time, _hora_fim time, _duracao_minutos int default 30
)
returns integer language sql security invoker set search_path = '' as $$
  select private.liberar_agenda(_profissional_id, _data_inicio, _data_fim, _dias_semana, _hora_inicio, _hora_fim, _duracao_minutos)
$$;

create or replace function public.listar_agenda(_profissional_id uuid default null, _dias int default 14)
returns table (
  id uuid, data_hora timestamptz, status text, profissional_id uuid,
  profissional_nome text, especialidade_nome text, unidade_nome text, paciente_nome text
)
language sql stable security invoker set search_path = '' as $$
  select * from private.listar_agenda(_profissional_id, _dias)
$$;

-- Permissões: só usuários logados executam; anon não.
revoke all on function private.salvar_meus_dados(text, date, text, text, text, text, text) from public, anon;
revoke all on function private.agendar_por_especialidade(uuid, uuid, text, date, text, uuid, uuid) from public, anon;
revoke all on function private.cancelar_consulta(uuid, text) from public, anon;
revoke all on function private.liberar_agenda(uuid, date, date, int[], time, time, int) from public, anon;
revoke all on function private.listar_agenda(uuid, int) from public, anon;
revoke all on function private.pode_gerir_agenda(uuid) from public, anon;
revoke all on function private.consultas_sincronizar_agenda() from public, anon, authenticated;

grant execute on function private.salvar_meus_dados(text, date, text, text, text, text, text) to authenticated;
grant execute on function private.agendar_por_especialidade(uuid, uuid, text, date, text, uuid, uuid) to authenticated;
grant execute on function private.cancelar_consulta(uuid, text) to authenticated;
grant execute on function private.liberar_agenda(uuid, date, date, int[], time, time, int) to authenticated;
grant execute on function private.listar_agenda(uuid, int) to authenticated;
grant execute on function private.pode_gerir_agenda(uuid) to authenticated;

revoke all on function public.salvar_meus_dados(text, date, text, text, text, text, text) from public, anon;
revoke all on function public.agendar_por_especialidade(uuid, uuid, text, date, text, uuid, uuid) from public, anon;
revoke all on function public.cancelar_consulta(uuid, text) from public, anon;
revoke all on function public.liberar_agenda(uuid, date, date, int[], time, time, int) from public, anon;
revoke all on function public.listar_agenda(uuid, int) from public, anon;

grant execute on function public.salvar_meus_dados(text, date, text, text, text, text, text) to authenticated;
grant execute on function public.agendar_por_especialidade(uuid, uuid, text, date, text, uuid, uuid) to authenticated;
grant execute on function public.cancelar_consulta(uuid, text) to authenticated;
grant execute on function public.liberar_agenda(uuid, date, date, int[], time, time, int) to authenticated;
grant execute on function public.listar_agenda(uuid, int) to authenticated;
