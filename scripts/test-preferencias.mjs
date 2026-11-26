import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import pg from 'pg';
import { prepararAgendaDemo } from './local-demo-agenda.mjs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const config = JSON.parse(fs.readFileSync('.local/database.json', 'utf8'));
const pool = new pg.Pool(config); globalThis.clinicaflowPool = pool;
const { execute } = require('../src/lib/local/database.ts');
const db = await pool.connect(); let user;
try {
  await prepararAgendaDemo(db);
  assert.equal((await prepararAgendaDemo(db)).horarios, 0, 'Repetir a preparação não duplica vagas');
  user = (await db.query('insert into auth.users(email,raw_user_meta_data) values($1,$2) returning id,email', [`demo-check-${Date.now()}@teste.local`, JSON.stringify({ nome: 'Paciente Teste Agenda Local' })])).rows[0];
  let cpf = String(Date.now()).slice(-9);
  for (let weight = 10; weight <= 11; weight++) { let sum = 0; for (let i = 0; i < cpf.length; i++) sum += Number(cpf[i]) * (weight - i); const digit = 11 - sum % 11; cpf += digit >= 10 ? '0' : String(digit); }
  assert.equal((await execute(user, { rpc: 'salvar_meus_dados', args: { _celular: '11987654321', _data_nascimento: '1990-01-01', _cpf: cpf } })).error, null);
  const specialties = (await db.query("select id,nome from public.especialidades where status='ativo' order by nome")).rows;
  const available = await execute(user, { rpc: 'resumo_vagas' }); assert.equal(available.error, null);
  const providers = await execute(user, { rpc: 'profissionais_para_agendamento' });
  assert.equal(providers.error, null);
  for (const specialty of specialties) {
    const provider = providers.data.find(p => p.especialidade_id === specialty.id);
    assert(provider, 'Precisa oferecer profissional da especialidade');
    const other = providers.data.find(p => p.especialidade_id !== specialty.id);
    const invalid = await execute(user, { rpc: 'previsualizar_com_preferencia', args: { _especialidade_id: specialty.id, _profissional_id: other.id } });
    assert.equal(invalid.error, null); assert.equal(invalid.data.length, 0, 'Outra especialidade nao pode ser reservada');
    const preview = await execute(user, { rpc: 'previsualizar_com_preferencia', args: { _especialidade_id: specialty.id, _profissional_id: provider.id, _unidade_id: provider.unidade_id } });
    assert.equal(preview.error, null); assert(preview.data.length);

    assert(available.data.some(row => row.especialidade_id === specialty.id && Number(row.total) > 0), `${specialty.nome}: precisa ter vagas`);
    const booked = await execute(user, { rpc: 'agendar_com_preferencia', args: { _especialidade_id: specialty.id, _profissional_id: provider.id, _unidade_id: provider.unidade_id } }); assert.equal(booked.error, null, specialty.nome);
    const id = booked.data[0].id_consulta;
    const actual = (await db.query('select profissional_id, unidade_id, data_hora from public.consultas where id=$1', [id])).rows[0];
    assert.equal(actual.profissional_id, provider.id); assert.equal(actual.unidade_id, provider.unidade_id);
    assert.equal(new Date(actual.data_hora).getTime(), new Date(preview.data[0].data_hora).getTime());
    const confirmation = await execute(user, { table: 'consultas', columns: 'id,status,data_hora,profissionais(nome),especialidades(nome)', filters: [{ column: 'id', op: 'eq', value: id }], single: 'required' });
    assert.equal(confirmation.error, null); assert(confirmation.data.profissionais.nome); assert.equal(confirmation.data.status, 'agendada');
    await prepararAgendaDemo(db);
    assert.equal((await db.query('select status from public.consultas where id=$1', [id])).rows[0].status, 'agendada', 'Reiniciar não altera consultas existentes');
    assert.equal((await execute(user, { rpc: 'cancelar_consulta', args: { _consulta_id: id } })).error, null);
    console.log(`OK: ${specialty.nome} — vaga, agendamento, confirmação e cancelamento.`);
  }
  console.log('OK: todas as especialidades disponíveis; preparação sem duplicatas ou alteração de reservas.');
} finally {
  if (user) { await db.query('delete from public.consultas where paciente_id in (select id from public.pacientes where user_id=$1)', [user.id]); await db.query('delete from auth.users where id=$1', [user.id]); }
  db.release(); await pool.end();
}
