const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pg = require('pg');
const puppeteer = require('puppeteer-core');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../.local/database.json'), 'utf8'));
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
async function main() {
 const db = new pg.Client(config); await db.connect();
 const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 const browser = await puppeteer.launch({ executablePath, headless: true });
 const external = [], errors = [];
 const email = `offline-${Date.now()}@teste.local`;
 const { rows: [doctor] } = await db.query("select p.id,p.especialidade_id from public.profissionais p join auth.users u on u.id=p.user_id where u.email='medico@clinicaflow.local'");
 const existingSlots = (await db.query('select id from public.agenda_medica where profissional_id=$1', [doctor.id])).rows.map(r => r.id);
 let createdSlots = [];
 async function page(context) {
  const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.setRequestInterception(true);
  p.on('request', req => { if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== new URL(base).origin) { external.push(req.url()); return req.abort(); } return req.continue(); });
  return p;
 }
 async function button(p, label) { await p.waitForFunction(text => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === text && !el.disabled), {}, label).catch(async e=>{console.log('Falhou botao:',label,await p.$eval('body',e=>e.innerText));throw e;}); await p.evaluate(text => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text).click(), label); }
 async function field(p, selector, value) { await p.$eval(selector, (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value); }
 async function text(p, value) { await p.waitForFunction(value => document.body.innerText.includes(value), { timeout: 30000 }, value).catch(async e=>{console.log('Falhou texto:',value,await p.$eval('body',e=>e.innerText));throw e;}); }
 try {
  const doctorContext = await browser.createBrowserContext(); const d = await page(doctorContext);
  await d.goto(base + '/portal-medico', { waitUntil: 'networkidle2' });
  await d.type('input[type=email]', 'medico@clinicaflow.local'); await d.type('input[type=password]', 'ClinicaLocal2026');
  await Promise.all([d.waitForNavigation({ waitUntil: 'networkidle2' }), d.click('button[type=submit]')]);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 5 * 86400000));
  await field(d, '#disp-inicio', date); await field(d, '#disp-fim', date);
  await field(d, '#disp-h1', '08:00'); await field(d, '#disp-h2', '11:00');
  await d.$$eval('input[name=dias]', els => els.forEach(el => { if (!el.checked) el.click(); }));
  await button(d, 'Liberar horários'); await d.waitForFunction(() => /liberado|Nenhum horário novo/.test(document.body.innerText));
  createdSlots = (await db.query("select id from public.agenda_medica where profissional_id=$1 and (data_hora at time zone 'America/Sao_Paulo')::date=$2::date and not (id=any($3::uuid[]))", [doctor.id, date, existingSlots])).rows.map(r => r.id);
  console.log('OK offline: médico libera horários pelo formulário.');
  const context = await browser.createBrowserContext(); const p = await page(context); await p.setViewport({ width: 390, height: 844 });
  await p.goto(base + '/cadastro', { waitUntil: 'networkidle2' });
  await p.type('#nome', 'Paciente Offline Teste'); await p.type('#email', email); await p.type('#senha', 'TesteOffline2026'); await p.click('input[type=checkbox]');
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }), p.click('button[type=submit]')]);
  assert.equal(new URL(p.url()).pathname, '/paciente/meus-dados');
  let cpf = String(Date.now()).slice(-9);
  for (let weight = 10; weight <= 11; weight++) { let sum = 0; for (let i = 0; i < cpf.length; i++) sum += Number(cpf[i]) * (weight - i); const digit = 11 - sum % 11; cpf += digit >= 10 ? '0' : String(digit); }
  await p.type('#celular', '11987654321'); await field(p, '#data_nascimento', '1990-01-01'); await p.type('#cpf', cpf);
  await button(p, 'Salvar e continuar'); await p.waitForFunction(() => location.pathname === '/paciente');
  console.log('OK offline: cadastro, sessão e complementação dos dados pelo celular.');
  await p.goto(base + '/paciente/agendar?especialidade=' + doctor.especialidade_id, { waitUntil: 'networkidle2' });
  await button(p, "Pesquisar disponibilidade");
  await p.waitForSelector('button[data-slot-id]'); const availableChoices = await p.$$('button[data-slot-id]'); await availableChoices[2].click(); const selectedSlot = await p.$eval('input[name=agenda_id]', e=>e.value);
  await button(p, 'Confirmar agendamento'); await text(p, 'Consulta marcada');
  const { rows: [consultation] } = await db.query('select c.id,c.data_hora,c.paciente_id from public.consultas c join public.pacientes p on p.id=c.paciente_id where p.email=$1 and c.status=\'agendada\'', [email]);
  assert(consultation); assert.equal((await db.query('select consulta_id from public.agenda_medica where id=$1',[selectedSlot])).rows[0].consulta_id,consultation.id); console.log('OK offline: consulta criada pelo formulário e confirmada no PostgreSQL.');
  await p.goto(base + '/paciente/agendar?remarcar=' + consultation.id, { waitUntil: 'networkidle2' });
  await button(p, 'Pesquisar disponibilidade'); await p.waitForSelector('button[data-slot-id]'); await p.click('button[data-slot-id]'); await button(p, 'Confirmar remarcação'); await text(p, 'Consulta remarcada');
  assert.equal((await db.query('select status from public.consultas where id=$1', [consultation.id])).rows[0].status, 'cancelada');
  console.log('OK offline: remarcação preserva a nova reserva e cancela a anterior.');
  await p.goto(base + '/paciente', { waitUntil: 'networkidle2' }); await button(p, 'Cancelar');
  await button(p, 'Sim, cancelar'); await p.waitForNetworkIdle(); console.log('OK: cancelamento enviado pela tela.');
  await p.waitForNetworkIdle();
  assert.equal((await db.query("select count(*)::int as total from public.consultas c join public.pacientes p on p.id=c.paciente_id where p.email=$1 and c.status<>'cancelada'", [email])).rows[0].total, 0);
  await p.reload({ waitUntil: 'networkidle2' }); assert.equal(new URL(p.url()).pathname, '/paciente');
  const forbidden = await p.evaluate(async () => (await fetch('/api/local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'query', payload: { table: 'auth.users' } }) })).status);
  assert.equal(forbidden, 403);
  for (const route of ['/', '/sobre', '/procurar-clinica', '/recuperar-senha']) { const r = await p.goto(base + route, { waitUntil: 'networkidle2' }); assert.equal(r.status(), 200); }
  const changed = await p.evaluate(async () => (await fetch('/api/local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'password', payload: { password: 'SenhaAlterada2026' } }) })).status);
  assert.equal(changed, 200);
  await p.goto(base + '/paciente', { waitUntil: 'networkidle2' }); assert.equal(new URL(p.url()).pathname, '/portal-paciente');
  await p.type('input[type=email]', email); await p.type('input[type=password]', 'SenhaAlterada2026');
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }), p.click('button[type=submit]')]);
  assert.equal(new URL(p.url()).pathname, '/paciente');
  const cookies = await context.cookies(); assert(cookies.find(c => c.name === 'clinicaflow_local_session' && c.httpOnly));
  await p.evaluate(async () => fetch('/api/local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }));
  await p.goto(base + '/paciente', { waitUntil: 'networkidle2' }); assert.equal(new URL(p.url()).pathname, '/portal-paciente');
  const crossOrigin = await fetch(base + '/api/local', { method: 'POST', headers: { Origin: 'https://externo.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', payload: {} }) }); assert.equal(crossOrigin.status, 403);
  assert.equal(errors.length, 0, errors.join(', ')); assert.equal(external.length, 0, external.join(', '));
  console.log('OK offline: cancelamento, persistência, páginas públicas, troca de senha, revogação de sessões, logout, proteção de origem e zero requisições externas.');
 } finally {
  await browser.close();
  // Remove only the synthetic account and slots created by this test.
  await db.query('delete from public.consultas where paciente_id in (select id from public.pacientes where email=$1)', [email]);
  await db.query('delete from auth.users where email=$1', [email]);
  await db.query('delete from public.agenda_medica where profissional_id=$1 and id=any($2::uuid[]) and consulta_id is null', [doctor.id, createdSlots]);
  await db.end();
 }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
