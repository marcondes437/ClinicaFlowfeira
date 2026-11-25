-- ============================================================
-- Testes de banco do ClinicaFlow (rodar num banco de TESTE).
-- Uso: scripts/test-db.sh   (sobe as migrations num PostgreSQL local)
--
-- Cada verificação imprime "ok - ..." ou interrompe com "FALHOU: ...".
-- Os usuários são simulados como o Supabase faz: role "authenticated"
-- e request.jwt.claims com o id do usuário.
-- ============================================================
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create schema if not exists test;
grant usage on schema test to authenticated;

create or replace function test.entrar(_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = _email), 'role', 'authenticated')::text, false);
end $$;

create or replace function test.sair() returns void
language sql as $$ select set_config('request.jwt.claims', '', false) $$;

create or replace function test.ok(_condicao boolean, _descricao text) returns void
language plpgsql as $$
begin
  if _condicao is distinct from true then
    raise exception 'FALHOU: %', _descricao;
  end if;
  raise notice 'ok - %', _descricao;
end $$;

-- Executa um comando que DEVE falhar com uma mensagem contendo _trecho.
create or replace function test.deve_falhar(_sql text, _trecho text, _descricao text) returns void
language plpgsql as $$
begin
  begin
    execute _sql;
  exception when others then
    if position(lower(_trecho) in lower(sqlerrm)) > 0 then
      raise notice 'ok - % (erro: %)', _descricao, sqlerrm;
      return;
    end if;
    raise exception 'FALHOU: % — erro inesperado: %', _descricao, sqlerrm;
  end;
  raise exception 'FALHOU: % — o comando deveria ter falhado', _descricao;
end $$;

-- Dia de referência: daqui a 7 dias, no horário de Brasília.
create or replace function test.dia() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date + 7 $$;

create or replace function test.hora_sp(_t timestamptz) returns text
language sql stable as $$ select to_char(_t at time zone 'America/Sao_Paulo', 'HH24:MI') $$;

