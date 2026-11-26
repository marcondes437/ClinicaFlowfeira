const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function main() {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync), headless: true });
  try {
    const page = await browser.newPage();
    const errors = [], external = [], mutations = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.method() !== 'GET') mutations.push(request.url());
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) { external.push(request.url()); return request.abort(); }
      return request.continue();
    });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(base + '/apresentacao', { waitUntil: 'networkidle2' });
    assert.equal(await page.$eval('select', el => el.value), '270');
    assert.equal((await page.$$('button[aria-label^="Ir para"]')).length, 10);
    await page.waitForFunction(() => document.querySelector('img[src*="/apresentacao/"]').complete && document.querySelector('img[src*="/apresentacao/"]').naturalWidth > 0);
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Começar apresentação')).click());
    const dir = path.resolve('.local/preview-apresentacao'); fs.mkdirSync(dir, { recursive: true });
    for (const width of [1440, 1920, 390]) {
      await page.setViewport({ width, height: width === 390 ? 844 : 1080 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(dir, `feira-${width}.png`), fullPage: true });
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.click('button[aria-label="Próxima etapa"]');
    assert((await page.$eval('h1', el => el.textContent)).includes('atendimento'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Reiniciar').click());
    assert((await page.$eval('h1', el => el.textContent)).includes('jornada'));
    const session = await page.createCDPSession();
    async function advance(milliseconds) {
      let timer;
      const expired = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Relógio virtual não avançou')), 15000);
        session.once('Emulation.virtualTimeBudgetExpired', resolve);
      });
      await session.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: milliseconds, maxVirtualTimeTaskStarvationCount: 100 });
      try { await expired; } finally { clearTimeout(timer); }
    }
    await advance(28000);
    assert.equal(await page.$eval('button[aria-current="step"]', el => el.getAttribute('aria-label')), 'Ir para O espaço do paciente');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Pausar')).click());
    const paused = await page.$eval('h1', el => el.textContent);
    await advance(60000);
    assert.equal(await page.$eval('h1', el => el.textContent), paused, 'Pausa deve interromper o avanço automático');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Reiniciar').click());
    await advance(273000);
    assert((await page.$eval('body', el => el.innerText)).includes('1 ciclo concluído'), 'Deve reiniciar sozinho após aproximadamente 4min30: ' + await page.$eval('footer', el => el.innerText));
    assert.equal(await page.$eval('button[aria-current="step"]', el => el.getAttribute('aria-label')), 'Ir para Conheça o projeto');
    await page.select('select', '300');
    assert.equal(await page.$eval('select', el => el.value), '300');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Pausar')).click());
    for (const button of await page.$$('button[aria-label^="Ir para"]')) {
      await button.evaluate(el => el.click());
      assert(await page.$eval('img[src*="/apresentacao/"]', el => el.complete && el.naturalWidth > 0));
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(external.length, 0, external.join('\n'));
    assert.equal(mutations.length, 0, 'Apresentação não pode enviar gravações ao servidor');
    console.log('OK: duração 4min30, avanço automático, pausa, reinício, repetição contínua, imagens locais, 390/1440/1920px e zero gravações ou conexões externas.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
