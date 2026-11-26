const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const puppeteer = require('puppeteer-core');
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function main() {
  const db = new Client(JSON.parse(fs.readFileSync('.local/database.json', 'utf8'))); await db.connect();
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  const users = [], professionals = [], patients = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const dir = path.resolve('.local/preview-medico'); fs.mkdirSync(dir, { recursive: true });
  async function go(route) { return page.goto(base + route, { waitUntil: 'networkidle2' }); }
  async function notFound(route) {
    const response = await go(route);
    // With a loading boundary, Next can stream the 404 UI after HTTP 200 headers.
    assert([200,404].includes(response.status()));
    const body = await page.$eval('body', el => el.innerText);
    assert.match(body, /404|could not be found|não encontrad/i);
    assert(!body.includes('Paciente Fora Do Vínculo'));
    assert.equal((await page.$$('textarea[name="descricao"]')).length, 0);
  }
  async function button(label) {
    await page.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === label && !b.disabled), {}, label);
    await page.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label).click(), label);
  }
  async function field(selector, value) { await page.$eval(selector, (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value); }
  async function waitDb(sql, args, expected) { for (let i = 0; i < 40; i++) { const value = (await db.query(sql, args)).rows[0]?.value; if (value === expected) return; await new Promise(r => setTimeout(r, 100)); } assert.fail('Estado não persistido: ' + sql); }
  try {
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
    await page.setViewport({ width: 1440, height: 1000 }); await go('/portal-medico');
    for (const width of [390, 768, 1440]) {
      await page.setViewport({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Login médico ' + width);
      await page.screenshot({ path: path.join(dir, `login-${width}.png`), fullPage: true });
    }
    await page.type('input[type="password"]', 'SenhaVisual2026'); await button('Mostrar senha');
    assert.equal(await page.$eval('#medico-senha', el => el.type), 'text'); await button('Ocultar senha');
    await page.$eval('#medico-senha', el => el.value = '');
    const email = `medico-check-${Date.now()}@teste.local`;
    const created = await page.evaluate(async email => (await fetch('/api/local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signup', payload: { email, password: 'MedicoTeste2026', options: { data: { nome: 'Eduardo Almeida', consentimento_lgpd_em: new Date().toISOString() } } } }) })).json(), email);
    assert.equal(created.error, null); const user = created.data.user; users.push(user.id);
    await db.query('delete from public.pacientes where user_id=$1', [user.id]);
    await db.query("update public.user_roles set role='medico' where user_id=$1", [user.id]);
    for (let i = 0; i < 2; i++) {
      const u = (await db.query('insert into auth.users(email,raw_user_meta_data) values($1,$2) returning id', [`patient-med-${Date.now()}-${i}@teste.local`, JSON.stringify({ nome: i ? 'Paciente Fora Do Vínculo' : 'Mariana Gonçalves' })])).rows[0]; users.push(u.id);
      const p = (await db.query('select id from public.pacientes where user_id=$1', [u.id])).rows[0]; patients.push(p.id);
      await db.query("update public.pacientes set celular='11987654321',data_nascimento='1990-03-10' where id=$1", [p.id]);
      const prof = (await db.query("insert into public.profissionais(user_id,nome,especialidade_id,unidade_id) values($1,$2,(select id from public.especialidades where nome='Cardiologia'),(select id from public.unidades where status='ativo' order by nome limit 1)) returning id,especialidade_id,unidade_id", [i ? null : user.id, i ? 'Outro Médico Teste' : 'Dr. Eduardo Almeida'])).rows[0]; professionals.push(prof);
    }
    const doctor = professionals[0], other = professionals[1];
    const dates = (await db.query("select (now() at time zone 'America/Sao_Paulo')::date::text as today, ((now() at time zone 'America/Sao_Paulo')::date+1)::text as tomorrow, ((now() at time zone 'America/Sao_Paulo')::date+5)::text as later")).rows[0];
    async function consult(patient, prof, date, hour, status = 'confirmada') {
      return (await db.query("insert into public.consultas(paciente_id,profissional_id,especialidade_id,unidade_id,data_hora,status,motivo) values($1,$2,$3,$4,($5::date+make_interval(hours=>$6)) at time zone 'America/Sao_Paulo',$7,'Consulta de acompanhamento (teste)') returning id", [patient, prof.id, prof.especialidade_id, prof.unidade_id, date, hour, status])).rows[0];
    }
    // Midnight is already in the past at any time of the test day; future visits cannot be started.
    const today = await consult(patients[0], doctor, dates.today, 0);
    await consult(patients[0], doctor, dates.tomorrow, 10);
    const denied = await consult(patients[1], other, dates.today, 11);
    await go('/medico');
    const calendar = 'section[aria-label="Calendário mensal do médico"]';
    assert.equal((await page.$$(calendar + ' a[data-has-appointments="true"]')).length, dates.today.slice(0,7) === dates.tomorrow.slice(0,7) ? 2 : 1);
    assert.equal((await page.$$(calendar + ' a[aria-current="date"]')).length, 1);
    await page.click('details[class*=calendarPicker] > summary');
    const nextMonth = await page.$eval(calendar + ' a[aria-label="Próximo mês"]', el => el.getAttribute('href'));
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click(calendar + ' a[aria-label="Pr\u00f3ximo m\u00eas"]')]);
    assert(page.url().endsWith(nextMonth));
    assert((await page.$eval('#dia-agenda', el => el.value)).endsWith('-01'));
    await go('/medico');
    await page.click('details[class*=calendarPicker] > summary');
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click(calendar+' a[href="/medico?dia='+dates.tomorrow+'"]')]);
    assert.equal(await page.$eval('#dia-agenda',el=>el.value),dates.tomorrow);
    assert.equal((await page.$$('section[aria-labelledby="agenda-dia"] li[data-consulta-id]')).length,1);
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle2'}),page.click('a[aria-label="Dia anterior"]')]);
    assert.equal(await page.$eval('#dia-agenda',el=>el.value),dates.today);
    await page.$eval('#registros-recentes', el => el.scrollIntoView({block:'center'}));
    await button('Pausar animações');
    await page.waitForFunction(() => document.querySelector('[data-motion-paused="true"]') && document.querySelector('[data-motion-paused="true"]').getAnimations({subtree:true}).every(a=>a.playState!=='running'));
    await button('Ativar animações');
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.waitForFunction(() => document.querySelector('[data-motion-paused="true"]') && document.querySelector('[data-motion-paused="true"]').getAnimations({subtree:true}).every(a=>a.playState!=='running'));
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
    await page.evaluate(() => scrollTo(0,0));
    console.log('OK: entrada ao rolar, pausa, retomada e preferência por reduzir animações.');
    assert.equal((await page.$$('aside')).length, 0);
    assert((await page.$eval('body', el => el.innerText)).includes('Meus dados na clínica'));
    assert((await page.$eval('body', el => el.innerText)).includes('Mariana Gonçalves'));
    assert(!(await page.$eval('body', el => el.innerText)).includes('Paciente Fora Do Vínculo'));
    await page.evaluate(() => [...document.querySelectorAll('[aria-label="Filtrar atendimentos por situação"] button')].find(b => b.textContent.includes('Concluídos')).click());
    assert.equal((await page.$$('section[aria-labelledby="agenda-dia"] li[data-consulta-id]')).length, 0);
    await button('Limpar filtros');
    await page.type('#buscar-na-agenda', 'goncalves');
    assert.equal((await page.$$('section[aria-labelledby="agenda-dia"] li[data-consulta-id]')).length, 1);
    await page.click('section[aria-labelledby="agenda-dia"] input[type="checkbox"]');
    assert(!(await page.$eval('section[aria-labelledby="agenda-dia"]', el => el.innerText)).includes('Consulta de acompanhamento (teste)'));
    await page.type('#buscar-na-agenda', 'naoexiste');
    assert.equal((await page.$$('section[aria-labelledby="agenda-dia"] li[data-consulta-id]')).length, 0);
    await button('Limpar filtros');
    await page.click('section[aria-labelledby="agenda-dia"] input[type="checkbox"]');
    await page.screenshot({ path: path.join(dir, 'agenda-desktop.png'), fullPage: true });
    await go('/medico?dia=' + dates.tomorrow); assert.equal(await page.$eval('#dia-agenda', el => el.value), dates.tomorrow);
    assert(await page.$('li[data-consulta-id]'));
    await notFound('/medico/pacientes/' + patients[1]);
    await notFound('/medico/pacientes/' + patients[0] + '?consulta=' + denied.id);
    await notFound('/medico/pacientes/invalid-id');
    await go('/medico/pacientes?busca=goncalves'); assert((await page.$eval('body', e => e.innerText)).includes('Mariana Gonçalves'));
    await go('/medico/pacientes/' + patients[0] + '?consulta=' + today.id);
    await page.select('section[aria-label="Atendimento selecionado"] select[name="status"]', 'em_atendimento');
    await waitDb('select status::text as value from public.consultas where id=$1', [today.id], 'em_atendimento');
    const note = 'Registro clínico de teste.\nAcompanhamento registrado para validar a persistência.';
    await page.type('textarea[name="descricao"]', note);
    await page.$eval('input[name="consulta_id"]', (el, id) => el.value = id, denied.id);
    await button('Registrar evolução');
    await page.waitForFunction(() => document.body.innerText.includes('não pertence a este paciente'));
    assert.equal(await page.$eval('textarea[name="descricao"]', el => el.value), note, 'Falha não deve apagar o texto clínico');
    assert.equal((await db.query('select count(*)::int as total from public.evolucoes where paciente_id=$1', [patients[0]])).rows[0].total, 0);
    await page.$eval('input[name="consulta_id"]', (el, id) => el.value = id, today.id);
    await button('Registrar evolução');
    await waitDb('select count(*)::int as value from public.evolucoes where paciente_id=$1 and consulta_id=$2 and autor_id=$3', [patients[0], today.id, user.id], 1);
    await page.reload({ waitUntil: 'networkidle2' }); assert((await page.$eval('body', e => e.innerText)).includes(note));
    await page.screenshot({ path: path.join(dir, 'prontuario-desktop.png'), fullPage: true });
    await page.select('section[aria-label="Atendimento selecionado"] select[name="status"]', 'concluida');
    await waitDb('select status::text as value from public.consultas where id=$1', [today.id], 'concluida');
    await go('/medico');
    assert((await page.$eval('#registros-recentes', el => el.innerText)).includes('Registro clínico de teste.'));
    await button('↻ Atualizar painel'); await page.waitForNetworkIdle();
    console.log('OK: agenda por data, isolamento de pacientes, busca sem acentos, iniciar/concluir atendimento e evolução persistida com consulta e autor corretos.');
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      for (const route of ['/medico', '/medico/pacientes', '/medico/pacientes/' + patients[0] + '?consulta=' + today.id]) {
        await go(route); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ' ' + width);
      }
      if (width === 390) await page.screenshot({ path: path.join(dir, 'prontuario-celular.png'), fullPage: true });
    }
    await go('/medico');
    await page.evaluate(() => [...document.querySelectorAll('details')].forEach(el => el.open = true));
    await field('#disp-inicio', dates.later); await field('#disp-fim', dates.later);
    await page.$$eval('input[name="dias"]', els => els.forEach(el => { if (!el.checked) el.click(); }));
    await button('Liberar horários');
    await waitDb("select exists(select 1 from public.agenda_medica where profissional_id=$1 and status='disponivel') as value", [doctor.id], true);
    const free = (await db.query("select count(*)::int as total from public.agenda_medica where profissional_id=$1 and status='disponivel'", [doctor.id])).rows[0].total; assert(free > 0);
    await field('#bloq-de', dates.later); await field('#bloq-ate', dates.later); await button('Registrar bloqueio');
    await waitDb('select count(*)::int as value from public.agenda_bloqueios where profissional_id=$1', [doctor.id], 1);
    console.log('OK: liberação de horários e bloqueio pelo formulário do médico.');
    await db.query("update public.profissionais set status='inativo' where id=$1", [doctor.id]);
    await go('/medico/pacientes'); assert((await page.$eval('body', el => el.innerText)).includes('profissional ativo')); assert(!(await page.$eval('body', el => el.innerText)).includes('Mariana Gonçalves'));
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('OK: 360/390/768/1440px, prontuário restrito e profissional inativo sem acesso à lista.');
  } finally {
    await browser.close();
    for (const p of patients) { await db.query('delete from public.evolucoes where paciente_id=$1', [p]); await db.query('delete from public.consultas where paciente_id=$1', [p]); }
    for (const p of professionals) { await db.query('delete from public.agenda_bloqueios where profissional_id=$1', [p.id]); await db.query('delete from public.agenda_medica where profissional_id=$1', [p.id]); await db.query('delete from public.profissionais where id=$1', [p.id]); }
    for (const id of users) await db.query('delete from auth.users where id=$1', [id]);
    await db.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
