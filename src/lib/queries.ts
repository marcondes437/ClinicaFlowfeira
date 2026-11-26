import { createClient } from "@/lib/local/server";
import { fimDoDia, hojeIso, inicioDoDia, somarDias } from "@/lib/format";
import { uuidValido } from "@/lib/validacao";

export const CONSULTA_SELECT =
  "id, data_hora, status, motivo, especialidade_id, pacientes(id, nome_completo), profissionais(nome), especialidades(nome), unidades(nome, endereco, cidade)";

/** Status que ocupam a agenda (consulta "valendo"). */
export const STATUS_ATIVOS = ["agendada", "confirmada", "em_atendimento"] as const;

export async function getIndicadores() {
  const supabase = await createClient();
  const hojeInicio = inicioDoDia();
  const hojeFim = fimDoDia();

  // Soma paginada: uma leitura só parava nas primeiras 1.000 linhas (limite do PostgREST).
  const somarFaturamento = async () => {
    const PAGINA = 1000;
    let total = 0;
    for (let inicio = 0; inicio < 200 * PAGINA; inicio += PAGINA) {
      const { data, error } = await supabase
        .from("consultas")
        .select("valor")
        .eq("status", "concluida")
        .not("valor", "is", null)
        .order("id")
        .range(inicio, inicio + PAGINA - 1);
      if (error) {
        console.error("Falha ao somar faturamento:", error.message);
        break;
      }
      total += (data ?? []).reduce((soma: number, c: { valor: number | null }) => soma + Number(c.valor ?? 0), 0);
      if (!data || data.length < PAGINA) break;
    }
    return total;
  };

  const [pacientes, profissionais, unidades, hoje, agendadas, concluidas, canceladas, faturamento] =
    await Promise.all([
      supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("status", "ativo"),
      supabase.from("profissionais").select("id", { count: "exact", head: true }).eq("status", "ativo"),
      supabase.from("unidades").select("id", { count: "exact", head: true }).eq("status", "ativo"),
      supabase.from("consultas").select("id", { count: "exact", head: true }).gte("data_hora", hojeInicio).lte("data_hora", hojeFim),
      supabase.from("consultas").select("id", { count: "exact", head: true }).in("status", ["agendada", "confirmada"]).gte("data_hora", hojeInicio),
      supabase.from("consultas").select("id", { count: "exact", head: true }).eq("status", "concluida"),
      supabase.from("consultas").select("id", { count: "exact", head: true }).eq("status", "cancelada"),
      somarFaturamento(),
    ]);

  return {
    pacientes: pacientes.count ?? 0,
    profissionais: profissionais.count ?? 0,
    unidades: unidades.count ?? 0,
    consultasHoje: hoje.count ?? 0,
    agendadas: agendadas.count ?? 0,
    concluidas: concluidas.count ?? 0,
    canceladas: canceladas.count ?? 0,
    faturamento,
  };
}

export type IndicadorEspecialidade = {
  especialidade_id: string;
  especialidade_nome: string;
  vagas_total: number;
  vagas_livres: number;
  vagas_reservadas: number;
  vagas_bloqueadas: number;
  consultas: number;
  canceladas: number;
  faltas: number;
  concluidas: number;
};

/** Ocupação da agenda e cancelamentos por especialidade (admin, gestor e recepção). */
export async function getIndicadoresAgenda(dias = 30) {
  const supabase = await createClient();
  const inicio = hojeIso();
  const { data, error } = await supabase.rpc("indicadores_agenda", {
    _inicio: inicio,
    _fim: somarDias(inicio, dias),
  });
  if (error) console.error("Falha ao carregar indicadores da agenda:", error.message);
  const linhas = ((data ?? []) as IndicadorEspecialidade[]).map((l) => ({
    ...l,
    vagas_total: Number(l.vagas_total),
    vagas_livres: Number(l.vagas_livres),
    vagas_reservadas: Number(l.vagas_reservadas),
    vagas_bloqueadas: Number(l.vagas_bloqueadas),
    consultas: Number(l.consultas),
    canceladas: Number(l.canceladas),
    faltas: Number(l.faltas),
    concluidas: Number(l.concluidas),
  }));
  const soma = (k: keyof IndicadorEspecialidade) => linhas.reduce((t, l) => t + Number(l[k]), 0);
  const ofertadas = soma("vagas_livres") + soma("vagas_reservadas");
  return {
    linhas,
    totais: {
      consultas: soma("consultas"),
      canceladas: soma("canceladas"),
      faltas: soma("faltas"),
      livres: soma("vagas_livres"),
      reservadas: soma("vagas_reservadas"),
      bloqueadas: soma("vagas_bloqueadas"),
      ocupacao: ofertadas ? Math.round((soma("vagas_reservadas") / ofertadas) * 100) : 0,
      cancelamento: soma("consultas") ? Math.round((soma("canceladas") / soma("consultas")) * 100) : 0,
    },
  };
}

/** Vagas por especialidade e unidade — sem médico e sem horário para escolher. */
export type ResumoVaga = {
  especialidade_id: string;
  unidade_id: string;
  total: number;
  primeira: string;
};

