import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.local');
fs.mkdirSync(dir, { recursive: true });
const configPath = path.join(dir, 'database.json');
if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify({ host: '127.0.0.1', port: 55432, user: 'postgres', password: crypto.randomBytes(32).toString('hex'), database: 'clinicaflow_local' }, null, 2));
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
// The upstream Windows stop uses taskkill. Use pg_ctl for a clean checkpoint,
// so a stopped database can be copied safely and reopened without crash recovery.
class LocalPostgres extends EmbeddedPostgres {
  async stop() {
    const dbProcess = this.process;
    if (!dbProcess || dbProcess.exitCode !== null) { this.process = undefined; return; }
    const platform = process.platform === 'win32' ? 'windows' : process.platform;
    const executable = path.join(root, 'node_modules', '@embedded-postgres', `${platform}-${process.arch}`, 'native', 'bin', process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
    const exited = new Promise(resolve => dbProcess.once('exit', resolve));
    await new Promise((resolve, reject) => {
      const control = spawn(executable, ['stop', '-D', path.join(dir, 'postgres'), '-m', 'fast', '-w'], { stdio: 'ignore', windowsHide: true });
      control.on('error', reject); control.on('exit', code => code === 0 ? resolve() : reject(new Error('Não foi possível encerrar o PostgreSQL normalmente.')));
    });
    await exited; this.process = undefined;
  }
}
const cluster = new LocalPostgres({ databaseDir: path.join(dir, 'postgres'), user: config.user, password: config.password, port: config.port, persistent: true, authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: (e) => console.error(String(e)) });
let ownsCluster = false;
let child;
let keepAlive;
async function connect(database = config.database) { const c = new pg.Client({ ...config, database }); await c.connect(); return c; }
async function setup() {
  // Reuse only a cluster that accepts our generated password; never adopt another local database.
  let existing;
  try { existing = await connect('postgres'); } catch {}
  if (existing) await existing.end();
  else {
    if (!fs.existsSync(path.join(dir, 'postgres', 'PG_VERSION'))) await cluster.initialise();
    await cluster.start(); ownsCluster = true;
  }
  const admin = await connect('postgres');
  try {
    if (!/^[a-z_][a-z0-9_]*$/.test(config.database)) throw new Error('Nome do banco inválido.');
    if (!(await admin.query('select 1 from pg_database where datname=$1', [config.database])).rowCount) await admin.query(`create database "${config.database}" encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`);
  } finally { await admin.end(); }
  const db = await connect();
  try {
    await db.query('create table if not exists public.local_migrations (name text primary key, applied_at timestamptz default now())');
    const files = [path.join(root, 'local', 'bootstrap.sql'), ...fs.readdirSync(path.join(root, 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).sort().map(f => path.join(root, 'supabase', 'migrations', f)), path.join(root, 'local', 'auth.sql')];
    for (const file of files) {
      const name = path.basename(file);
      if ((await db.query('select 1 from public.local_migrations where name=$1', [name])).rowCount) continue;
      await db.query('begin');
      try { await db.query(fs.readFileSync(file, 'utf8')); await db.query('insert into public.local_migrations(name) values($1)', [name]); await db.query('commit'); console.log('Banco: ' + name); }
      catch (e) { await db.query('rollback'); throw e; }
    }
    const roles = ['admin', 'gestor', 'medico', 'enfermeiro', 'recepcionista', 'paciente'];
    for (const role of roles) {
      const email = `${role}@clinicaflow.local`;
      if ((await db.query('select 1 from auth.users where email=$1', [email])).rowCount) continue;
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = `${salt}:${crypto.scryptSync('ClinicaLocal2026', salt, 64).toString('hex')}`;
      await db.query('begin');
      try {
        const { rows: [user] } = await db.query('insert into auth.users(email, raw_user_meta_data, password_hash) values($1,$2,$3) returning id', [email, JSON.stringify({ nome: `Demonstração ${role}` }), hash]);
        await db.query('delete from public.user_roles where user_id=$1', [user.id]);
        await db.query('insert into public.user_roles(user_id,role) values($1,$2)', [user.id, role]);
        if (role !== 'paciente') await db.query('delete from public.pacientes where user_id=$1', [user.id]);
        if (role === 'medico') await db.query("insert into public.profissionais(user_id,nome,email,especialidade_id,unidade_id) values($1,'Médico Demonstração',$2,(select id from public.especialidades where status='ativo' order by nome limit 1),(select id from public.unidades where status='ativo' order by nome limit 1))", [user.id, email]);
        await db.query('commit');
      } catch (e) { await db.query('rollback'); throw e; }
    }
    console.log('PostgreSQL local pronto em 127.0.0.1:' + config.port);
  } finally { await db.end(); }
}
let stopping = false;
async function stop(code = 0) { if (stopping) return; stopping = true; clearInterval(keepAlive); if (child && child.exitCode === null) child.kill(); if (ownsCluster) await cluster.stop(); process.exitCode = code; }
process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
try {
  await setup();
  const mode = process.argv[2] || 'serve';
  if (mode === 'setup') await stop();
  else if (mode === 'dev' || mode === 'start') {
    child = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), mode, '-H', '127.0.0.1', '-p', '3000'], { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
    child.on('exit', code => void stop(code ?? 1));
  } else if (mode === 'test') {
    child = spawn(process.execPath, ['scripts/test-local.cjs'], { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('exit', code => void stop(code ?? 1));
  } else { console.log('Mantenha este terminal aberto. Ctrl+C encerra o banco.'); keepAlive = setInterval(() => {}, 60000); }
} catch (e) { console.error(e); await stop(1); }
