#!/usr/bin/env node
/*
 * Teste de responsividade com navegador real (Chrome/Edge já instalado; nada é baixado).
 *
 *  - Sobe `next start` (precisa de `npm run build` antes) ou usa BASE_URL, se informado.
 *  - Abre as páginas públicas em 360, 390, 768 e 1280 px e verifica:
 *      * nenhuma rolagem horizontal na página;
 *      * botões e links principais do formulário com pelo menos 40 px de altura no celular;
 *      * todo campo de formulário visível tem rótulo (acessibilidade).
 *  - Confere que áreas internas (/admin, /paciente, /medico...) redirecionam para o login sem sessão.
 *
 * Variáveis: CHROME_PATH (caminho do navegador), BASE_URL (servidor já rodando), PORTA (padrão 3100).
 * Áreas logadas não são abertas aqui: exigem um Supabase com usuários reais.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const RAIZ = path.join(__dirname, "..");
const PORTA = Number(process.env.PORTA || 3100);
const BASE = (process.env.BASE_URL || `http://127.0.0.1:${PORTA}`).replace(/\/$/, "");

const PAGINAS = ["/", "/portal-paciente", "/cadastro", "/portal-medico", "/agendamento-online", "/recuperar-senha", "/nova-senha", "/sobre", "/procurar-clinica", "/procurar-clinica?busca=inexistente&cidade=teste"];
const LARGURAS = [
  { nome: "celular pequeno", width: 360, height: 740, mobile: true },
  { nome: "celular", width: 390, height: 844, mobile: true },
  { nome: "tablet", width: 768, height: 1024, mobile: true },
  { nome: "desktop", width: 1280, height: 800, mobile: false },
];
const PROTEGIDAS = ["/admin", "/admin/agenda", "/admin/pacientes", "/admin/pacientes/00000000-0000-0000-0000-000000000001", "/admin/profissionais", "/admin/especialidades", "/admin/unidades", "/admin/tarefas", "/paciente", "/paciente/agendar", "/paciente/historico", "/paciente/meus-dados", "/medico", "/medico/pacientes", "/medico/pacientes/00000000-0000-0000-0000-000000000001", "/recepcao", "/recepcao/pacientes", "/recepcao/agenda", "/recepcao/tarefas", "/gestor", "/gestor/agenda", "/gestor/tarefas", "/enfermagem"];

function acharNavegador() {
  const candidatos = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidatos.find((c) => fs.existsSync(c));
}

async function esperarServidor(url, ms = 60000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status > 0) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Servidor não respondeu em ${url}`);
}

async function main() {
  const navegador = acharNavegador();
  if (!navegador) {
    console.log("PULADO: nenhum Chrome/Edge encontrado (defina CHROME_PATH).");
    return;
  }

  let servidor = null;
  if (!process.env.BASE_URL) {
    if (!fs.existsSync(path.join(RAIZ, ".next", "BUILD_ID"))) {
      console.error("Rode `npm run build` antes (ou informe BASE_URL).");
      process.exit(1);
    }
    servidor = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(PORTA), "-H", "127.0.0.1"], {
      cwd: RAIZ,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "ignore",
    });
  }

  let falhas = 0;
  const verificar = (cond, desc) => {
    console.log(`  ${cond ? "ok" : "FALHOU:"} - ${desc}`);
    if (!cond) falhas++;
  };

  const browser = await puppeteer.launch({ executablePath: navegador, headless: true, args: ["--no-sandbox"] });
  try {
    await esperarServidor(BASE + "/portal-paciente");
    const page = await browser.newPage();
    let errosPagina = [];
    page.on("pageerror", (error) => errosPagina.push(error.message));

    for (const tela of LARGURAS) {
      console.log(`# ${tela.nome} (${tela.width}px)`);
      await page.setViewport({ width: tela.width, height: tela.height, isMobile: tela.mobile, hasTouch: tela.mobile, deviceScaleFactor: 1 });
      for (const rota of PAGINAS) {
        errosPagina = [];
        const resp = await page.goto(BASE + rota, { waitUntil: "networkidle2", timeout: 45000 }).catch((e) => ({ erro: e.message }));
        if (resp?.erro || !resp || resp.status() >= 400) {
          verificar(false, `${rota} carrega (${resp?.erro ?? resp.status()})`);
          continue;
        }
        verificar(errosPagina.length === 0, `${rota}: sem erro JavaScript ${errosPagina.join(", ")}`);
        if (["/portal-paciente", "/portal-medico", "/cadastro", "/recuperar-senha", "/nova-senha"].includes(rota)) {
          verificar(await page.$$eval('aside[aria-label="Agendamentos e serviços"]', els => els.length === 0), `${rota}: formulário sem painel flutuante sobre os botões`);
        }
        const m = await page.evaluate(() => {
          const doc = document.scrollingElement || document.documentElement;
          const larguraVisivel = window.innerWidth;
          // Elementos que passam da borda direita (ignorando os escondidos/fixos fora da tela de propósito).
          const vazando = [...document.querySelectorAll("body *")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return r.width > 0 && r.right > larguraVisivel + 1 && s.visibility !== "hidden" && s.position !== "fixed";
            })
            .slice(0, 3)
            .map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}`);
          const pequenos = [...document.querySelectorAll("form button, form input[type=submit]")]
            .filter((el) => el.offsetParent && el.getBoundingClientRect().height < 40)
            .map((el) => (el.textContent || el.value || "").trim().slice(0, 30));
          const semRotulo = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea")]
            .filter((el) => el.offsetParent)
            .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby"))
            .map((el) => el.name || el.id || el.type);
          return { scroll: doc.scrollWidth, larguraVisivel, vazando, pequenos, semRotulo };
        });
        verificar(m.scroll <= m.larguraVisivel + 1, `${rota}: sem rolagem horizontal (${m.scroll}px de ${m.larguraVisivel}px)${m.vazando.length ? " — " + m.vazando.join(", ") : ""}`);
        if (tela.mobile) verificar(m.pequenos.length === 0, `${rota}: botões de formulário com 40px+ de altura${m.pequenos.length ? " — " + m.pequenos.join(", ") : ""}`);
        if (tela.width === 390) verificar(m.semRotulo.length === 0, `${rota}: campos com rótulo${m.semRotulo.length ? " — " + m.semRotulo.join(", ") : ""}`);
      }
    }

    console.log("# áreas internas sem sessão");
    for (const rota of PROTEGIDAS) {
      const r = await fetch(BASE + rota, { redirect: "manual" });
      const destino = r.headers.get("location") || "";
      const portal = rota === "/medico" || rota.startsWith("/medico/") ? "/portal-medico" : "/portal-paciente";
      verificar(r.status >= 300 && r.status < 400 && destino.includes(portal), `${rota} redireciona para o login (${r.status} → ${destino.replace(BASE, "") || "—"})`);
    }
  } finally {
    await browser.close();
    if (servidor) servidor.kill();
  }

  if (falhas) {
    console.error(`TESTE DE RESPONSIVIDADE: ${falhas} falha(s)`);
    process.exit(1);
  }
  console.log("TESTE DE RESPONSIVIDADE PASSOU");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
