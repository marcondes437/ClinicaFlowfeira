// Refresh the fair presentation with real screens and exclusively synthetic patient data.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function main() {
  const db = new Client(JSON.parse(fs.readFileSync(path.join(root, '.local/database.json'), 'utf8')));
  await db.connect();
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync), headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const dir = path.join(root, 'public', 'apresentacao');
  fs.mkdirSync(dir, { recursive: true });
  let user, patient, professional;
  async function go(route) { await page.goto(base + route, { waitUntil: 'networkidle2' }); }
  async function click(text) {
    await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === text && !b.disabled), {}, text);
    await page.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text).click(), text);
  }
  async function capture(name, selector) {
    if (selector) await page.$eval(selector, el => el.scrollIntoView({ block: 'start' }));
    else await page.evaluate(() => scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 350));
    await page.screenshot({ path: path.join(dir, name + '.webp'), type: 'webp', quality: 88 });
    console.log('Captura: ' + name);
  }
  try {
    await go('/');
    await page.addStyleTag({ content: '[class*="SupportDock_dock"] { display:none!important; }' });
    await capture('inicio');
    await go('/portal-paciente');
    const email = `apresentacao-${Date.now()}@teste.local`;
    const created = await page.evaluate(async email => (await fetch('/api/local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signup', payload: { email, password: 'Apresentacao2026', options: { data: { nome: 'Mariana Oliveira', consentimento_lgpd_em: new Date().toISOString() } } } }) })).json(), email);
    assert.equal(created.error, null);
    user = created.data.user;
    patient = (await db.query('select id from public.pacientes where user_id=$1', [user.id])).rows[0];
    let cpf = String(Date.now()).slice(-9);
    for (let weight = 10; weight <= 11; weight++) { let sum = 0; for (let i = 0; i < cpf.length; i++) sum += Number(cpf[i]) * (weight - i); const digit = 11 - sum % 11; cpf += digit >= 10 ? '0' : String(digit); }
    await go('/paciente/meus-dados');
    await page.type('#celular','11987654321'); await page.type('#cpf',cpf);
    await page.$eval('#data_nascimento', el => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'1990-01-01');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Salvar')).click());
    await page.waitForNetworkIdle();
    assert((await db.query('select cadastro_completo_em from public.pacientes where id=$1',[patient.id])).rows[0].cadastro_completo_em);
    // Use a stable, fictional email on screen, with no personal data from existing accounts.
    await db.query("update public.pacientes set email='mariana@exemplo.local' where id=$1", [patient.id]);
    await db.query("update auth.users set email='mariana-' || id::text || '@exemplo.local' where id=$1", [user.id]);
    professional = (await db.query("insert into public.profissionais(nome,especialidade_id,unidade_id,descricao) values('Dra. Laura Mendes',(select id from public.especialidades where nome='Cardiologia' and status='ativo' limit 1),(select id from public.unidades where status='ativo' order by nome limit 1),'Profissional fictícia, usada apenas na captura da apresentação.') returning id,especialidade_id,unidade_id")).rows[0];
    for (const hour of [9, 10, 14, 15]) await db.query("insert into public.agenda_medica(profissional_id,especialidade_id,unidade_id,data_hora,duracao_minutos) values($1,$2,$3,((now() at time zone 'America/Sao_Paulo')::date+1+make_interval(hours=>$4)) at time zone 'America/Sao_Paulo',30)", [professional.id, professional.especialidade_id, professional.unidade_id, hour]);
    await db.query("insert into public.consultas(paciente_id,profissional_id,especialidade_id,unidade_id,data_hora,status) values($1,$2,$3,$4,now()-interval '20 days','concluida')", [patient.id, professional.id, professional.especialidade_id, professional.unidade_id]);
    await go('/paciente'); await capture('painel');
    await go('/paciente/agendar?especialidade=' + professional.especialidade_id);
    await page.click('#booking-professional');
    await page.evaluate(() => [...document.querySelectorAll('#booking-professional-options button')].find(b => b.textContent.includes('Dra. Laura Mendes')).click());
    await page.click('#booking-date'); await capture('preferencias', '#booking-specialty');
    await page.click('#booking-date'); await click('Pesquisar disponibilidade');
    await page.waitForSelector('button[data-slot-id]'); await capture('horarios', 'section[aria-label="Resultado da pesquisa"]');
    const choices = await page.$$('button[data-slot-id]'); await choices[1].click();
    await page.waitForSelector('#booking-review'); await capture('revisao', '#booking-review');
    await click('Confirmar agendamento');
    await page.waitForFunction(() => document.body.innerText.includes('Consulta marcada'));
    await capture('confirmacao');
    await go('/paciente/historico'); await capture('historico');
    const context = await browser.createBrowserContext();
    const adminPage = await context.newPage(); await adminPage.setViewport({ width: 1440, height: 1000 });
    await adminPage.goto(base + '/portal-paciente');
    const login = await adminPage.evaluate(async () => (await fetch('/api/local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', payload: { email: 'admin@clinicaflow.local', password: 'ClinicaLocal2026' } }) })).json());
    assert.equal(login.error, null);
    await adminPage.goto(base + '/admin/agenda?profissional=' + professional.id, { waitUntil: 'networkidle2' });
    // Capture only the filtered consultations panel: it contains this synthetic patient alone.
    const panel = await adminPage.$('main > section'); assert(panel);
    const panelText = await panel.evaluate(el => el.innerText); assert(panelText.includes('Mariana Oliveira'));
    await panel.screenshot({ path: path.join(dir, 'equipe.webp'), type: 'webp', quality: 88 });
    console.log('Captura: equipe (somente consulta fictícia filtrada)');
  } finally {
    await browser.close();
    if (patient) await db.query('delete from public.consultas where paciente_id=$1', [patient.id]);
    if (professional) { await db.query('delete from public.agenda_medica where profissional_id=$1', [professional.id]); await db.query('delete from public.profissionais where id=$1', [professional.id]); }
    if (user) await db.query('delete from auth.users where id=$1', [user.id]);
    await db.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
