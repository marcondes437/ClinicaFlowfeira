import { Pool, types, type PoolClient } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import type { Filter, Operation, Result } from './protocol';

types.setTypeParser(1082, value => value); // Keep date-only values free of timezone shifts.
types.setTypeParser(1184, value => new Date(value).toISOString());
types.setTypeParser(1700, Number);
type LocalGlobal = typeof globalThis & { clinicaflowPool?: Pool };
export function pool() {
  const global = globalThis as LocalGlobal;
  if (!global.clinicaflowPool) {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.local/database.json'), 'utf8'));
    global.clinicaflowPool = new Pool({ ...config, max: 10, connectionTimeoutMillis: 5000 });
  }
  return global.clinicaflowPool;
}
export type LocalUser = { id: string; email: string };
export async function asUser<T>(user: LocalUser | null, fn: (db: PoolClient) => Promise<T>) {
  const db = await pool().connect();
  try {
    await db.query('begin');
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user.id, email: user.email, role: 'authenticated' } : { role: 'anon' })]);
    await db.query(user ? 'set local role authenticated' : 'set local role anon');
    const result = await fn(db);
    await db.query('commit'); return result;
  } catch (e) { await db.query('rollback'); throw e; } finally { db.release(); }
}
const tables = new Set(['profiles', 'user_roles', 'unidades', 'especialidades', 'profissionais', 'pacientes', 'pacientes_dados_sensiveis', 'consultas', 'evolucoes', 'agenda_medica', 'agenda_bloqueios', 'tarefas_internas', 'interessados_presencial']);
const rpcs = new Set(['salvar_meus_dados', 'agendar_por_especialidade', 'previsualizar_vaga', 'resumo_vagas', 'cancelar_consulta', 'alterar_status_consulta', 'liberar_agenda', 'remover_horario', 'criar_bloqueio', 'remover_bloqueio', 'listar_agenda', 'indicadores_agenda', 'vincular_acesso_profissional']);
function identifier(s: string) { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error('Identificador inválido'); return `"${s}"`; }
function splitColumns(s: string) {
  let depth = 0, start = 0; const parts: string[] = [];
  for (let i = 0; i < s.length; i++) { if (s[i] === '(') depth++; if (s[i] === ')') depth--; if (s[i] === ',' && !depth) { parts.push(s.slice(start, i).trim()); start = i + 1; } }
  parts.push(s.slice(start).trim()); return parts;
}
const references: Record<string, string> = { pacientes: 'paciente_id', profissionais: 'profissional_id', especialidades: 'especialidade_id', unidades: 'unidade_id' };
function projection(columns: string, alias = 't', base = ''): string {
  return splitColumns(columns).map(part => {
    if (part === '*') return `${alias}.*`;
    const match = /^(\w+)\((.*)\)$/.exec(part);
    if (!match) return `${alias}.${identifier(part)}`;
    const [, table, fields] = match;
    if (!tables.has(table)) throw new Error('Relação inválida');
    const sensitive = table === 'pacientes_dados_sensiveis' && base === 'pacientes';
    const fk = references[table];
    if (!sensitive && !fk) throw new Error('Relação não suportada');
    const relation = sensitive ? 'r.paciente_id = t.id' : `r.id = ${alias}.${identifier(fk)}`;
    return `(select row_to_json(j) from (select ${projection(fields, 'r', table)} from public.${identifier(table)} r where ${relation}) j) as ${identifier(table)}`;
  }).join(', ');
}
export async function execute(user: LocalUser | null, op: Operation): Promise<Result> {
  try {
    return await asUser(user, async db => {
      if (op.rpc) {
        if (!rpcs.has(op.rpc)) throw new Error('Função não permitida');
        const args = Object.entries(op.args ?? {});
        const sql = `select * from public.${identifier(op.rpc)}(${args.map(([key], i) => `${identifier(key)} => $${i + 1}`).join(',')})`;
        const { rows } = await db.query(sql, args.map(([, value]) => value));
        const scalar = ['salvar_meus_dados', 'cancelar_consulta', 'alterar_status_consulta', 'liberar_agenda', 'remover_horario', 'criar_bloqueio', 'remover_bloqueio', 'vincular_acesso_profissional'].includes(op.rpc);
        return { data: scalar ? rows[0]?.[op.rpc] ?? null : rows, error: null };
      }
      if (!op.table || !tables.has(op.table)) throw new Error('Tabela não permitida');
      const params: unknown[] = [];
      const value = (v: unknown) => { params.push(v); return `$${params.length}`; };
      function condition(f: Filter): string {
        const column = `t.${identifier(f.column)}`;
        if (f.op === 'is' || f.op === 'not_is') { if (f.value !== null) throw new Error('Filtro inválido'); return `${column} is ${f.op === 'not_is' ? 'not ' : ''}null`; }
        if (f.op === 'in') { if (!Array.isArray(f.value)) throw new Error('Filtro inválido'); return f.value.length ? `${column} in (${f.value.map(value).join(',')})` : 'false'; }
        const operator = ({ eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=', ilike: 'ilike' } as Record<string, string>)[f.op];
        if (!operator) throw new Error('Filtro inválido');
        return `${column} ${operator} ${value(f.value)}`;
      }
      const filters = (op.filters ?? []).map(condition);
      if (op.or) filters.push('(' + op.or.split(',').map(s => { const m = /^(\w+)\.(eq|lt|gt|gte|lte)\.(.*)$/.exec(s); if (!m) throw new Error('Filtro inválido'); return condition({ column: m[1], op: m[2], value: m[3].replace(/^"|"$/g, '') }); }).join(' or ') + ')');
      const where = filters.length ? ` where ${filters.join(' and ')}` : '';
      const table = `public.${identifier(op.table)} as t`;
      let sql: string;
      if (!op.method || op.method === 'select') {
        if (op.head) { const result = await db.query(`select count(*)::int as total from ${table}${where}`, params); return { data: null, count: result.rows[0].total, error: null }; }
        sql = `select ${projection(op.columns || '*', 't', op.table)} from ${table}${where}`;
        if (op.orders?.length) sql += ' order by ' + op.orders.map(o => `t.${identifier(o.column)} ${o.ascending ? 'asc' : 'desc'}`).join(',');
        const limit = op.limit ?? 1000;
        if (!Number.isInteger(limit) || limit < 0 || limit > 10000 || !Number.isInteger(op.offset ?? 0) || (op.offset ?? 0) < 0) throw new Error('Paginação inválida');
        sql += ` limit ${limit} offset ${op.offset ?? 0}`;
      } else {
        const entries = Object.entries(op.values ?? {});
        if (!entries.length) throw new Error('Dados vazios');
        if (op.method === 'insert') sql = `insert into ${table} (${entries.map(([key]) => identifier(key)).join(',')}) values (${entries.map(([, v]) => value(v)).join(',')})`;
        else if (op.method === 'update') { if (!filters.length) throw new Error('Atualização sem filtro'); sql = `update ${table} set ${entries.map(([key, v]) => `${identifier(key)}=${value(v)}`).join(',')}${where}`; }
        else throw new Error('Operação não permitida');
        sql += ` returning ${projection(op.columns || '*', 't', op.table)}`;
      }
      const { rows } = await db.query(sql, params);
      if (op.single && (rows.length > 1 || (op.single === 'required' && rows.length !== 1))) return { data: null, error: { code: 'PGRST116', message: 'Registro não encontrado ou resultado ambíguo.' } };
      return { data: op.single ? rows[0] ?? null : rows, error: null, count: op.count ? rows.length : null };
    });
  } catch (e) {
    const error = e as { code?: string; message: string };
    console.error('Banco local:', error.code, error.message);
    return { data: null, error: { code: error.code, message: error.code === 'P0001' ? error.message : 'Não foi possível concluir a operação no banco local.' } };
  }
}
