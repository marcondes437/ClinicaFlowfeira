#!/usr/bin/env node
/*
 * Testes de banco do ClinicaFlow, sem depender do psql (funciona no Windows).
 *
 *  1. Recria o banco de teste (TEST_DB, padrão clinicaflow_test).
 *  2. Aplica supabase/tests/00_supabase_stub.sql (simula auth/roles do Supabase)
 *     e TODAS as migrations de supabase/migrations, em ordem.
 *  3. Roda supabase/tests/*.test.sql (cada "ok - ..." é impresso; a 1ª falha interrompe).
 *  4. Roda os testes de concorrência com conexões simultâneas reais.
 *
 * Requer PostgreSQL 15+ com btree_gist (contrib). Conexão pelas variáveis padrão:
 * PGHOST, PGPORT, PGUSER, PGPASSWORD (superusuário). NUNCA aponte para o Supabase de produção.
 */
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const RAIZ = path.join(__dirname, "..");
const DB = process.env.TEST_DB || "clinicaflow_test";
const BASE = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD,
};

if (!/^[a-z_][a-z0-9_]*$/.test(DB)) {
  console.error("TEST_DB inválido.");
  process.exit(1);
}

/** Divide um arquivo SQL em comandos, respeitando strings, $$...$$ e comentários. */
function dividirSql(sql) {
  const comandos = [];
  let atual = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const resto = sql.slice(i);
    if (c === "-" && sql[i + 1] === "-") {
      const fim = sql.indexOf("\n", i);
      i = fim === -1 ? sql.length : fim;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const fim = sql.indexOf("*/", i + 2);
      i = fim === -1 ? sql.length : fim + 2;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      atual += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const dolar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(resto);
    if (dolar) {
      const tag = dolar[0];
      const fim = sql.indexOf(tag, i + tag.length);
      const ate = fim === -1 ? sql.length : fim + tag.length;
      atual += sql.slice(i, ate);
      i = ate;
      continue;
    }
    // Linhas de meta-comando do psql (\set, \echo) são ignoradas.
    if (c === "\\" && (i === 0 || sql[i - 1] === "\n")) {
      const fim = sql.indexOf("\n", i);
      i = fim === -1 ? sql.length : fim;
      continue;
    }
    if (c === ";") {
      if (atual.trim()) comandos.push(atual.trim());
      atual = "";
      i++;
      continue;
    }
    atual += c;
    i++;
  }
  if (atual.trim()) comandos.push(atual.trim());
  return comandos;
}

async function conectar(database) {
  const client = new Client({ ...BASE, database });
  await client.connect();
  return client;
}

async function rodarArquivo(client, arquivo, { mostrarNotices = false } = {}) {
  const sql = fs.readFileSync(arquivo, "utf8");
  const ouvinte = (msg) => {
    if (mostrarNotices && /^ok - /.test(msg.message)) console.log("  " + msg.message);
  };
  client.on("notice", ouvinte);
  try {
    for (const comando of dividirSql(sql)) {
      try {
        await client.query(comando);
      } catch (erro) {
        erro.message = `${path.basename(arquivo)}: ${erro.message}\n--- comando ---\n${comando.slice(0, 600)}`;
        throw erro;
      }
    }
  } finally {
    client.removeListener("notice", ouvinte);
  }
}

