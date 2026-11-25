"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/local/server";
import { getSessionUser } from "@/lib/auth";
import { mensagemBanco } from "@/lib/erros";
import { uuidValido } from "@/lib/validacao";
import {
  cartoesDoQuadro,
  criarCartao,
  lerConfigTrello,
  lerMembros,
  membroDoResponsavel,
  montarCartao,
  moverCartao,
  statusParaSincronizar,
  STATUS_TAREFA,
  validarConteudoTarefa,
  type CategoriaTarefa,
  type StatusTarefa,
} from "@/lib/trello";

type Estado = { ok?: string; erro?: string };

const CATEGORIAS: CategoriaTarefa[] = ["administrativa", "tecnica", "manutencao"];
const STATUS: StatusTarefa[] = ["aberta", "em_andamento", "concluida"];
const AREAS = ["/admin/tarefas", "/gestor/tarefas", "/recepcao/tarefas"];

function revalidar() {
  AREAS.forEach((a) => revalidatePath(a));
}

async function equipe(apenasGestao = false) {
  const user = await getSessionUser();
  const permitidos = apenasGestao ? ["admin", "gestor"] : ["admin", "gestor", "recepcionista"];
  if (!user || !user.roles.some((r) => permitidos.includes(r))) return null;
  return user;
}

