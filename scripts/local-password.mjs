import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import readline from 'node:readline/promises';
import pg from 'pg';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, '.local/database.json'), 'utf8'));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let db;
try {
  const email = (await rl.question('E-mail da conta local: ')).trim().toLowerCase();
  const password = await rl.question('Nova senha (8–72 caracteres, letras e números): ');
  if (password.length < 8 || password.length > 72 || !/[a-z]/i.test(password) || !/[0-9]/.test(password)) throw new Error('Senha inválida.');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = salt + ':' + (await promisify(crypto.scrypt)(password, salt, 64)).toString('hex');
  db = new pg.Client(config); await db.connect(); await db.query('begin');
  const { rows } = await db.query('update auth.users set password_hash=$1 where email=$2 returning id', [hash, email]);
  if (!rows.length) throw new Error('Conta não encontrada.');
  await db.query('delete from auth.local_sessions where user_id=$1', [rows[0].id]);
  await db.query('commit'); console.log('Senha redefinida. Entre novamente no portal.');
} catch (e) { if (db) await db.query('rollback').catch(() => {}); console.error(e.message); process.exitCode = 1; }
finally { rl.close(); if (db) await db.end(); }
