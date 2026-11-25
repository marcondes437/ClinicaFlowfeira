/**
 * Integração OPCIONAL com a API oficial do Trello (https://api.trello.com/1).
 * Uso exclusivo no servidor (server actions / páginas de servidor): as credenciais
 * vêm de variáveis de ambiente SEM o prefixo NEXT_PUBLIC_, então nunca chegam ao navegador.
 *
 * Nunca envie CPF, dados clínicos, prontuário ou nome de paciente para o Trello.
 */
import { contemCpf } from "./validacao";

export type CategoriaTarefa = "administrativa" | "tecnica" | "manutencao";
export type StatusTarefa = "aberta" | "em_andamento" | "concluida";

export const CATEGORIAS: Record<CategoriaTarefa, string> = {
  administrativa: "Tarefa administrativa",
  tecnica: "Problema técnico",
  manutencao: "Manutenção",
};

export const STATUS_TAREFA: Record<StatusTarefa, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

export type TrelloConfig = {
  apiKey: string;
  token: string;
  boardId: string;
  listas: Record<StatusTarefa, string | null>;
};

type Env = Record<string, string | undefined>;

/** Lê a configuração do ambiente. Retorna null se a integração não estiver completa. */
export function lerConfigTrello(env: Env = process.env): TrelloConfig | null {
  if (env.ALLOW_ONLINE_INTEGRATIONS !== 'true') return null;
  const apiKey = env.TRELLO_API_KEY?.trim();
  const token = env.TRELLO_TOKEN?.trim();
  const boardId = env.TRELLO_BOARD_ID?.trim();
  const aberta = env.TRELLO_LIST_ABERTA?.trim();
  if (!apiKey || !token || !boardId || !aberta) return null;
  return {
    apiKey,
    token,
    boardId,
    listas: {
      aberta,
      em_andamento: env.TRELLO_LIST_EM_ANDAMENTO?.trim() || null,
      concluida: env.TRELLO_LIST_CONCLUIDA?.trim() || null,
    },
  };
}

/** Quais variáveis estão definidas (sem revelar os valores) — para a tela de configuração. */
export function diagnosticoTrello(env: Env = process.env) {
  const nomes = ["TRELLO_API_KEY", "TRELLO_TOKEN", "TRELLO_BOARD_ID", "TRELLO_LIST_ABERTA", "TRELLO_LIST_EM_ANDAMENTO", "TRELLO_LIST_CONCLUIDA", "TRELLO_MEMBROS"];
  const opcionais = ["TRELLO_LIST_EM_ANDAMENTO", "TRELLO_LIST_CONCLUIDA", "TRELLO_MEMBROS"];
  return nomes.map((nome) => ({ nome, definida: Boolean(env[nome]?.trim()), obrigatoria: !opcionais.includes(nome) }));
}

export type MembroTrello = { nome: string; id: string };

/**
 * Responsáveis que viram membros do cartão. Formato de TRELLO_MEMBROS:
 *   "TI=5f1a...;Manutenção=60b2...;Ana (recepção)=6123..."
 * (nome como aparece no campo Responsável = ID do membro no Trello, 24 caracteres).
 * Entradas mal formadas são ignoradas.
 */