create or replace function test.paciente_id(_nome text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.pacientes where nome_completo = _nome limit 1
$$;

grant execute on all functions in schema test to authenticated;

-- ------------------------------------------------------------
-- Massa de teste (como superusuário)
-- ------------------------------------------------------------
reset role;
select test.sair();

insert into auth.users (email, raw_user_meta_data) values
  ('admin@teste.com', '{"nome":"Admin"}'),
  ('recepcao@teste.com', '{"nome":"Recepção"}'),
  ('ana@teste.com', '{"nome":"Ana Cardio"}'),
  ('bruno@teste.com', '{"nome":"Bruno Cardio"}'),
  ('aaron@teste.com', '{"nome":"Aaron Cardio"}'),
  ('pac.a@teste.com', '{"nome":"Paciente A"}'),
  ('pac.b@teste.com', '{"nome":"Paciente B"}'),
  ('pac.c@teste.com', '{"full_name":"Paciente C (Google)"}');

update public.user_roles set role = 'admin' where user_id = (select id from auth.users where email = 'admin@teste.com');
update public.user_roles set role = 'recepcionista' where user_id = (select id from auth.users where email = 'recepcao@teste.com');

insert into public.especialidades (nome) values ('Teste Concorrência') on conflict do nothing;

insert into public.profissionais (nome, especialidade_id, unidade_id, user_id)
select v.nome, (select id from public.especialidades where nome = 'Cardiologia'),
       (select id from public.unidades where nome = v.unidade),
       (select id from auth.users where email = v.email)
from (values
  ('Ana Cardio', 'ClinicxFlow Centro', 'ana@teste.com'),
  ('Bruno Cardio', 'ClinicxFlow Zona Norte', 'bruno@teste.com'),
  ('Aaron Cardio', 'ClinicxFlow Centro', 'aaron@teste.com')
) as v(nome, unidade, email);

-- ------------------------------------------------------------
-- 1. Cadastro de novo paciente (gatilho handle_new_user)
-- ------------------------------------------------------------
select test.ok(
  (select count(*) from public.pacientes p join auth.users u on u.id = p.user_id where u.email like 'pac.%') = 3,
  'cadastro cria um registro de paciente por conta (inclusive Google)');
select test.ok(
  (select nome_completo from public.pacientes p join auth.users u on u.id = p.user_id where u.email = 'pac.c@teste.com') = 'Paciente C (Google)',
  'nome vindo do Google (full_name) é aproveitado');
select test.ok(
  (select bool_and(cadastro_completo_em is null) from public.pacientes p join auth.users u on u.id = p.user_id where u.email like 'pac.%'),
  'cadastro novo começa incompleto (pede CPF/celular/nascimento no 1º acesso)');
select test.ok(
  (select count(*) from public.user_roles r join auth.users u on u.id = r.user_id where u.email = 'ana@teste.com' and r.role = 'medico') = 1,
  'vincular profissional a um usuário dá o cargo de médico');

-- ------------------------------------------------------------
-- 3/4. Complementação cadastral e persistência
-- ------------------------------------------------------------
set role authenticated;
select test.entrar('pac.a@teste.com');

select test.deve_falhar($$select public.salvar_meus_dados('(11) 98888-7777', '1990-05-10', '111.111.111-11')$$,
  'CPF inválido', 'CPF com dígitos verificadores errados é recusado');
select test.deve_falhar($$select public.salvar_meus_dados('1234', '1990-05-10', '529.982.247-25')$$,
  'celular', 'celular sem DDD é recusado');
select test.deve_falhar($$select public.salvar_meus_dados('(11) 98888-7777', current_date + 1, '529.982.247-25')$$,
  'nascimento', 'data de nascimento no futuro é recusada');
select test.ok(public.salvar_meus_dados('(11) 98888-7777', '1990-05-10', '529.982.247-25') is not null,
  'paciente A salva celular, nascimento e CPF');

-- "Sair e entrar de novo"
select test.sair();
select test.entrar('pac.a@teste.com');
select test.ok(
  (select cadastro_completo_em is not null and celular = '11988887777' and data_nascimento = '1990-05-10'
   from public.pacientes where user_id = auth.uid()),
  'dados continuam salvos depois de sair e entrar (cadastro completo)');
select test.ok(
  (select s.cpf from public.pacientes_dados_sensiveis s join public.pacientes p on p.id = s.paciente_id where p.user_id = auth.uid()) = '52998224725',
  'CPF persistido só com dígitos');
select test.ok(public.salvar_meus_dados('(11) 97777-6666', '1990-05-10', '52998224725', '01310-100', 'São Paulo', 'sp') is not null,
  'paciente edita os próprios dados depois');
select test.ok(
  (select count(*) from public.pacientes_dados_sensiveis s join public.pacientes p on p.id = s.paciente_id where p.user_id = auth.uid()) = 1,
  'edição não duplica registro');

-- O paciente não consegue mudar vínculo/situação/observações direto pela API.
update public.pacientes set status = 'inativo', observacoes = 'hack' where user_id = auth.uid();
select test.ok((select status = 'ativo' and observacoes is null from public.pacientes where user_id = auth.uid()),
  'paciente não altera status nem observações da equipe');

select test.entrar('pac.b@teste.com');
select test.deve_falhar($$select public.salvar_meus_dados('(21) 98888-1111', '1985-01-01', '529.982.247-25')$$,
  'já está cadastrado', 'CPF duplicado em outra conta é recusado');
select test.ok(public.salvar_meus_dados('(21) 98888-1111', '1985-01-01', '168.995.350-09') is not null,
  'paciente B completa o cadastro');
select test.ok((select count(*) from public.pacientes) = 1, 'paciente só enxerga o próprio registro');
select test.ok((select count(*) from public.pacientes_dados_sensiveis) = 1, 'paciente só enxerga o próprio CPF');

-- Paciente C tenta "completar" sem CPF, direto na tabela.
select test.entrar('pac.c@teste.com');
update public.pacientes set celular = '11955554444', data_nascimento = '2000-01-01' where user_id = auth.uid();
select test.ok((select cadastro_completo_em is null from public.pacientes where user_id = auth.uid()),
  'sem CPF o cadastro não é marcado como completo');
select test.deve_falhar($$insert into public.pacientes_dados_sensiveis (paciente_id, cpf)
  select id, '123.456.789-00' from public.pacientes where user_id = auth.uid()$$,
  'CPF inválido', 'CPF inválido não entra nem por inserção direta');

-- ------------------------------------------------------------
-- Agenda médica (liberar, intervalo, sobreposição, permissões)
-- ------------------------------------------------------------
select test.entrar('ana@teste.com');
select test.deve_falhar(format($$select public.liberar_agenda(%L, test.dia(), test.dia(), array[0,1,2,3,4,5,6], '08:00', '12:00', 30)$$,
  (select id from public.profissionais where nome = 'Bruno Cardio')),
  'Sem permissão', 'médico não libera a agenda de outro médico');
select test.ok(
  public.liberar_agenda((select id from public.profissionais where nome = 'Ana Cardio'),
    test.dia(), test.dia(), array[0,1,2,3,4,5,6], '08:00', '12:00', 30, '10:00', '10:30') = 7,
  'médica libera a própria agenda com intervalo 10:00–10:30 (7 horários)');
select test.ok(
  not exists (select 1 from public.listar_agenda(null, 30) where test.hora_sp(data_hora) = '10:00'),
  'nenhum horário dentro do intervalo');
select test.ok(
  public.liberar_agenda((select id from public.profissionais where nome = 'Ana Cardio'),
    test.dia(), test.dia(), array[0,1,2,3,4,5,6], '08:15', '09:15', 20) = 0,
  'horários sobrepostos aos existentes são ignorados');
select test.deve_falhar($$insert into public.agenda_medica (profissional_id, especialidade_id, unidade_id, data_hora)
  select id, especialidade_id, unidade_id, now() + interval '30 days' from public.profissionais where nome = 'Ana Cardio'$$,
  'permission denied', 'ninguém grava direto na agenda (só pelas funções)');

select test.entrar('admin@teste.com');
select public.liberar_agenda((select id from public.profissionais where nome = 'Bruno Cardio'),
  test.dia(), test.dia(), array[0,1,2,3,4,5,6], '08:00', '12:00', 30);
select public.liberar_agenda((select id from public.profissionais where nome = 'Bruno Cardio'),
  test.dia(), test.dia(), array[0,1,2,3,4,5,6], '14:00', '16:00', 30);
select public.liberar_agenda((select id from public.profissionais where nome = 'Aaron Cardio'),
  test.dia(), test.dia(), array[0,1,2,3,4,5,6], '07:00', '08:00', 30);

reset role;
update public.profissionais set status = 'inativo' where nome = 'Aaron Cardio';
set role authenticated;

-- ------------------------------------------------------------
-- 5/6/7/8. Agendamento por especialidade
-- ------------------------------------------------------------
select test.entrar('pac.a@teste.com');
select test.ok((select count(*) from public.agenda_medica) = 0, 'paciente não lê a agenda médica (nem o médico de cada horário)');
select test.ok(
  (select test.hora_sp(data_hora) = '08:00' from public.previsualizar_vaga((select id from public.especialidades where nome = 'Cardiologia'))),
  'prévia mostra o primeiro horário livre (médico inativo ignorado)');
select test.ok(
  not exists (
    select 1 from pg_proc p, unnest(p.proargnames) a
    where p.proname in ('previsualizar_vaga', 'resumo_vagas') and p.pronamespace = 'public'::regnamespace
      and a ilike '%profissional%'),
  'prévia e resumo não devolvem o médico');
select test.ok((select sum(total) from public.resumo_vagas()) = 19, 'resumo de vagas conta só médicos ativos (7 + 8 + 4)');

select test.deve_falhar($$insert into public.consultas (paciente_id, profissional_id, data_hora)
  select p.id, (select id from public.profissionais limit 1), now() + interval '8 days' from public.pacientes p$$,
  'permission denied', 'paciente não insere consulta direto (não escolhe médico nem horário)');

create temporary table r_a as
select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Cardiologia'));
grant select on r_a to authenticated;
select test.ok((select nome_profissional = 'Ana Cardio' and test.hora_sp(data_hora) = '08:00' from r_a),
  'paciente A recebe o primeiro horário (08:00) e o médico é atribuído automaticamente');
select test.ok(
  (select c.profissional_id = (select id from public.profissionais where nome = 'Ana Cardio') from public.consultas c where c.id = (select id_consulta from r_a)),
  'consulta gravada no banco com o médico atribuído');
select test.deve_falhar($$select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Cardiologia'))$$,
  'Já existe uma consulta', 'não deixa duas consultas futuras na mesma especialidade');

select test.entrar('pac.b@teste.com');
create temporary table r_b as
select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Cardiologia'));
grant select on r_b to authenticated;
select test.ok((select nome_profissional = 'Bruno Cardio' and test.hora_sp(data_hora) = '08:00' from r_b),
  'mesmo horário em outro médico: vai para quem tem menos consultas no dia');

reset role;
select test.ok(
  (select count(*) from public.agenda_medica where status = 'reservado') = 2
  and (select count(*) from public.consultas where status = 'agendada') = 2,
  'cada consulta reservou exatamente uma vaga');
set role authenticated;

select test.entrar('pac.c@teste.com');
select test.deve_falhar($$select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Cardiologia'))$$,
  'Complete seus dados', 'sem CPF/celular/nascimento não agenda');

-- Preferências: período e unidade.
select test.entrar('recepcao@teste.com');
reset role;
insert into public.especialidades (nome) values ('Sem Médicos') on conflict do nothing;
set role authenticated;
select test.deve_falhar(format($$select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Sem Médicos'), _paciente_id => %L)$$,
  (select id from public.pacientes where nome_completo = 'Paciente C (Google)')),
  'Não há horários livres', 'especialidade sem médicos: mensagem clara');

-- ------------------------------------------------------------
-- 11. Remarcação e cancelamento
-- ------------------------------------------------------------
select test.entrar('pac.a@teste.com');
select test.deve_falhar(format($$select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Cardiologia'),
    _a_partir_de => test.dia() + 60, _remarcar_consulta_id => %L)$$, (select id_consulta from r_a)),
  'Não há horários livres', 'remarcação sem vaga falha...');
