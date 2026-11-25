import { NextResponse, type NextRequest } from 'next/server';
import { execute, pool } from '@/lib/local/database';
import { createSession, passwordHash, passwordMatches, SESSION_COOKIE, sessionUser, tokenHash } from '@/lib/local/session';
import { emailValido, nomeCompletoValido, senhaForte } from '@/lib/validacao';
export const runtime = 'nodejs';
const attempts = new Map<string, { count: number; until: number }>();
const fail = (message: string, status = 400) => NextResponse.json({ data: null, error: { message } }, { status });
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  try { if (!origin || new URL(origin).host !== request.headers.get('host')) return fail('Origem não permitida.', 403); }
  catch { return fail('Origem não permitida.', 403); }
  const reader = request.body?.getReader(); if (!reader) return fail('Dados inválidos.');
  let text = ''; let bytes = 0; const decoder = new TextDecoder();
  try { while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 16384) { await reader.cancel(); return fail('Dados muito longos.', 413); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); } catch { return fail('Dados inválidos.'); } finally { reader.releaseLock(); }
  let body; try { body = JSON.parse(text); } catch { return fail('Dados inválidos.'); }
  const { action, payload = {} } = body ?? {};
  if (!payload || typeof payload !== 'object') return fail('Dados inválidos.');
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const user = await sessionUser(token);
    if (action === 'logout') {
      if (token) await pool().query('delete from auth.local_sessions where token_hash=$1', [tokenHash(token)]);
      const response = NextResponse.json({ error: null }); response.cookies.delete(SESSION_COOKIE); return response;
    }
    if (action === 'query') {
      if (!user) return fail('Sua sessão expirou.', 401);
      // Browser reads are limited to the current user's roles and onboarding status.
      if (payload.table === 'user_roles') return NextResponse.json(await execute(user, { table: 'user_roles', columns: 'role', filters: [{ column: 'user_id', op: 'eq', value: user.id }] }));
      if (payload.table === 'pacientes') return NextResponse.json(await execute(user, { table: 'pacientes', columns: 'cadastro_completo_em', filters: [{ column: 'user_id', op: 'eq', value: user.id }], single: 'optional' }));
      return fail('Consulta não permitida.', 403);
    }
    if (action === 'password') {
      if (!user) return fail('Entre novamente para alterar a senha.', 401);
      if (typeof payload.password !== 'string' || !senhaForte(payload.password)) return fail('Use 8 a 72 caracteres, com letras e números.');
      const db = await pool().connect();
      try {
        await db.query('begin');
        await db.query('update auth.users set password_hash=$1 where id=$2', [await passwordHash(payload.password), user.id]);
        await db.query('delete from auth.local_sessions where user_id=$1', [user.id]);
        await db.query('commit');
      } catch (e) { await db.query('rollback'); throw e; } finally { db.release(); }
      return NextResponse.json({ data: { user }, error: null });
    }
    if (action !== 'login' && action !== 'signup') return fail('Ação não permitida.');
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const password = payload.password;
    if (!emailValido(email) || email.length > 254 || typeof password !== 'string' || password.length > 72) return fail('E-mail ou senha inválidos.');
    const now = Date.now(); for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
    const key = 'auth'; const budget = attempts.get(key) ?? { count: 0, until: now + 60000 }; attempts.set(key, budget);
    if (++budget.count > 30) return fail('Muitas tentativas. Aguarde um minuto.', 429);
    let account;
    if (action === 'signup') {
      const nome = payload.options?.data?.nome;
      if (typeof nome !== 'string' || nome.length > 120 || !nomeCompletoValido(nome) || !senhaForte(password)) return fail('Confira nome completo, e-mail e senha.');
      const consent = payload.options?.data?.consentimento_lgpd_em;
      if (typeof consent !== 'string' || !Number.isFinite(Date.parse(consent))) return fail('Aceite o uso dos dados para criar a conta.');
      const { rows } = await pool().query('insert into auth.users(email,password_hash,raw_user_meta_data) values($1,$2,$3) returning id,email', [email, await passwordHash(password), JSON.stringify({ nome: nome.trim(), consentimento_lgpd_em: new Date().toISOString() })]);
      account = rows[0];
    } else {
      const { rows } = await pool().query('select id,email,password_hash from auth.users where email=$1', [email]);
      const valid = await passwordMatches(password, rows[0]?.password_hash ?? '00000000000000000000000000000000:' + '0'.repeat(128));
      if (!rows[0] || !valid) return fail('E-mail ou senha incorretos.', 401);
      account = { id: rows[0].id, email: rows[0].email };
    }
    const response = NextResponse.json({ data: { user: { ...account, identities: [{ provider: 'local' }] }, session: { user: account } }, error: null });
    response.cookies.set(SESSION_COOKIE, await createSession(account.id), { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 43200 });
    response.headers.set('Cache-Control', 'no-store'); return response;
  } catch (e) {
    const error = e as { code?: string };
    if (error.code === '23505') return fail('Este e-mail já tem uma conta. Entre com sua senha.');
    console.error('Falha na autenticação local', e); return fail('Banco local indisponível. Inicie o sistema com npm run dev.', 503);
  }
}
