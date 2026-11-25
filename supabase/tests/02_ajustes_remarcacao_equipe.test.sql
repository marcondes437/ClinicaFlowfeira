-- ============================================================
-- Testes da migration 20261112180000_ajustes_agendamento.sql
-- (roda depois de 01_regras_agendamento.test.sql, no mesmo banco)
--
--  - remarcação quando o primeiro horário livre é no MESMO horário da consulta atual
--  - prévia da equipe antes de escolher o paciente
--  - remarcação feita pela recepção em nome do paciente
--  - médico inativado e unidade inativada deixam de receber consultas
--  - consulta passada não é remarcada nem cancelada pelo paciente
-- ============================================================
\set ON_ERROR_STOP 1

reset role;
select test.sair();

insert into public.especialidades (nome) values ('Teste Remarcar') on conflict do nothing;

insert into public.profissionais (nome, especialidade_id, unidade_id)
select v.nome, (select id from public.especialidades where nome = 'Teste Remarcar'),
       (select id from public.unidades where nome = 'ClinicxFlow Centro')
from (values ('Rita Remarcar'), ('Saulo Remarcar')) as v(nome)
where not exists (select 1 from public.profissionais p where p.nome = v.nome);

-- Rita: 09:00 e 10:00; Saulo: 09:00 (mesmo horário) — dia de referência + 1.
insert into public.agenda_medica (profissional_id, especialidade_id, unidade_id, data_hora)
select p.id, p.especialidade_id, p.unidade_id, ((test.dia() + 1) + h)::timestamp at time zone 'America/Sao_Paulo'
from public.profissionais p
cross join (values (time '09:00'), (time '10:00')) as t(h)
where (p.nome = 'Rita Remarcar') or (p.nome = 'Saulo Remarcar' and t.h = '09:00');

set role authenticated;

-- ------------------------------------------------------------
-- Remarcação com o primeiro horário livre no mesmo horário da consulta atual
-- ------------------------------------------------------------
select test.entrar('pac.a@teste.com');
create temporary table r_rem as
select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Teste Remarcar'));
grant select on r_rem to authenticated;
select test.ok((select test.hora_sp(data_hora) = '09:00' from r_rem), 'paciente A marca às 09:00');

select test.ok(
  (select test.hora_sp(data_hora) = '10:00'
   from public.previsualizar_vaga((select id from public.especialidades where nome = 'Teste Remarcar'),
     _remarcar_consulta_id => (select id_consulta from r_rem))),
  'prévia da remarcação não sugere o mesmo horário da consulta atual');

create temporary table r_rem2 as
select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Teste Remarcar'),
  _remarcar_consulta_id => (select id_consulta from r_rem));
grant select on r_rem2 to authenticated;
select test.ok((select test.hora_sp(data_hora) = '10:00' from r_rem2),
  'remarcação vai para o próximo horário diferente (antes falhava com "acabou de ser ocupado")');
select test.ok((select status = 'cancelada' from public.consultas where id = (select id_consulta from r_rem)),
  'consulta antiga cancelada na remarcação');

-- ------------------------------------------------------------
-- Equipe: prévia antes de escolher o paciente e remarcação em nome do paciente
-- ------------------------------------------------------------
select test.entrar('recepcao@teste.com');
select test.ok(
  (select count(*) = 1 from public.previsualizar_vaga((select id from public.especialidades where nome = 'Teste Remarcar'))),
  'recepção vê a prévia antes de escolher o paciente (antes: "Paciente inválido")');

create temporary table r_rem3 as
select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Teste Remarcar'),
  _paciente_id => test.paciente_id('Paciente A'), _remarcar_consulta_id => (select id_consulta from r_rem2));
grant select on r_rem3 to authenticated;
select test.ok((select test.hora_sp(data_hora) = '09:00' from r_rem3), 'recepção remarca a consulta do paciente');
select test.ok((select status = 'cancelada' from public.consultas where id = (select id_consulta from r_rem2)),
  'remarcação pela recepção cancela a anterior');
select test.deve_falhar(format($$select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Teste Remarcar'),
    _paciente_id => %L, _remarcar_consulta_id => %L)$$, test.paciente_id('Paciente B'), (select id_consulta from r_rem3)),
  'não encontrada', 'remarcação não aceita consulta de outro paciente');

-- O paciente vê a consulta remarcada pela recepção, com o médico atribuído.
select test.entrar('pac.a@teste.com');
select test.ok(
  (select p.nome is not null from public.consultas c join public.profissionais p on p.id = c.profissional_id
   where c.id = (select id_consulta from r_rem3)),
  'paciente lê a consulta remarcada com o nome do médico');

-- ------------------------------------------------------------
-- Médico inativo e unidade inativa não recebem consultas
-- ------------------------------------------------------------
reset role;
update public.profissionais set status = 'inativo' where nome in ('Rita Remarcar', 'Saulo Remarcar');
set role authenticated;
select test.entrar('pac.b@teste.com');
select test.deve_falhar($$select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Teste Remarcar'))$$,
  'Não há horários livres', 'médicos inativos não recebem consultas');

reset role;
update public.profissionais set status = 'ativo' where nome in ('Rita Remarcar', 'Saulo Remarcar');
update public.unidades set status = 'inativo' where nome = 'ClinicxFlow Centro';
set role authenticated;
select test.deve_falhar($$select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Teste Remarcar'))$$,
  'Não há horários livres', 'unidade inativa não recebe consultas');
reset role;
update public.unidades set status = 'ativo' where nome = 'ClinicxFlow Centro';
set role authenticated;