/** Opções de especialidade, unidade e profissionais com agenda disponível. */
export async function getOpcoesPaciente() {
  const supabase = await createClient();
  const [especialidades, unidades, resumo, profissionais] = await Promise.all([
    supabase.from("especialidades").select("id, nome, descricao").eq("status", "ativo").order("nome"),
    supabase.from("unidades").select("id, nome, endereco, cidade").eq("status", "ativo").order("nome"),
    supabase.rpc("resumo_vagas"),
    supabase.rpc("profissionais_para_agendamento"),
  ]);
  if (resumo.error) console.error("Falha ao carregar resumo de vagas:", resumo.error.message);
  return {
    erro: especialidades.error || unidades.error || resumo.error || profissionais.error
      ? "Não foi possível carregar a disponibilidade. Atualize a página e tente novamente."
      : null,
    profissionais: (profissionais.data ?? []) as Array<{ id: string; nome: string; especialidade_id: string; unidade_id: string }>,
    especialidades: especialidades.data ?? [],
    unidades: unidades.data ?? [],
    resumo: ((resumo.data ?? []) as ResumoVaga[]).map((r) => ({ ...r, total: Number(r.total) })),
  };
}

/** Opções para os formulários de agendamento e de gestão (equipe). */
export async function getOpcoes() {
  const supabase = await createClient();

  const [pacientes, profissionais, especialidades, unidades, resumo] = await Promise.all([
    supabase.from("pacientes").select("id, nome_completo").eq("status", "ativo").order("nome_completo"),
    supabase.from("profissionais").select("id, nome, especialidade_id, unidade_id, status").order("nome"),
    supabase.from("especialidades").select("id, nome, descricao").eq("status", "ativo").order("nome"),
    supabase.from("unidades").select("id, nome, endereco, cidade").eq("status", "ativo").order("nome"),
    supabase.rpc("resumo_vagas"),
  ]);

  if (resumo.error) console.error("Falha ao carregar resumo de vagas:", resumo.error.message);

  return {
    pacientes: (pacientes.data ?? []).map((p) => ({ id: p.id, nome: p.nome_completo })),
    profissionais: (profissionais.data ?? []).filter((p) => p.status === "ativo"),
    todosProfissionais: profissionais.data ?? [],
    especialidades: especialidades.data ?? [],
    unidades: unidades.data ?? [],
    resumo: ((resumo.data ?? []) as ResumoVaga[]).map((r) => ({ ...r, total: Number(r.total) })),
  };
}

/**
 * Consulta futura (agendada/confirmada) que pode ser remarcada. O RLS limita o que cada
 * um enxerga; com `pacienteId`, só aceita consultas daquele paciente (portal do paciente).
 * O banco (agendar_por_especialidade) confere tudo de novo na hora de remarcar.
 */
export async function getConsultaParaRemarcar(id: string | null | undefined, pacienteId?: string) {
  if (!uuidValido(id)) return null;
  const supabase = await createClient();
  let query = supabase
    .from("consultas")
    .select("id, data_hora, especialidade_id, paciente_id, especialidades(nome), pacientes(nome_completo)")
    .eq("id", id)
    .in("status", ["agendada", "confirmada"])
    .gt("data_hora", new Date().toISOString());
  if (pacienteId) query = query.eq("paciente_id", pacienteId);
  const { data } = await query.maybeSingle();
  if (!data?.especialidade_id) return null;
  const esp = data.especialidades as unknown as { nome: string } | null;
  const pac = data.pacientes as unknown as { nome_completo: string } | null;
  return {
    id: data.id as string,
    data_hora: data.data_hora as string,
    especialidade_id: data.especialidade_id as string,
    especialidade_nome: esp?.nome ?? "",
    paciente_id: data.paciente_id as string,
    paciente_nome: pac?.nome_completo ?? undefined,
  };
}

export type SlotAgenda = {
  id: string;
  data_hora: string;
  data_fim: string;
  status: "disponivel" | "reservado" | "bloqueado";
  profissional_id: string;
  profissional_nome: string;
  especialidade_nome: string | null;
  unidade_nome: string | null;
  paciente_nome: string | null;
  consulta_status: string | null;
};

/** Agenda detalhada para a equipe (médico vê só a própria; o banco garante). */
export async function getAgendaEquipe(
  filtros: { profissionalId?: string | null; especialidadeId?: string | null; unidadeId?: string | null; aPartirDe?: string | null } = {},
  dias = 14
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listar_agenda", {
    _profissional_id: filtros.profissionalId || null,
    _dias: dias,
    _especialidade_id: filtros.especialidadeId || null,
    _unidade_id: filtros.unidadeId || null,
    _a_partir_de: filtros.aPartirDe || null,
  });
  if (error) console.error("Falha ao listar agenda:", error.message);
  return (data ?? []) as SlotAgenda[];
}

export type Bloqueio = {
  id: string;
  profissional_id: string;
  inicio: string;
  fim: string;
  tipo: "bloqueio" | "ferias" | "afastamento" | "intervalo";
  motivo: string | null;
  profissionais: { nome: string } | null;
};

/** Bloqueios, férias e afastamentos atuais e futuros. */
export async function getBloqueios(profissionalId?: string | null) {
  const supabase = await createClient();
  let query = supabase
    .from("agenda_bloqueios")
    .select("id, profissional_id, inicio, fim, tipo, motivo, profissionais(nome)")
    .gte("fim", new Date().toISOString())
    .order("inicio")
    .limit(200);
  if (profissionalId) query = query.eq("profissional_id", profissionalId);
  const { data, error } = await query;
  if (error) console.error("Falha ao listar bloqueios:", error.message);
  return (data ?? []) as unknown as Bloqueio[];
}
