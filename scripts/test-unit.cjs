/**
 * Testes unitários (node:test, sem dependências novas).
 * Cobrem validações de cadastro, fuso horário, mensagens de erro, rotas seguras
 * e a integração com o Trello (com fetch simulado — nenhuma chamada real).
 *
 * Rodar: npm run test:unit
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const raiz = path.join(__dirname, "..");
const cache = new Map();

function carregar(arquivo, env = {}) {
  const chave = arquivo + JSON.stringify(env);
  if (cache.has(chave)) return cache.get(chave);
  const fonte = fs.readFileSync(path.join(raiz, arquivo), "utf8");
  const js = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exportsObj = {};
  cache.set(chave, exportsObj);
  const dir = path.dirname(arquivo);
  vm.runInNewContext(js, {
    exports: exportsObj,
    module: { exports: exportsObj },
    process: { env },
    Intl, Date, URL, AbortSignal, TextEncoder, JSON, Math, Number, String, Array, Object, RegExp, Map, Set, Promise, Error,
    console,
    require(nome) {
      if (nome.startsWith("@/")) return carregar(`src/${nome.slice(2)}.ts`, env);
      if (nome.startsWith("./")) return carregar(path.join(dir, `${nome.slice(2)}.ts`), env);
      return require(nome);
    },
  });
  return exportsObj;
}

const v = carregar("src/lib/validacao.ts");
const f = carregar("src/lib/format.ts");
const e = carregar("src/lib/erros.ts");
const r = carregar("src/lib/roles.ts");
const csv = carregar("src/lib/csv.ts");

test("CSV: escapa separadores, aspas e quebras de linha, preservando números", () => {
  assert.equal(csv.gerarCsv([["Nome; da área", 'Diz "olá"', "linha\nnova", 12]]), '\uFEFF"Nome; da área";"Diz ""olá""";"linha\nnova";"12"');
});

test("CSV: impede fórmulas de planilha em textos, inclusive com espaços iniciais", () => {
  for (const texto of ["=1+1", "+cmd", "-cmd", "@sum", "  =1+1", "\t=1+1"]) {
    assert.equal(csv.gerarCsv([[texto]]), '\uFEFF"\'' + texto + '"');
  }
  assert.equal(csv.gerarCsv([[-2]]), '\uFEFF"-2"');
});

// ------------------------------------------------------------
// Cadastro: validações
// ------------------------------------------------------------
test("CPF: aceita válidos (com e sem máscara) e recusa inválidos", () => {
  assert.equal(v.cpfValido("529.982.247-25"), true);
  assert.equal(v.cpfValido("16899535009"), true);
  assert.equal(v.cpfValido("529.982.247-24"), false, "dígito errado");
  assert.equal(v.cpfValido("111.111.111-11"), false, "todos iguais");
  assert.equal(v.cpfValido("1234567890"), false, "10 dígitos");
  assert.equal(v.cpfValido(""), false);
  assert.equal(v.cpfValido(null), false);
});

test("celular: exige DDD + 9 dígitos começando com 9", () => {
  assert.equal(v.celularValido("(11) 98888-7777"), true);
  assert.equal(v.celularValido("11988887777"), true);
  assert.equal(v.celularValido("(11) 3888-7777"), false, "fixo não é celular");
  assert.equal(v.celularValido("988887777"), false, "sem DDD");
  assert.equal(v.celularValido("(01) 98888-7777"), false, "DDD inválido");
  assert.equal(v.telefoneValido("(11) 3888-7777"), true);
});

test("data de nascimento: real, no passado, até 130 anos", () => {
  const hoje = new Date(2026, 10, 12);
  assert.equal(v.nascimentoValido("1990-05-10", hoje), true);
  assert.equal(v.nascimentoValido("2026-11-12", hoje), true, "hoje é aceito");
  assert.equal(v.nascimentoValido("2026-11-13", hoje), false, "futuro");
  assert.equal(v.nascimentoValido("1890-01-01", hoje), false, "mais de 130 anos");
  assert.equal(v.nascimentoValido("2023-02-30", hoje), false, "data inexistente");
  assert.equal(v.nascimentoValido("10/05/1990", hoje), false, "formato errado");
});

test("e-mail, nome completo e senha", () => {
  assert.equal(v.emailValido("ana@clinica.com.br"), true);
  assert.equal(v.emailValido("ana@clinica"), false);
  assert.equal(v.emailValido("ana clinica@x.com"), false);
  assert.equal(v.nomeCompletoValido("Maria da Silva"), true);
  assert.equal(v.nomeCompletoValido("João D'Ávila-Souza"), true);
  assert.equal(v.nomeCompletoValido("Maria"), false, "só um nome");
  assert.equal(v.nomeCompletoValido("Maria 123"), false);
  assert.equal(v.senhaForte("abc12345"), true);
  assert.equal(v.senhaForte("abcdefgh"), false, "sem número");
  assert.equal(v.senhaForte("12345678"), false, "sem letra");
  assert.equal(v.senhaForte("ab1"), false, "curta");
});

test("ids, datas, horas e período validados antes de chamar o banco", () => {
  assert.equal(v.uuidValido("3f2c6a3e-1b2c-4d5e-8f90-1234567890ab"), true);
  assert.equal(v.uuidValido("1; drop table consultas"), false);
  assert.equal(v.dataIsoValida("2026-02-29"), false);
  assert.equal(v.dataIsoValida("2028-02-29"), true);
  assert.equal(v.horaValida("08:30"), true);
  assert.equal(v.horaValida("24:00"), false);
  assert.equal(v.periodoValido("tarde"), true);
  assert.equal(v.periodoValido("madrugada"), false);
});

// ------------------------------------------------------------
// Fuso horário America/Sao_Paulo
// ------------------------------------------------------------
test("horários exibidos no fuso de São Paulo, mesmo com servidor em UTC", () => {
  assert.equal(f.dataHora("2026-11-19T11:00:00.000Z"), "19/11/2026 08:00");
  assert.equal(f.hora("2026-11-19T21:30:00.000Z"), "18:30");
  assert.equal(f.dataCurta("1990-05-10"), "10/05/1990", "data pura não muda de dia");
});

test("início/fim do dia calculados em São Paulo (UTC-3)", () => {
  const ref = new Date("2026-11-20T01:30:00.000Z"); // ainda é dia 19 em São Paulo
  assert.equal(f.hojeIso(ref), "2026-11-19");
  assert.equal(f.inicioDoDia(ref), "2026-11-19T03:00:00.000Z");
  assert.equal(f.fimDoDia(ref), "2026-11-20T02:59:59.999Z");
  assert.equal(f.instanteSaoPaulo("2026-11-19", "08:00"), "2026-11-19T11:00:00.000Z");
  assert.equal(f.somarDias("2026-12-31", 1), "2027-01-01");
});

// ------------------------------------------------------------
// Mensagens de erro
// ------------------------------------------------------------
test("erros do banco: mensagem de negócio passa; detalhes internos não", () => {
  assert.equal(e.mensagemBanco({ code: "P0001", message: "Não há horários livres" }, "padrão"), "Não há horários livres");
  assert.equal(e.mensagemBanco({ code: "42P01", message: 'relation "x" does not exist' }, "padrão"), "padrão");
  assert.equal(e.mensagemBanco({ code: "42501", message: "permission denied" }, "padrão"), "Você não tem permissão para fazer isso.");
  assert.equal(e.dicaBanco({ code: "P0001", message: "x", hint: "sem_vagas" }), "sem_vagas");
  assert.equal(e.dicaBanco({ code: "23505", message: "x", hint: "y" }), null);
});

test("erros do login traduzidos", () => {
  assert.match(e.traduzirErroAuth("User already registered"), /Já existe uma conta/);
  assert.match(e.traduzirErroAuth("Invalid login credentials"), /E-mail ou senha inválidos/);
  assert.match(e.traduzirErroAuth("Email not confirmed"), /Confirme seu e-mail/);
  assert.match(e.traduzirErroAuth("Password should be at least 6 characters"), /Senha fraca/);
});

// ------------------------------------------------------------
// Permissões por cargo (rotas)
// ------------------------------------------------------------
test("cargos: prioridade e rota inicial", () => {
  assert.deepEqual([...r.normalizeRoles(["paciente", "medico"])], ["medico", "paciente"]);
  assert.equal(r.getPrimaryRole(["paciente", "admin"]), "admin");
  assert.deepEqual([...r.normalizeRoles(["hacker"])], ["paciente"], "cargo desconhecido vira paciente");
  assert.equal(r.HOME_BY_ROLE.recepcionista, "/recepcao");
});

test("redirecionamento só para caminhos internos", () => {
  const p = carregar("src/lib/paciente.ts", {});
  assert.equal(p.caminhoSeguro("/paciente/agendar"), "/paciente/agendar");
  assert.equal(p.caminhoSeguro("//evil.com"), "/paciente");
  assert.equal(p.caminhoSeguro("https://evil.com"), "/paciente");
});

// ------------------------------------------------------------
// Trello
// ------------------------------------------------------------
const envTrello = { ALLOW_ONLINE_INTEGRATIONS: "true",
  TRELLO_API_KEY: "chave-teste",
  TRELLO_TOKEN: "token-teste",
  TRELLO_BOARD_ID: "quadro1",
  TRELLO_LIST_ABERTA: "lista-aberta",
  TRELLO_LIST_EM_ANDAMENTO: "lista-andamento",
  TRELLO_LIST_CONCLUIDA: "lista-feita",
};
const t = carregar("src/lib/trello.ts", envTrello);

test("Trello: desativado sem as variáveis obrigatórias", () => {
  assert.equal(t.lerConfigTrello({}), null);
  assert.equal(t.lerConfigTrello({ ...envTrello, ALLOW_ONLINE_INTEGRATIONS: 'false' }), null);
  assert.equal(t.lerConfigTrello({ ...envTrello, TRELLO_TOKEN: "" }), null);
  const c = t.lerConfigTrello(envTrello);
  assert.equal(c.listas.concluida, "lista-feita");
  const diag = t.diagnosticoTrello({ TRELLO_API_KEY: "x" });
  assert.equal(diag.find((d) => d.nome === "TRELLO_API_KEY").definida, true);
  assert.equal(JSON.stringify(diag).includes("x\""), false, "não expõe valores");
});

test("Trello: bloqueia CPF, telefone e e-mail no conteúdo", () => {
  assert.equal(t.validarConteudoTarefa("Impressora sem conexão", "Sala 2", "TI"), null);
  assert.match(t.validarConteudoTarefa("Paciente 529.982.247-25 reclamou", null, null), /CPF/);
  assert.match(t.validarConteudoTarefa("Ligar para paciente", "(11) 98888-7777", null), /telefones/);
  assert.match(t.validarConteudoTarefa("Retornar e-mail", "fulano@gmail.com", null), /e-mails/);
  assert.match(t.validarConteudoTarefa("ab", null, null), /entre 3 e 120/);
});

test("Trello: cartão leva categoria e origem, sem dados extras", () => {
  const c = t.montarCartao({ id: "abcdef12-0000", titulo: "Ar-condicionado", descricao: "Sala 3", categoria: "manutencao", responsavel: "Manutenção" });
  assert.equal(c.name, "[Manutenção] Ar-condicionado");
  assert.match(c.desc, /Categoria: Manutenção/);
  assert.match(c.desc, /Origem: ClinicaFlow \(tarefa abcdef12\)/);
});

test("Trello: status pela lista do cartão", () => {
  const c = t.lerConfigTrello(envTrello);
  assert.equal(t.statusDaLista(c, "lista-feita"), "concluida");
  assert.equal(t.statusDaLista(c, "lista-andamento"), "em_andamento");
  assert.equal(t.statusDaLista(c, "lista-aberta"), "aberta");
  assert.equal(t.statusDaLista(c, "outra"), null);
  assert.equal(t.statusDaLista(c, "lista-aberta", true), "concluida", "arquivado = concluído");
});

test("Trello: credenciais no cabeçalho Authorization, nunca na URL", async () => {
  const c = t.lerConfigTrello(envTrello);
  const chamadas = [];
  const fetchFalso = async (url, init) => {
    chamadas.push({ url, init });
    return new Response(JSON.stringify({ id: "card1", shortUrl: "https://trello.com/c/x" }), { status: 200 });
  };
  const card = await t.criarCartao(c, { name: "n", desc: "d" }, "em_andamento", fetchFalso);
  assert.equal(card.id, "card1");
  assert.equal(chamadas[0].url, "https://api.trello.com/1/cards");
  assert.equal(chamadas[0].init.method, "POST");
  assert.equal(JSON.parse(chamadas[0].init.body).idList, "lista-andamento");
  assert.equal(chamadas[0].init.headers.Authorization, 'OAuth oauth_consumer_key="chave-teste", oauth_token="token-teste"');
  assert.equal(chamadas[0].url.includes("token"), false);

  await t.moverCartao(c, "card1", "concluida", fetchFalso);
  assert.equal(chamadas[1].url, "https://api.trello.com/1/cards/card1");
  assert.equal(JSON.parse(chamadas[1].init.body).idList, "lista-feita");
});

test("Trello: erros de credencial viram mensagem clara", async () => {
  const c = t.lerConfigTrello(envTrello);
  const fetch401 = async () => new Response("invalid key", { status: 401 });
  await assert.rejects(() => t.listarListas(c, fetch401), /recusou as credenciais/);
  const fetch404 = async () => new Response("not found", { status: 404 });
  await assert.rejects(() => t.cartoesDoQuadro(c, fetch404), /não encontrado/);
});

test("Trello: sincronizar não desfaz status cuja lista não está configurada", () => {
  const completo = t.lerConfigTrello(envTrello);
  // Com todas as listas: o Trello manda.
  assert.equal(t.statusParaSincronizar(completo, "aberta", { idList: "lista-andamento", closed: false }), "em_andamento");
  assert.equal(t.statusParaSincronizar(completo, "aberta", { idList: "lista-aberta", closed: false }), null, "sem mudança");
  assert.equal(t.statusParaSincronizar(completo, "aberta", { idList: "lista-desconhecida", closed: false }), null);

  // Sem lista "em andamento": o cartão ficou em "aberta" e não pode reverter a tarefa.
  const semAndamento = t.lerConfigTrello({ ...envTrello, TRELLO_LIST_EM_ANDAMENTO: "" });
  assert.equal(t.statusParaSincronizar(semAndamento, "em_andamento", { idList: "lista-aberta", closed: false }), null);
  assert.equal(t.statusParaSincronizar(semAndamento, "em_andamento", { idList: "lista-aberta", closed: true }), "concluida", "arquivado conclui");
});

test("Trello: mover para status sem lista configurada não chama a API", async () => {
  const semAndamento = t.lerConfigTrello({ ...envTrello, TRELLO_LIST_EM_ANDAMENTO: "" });
  let chamadas = 0;
  const r = await t.moverCartao(semAndamento, "card1", "em_andamento", async () => { chamadas += 1; return new Response("{}"); });
  assert.equal(r, null);
  assert.equal(chamadas, 0);
});

// ------------------------------------------------------------
// Navegação e ações do paciente
// ------------------------------------------------------------
const n = carregar("src/lib/nav.ts");
const consulta = carregar("src/lib/consulta.ts");

test("menu: marca só o item mais específico como página atual", () => {
  const admin = Array.from(n.NAV_BY_ROLE.admin, (i) => i.href);
  const ativos = (caminho) => Array.from(admin.filter((h) => n.itemAtivo(h, caminho, admin)));
  assert.deepEqual(ativos("/admin"), ["/admin"]);
  assert.deepEqual(ativos("/admin/agenda"), ["/admin/agenda"]);
  assert.deepEqual(ativos("/admin/pacientes/123"), ["/admin/pacientes"]);
  const pac = Array.from(n.NAV_BY_ROLE.paciente, (i) => i.href);
  assert.deepEqual(Array.from(pac.filter((h) => n.itemAtivo(h, "/paciente/meus-dados", pac))), ["/paciente/meus-dados"]);
  assert.equal(pac.filter((h) => n.itemAtivo(h, "/pacientes", pac)).length, 0, "prefixo parecido não conta");
});

test("paciente só vê Remarcar/Cancelar em consulta futura agendada ou confirmada", () => {
  const agora = Date.parse("2026-11-12T12:00:00Z");
  const futura = "2026-11-20T12:00:00Z";
  assert.equal(consulta.consultaAlteravel({ status: "agendada", data_hora: futura }, agora), true);
  assert.equal(consulta.consultaAlteravel({ status: "confirmada", data_hora: futura }, agora), true);
  assert.equal(consulta.consultaAlteravel({ status: "cancelada", data_hora: futura }, agora), false);
  assert.equal(consulta.consultaAlteravel({ status: "concluida", data_hora: futura }, agora), false);
  assert.equal(consulta.consultaAlteravel({ status: "agendada", data_hora: "2026-11-01T12:00:00Z" }, agora), false, "passada");
});

test("Trello: responsável vira membro do cartão quando está em TRELLO_MEMBROS", async () => {
  const id1 = "5f1a2b3c4d5e6f7a8b9c0d1e";
  const membros = t.lerMembros({ TRELLO_MEMBROS: `TI=${id1}; Manutenção = 60b2c3d4e5f6a7b8c9d0e1f2 ;quebrado=123;=${id1}` });
  assert.equal(membros.length, 2, "ignora entradas mal formadas");
  assert.equal(t.membroDoResponsavel(membros, "ti"), id1, "sem diferenciar maiúsculas");
  assert.equal(t.membroDoResponsavel(membros, "manutencao"), "60b2c3d4e5f6a7b8c9d0e1f2", "sem diferenciar acentos");
  assert.equal(t.membroDoResponsavel(membros, "Financeiro"), null);
  assert.equal(t.membroDoResponsavel(membros, null), null);

  const c = t.lerConfigTrello(envTrello);
  const corpos = [];
  const fetchFalso = async (_url, init) => { corpos.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: "c1" })); };
  await t.criarCartao(c, { name: "n", desc: "d", idMembro: id1 }, "aberta", fetchFalso);
  await t.criarCartao(c, { name: "n", desc: "d", idMembro: null }, "aberta", fetchFalso);
  assert.deepEqual(Array.from(corpos[0].idMembers), [id1]);
  assert.equal("idMembers" in corpos[1], false, "sem responsável mapeado, sem membro");
  assert.equal("idMembro" in corpos[0], false, "campo interno não vai para a API");
});

test("data de nascimento: 'hoje' é o dia em São Paulo, mesmo com servidor em UTC", () => {
  // 12/11 às 23h30 em São Paulo = 13/11 02h30 UTC
  const noite = new Date("2026-11-13T02:30:00Z");
  assert.equal(v.nascimentoValido("2026-11-12", noite), true, "hoje em SP");
  assert.equal(v.nascimentoValido("2026-11-13", noite), false, "amanhã em SP (já é hoje em UTC)");
});

test("callback local: ignora códigos externos e destinos fornecidos na URL", async () => {
  const source = fs.readFileSync(path.join(raiz, "src/app/auth/callback/route.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports, URL,
    require(name) {
      if (name === "next/server") return { NextResponse: { redirect: url => ({ location: url.href }) } };
      throw new Error("Callback local não deve carregar banco ou provedor: " + name);
    },
  });
  for (const next of ["/nova-senha", "https://externo.example", "//externo.example", "/admin"]) {
    const result = await exports.GET({ url: "http://localhost/auth/callback?code=externo&next=" + encodeURIComponent(next) });
    assert.equal(result.location, "http://localhost/portal-paciente?erro=local");
  }
});

test('calendário: exporta a consulta em UTC e escapa conteúdo sem inventar duração', () => {
  const { calendarioConsulta } = carregar('src/lib/calendario.ts');
  const value = calendarioConsulta({ id: 'abc-123', data_hora: '2026-11-26T08:30:00-03:00', especialidade: 'Clínica Geral\nBEGIN:VEVENT', profissional: 'Dra. Ágata; Silva', local: 'Unidade Centro, São Paulo' }, new Date('2026-11-25T12:00:00Z'));
  assert(value.includes('DTSTART:20261126T113000Z\r\n'));
  assert(value.includes('DTSTAMP:20261125T120000Z\r\n'));
  assert(value.includes('SUMMARY:Consulta de Clínica Geral\\nBEGIN:VEVENT'));
  assert(value.includes('Dra. Ágata\\; Silva'));
  assert(value.includes('Unidade Centro\\, São Paulo'));
  assert.equal(value.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert.equal(value.includes('DTEND:'), false);
});

test('calendário: preserva acentos nas linhas longas e recusa datas e IDs inválidos', () => {
  const { calendarioConsulta } = carregar('src/lib/calendario.ts');
  const event = { id: 'abc-123', data_hora: '2026-11-26T11:00:00Z', especialidade: 'Clínica '.repeat(30), profissional: 'Dra. Ana', local: 'São Paulo' };
  const value = calendarioConsulta(event);
  for (const line of value.split('\r\n')) assert(Buffer.byteLength(line, 'utf8') <= 75);
  assert(value.replace(/\r\n /g, '').includes('SUMMARY:Consulta de ' + event.especialidade));
  assert.throws(() => calendarioConsulta({ ...event, data_hora: 'inválida' }));
  assert.throws(() => calendarioConsulta({ ...event, id: 'id\nSUMMARY:outro' }));
});