-- ------------------------------------------------------------
-- Consulta passada: paciente não remarca nem cancela
-- ------------------------------------------------------------
reset role;
insert into public.agenda_medica (profissional_id, especialidade_id, unidade_id, data_hora)
select p.id, p.especialidade_id, p.unidade_id, now() + interval '2 hours'
from public.profissionais p where p.nome = 'Saulo Remarcar';
set role authenticated;
select test.entrar('pac.b@teste.com');
create temporary table r_passada as
select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Teste Remarcar'));
grant select on r_passada to authenticated;
reset role;
-- simula que o horário já passou
alter table public.consultas disable trigger user;
update public.consultas set data_hora = now() - interval '1 day' where id = (select id_consulta from r_passada);
alter table public.consultas enable trigger user;
set role authenticated;
select test.entrar('pac.b@teste.com');
select test.deve_falhar(format($$select public.cancelar_consulta(%L)$$, (select id_consulta from r_passada)),
  'não pode ser cancelada por você', 'paciente não cancela consulta que já passou');
select test.deve_falhar(format($$select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Teste Remarcar'),
    _remarcar_consulta_id => %L)$$, (select id_consulta from r_passada)),
  'não encontrada', 'paciente não remarca consulta que já passou');

-- ------------------------------------------------------------
-- CPF antigo com máscara: normalizado e contado na duplicidade
-- ------------------------------------------------------------
reset role;
select test.sair();
insert into public.pacientes (nome_completo) values ('Legado Mascara'), ('Legado Duplicado');
alter table public.pacientes_dados_sensiveis disable trigger user;
insert into public.pacientes_dados_sensiveis (paciente_id, cpf) values
  (test.paciente_id('Legado Mascara'), '390.533.447-05'),
  -- mesmo CPF do Paciente A, com máscara: a normalização não pode quebrar a migration
  (test.paciente_id('Legado Duplicado'), '529.982.247-25');
alter table public.pacientes_dados_sensiveis enable trigger user;

select test.ok(private.normalizar_cpfs() = 1, 'normalização corrige o CPF com máscara e pula o duplicado sem erro');
select test.ok(
  (select cpf = '39053344705' from public.pacientes_dados_sensiveis where paciente_id = test.paciente_id('Legado Mascara')),
  'CPF antigo passa a ficar só com dígitos');
select test.ok(
  (select cpf = '529.982.247-25' from public.pacientes_dados_sensiveis where paciente_id = test.paciente_id('Legado Duplicado')),
  'CPF duplicado fica como estava (aviso para a recepção unir os cadastros)');

set role authenticated;
select test.entrar('pac.c@teste.com');
select test.deve_falhar($$select public.salvar_meus_dados('(11) 95555-4444', '2000-01-01', '39053344705')$$,
  'já está cadastrado', 'CPF de cadastro antigo (antes com máscara) não é reaproveitado por outra conta');
select test.ok(public.salvar_meus_dados('(11) 95555-4444', '2000-01-01', '123.456.789-09') is not null,
  'paciente C completa o cadastro com CPF próprio');
select test.ok((select cadastro_completo_em is not null from public.pacientes where user_id = auth.uid()),
  'cadastro do paciente C marcado como completo (Google → complementação → agendamento liberado)');

reset role;
select test.sair();
\echo 'TESTES DE AJUSTES PASSARAM'

-- ------------------------------------------------------------
-- Nascimento conferido com o dia de São Paulo
-- ------------------------------------------------------------
set role authenticated;
select test.entrar('pac.c@teste.com');
select test.deve_falhar($$select public.salvar_meus_dados('(11) 95555-4444', (now() at time zone 'America/Sao_Paulo')::date + 1, '123.456.789-09')$$,
  'nascimento', 'nascimento "amanhã" em Brasília é recusado');
select test.ok(public.salvar_meus_dados('(11) 95555-4444', (now() at time zone 'America/Sao_Paulo')::date, '123.456.789-09') is not null,
  'nascimento "hoje" em Brasília é aceito');

-- ------------------------------------------------------------
-- Edição de especialidades e unidades (admin sim, recepção não)
-- ------------------------------------------------------------
select test.entrar('admin@teste.com');
update public.especialidades set descricao = 'Coração e vasos' where nome = 'Cardiologia';
select test.ok((select descricao = 'Coração e vasos' from public.especialidades where nome = 'Cardiologia'), 'admin edita especialidade');
update public.unidades set horario_funcionamento = 'Seg a Sex, 7h às 19h' where nome = 'ClinicxFlow Centro';
select test.ok((select horario_funcionamento = 'Seg a Sex, 7h às 19h' from public.unidades where nome = 'ClinicxFlow Centro'), 'admin edita unidade');

select test.entrar('recepcao@teste.com');
update public.especialidades set descricao = 'alterado pela recepção' where nome = 'Cardiologia';
update public.unidades set nome = 'alterado pela recepção' where nome = 'ClinicxFlow Centro';
select test.ok((select descricao = 'Coração e vasos' from public.especialidades where nome = 'Cardiologia'), 'recepção não edita especialidade');
select test.ok(exists (select 1 from public.unidades where nome = 'ClinicxFlow Centro'), 'recepção não edita unidade');

select test.entrar('pac.a@teste.com');
update public.especialidades set nome = 'hack' where nome = 'Cardiologia';
select test.ok(exists (select 1 from public.especialidades where nome = 'Cardiologia'), 'paciente não edita especialidade');

reset role;
select test.sair();
\echo 'TESTES DE EDIÇÃO PASSARAM'
