const fs = require('node:fs');
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
// Requer servidor em BASE_URL e contas de um ambiente de teste.
// Arquivo JSON: [{ role, email, password }]. Nunca versionar credenciais.
const arquivoContas = process.env.TEST_ACCOUNTS_FILE || '.contas-teste.local.json';
if (!fs.existsSync(arquivoContas)) {
 console.error('Informe TEST_ACCOUNTS_FILE com as contas de teste. As contas temporárias da revisão foram removidas.');
 process.exit(1);
}
const contas = JSON.parse(fs.readFileSync(arquivoContas, 'utf8').replace(/^\uFEFF/, ''));
const rotas = {
 admin: ['/admin','/admin/pacientes','/admin/profissionais','/admin/especialidades','/admin/unidades','/admin/agenda','/admin/tarefas'],
 gestor: ['/gestor','/gestor/agenda','/gestor/tarefas'],
 medico: ['/medico','/medico/pacientes'],
 enfermeiro: ['/enfermagem'],
 recepcionista: ['/recepcao','/recepcao/pacientes','/recepcao/agenda','/recepcao/tarefas'],
 paciente: ['/paciente','/paciente/historico','/paciente/meus-dados','/paciente/agendar'],
};
(async () => {
 const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 const browser = await puppeteer.launch({ executablePath, headless: true });
 const base = process.env.BASE_URL || 'http://127.0.0.1:3200';
 try {
  for (const conta of contas) {
   const context = await browser.createBrowserContext();
   try {
    const page = await context.newPage();
    const errors = [];
    const external = [];
    if (process.env.OFFLINE_TEST === '1') {
     await page.setRequestInterception(true);
     page.on('request', request => {
      const url = request.url();
      if (/^https?:/.test(url) && new URL(url).origin !== new URL(base).origin) { external.push(url); return request.abort(); }
      return request.continue();
     });
    }
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + (conta.role === 'medico' ? '/portal-medico' : '/portal-paciente'), {waitUntil:'networkidle2'});
    assert.equal(await page.$$eval('aside[aria-label="Agendamentos e serviços"]', els => els.length), 0, 'Login não deve ter painel flutuante sobre o formulário');
    await page.type('input[type=email]', conta.email);
    await page.type('input[type=password]', conta.password);
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle2',timeout:45000}), page.click('form button[type=submit]')]);
    assert(!new URL(page.url()).pathname.startsWith('/portal-'), `${conta.role}: login não concluiu`);
    for (const rota of rotas[conta.role]) {
     const response = await page.goto(base + rota, {waitUntil:'networkidle2',timeout:45000});
     assert(response.status() < 400, `${rota}: HTTP ${response.status()}`);
     const body = await page.$eval('body', e => e.innerText);
     assert(!/Application error|Internal Server Error|Digest:/i.test(body), `${rota}: erro de renderização`);
     const finalPath = new URL(page.url()).pathname;
     assert(finalPath === rota || (rota === '/paciente/agendar' && finalPath === '/paciente/meus-dados'), `${rota}: destino inesperado ${finalPath}`);
     assert.equal(errors.length, 0, `${rota}: ${errors.join(', ')}`);
     console.log(`OK ${conta.role}: ${rota}`);
    }
    if (process.env.TEST_PATIENT_ID && ['admin','medico'].includes(conta.role)) {
     const rota = `/${conta.role}/pacientes/${process.env.TEST_PATIENT_ID}`;
     const response = await page.goto(base + rota, {waitUntil:'networkidle2'});
     assert.equal(response.status(), 200, `${rota}: ficha/prontuário`);
     assert((await page.$eval('body', e=>e.innerText)).includes('Teste ClinicaFlow paciente'), 'Ficha deve exibir o paciente de teste');
     console.log(`OK ${conta.role}: ficha individual`);
    }
    const areaProibida = conta.role === 'admin' ? '/medico' : '/admin';
    await page.goto(base + areaProibida, {waitUntil:'networkidle2'});
    assert.notEqual(new URL(page.url()).pathname, areaProibida, `${conta.role}: bloqueio de outra área`);
    console.log(`OK ${conta.role}: bloqueio de outra área`);
    assert.equal(external.length, 0, `Requisições externas no modo offline: ${external.join(', ')}`);
   } finally { await context.close(); }
  }
 } finally { await browser.close(); }
})().catch(error => {console.error(error.message);process.exitCode=1});
