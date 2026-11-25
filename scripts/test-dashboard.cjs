const fs = require("node:fs");
const assert = require("node:assert/strict");
const puppeteer = require("puppeteer-core");

async function main() {
  assert(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD, "Informe TEST_ADMIN_EMAIL e TEST_ADMIN_PASSWORD.");
  const base = process.env.BASE_URL || "http://127.0.0.1:3300";
  const executablePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1050 });
    await page.goto(base + "/portal-paciente", { waitUntil: "networkidle2" });
    await page.type("input[type=email]", process.env.TEST_ADMIN_EMAIL);
    await page.type("input[type=password]", process.env.TEST_ADMIN_PASSWORD);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("form button[type=submit]")]);
    assert.equal(new URL(page.url()).pathname, "/admin");
    for (const dias of [7, 14, 30]) {
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click(`a[href="/admin?dias=${dias}"]`)]);
      await page.waitForFunction(n => document.querySelector(`a[href="/admin?dias=${n}"]`)?.getAttribute("aria-current") === "page", {}, dias);
      assert((await page.$eval("main", e => e.innerText)).includes(`Próximos ${dias} dias`));
      console.log(`OK período ${dias} dias`);
    }
    await page.evaluate(() => {
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { blob.text().then(text => { window.__csvDashboard = text; }); return original(blob); };
    });
    const cdp = await page.createCDPSession();
    await cdp.send("Page.setDownloadBehavior", { behavior: "deny" });
    await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.includes("Exportar CSV")).click());
    await page.waitForFunction(() => window.__csvDashboard);
    const csv = await page.evaluate(() => window.__csvDashboard);
    assert(csv.includes('"Próximos 30 dias"'));
    assert(csv.includes('"Especialidade";"Vagas disponíveis"'));
    assert(csv.includes("Cardiologia"));
    console.log("OK CSV: período, cabeçalho e dados reais");
    await page.click('button[aria-pressed="false"]');
    assert((await page.$eval('button[aria-pressed="true"]', e => e.textContent)).includes("Próximos"));
    await page.type("#dashboard-busca", "zzzz inexistente");
    await page.select("#dashboard-status", "confirmada");
    assert((await page.$eval("main", e => e.innerText)).includes("Nenhum atendimento corresponde aos filtros"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent === "Limpar filtros").click());
    assert.equal(await page.$eval("#dashboard-busca", e => e.value), "");
    assert.equal(await page.$eval("#dashboard-status", e => e.value), "");
    console.log("OK abas, busca, filtro de situação e limpeza");
    await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === "/admin" && r.request().method() === "GET" && r.status() === 200),
      page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent === "Atualizar dados").click()),
    ]);
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "Atualizar dados" && !b.disabled));
    console.log("OK atualização de dados");
    for (const width of [1440, 1024, 768, 390, 360]) {
      await page.setViewport({ width, height: 1050 });
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow em ${width}px`);
      console.log(`OK layout ${width}px`);
      if (width === 1440 || width === 390) await page.screenshot({ path: `docs/dashboard-funcoes-${width}.png`, fullPage: true });
    }
    for (const [rota, mensagem] of [["/admin/pacientes?incompletos=1", "Mostrando pacientes ativos com cadastro incompleto"], ["/admin/profissionais?sem_acesso=1", "Mostrando profissionais ativos sem login vinculado"]]) {
      const response = await page.goto(base + rota, { waitUntil: "networkidle2" });
      assert.equal(response.status(), 200);
      assert((await page.$eval("main", e => e.innerText)).includes(mensagem));
      console.log(`OK pendência ${rota}`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