select test.ok((select status = 'agendada' from public.consultas where id = (select id_consulta from r_a)),
  '...e a consulta original continua valendo');

create temporary table r_a2 as
select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Cardiologia'),
  _periodo => 'tarde', _remarcar_consulta_id => (select id_consulta from r_a));
grant select on r_a2 to authenticated;
select test.ok((select nome_profissional = 'Bruno Cardio' and test.hora_sp(data_hora) = '14:00' from r_a2),
  'remarcação respeita o período (tarde → 14:00)');
select test.ok((select status = 'cancelada' from public.consultas where id = (select id_consulta from r_a)),
  'consulta antiga cancelada só depois da nova garantida');
reset role;
select test.ok(
  (select status = 'disponivel' and consulta_id is null from public.agenda_medica a
   where a.data_hora = (select data_hora from r_a) and a.profissional_id = (select id from public.profissionais where nome = 'Ana Cardio')),
  'vaga antiga voltou para a agenda');
set role authenticated;

select test.entrar('pac.b@teste.com');
select test.deve_falhar(format($$select public.cancelar_consulta(%L)$$, (select id_consulta from r_a2)),
  'não pode ser cancelada por você', 'paciente não cancela consulta de outro paciente');
select public.cancelar_consulta((select id_consulta from r_b), 'Imprevisto');
select test.ok((select status = 'cancelada' from public.consultas where id = (select id_consulta from r_b)), 'paciente cancela a própria consulta');
select test.entrar('recepcao@teste.com');
select test.deve_falhar(format($$select public.alterar_status_consulta(%L, 'agendada')$$, (select id_consulta from r_b)),
  'não pode mudar', 'consulta cancelada não é reativada');