// ------------------------------------------------------------
// Concorrência: duas conexões tentando reservar ao mesmo tempo.
// ------------------------------------------------------------
async function prepararConcorrencia(db) {
  await db.query(`
    insert into auth.users (email, raw_user_meta_data) values
      ('conc.1@teste.com', '{"nome":"Conc Um"}'),
      ('conc.2@teste.com', '{"nome":"Conc Dois"}')
    on conflict (email) do nothing;

    insert into public.especialidades (nome) values ('Conc Última Vaga'), ('Conc Duplo Clique'), ('Conc Remarcar')
    on conflict do nothing;

    insert into public.profissionais (nome, especialidade_id, unidade_id)
    select v.nome, (select id from public.especialidades where nome = v.esp), (select id from public.unidades order by nome limit 1)
    from (values ('Carla Conc', 'Conc Última Vaga'), ('Davi Conc', 'Conc Duplo Clique'), ('Elisa Conc', 'Conc Remarcar')) v(nome, esp)
    where not exists (select 1 from public.profissionais p where p.nome = v.nome);

    -- 1 vaga para "última vaga"; 2 para "duplo clique"; 3 para "remarcar"
    insert into public.agenda_medica (profissional_id, especialidade_id, unidade_id, data_hora)
    select p.id, p.especialidade_id, p.unidade_id, date_trunc('hour', now()) + make_interval(days => 10, hours => h)
    from public.profissionais p
    cross join generate_series(0, 3) h
    where (p.nome = 'Carla Conc' and h = 0) or (p.nome = 'Davi Conc' and h in (2, 3)) or (p.nome = 'Elisa Conc' and h in (1, 2, 3))
    on conflict do nothing;

    select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'conc.1@teste.com'))::text, false);
    select public.salvar_meus_dados('(11) 91111-2222', '1980-01-01', '935.411.347-80');
    select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'conc.2@teste.com'))::text, false);
    select public.salvar_meus_dados('(11) 93333-4444', '1981-01-01', '071.329.250-40');
    select set_config('request.jwt.claims', '', false);
  `);
}

/** Abre uma transação como o paciente, executa o SQL e segura a transação por `espera` segundos. */
async function comoPaciente(email, sql, params, espera) {
  const c = await conectar(DB);
  try {
    await c.query("begin");
    await c.query(
      "select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = $1))::text, true)",
      [email],
    );
    await c.query("set local role authenticated");
    const r = await c.query(sql, params);
    if (espera) await c.query("select pg_sleep($1)", [espera]);
    await c.query("commit");
    return { ok: true, linhas: r.rows };
  } catch (erro) {
    await c.query("rollback").catch(() => {});
    return { ok: false, erro: erro.message };
  } finally {
    await c.end();
  }
}

