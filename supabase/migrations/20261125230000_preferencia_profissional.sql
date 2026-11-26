-- Preferencia opcional de profissional; preserva bloqueios, concorrencia e remarcacao.
create or replace function public.agendar_com_preferencia(
  _especialidade_id uuid,
  _unidade_id uuid default null,
  _periodo text default null,
  _a_partir_de date default null,
  _motivo text default null,
  _paciente_id uuid default null,
  _remarcar_consulta_id uuid default null,
  _profissional_id uuid default null
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
  where (_profissional_id is null or a.profissional_id = _profissional_id)
    and a.status = 'disponivel'
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
create or replace function public.previsualizar_com_preferencia(
  _especialidade_id uuid,
  _unidade_id uuid default null,
  _periodo text default null,
  _a_partir_de date default null,
  _paciente_id uuid default null,
  _remarcar_consulta_id uuid default null,
  _profissional_id uuid default null
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
  join public.agenda_medica a on a.id = v.agenda_id
  where (_profissional_id is null or a.profissional_id = _profissional_id)
  order by v.ordem
  limit 1;
end;
$$;

create or replace function public.profissionais_para_agendamento()
returns table (id uuid, nome text, especialidade_id uuid, unidade_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sessao necessaria.'; end if;
  return query
  select distinct p.id, p.nome, p.especialidade_id, p.unidade_id
  from private.vagas_candidatas(null, null, null, now() + interval '1 hour', null, null) v
  join public.agenda_medica a on a.id = v.agenda_id
  join public.profissionais p on p.id = a.profissional_id
  order by p.nome;
end;
$$;
revoke all on function public.agendar_com_preferencia(uuid,uuid,text,date,text,uuid,uuid,uuid) from public, anon;
revoke all on function public.previsualizar_com_preferencia(uuid,uuid,text,date,uuid,uuid,uuid) from public, anon;
revoke all on function public.profissionais_para_agendamento() from public, anon;
grant execute on function public.agendar_com_preferencia(uuid,uuid,text,date,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.previsualizar_com_preferencia(uuid,uuid,text,date,uuid,uuid,uuid) to authenticated;
grant execute on function public.profissionais_para_agendamento() to authenticated;