-- ------------------------------------------------------------
-- 12. Permissões por perfil
-- ------------------------------------------------------------
select test.entrar('ana@teste.com');
select test.ok((select count(*) from public.consultas) = 1, 'médica vê só as próprias consultas');
select test.ok(
  not exists (select 1 from public.pacientes where nome_completo = 'Paciente B'),
  'médica não vê paciente que não atende');
select test.ok(
  (select count(*) from public.pacientes_dados_sensiveis) = 1,
  'médica vê o CPF só do paciente que atende');
select test.deve_falhar(format($$select public.alterar_status_consulta(%L, 'confirmada')$$, (select id_consulta from r_a2)),
  'Sem permissão', 'médica não altera consulta de outro médico');
select test.deve_falhar(format($$select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Cardiologia'), _paciente_id => %L)$$,
  (select id from public.pacientes where nome_completo = 'Paciente A')),
  'inválido', 'médico não marca consulta em nome de paciente');
insert into public.evolucoes (paciente_id, autor_id, descricao)
select id, auth.uid(), 'Paciente orientado.' from public.pacientes where nome_completo = 'Paciente A';
select test.ok((select count(*) from public.evolucoes) = 1, 'médica registra evolução do paciente que atende');
select test.deve_falhar(format($$insert into public.evolucoes (paciente_id, autor_id, descricao) values (%L, auth.uid(), 'x')$$,
  test.paciente_id('Paciente B')),
  'row-level security', 'médica não registra evolução de paciente que não atende');