function texto(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Registra a tarefa no ClinicaFlow e, se o Trello estiver configurado, cria o cartão. */
export async function criarTarefa(_prev: Estado, formData: FormData): Promise<Estado> {
  const user = await equipe();
  if (!user) return { erro: "Você não tem permissão para registrar tarefas." };

  const titulo = texto(formData, "titulo") ?? "";
  const descricao = texto(formData, "descricao");
  const responsavel = texto(formData, "responsavel");
  const categoria = texto(formData, "categoria") as CategoriaTarefa | null;
  if (!categoria || !CATEGORIAS.includes(categoria)) return { erro: "Escolha a categoria." };
  const invalido = validarConteudoTarefa(titulo, descricao, responsavel);
  if (invalido) return { erro: invalido };

  const supabase = await createClient();
  const { data: tarefa, error } = await supabase
    .from("tarefas_internas")
    .insert({ titulo, descricao, categoria, responsavel, criado_por: user.id })
    .select("id, titulo, descricao, categoria, responsavel")
    .single();
  if (error || !tarefa) return { erro: mensagemBanco(error, "Não foi possível registrar a tarefa.") };

  const config = lerConfigTrello();
  if (!config) {
    revalidar();
    return { ok: "Tarefa registrada no ClinicaFlow. (Trello não configurado — veja as instruções abaixo.)" };
  }

  try {
    const cartao = await criarCartao(config, {
      ...montarCartao(tarefa as Parameters<typeof montarCartao>[0]),
      idMembro: membroDoResponsavel(lerMembros(), tarefa.responsavel),
    });
    await supabase
      .from("tarefas_internas")
      .update({ trello_card_id: cartao.id, trello_url: cartao.shortUrl ?? cartao.url, sincronizado_em: new Date().toISOString(), erro_sincronizacao: null })
      .eq("id", tarefa.id);
    revalidar();
    return { ok: "Tarefa registrada e enviada ao Trello." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha desconhecida";
    console.error("Trello: falha ao criar cartão:", msg);
    await supabase.from("tarefas_internas").update({ erro_sincronizacao: msg.slice(0, 300) }).eq("id", tarefa.id);
    revalidar();
    return { ok: `Tarefa registrada no ClinicaFlow, mas não foi enviada ao Trello: ${msg} Use "Reenviar" depois.` };
  }
}

/** Muda o status local e move o cartão para a lista correspondente. */
export async function alterarStatusTarefa(_prev: Estado, formData: FormData): Promise<Estado> {
  const user = await equipe();
  if (!user) return { erro: "Sem permissão." };
  const id = texto(formData, "id");
  const status = texto(formData, "status") as StatusTarefa | null;
  if (!uuidValido(id) || !status || !STATUS.includes(status)) return { erro: "Dados inválidos." };

  const supabase = await createClient();
  const { data: tarefa, error } = await supabase
    .from("tarefas_internas")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("trello_card_id")
    .maybeSingle();
  if (error) return { erro: mensagemBanco(error, "Não foi possível atualizar.") };
  if (!tarefa) return { erro: "Só quem criou a tarefa ou a gestão pode alterá-la." };

  const config = lerConfigTrello();
  if (config && tarefa.trello_card_id) {
    try {
      const movido = await moverCartao(config, tarefa.trello_card_id, status);
      await supabase.from("tarefas_internas").update({ sincronizado_em: new Date().toISOString(), erro_sincronizacao: null }).eq("id", id);
      if (!movido) {
        revalidar();
        return { ok: `Status salvo. O cartão continua na mesma lista do Trello: não há lista configurada para "${STATUS_TAREFA[status]}".` };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha desconhecida";
      await supabase.from("tarefas_internas").update({ erro_sincronizacao: msg.slice(0, 300) }).eq("id", id);
      revalidar();
      return { ok: `Status salvo, mas o cartão não foi movido no Trello: ${msg}` };
    }
  }
  revalidar();
  return { ok: "Status atualizado." };
}

/** Reenvia ao Trello as tarefas que ainda não têm cartão. */
export async function reenviarPendentes(_prev: Estado, _formData: FormData): Promise<Estado> {
  const user = await equipe(true);
  if (!user) return { erro: "Só a gestão reenvia tarefas." };
  const config = lerConfigTrello();
  if (!config) return { erro: "Trello não configurado." };

  const supabase = await createClient();
  const { data: pendentes } = await supabase
    .from("tarefas_internas")
    .select("id, titulo, descricao, categoria, responsavel, status")
    .is("trello_card_id", null)
    .limit(20);

  let enviadas = 0;
  let falhas = 0;
  for (const t of pendentes ?? []) {
    try {
      const cartao = await criarCartao(
        config,
        { ...montarCartao(t as Parameters<typeof montarCartao>[0]), idMembro: membroDoResponsavel(lerMembros(), t.responsavel) },
        t.status as StatusTarefa
      );
      await supabase
        .from("tarefas_internas")
        .update({ trello_card_id: cartao.id, trello_url: cartao.shortUrl ?? cartao.url, sincronizado_em: new Date().toISOString(), erro_sincronizacao: null })
        .eq("id", t.id);
      enviadas += 1;
    } catch (e) {
      falhas += 1;
      await supabase.from("tarefas_internas").update({ erro_sincronizacao: (e instanceof Error ? e.message : "Falha").slice(0, 300) }).eq("id", t.id);
    }
  }
  revalidar();
  return falhas ? { erro: `${enviadas} enviada(s), ${falhas} com falha. Veja o erro em cada tarefa.` } : { ok: `${enviadas} tarefa(s) enviada(s) ao Trello.` };
}

/** Traz do Trello o status dos cartões (quem moveu o cartão lá, atualiza aqui). */
export async function sincronizarDoTrello(_prev: Estado, _formData: FormData): Promise<Estado> {
  const user = await equipe(true);
  if (!user) return { erro: "Só a gestão sincroniza." };
  const config = lerConfigTrello();
  if (!config) return { erro: "Trello não configurado." };

  const supabase = await createClient();
  const { data: tarefas } = await supabase
    .from("tarefas_internas")
    .select("id, status, trello_card_id")
    .not("trello_card_id", "is", null)
    .limit(500);

  try {
    const cartoes = new Map((await cartoesDoQuadro(config)).map((c) => [c.id, c]));
    let alteradas = 0;
    for (const t of tarefas ?? []) {
      const cartao = cartoes.get(t.trello_card_id!);
      if (!cartao) continue;
      const novo = statusParaSincronizar(config, t.status as StatusTarefa, cartao);
      if (novo) {
        await supabase.from("tarefas_internas").update({ status: novo, sincronizado_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", t.id);
        alteradas += 1;
      }
    }
    revalidar();
    return { ok: alteradas ? `${alteradas} tarefa(s) atualizada(s) a partir do Trello.` : "Tudo sincronizado." };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao sincronizar com o Trello." };
  }
}
