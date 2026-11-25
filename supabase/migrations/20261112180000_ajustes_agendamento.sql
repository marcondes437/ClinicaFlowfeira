-- ============================================================
-- ClinicaFlow — ajustes do agendamento (12/11/2026, 2ª rodada)
--
-- Roda depois de 20261112120000_revisao_agendamento_seguranca.sql.
-- Só recria funções (create or replace): não altera tabelas nem dados,
-- mantém as permissões já concedidas e pode ser executada mais de uma vez.
--
--  1. Remarcação travada: o primeiro horário livre costumava ser o MESMO horário
--     da consulta atual, só que com outro médico da especialidade. A reserva batia
--     no índice único (paciente, horário) e falhava sempre com "Esse horário acabou
--     de ser ocupado". Agora a remarcação procura um horário que não se sobreponha
--     à consulta atual (que só é cancelada depois que a nova estiver garantida).
--  2. Prévia da equipe: recepção/admin viam "Paciente inválido para este usuário"
--     antes de escolher o paciente. Agora a prévia funciona sem paciente.
--  3. CPF duplicado: cadastros antigos podiam ter o CPF com máscara ("529.982.247-25"),
--     e a checagem de duplicidade compara só dígitos — outra conta conseguia usar o
--     mesmo CPF. Os CPFs existentes passam a ser gravados só com dígitos.
--     (Única alteração de dados desta migration; linhas com problema ficam como estão
--     e geram um aviso com o id do paciente, nunca com o CPF.)
--  4. Data de nascimento: o banco comparava com current_date (UTC no Supabase) e,
--     depois das 21h em Brasília, aceitava a data de amanhã. Agora usa o dia em São Paulo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Horários candidatos
-- ------------------------------------------------------------
-- O parâmetro _ignorar_consulta continua na assinatura (compatibilidade), mas a
-- consulta que está sendo remarcada NÃO é mais ignorada na checagem de sobreposição:
-- remarcar significa ir para outro horário.
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
    -- (inclui a consulta que está sendo remarcada)
    and (
      _paciente_id is null
      or not exists (
        select 1
        from public.consultas c
        left join public.agenda_medica x on x.consulta_id = c.id
        where c.paciente_id = _paciente_id
          and c.status in ('agendada', 'confirmada', 'em_atendimento')
          and c.data_hora < a.data_fim
          and coalesce(x.data_fim, c.data_hora + interval '30 minutes') > a.data_hora
      )
    )
$$;

-- ------------------------------------------------------------
-- 2. Prévia: a equipe pode consultar antes de escolher o paciente
-- ------------------------------------------------------------
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
  if _a_partir_de is not null and _a_partir_de > current_date + 365 then
    raise exception 'Escolha uma data dentro dos próximos 12 meses.';
  end if;

  if _paciente_id is null and private.pode_agendar_por_outro(auth.uid()) then
    -- Recepção/admin ainda sem paciente escolhido: prévia geral da especialidade.
    v_paciente := null;
  else
    v_paciente := private.resolver_paciente(_paciente_id, false);
  end if;

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

-- ------------------------------------------------------------
-- 3. CPFs antigos só com dígitos (o índice único passa a valer de verdade)
-- ------------------------------------------------------------
create or replace function private.normalizar_cpfs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_total integer := 0;
begin
  for r in
    select s.paciente_id, s.cpf from public.pacientes_dados_sensiveis s where s.cpf ~ '\D'
  loop
    begin
      -- O gatilho trg_dados_sensiveis_validar tira a máscara e confere os dígitos.
      update public.pacientes_dados_sensiveis set cpf = r.cpf where paciente_id = r.paciente_id;
      v_total := v_total + 1;
    exception
      when unique_violation then
        raise warning 'CPF do paciente % já existe em outro cadastro: confira e una os cadastros.', r.paciente_id;
      when others then
        raise warning 'CPF/CEP do paciente % é inválido e foi mantido como está: corrija pela recepção.', r.paciente_id;
    end;
  end loop;
  return v_total;
end;
$$;
revoke all on function private.normalizar_cpfs() from public, anon, authenticated;

select private.normalizar_cpfs();

-- ------------------------------------------------------------
-- 4. Data de nascimento conferida com o dia de HOJE em São Paulo
--    (current_date no Supabase é UTC: depois das 21h aceitava a data de amanhã)
-- ------------------------------------------------------------
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
  if _data_nascimento is null
     or _data_nascimento > (now() at time zone 'America/Sao_Paulo')::date
     or _data_nascimento < (now() at time zone 'America/Sao_Paulo')::date - interval '130 years' then
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

-- As permissões das funções acima foram concedidas pela migration anterior e
-- "create or replace" as mantém. Reforço para bancos onde ela rodou parcialmente:
revoke all on function private.vagas_candidatas(uuid, uuid, text, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke all on function private.previsualizar_vaga(uuid, uuid, text, date, uuid, uuid) from public, anon;
grant execute on function private.previsualizar_vaga(uuid, uuid, text, date, uuid, uuid) to authenticated;
grant execute on function private.salvar_meus_dados(text, date, text, text, text, text, text) to authenticated;