select test.entrar('admin@teste.com');
select test.ok((select count(*) from public.consultas) = 3, 'admin vê todas as consultas');
select test.ok((select count(*) from public.pacientes_dados_sensiveis) = 0, 'admin não lê CPF/endereço (LGPD)');
select test.ok((select count(*) from public.evolucoes) = 0, 'admin não lê prontuário');
select test.ok((select sum(vagas_reservadas) from public.indicadores_agenda(test.dia(), test.dia())) = 1, 'indicadores de ocupação para a gestão');

select test.entrar('recepcao@teste.com');
select test.ok((select count(*) from public.pacientes_dados_sensiveis) >= 2, 'recepção lê CPF para atendimento');
select public.alterar_status_consulta((select id_consulta from r_a2), 'confirmada');
select test.ok((select status = 'confirmada' from public.consultas where id = (select id_consulta from r_a2)), 'recepção confirma a consulta');
select test.deve_falhar(format($$select public.alterar_status_consulta(%L, 'concluida')$$, (select id_consulta from r_a2)),
  'no horário da consulta', 'não conclui consulta que ainda não aconteceu');

select test.entrar('pac.a@teste.com');
select test.deve_falhar($$select * from public.indicadores_agenda()$$, 'Sem permissão', 'paciente não vê indicadores');
select test.ok((select count(*) from public.listar_agenda()) = 0, 'paciente não lista agenda médica');

-- ------------------------------------------------------------
-- Bloqueios, férias e afastamentos
-- ------------------------------------------------------------
select test.entrar('bruno@teste.com');
select test.deve_falhar(format($$select public.criar_bloqueio(%L, test.dia(), test.dia(), _tipo => 'ferias')$$,
  (select id from public.profissionais where nome = 'Bruno Cardio')),
  'consulta(s) marcada(s)', 'não bloqueia por cima de consulta marcada');
select test.ok(
  public.criar_bloqueio((select id from public.profissionais where nome = 'Bruno Cardio'),
    test.dia(), test.dia(), '08:00', '12:00', 'afastamento', 'Congresso') = 8,
  'afastamento na manhã bloqueia os 8 horários livres');

select test.entrar('pac.b@teste.com');
create temporary table r_b2 as
select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Cardiologia'),
  _unidade_id => (select id from public.unidades where nome = 'ClinicxFlow Zona Norte'));
grant select on r_b2 to authenticated;
select test.ok((select test.hora_sp(data_hora) = '14:30' from r_b2),
  'com o médico afastado de manhã, a vaga vai para a tarde (respeita bloqueio e consulta já marcada)');

select test.entrar('bruno@teste.com');
select test.ok(
  public.remover_bloqueio((select id from public.agenda_bloqueios limit 1)) = 8,
  'remover o bloqueio devolve os horários');

-- ------------------------------------------------------------
-- Tarefas internas / Trello
-- ------------------------------------------------------------
select test.entrar('admin@teste.com');
select test.deve_falhar($$insert into public.tarefas_internas (titulo, descricao, categoria, criado_por)
  values ('Paciente reclamou', 'CPF 529.982.247-25', 'administrativa', auth.uid())$$,
  'tarefas_sem_cpf', 'tarefa com CPF é recusada (não vai para o Trello)');
insert into public.tarefas_internas (titulo, categoria, criado_por) values ('Trocar lâmpada da recepção', 'manutencao', auth.uid());
select test.ok((select count(*) from public.tarefas_internas) = 1, 'admin registra tarefa de manutenção');
select test.entrar('pac.a@teste.com');
select test.deve_falhar($$insert into public.tarefas_internas (titulo, categoria, criado_por) values ('x x x', 'tecnica', auth.uid())$$,
  'row-level security', 'paciente não registra tarefas internas');

reset role;
select test.sair();
\echo 'TODOS OS TESTES DE BANCO PASSARAM'