const reservar = (email, especialidade, espera, extra = "") =>
  comoPaciente(
    email,
    `select id_consulta, data_hora from public.agendar_por_especialidade((select id from public.especialidades where nome = $1)${extra})`,
    [especialidade],
    espera,
  );

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function testarConcorrencia(db) {
  let falhas = 0;
  const verificar = (cond, desc) => {
    console.log(`  ${cond ? "ok" : "FALHOU:"} - ${desc}`);
    if (!cond) falhas++;
  };
  const ativas = async (esp) =>
    Number(
      (
        await db.query(
          `select count(*) from public.consultas c join public.especialidades e on e.id = c.especialidade_id
           where e.nome = $1 and c.status <> 'cancelada'`,
          [esp],
        )
      ).rows[0].count,
    );

  await prepararConcorrencia(db);

  // A) dois pacientes, uma vaga: o 1º segura a transação; o 2º chega no meio.
  const a1 = reservar("conc.1@teste.com", "Conc Última Vaga", 1.5);
  await pausa(400);
  const a2 = reservar("conc.2@teste.com", "Conc Última Vaga", 0);
  const [ra1, ra2] = await Promise.all([a1, a2]);
  verificar(ra1.ok, "última vaga: o primeiro paciente reserva");
  verificar((await ativas("Conc Última Vaga")) === 1, "última vaga: só uma reserva para dois pacientes simultâneos");
  verificar(!ra2.ok && /Não há horários livres/.test(ra2.erro), `o segundo paciente recebe "não há horários livres" (${ra2.erro || "reservou!"})`);

  // B) mesmo paciente, duas requisições ao mesmo tempo (duplo clique / duas abas).
  const b1 = reservar("conc.1@teste.com", "Conc Duplo Clique", 1.5);
  await pausa(400);
  const b2 = reservar("conc.1@teste.com", "Conc Duplo Clique", 0);
  const [rb1, rb2] = await Promise.all([b1, b2]);
  verificar(rb1.ok && !rb2.ok, "duplo clique: a segunda requisição é recusada");
  verificar((await ativas("Conc Duplo Clique")) === 1, "duplo clique: o mesmo paciente fica com uma consulta só");

  // C) sem espera: 2 pacientes disparando juntos em 2 vagas -> horários diferentes.
  await db.query(`
    insert into public.agenda_medica (profissional_id, especialidade_id, unidade_id, data_hora)
    select p.id, p.especialidade_id, p.unidade_id, date_trunc('hour', now()) + make_interval(days => 11, hours => h)
    from public.profissionais p cross join generate_series(0, 1) h
    where p.nome = 'Carla Conc' on conflict do nothing;
    update public.consultas set status = 'cancelada'
    where especialidade_id = (select id from public.especialidades where nome = 'Conc Última Vaga');
  `);
  const [rc1, rc2] = await Promise.all([
    reservar("conc.1@teste.com", "Conc Última Vaga", 0.3),
    reservar("conc.2@teste.com", "Conc Última Vaga", 0.3),
  ]);
  const horarios = [rc1, rc2].filter((r) => r.ok).map((r) => new Date(r.linhas[0].data_hora).getTime());
  verificar(horarios.length >= 1 && new Set(horarios).size === horarios.length, "disparos simultâneos nunca recebem o mesmo horário");

  // D) remarcação concorrente com um agendamento: a original segue valendo se a nova falhar.
  const original = await reservar("conc.2@teste.com", "Conc Remarcar", 0);
  verificar(original.ok, "remarcar: consulta original criada");
  const idOriginal = original.ok ? original.linhas[0].id_consulta : null;
  // Ocupa as duas vagas restantes com o paciente 1 (uma segurando a transação).
  const ocupar = reservar("conc.1@teste.com", "Conc Remarcar", 1.5);
  await pausa(400);
  const remarcar = await comoPaciente(
    "conc.2@teste.com",
    `select * from public.agendar_por_especialidade((select id from public.especialidades where nome = 'Conc Remarcar'),
       _a_partir_de => (now() at time zone 'America/Sao_Paulo')::date + 10, _remarcar_consulta_id => $1)`,
    [idOriginal],
    0,
  );
  await ocupar;
  const statusOriginal = (await db.query("select status::text from public.consultas where id = $1", [idOriginal])).rows[0]?.status;
  verificar(
    remarcar.ok ? statusOriginal === "cancelada" : statusOriginal === "agendada",
    `remarcar sob concorrência: ${remarcar.ok ? "nova vaga garantida e antiga cancelada" : "falhou e a original continua agendada"}`,
  );

  return falhas;
}

async function main() {
  const admin = await conectar("postgres");
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.query(`create database ${DB} encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`);
  await admin.end();

  const db = await conectar(DB);
  try {
    await rodarArquivo(db, path.join(RAIZ, "supabase/tests/00_supabase_stub.sql"));
    const migrations = fs.readdirSync(path.join(RAIZ, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
    for (const m of migrations) {
      await rodarArquivo(db, path.join(RAIZ, "supabase/migrations", m));
    }
    console.log(`Migrations aplicadas em ${DB} (${migrations.length} arquivos)`);

    // Reaplicar a última migration tem de ser seguro (idempotência).
    await rodarArquivo(db, path.join(RAIZ, "supabase/migrations", migrations[migrations.length - 1]));
    console.log("  ok - a última migration pode ser executada de novo sem erro");

    const testes = fs.readdirSync(path.join(RAIZ, "supabase/tests")).filter((f) => f.endsWith(".test.sql")).sort();
    for (const t of testes) {
      console.log(`# ${t}`);
      await rodarArquivo(db, path.join(RAIZ, "supabase/tests", t), { mostrarNotices: true });
      await db.query("reset role; select set_config('request.jwt.claims', '', false)");
    }

    console.log("# concorrência");
    const falhas = await testarConcorrencia(db);
    if (falhas > 0) {
      console.error(`TESTES DE BANCO: ${falhas} falha(s) de concorrência`);
      process.exitCode = 1;
      return;
    }
    console.log("TODOS OS TESTES DE BANCO PASSARAM");
  } finally {
    await db.end();
  }
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