export function lerMembros(env: Env = process.env): MembroTrello[] {
  return (env.TRELLO_MEMBROS ?? "")
    .split(/[;\n]/)
    .map((par) => {
      const i = par.lastIndexOf("=");
      return { nome: par.slice(0, i).trim(), id: par.slice(i + 1).trim() };
    })
    .filter((m) => m.nome.length > 0 && m.nome.length <= 80 && /^[0-9a-f]{24}$/i.test(m.id));
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** ID do membro do Trello para o responsável digitado (sem diferenciar maiúsculas e acentos). */
export function membroDoResponsavel(membros: MembroTrello[], responsavel: string | null | undefined) {
  if (!responsavel) return null;
  const alvo = normalizar(responsavel);
  return membros.find((m) => normalizar(m.nome) === alvo)?.id ?? null;
}

/** Cabeçalho de autorização (evita key/token na URL e, portanto, em logs). */
export function cabecalhoAutorizacao(config: Pick<TrelloConfig, "apiKey" | "token">) {
  return `OAuth oauth_consumer_key="${config.apiKey}", oauth_token="${config.token}"`;
}

const TELEFONE = /(\(?\d{2}\)?\s?)?9?\d{4}-?\d{4}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * Valida o conteúdo antes de enviar ao Trello. Bloqueia CPF, telefones e e-mails
 * (que normalmente identificam pacientes). Retorna a mensagem de erro ou null.
 */
export function validarConteudoTarefa(titulo: string, descricao: string | null, responsavel: string | null) {
  const t = titulo.trim();
  if (t.length < 3 || t.length > 120) return "O título deve ter entre 3 e 120 caracteres.";
  if ((descricao ?? "").length > 2000) return "A descrição deve ter até 2.000 caracteres.";
  if ((responsavel ?? "").length > 80) return "O responsável deve ter até 80 caracteres.";
  const tudo = [t, descricao ?? "", responsavel ?? ""].join("\n");
  if (contemCpf(tudo)) return "Remova o CPF: dados de pacientes não podem ir para tarefas internas nem para o Trello.";
  if (TELEFONE.test(tudo) || EMAIL.test(tudo)) {
    return "Remova telefones e e-mails: dados pessoais não podem ir para tarefas internas nem para o Trello.";
  }
  return null;
}

/** Nome e descrição do cartão (sem dados pessoais). */
export function montarCartao(tarefa: { titulo: string; descricao: string | null; categoria: CategoriaTarefa; responsavel: string | null; id: string }) {
  const linhas = [
    tarefa.descricao?.trim() || "(sem descrição)",
    "",
    "---",
    `Categoria: ${CATEGORIAS[tarefa.categoria]}`,
    tarefa.responsavel ? `Responsável: ${tarefa.responsavel}` : null,
    `Origem: ClinicaFlow (tarefa ${tarefa.id.slice(0, 8)})`,
  ].filter((l): l is string => l !== null);
  return { name: `[${CATEGORIAS[tarefa.categoria]}] ${tarefa.titulo.trim()}`, desc: linhas.join("\n") };
}

/** Converte a lista atual do cartão em status do ClinicaFlow. */
export function statusDaLista(config: TrelloConfig, idList: string, fechado = false): StatusTarefa | null {
  if (fechado) return "concluida";
  if (idList === config.listas.concluida) return "concluida";
  if (idList === config.listas.em_andamento) return "em_andamento";
  if (idList === config.listas.aberta) return "aberta";
  return null;
}

/**
 * Status que a tarefa deve receber ao "Trazer status do Trello", ou null para não mexer.
 *
 * Se a lista do status LOCAL não estiver configurada (ex.: sem TRELLO_LIST_EM_ANDAMENTO),
 * o cartão nunca saiu da lista onde estava — então a lista dele não diz nada sobre a
 * tarefa e não pode sobrescrever o status local. (Antes, marcar "Em andamento" e depois
 * sincronizar devolvia a tarefa para "Aberta".) Cartão arquivado sempre conta como concluída.
 */
export function statusParaSincronizar(
  config: TrelloConfig,
  local: StatusTarefa,
  cartao: { idList: string; closed: boolean }
): StatusTarefa | null {
  const remoto = statusDaLista(config, cartao.idList, cartao.closed);
  if (!remoto || remoto === local) return null;
  if (!config.listas[local] && !cartao.closed) return null;
  return remoto;
}

type Fetch = typeof fetch;

async function chamar<T>(config: TrelloConfig, caminho: string, init: RequestInit = {}, f: Fetch = fetch): Promise<T> {
  const resposta = await f(`https://api.trello.com/1${caminho}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: cabecalhoAutorizacao(config),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!resposta.ok) {
    const texto = (await resposta.text().catch(() => "")).slice(0, 120);
    if (resposta.status === 401) throw new Error("Trello recusou as credenciais (verifique TRELLO_API_KEY e TRELLO_TOKEN).");
    if (resposta.status === 404) throw new Error("Quadro, lista ou cartão não encontrado no Trello (verifique os IDs).");
    if (resposta.status === 429) throw new Error("Limite de requisições do Trello atingido. Tente em instantes.");
    throw new Error(`Trello respondeu ${resposta.status}${texto ? `: ${texto}` : ""}`);
  }
  return (await resposta.json()) as T;
}

export async function listarListas(config: TrelloConfig, f?: Fetch) {
  return chamar<Array<{ id: string; name: string; closed: boolean }>>(
    config,
    `/boards/${encodeURIComponent(config.boardId)}/lists?fields=name,closed&filter=open`,
    {},
    f
  );
}

export async function criarCartao(
  config: TrelloConfig,
  cartao: { name: string; desc: string; idMembro?: string | null },
  status: StatusTarefa = "aberta",
  f?: Fetch
) {
  const idList = config.listas[status] ?? config.listas.aberta!;
  const { idMembro, ...resto } = cartao;
  return chamar<{ id: string; shortUrl: string; url: string }>(
    config,
    "/cards",
    { method: "POST", body: JSON.stringify({ ...resto, idList, pos: "top", ...(idMembro ? { idMembers: [idMembro] } : {}) }) },
    f
  );
}

/** Membros do quadro (para a tela de configuração mostrar os IDs). */
export async function listarMembros(config: TrelloConfig, f?: Fetch) {
  return chamar<Array<{ id: string; fullName: string; username: string }>>(
    config,
    `/boards/${encodeURIComponent(config.boardId)}/members?fields=fullName,username`,
    {},
    f
  );
}

export async function moverCartao(config: TrelloConfig, cardId: string, status: StatusTarefa, f?: Fetch) {
  const idList = config.listas[status];
  if (!idList) return null; // lista não configurada: mantém o cartão onde está
  return chamar<{ id: string }>(
    config,
    `/cards/${encodeURIComponent(cardId)}`,
    { method: "PUT", body: JSON.stringify({ idList }) },
    f
  );
}

/** Cartões do quadro (id, lista e se está arquivado), para sincronizar o status. */
export async function cartoesDoQuadro(config: TrelloConfig, f?: Fetch) {
  return chamar<Array<{ id: string; idList: string; closed: boolean }>>(
    config,
    `/boards/${encodeURIComponent(config.boardId)}/cards/all?fields=idList,closed`,
    {},
    f
  );
}
