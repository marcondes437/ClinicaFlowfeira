"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/local/server";
import { getSessionUser } from "@/lib/auth";
import type { AppRole } from "@/lib/roles";
import { dicaBanco, mensagemBanco } from "@/lib/erros";
import {
  celularValido,
  cpfValido,
  dataIsoValida,
  emailValido,
  horaValida,
  nascimentoValido,
  periodoValido,
  soDigitos,
  telefoneValido,
  UFS,
  uuidValido,
} from "@/lib/validacao";

export type EstadoForm = { ok?: string; erro?: string };

function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Defesa extra no servidor (o banco também valida por RLS/funções). */
async function exigirCargo(cargos: AppRole[]) {
  const user = await getSessionUser();
  if (!user) return { erro: "Sua sessão expirou. Entre novamente." } as const;
  if (!user.roles.some((r) => cargos.includes(r))) return { erro: "Você não tem permissão para fazer isso." } as const;
  return { user } as const;
}

function revalidarAgendas() {
  for (const caminho of [
    "/admin",
    "/admin/agenda",
    "/recepcao",
    "/recepcao/agenda",
    "/gestor",
    "/gestor/agenda",
    "/medico",
    "/enfermagem",
    "/paciente",
    "/paciente/agendar",
    "/paciente/historico",
  ]) {
    revalidatePath(caminho);
  }
}

// ------------------------------------------------------------------
// Cadastros da equipe
// ------------------------------------------------------------------

export async function criarPaciente(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const permissao = await exigirCargo(["admin", "gestor", "recepcionista", "enfermeiro"]);
  if ("erro" in permissao) return { erro: permissao.erro };

  const nome = str(formData, "nome_completo");
  if (!nome || nome.length < 3) return { erro: "Informe o nome completo." };
  const nascimento = str(formData, "data_nascimento");
  if (nascimento && !nascimentoValido(nascimento)) return { erro: "Data de nascimento inválida." };
  const celular = str(formData, "celular");
  if (celular && !celularValido(celular)) return { erro: "Celular inválido: use DDD + 9 dígitos." };
  const telefone = str(formData, "telefone");
  if (telefone && !telefoneValido(telefone)) return { erro: "Telefone inválido: inclua o DDD." };
  const email = str(formData, "email");
  if (email && !emailValido(email)) return { erro: "E-mail inválido." };
  const cpf = soDigitos(str(formData, "cpf")) || null;
  if (cpf && !cpfValido(cpf)) return { erro: "CPF inválido. Confira os números." };
  const estado = str(formData, "estado")?.toUpperCase() ?? null;
  if (estado && !UFS.includes(estado)) return { erro: "UF inválida." };
  const cep = soDigitos(str(formData, "cep")) || null;
  if (cep && cep.length !== 8) return { erro: "CEP inválido." };

  const supabase = await createClient();

  // Dados operacionais ficam em "pacientes"; CPF/endereço em "pacientes_dados_sensiveis" (LGPD).
  const { data: paciente, error } = await supabase
    .from("pacientes")
    .insert({
      nome_completo: nome,
      data_nascimento: nascimento,
      telefone: telefone ? soDigitos(telefone) : null,
      celular: celular ? soDigitos(celular) : null,
      email: email?.toLowerCase() ?? null,
      observacoes: str(formData, "observacoes"),
    })
    .select("id")
    .single();

  if (error || !paciente) return { erro: mensagemBanco(error, "Não foi possível cadastrar o paciente.") };

  revalidatePath("/admin/pacientes");
  revalidatePath("/recepcao/pacientes");

  const sensiveis = {
    cpf,
    endereco: str(formData, "endereco"),
    cidade: str(formData, "cidade"),
    estado,
    cep,
    contato_emergencia: str(formData, "contato_emergencia"),
  };

  if (Object.values(sensiveis).some(Boolean)) {
    const { error: erroSensivel } = await supabase
      .from("pacientes_dados_sensiveis")
      .insert({ paciente_id: paciente.id, ...sensiveis });
    if (erroSensivel) {
      return {
        ok:
          erroSensivel.code === "23505"
            ? "Paciente cadastrado, mas este CPF já pertence a outro cadastro. Confira antes de completar."
            : "Paciente cadastrado. CPF e endereço não foram salvos: só a recepção e a equipe clínica podem registrar esses dados (LGPD).",
      };
    }
  }

  return { ok: "Paciente cadastrado com sucesso." };
}

/** Cria a especialidade ou, com `id`, atualiza nome e descrição. */
export async function salvarEspecialidade(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const permissao = await exigirCargo(["admin", "gestor"]);
  if ("erro" in permissao) return { erro: permissao.erro };
  const id = str(formData, "id");
  if (id && !uuidValido(id)) return { erro: "Especialidade inválida." };
  const nome = str(formData, "nome");
  if (!nome || nome.length < 3 || nome.length > 80) return { erro: "Informe um nome entre 3 e 80 caracteres." };
  const descricao = str(formData, "descricao");
  if (descricao && descricao.length > 500) return { erro: "A descrição deve ter até 500 caracteres." };

  const supabase = await createClient();
  const dados = { nome, descricao };
  const { data, error } = id
    ? await supabase.from("especialidades").update(dados).eq("id", id).select("id")
    : await supabase.from("especialidades").insert(dados).select("id");
  if (error) return { erro: error.code === "23505" ? "Já existe uma especialidade com esse nome." : mensagemBanco(error, "Não foi possível salvar.") };
  if (!data?.length) return { erro: "Especialidade não encontrada ou sem permissão." };
  revalidatePath("/admin/especialidades");
  revalidarAgendas();
  revalidatePath("/");
  return { ok: id ? "Especialidade atualizada." : "Especialidade cadastrada." };
}

export async function alternarStatusEspecialidade(formData: FormData) {
  const permissao = await exigirCargo(["admin", "gestor"]);
  if ("erro" in permissao) return;
  const id = str(formData, "id");
  const status = str(formData, "status");
  if (!uuidValido(id) || (status !== "ativo" && status !== "inativo")) return;
  const supabase = await createClient();
  const { error } = await supabase.from("especialidades").update({ status }).eq("id", id);
  if (error) console.error("Falha ao alterar especialidade:", error.message);
  revalidatePath("/admin/especialidades");
  revalidarAgendas();
  revalidatePath("/");
}

/** Cria a unidade ou, com `id`, atualiza os dados dela. */
export async function salvarUnidade(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const permissao = await exigirCargo(["admin", "gestor"]);
  if ("erro" in permissao) return { erro: permissao.erro };
  const id = str(formData, "id");
  if (id && !uuidValido(id)) return { erro: "Unidade inválida." };
  const nome = str(formData, "nome");
  if (!nome || nome.length < 3 || nome.length > 120) return { erro: "Informe o nome da unidade." };
  const email = str(formData, "email");
  if (email && !emailValido(email)) return { erro: "E-mail inválido." };
  const telefone = str(formData, "telefone");
  if (telefone && !telefoneValido(telefone)) return { erro: "Telefone inválido: inclua o DDD." };
  const estado = str(formData, "estado")?.toUpperCase() ?? null;
  if (estado && !UFS.includes(estado)) return { erro: "UF inválida." };

  const supabase = await createClient();
  const dados = {
    nome,
    endereco: str(formData, "endereco"),
    cidade: str(formData, "cidade"),
    estado,
    telefone,
    email: email?.toLowerCase() ?? null,
    horario_funcionamento: str(formData, "horario_funcionamento"),
  };
  const { data, error } = id
    ? await supabase.from("unidades").update(dados).eq("id", id).select("id")
    : await supabase.from("unidades").insert(dados).select("id");
  if (error) return { erro: mensagemBanco(error, "Não foi possível salvar a unidade.") };
  if (!data?.length) return { erro: "Unidade não encontrada ou sem permissão." };
  revalidatePath("/admin/unidades");
  revalidarAgendas();
  revalidatePath("/");
  return { ok: id ? "Unidade atualizada." : "Unidade cadastrada." };
}

export async function alternarStatusUnidade(formData: FormData) {
  const permissao = await exigirCargo(["admin", "gestor"]);
  if ("erro" in permissao) return;
  const id = str(formData, "id");
  const status = str(formData, "status");
  if (!uuidValido(id) || (status !== "ativo" && status !== "inativo")) return;
  const supabase = await createClient();
  const { error } = await supabase.from("unidades").update({ status }).eq("id", id);
  if (error) console.error("Falha ao alterar unidade:", error.message);
  revalidatePath("/admin/unidades");
  revalidarAgendas();
  revalidatePath("/");
}

function dadosProfissional(formData: FormData) {
  const nome = str(formData, "nome");
  const email = str(formData, "email");
  const telefone = str(formData, "telefone");
  const especialidade = str(formData, "especialidade_id");
  const unidade = str(formData, "unidade_id");
  if (!nome || nome.length < 3) return { erro: "Informe o nome do profissional." } as const;
  if (email && !emailValido(email)) return { erro: "E-mail inválido." } as const;
  if (telefone && !telefoneValido(telefone)) return { erro: "Telefone inválido: inclua o DDD." } as const;
  if (especialidade && !uuidValido(especialidade)) return { erro: "Especialidade inválida." } as const;
  if (unidade && !uuidValido(unidade)) return { erro: "Unidade inválida." } as const;
  return {
    dados: {
      nome,
      registro_profissional: str(formData, "registro_profissional"),
      especialidade_id: especialidade,
      unidade_id: unidade,
      telefone,
      email: email?.toLowerCase() ?? null,
      descricao: str(formData, "descricao"),
    },
  } as const;
}

export async function criarProfissional(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const permissao = await exigirCargo(["admin", "gestor"]);
  if ("erro" in permissao) return { erro: permissao.erro };
  const r = dadosProfissional(formData);
  if ("erro" in r) return { erro: r.erro };

  const supabase = await createClient();
  const { error } = await supabase.from("profissionais").insert(r.dados);
  if (error) {
    return { erro: error.code === "23505" ? "Já existe um profissional com esse registro ou CPF." : mensagemBanco(error, "Não foi possível cadastrar.") };
  }
  revalidatePath("/admin/profissionais");
  revalidatePath("/");
  return { ok: "Profissional cadastrado. Agora libere a agenda dele em Agenda e consultas." };
}

export async function atualizarProfissional(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const permissao = await exigirCargo(["admin", "gestor"]);
  if ("erro" in permissao) return { erro: permissao.erro };
  const id = str(formData, "id");
  if (!uuidValido(id)) return { erro: "Profissional inválido." };
  const r = dadosProfissional(formData);
  if ("erro" in r) return { erro: r.erro };
  const status = str(formData, "status") === "inativo" ? "inativo" : "ativo";

  const supabase = await createClient();
  const { error } = await supabase.from("profissionais").update({ ...r.dados, status }).eq("id", id);
  if (error) return { erro: mensagemBanco(error, "Não foi possível salvar as alterações.") };

  revalidatePath("/admin/profissionais");
  revalidarAgendas();

  // Inativar não cancela consultas sozinho: avisa quantas precisam ser remarcadas.
  if (status === "inativo") {
    const { count } = await supabase
      .from("consultas")
      .select("id", { count: "exact", head: true })
      .eq("profissional_id", id)
      .in("status", ["agendada", "confirmada"])
      .gte("data_hora", new Date().toISOString());
    if (count) {
      return { ok: `Profissional inativado: não recebe novas consultas. Atenção: ${count} consulta(s) futura(s) dele precisam ser remarcadas.` };
    }
    return { ok: "Profissional inativado: não recebe novas consultas." };
  }
  return { ok: "Dados do profissional atualizados." };
}

export async function vincularAcessoProfissional(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const permissao = await exigirCargo(["admin", "gestor"]);
  if ("erro" in permissao) return { erro: permissao.erro };
  const id = str(formData, "id");
  const email = str(formData, "email");
  if (!uuidValido(id)) return { erro: "Profissional inválido." };
  if (!email || !emailValido(email)) return { erro: "Informe o e-mail da conta do profissional." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vincular_acesso_profissional", { _profissional_id: id, _email: email });
  if (error) return { erro: mensagemBanco(error, "Não foi possível vincular o acesso.") };
  revalidatePath("/admin/profissionais");
  return { ok: `Acesso vinculado: ${data} já pode entrar pelo Portal do Médico.` };
}

// ------------------------------------------------------------------
// Dados do paciente (2ª etapa do cadastro, feita no primeiro login)
// ------------------------------------------------------------------

export async function salvarMeusDados(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const cpf = soDigitos(str(formData, "cpf"));
  if (!cpfValido(cpf)) return { erro: "CPF inválido. Confira os números." };
  const celular = str(formData, "celular");
  if (!celularValido(celular)) return { erro: "Informe o celular com DDD (ex.: (11) 98888-7777)." };
  const nascimento = str(formData, "data_nascimento");
  if (!nascimentoValido(nascimento)) return { erro: "Informe uma data de nascimento válida." };
  const estado = str(formData, "estado")?.toUpperCase() ?? null;
  if (estado && !UFS.includes(estado)) return { erro: "UF inválida." };
  const cep = soDigitos(str(formData, "cep"));
  if (cep && cep.length !== 8) return { erro: "CEP inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_meus_dados", {
    _celular: soDigitos(celular),
    _data_nascimento: nascimento,
    _cpf: cpf,
    _cep: cep || null,
    _cidade: str(formData, "cidade"),
    _estado: estado,
    _contato_emergencia: str(formData, "contato_emergencia"),
  });

  if (error) return { erro: mensagemBanco(error, "Não foi possível salvar seus dados.") };

  revalidatePath("/paciente", "layout");
  const destino = str(formData, "next");
  if (destino && destino.startsWith("/paciente") && !destino.startsWith("//") && !destino.startsWith("/paciente/meus-dados")) {
    redirect(destino);
  }
  return { ok: "Dados salvos com sucesso." };
}

// ------------------------------------------------------------------
// Agendamento por especialidade
// ------------------------------------------------------------------

export type ConsultaMarcada = {
  id: string;
  data_hora: string;
  status: string;
  profissional: string;
  especialidade: string;
  unidade: string;
  endereco: string | null;
};

export type EstadoAgendamento = {
  erro?: string;
  /** Código do banco: "sem_vagas", "ja_agendada", "cadastro_incompleto"... */
  dica?: string | null;
  consulta?: ConsultaMarcada;
  remarcada?: boolean;
};

type Preferencias = {
  especialidadeId: string;
  unidadeId: string | null;
  periodo: string | null;
  aPartirDe: string | null;
  pacienteId: string | null;
  remarcarId: string | null;
};

function lerPreferencias(formData: FormData): Preferencias | { erro: string } {
  const especialidadeId = str(formData, "especialidade_id");
  if (!uuidValido(especialidadeId)) return { erro: "Escolha a especialidade." };
  const unidadeId = str(formData, "unidade_id");
  if (unidadeId && !uuidValido(unidadeId)) return { erro: "Unidade inválida." };
  const periodo = str(formData, "periodo");
  if (periodo && !periodoValido(periodo)) return { erro: "Período inválido." };
  const aPartirDe = str(formData, "a_partir_de");
  if (aPartirDe && !dataIsoValida(aPartirDe)) return { erro: "Data inválida." };
  const pacienteId = str(formData, "paciente_id");
  if (pacienteId && !uuidValido(pacienteId)) return { erro: "Paciente inválido." };
  const remarcarId = str(formData, "remarcar_consulta_id");
  if (remarcarId && !uuidValido(remarcarId)) return { erro: "Consulta inválida." };
  return { especialidadeId, unidadeId, periodo, aPartirDe, pacienteId, remarcarId };
}

/**
 * O paciente informa a especialidade (e, se quiser, unidade, período e data mínima).
 * O banco escolhe o PRIMEIRO horário livre da agenda médica e o médico, numa transação.
 * A confirmação é lida de novo do banco e só então o nome do médico aparece.
 */
export async function agendarConsulta(_prev: EstadoAgendamento, formData: FormData): Promise<EstadoAgendamento> {
  const pref = lerPreferencias(formData);
  if ("erro" in pref) return { erro: pref.erro };
  const motivo = str(formData, "motivo");
  if (motivo && motivo.length > 200) return { erro: "O motivo deve ter até 200 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agendar_por_especialidade", {
    _especialidade_id: pref.especialidadeId,
    _unidade_id: pref.unidadeId,
    _periodo: pref.periodo,
    _a_partir_de: pref.aPartirDe,
    _motivo: motivo,
    _paciente_id: pref.pacienteId,
    _remarcar_consulta_id: pref.remarcarId,
  });

  if (error) {
    if (error.code !== "P0001") console.error("Falha ao agendar:", error.code, error.message);
    return {
      erro: mensagemBanco(error, "Não foi possível marcar a consulta. Tente novamente."),
      dica: dicaBanco(error),
    };
  }

  const linha = (data as Array<{ id_consulta: string }> | null)?.[0];
  if (!linha?.id_consulta) return { erro: "Não foi possível marcar a consulta. Tente novamente." };

  // Confirmação com os dados atualizados direto do banco.
  const { data: c, error: erroLeitura } = await supabase
    .from("consultas")
    .select("id, data_hora, status, profissionais(nome), especialidades(nome), unidades(nome, endereco, cidade)")
    .eq("id", linha.id_consulta)
    .single();

  revalidarAgendas();

  if (erroLeitura || !c) {
    console.error("Consulta marcada, mas falhou a releitura:", erroLeitura?.message);
    return { erro: "Consulta marcada! Veja os detalhes no seu painel." };
  }

  const prof = c.profissionais as unknown as { nome: string } | null;
  const esp = c.especialidades as unknown as { nome: string } | null;
  const uni = c.unidades as unknown as { nome: string; endereco: string | null; cidade: string | null } | null;

  return {
    remarcada: Boolean(pref.remarcarId),
    consulta: {
      id: c.id,
      data_hora: c.data_hora,
      status: c.status,
      profissional: prof?.nome ?? "—",
      especialidade: esp?.nome ?? "—",
      unidade: uni?.nome ?? "—",
      endereco: [uni?.endereco, uni?.cidade].filter(Boolean).join(", ") || null,
    },
  };
}

export type PreviaVaga = { data_hora: string; unidade: string } | null;

/** Primeiro horário que o sistema atribuiria — calculado no banco, sem revelar o médico. */
export async function previsualizarVaga(dados: {
  especialidadeId: string;
  unidadeId?: string | null;
  periodo?: string | null;
  aPartirDe?: string | null;
  pacienteId?: string | null;
  remarcarId?: string | null;
}): Promise<{ previa: PreviaVaga; erro?: string }> {
  if (!uuidValido(dados.especialidadeId)) return { previa: null, erro: "Escolha a especialidade." };
  if (dados.unidadeId && !uuidValido(dados.unidadeId)) return { previa: null, erro: "Unidade inválida." };
  if (dados.periodo && !periodoValido(dados.periodo)) return { previa: null, erro: "Período inválido." };
  if (dados.aPartirDe && !dataIsoValida(dados.aPartirDe)) return { previa: null, erro: "Data inválida." };
  if (dados.pacienteId && !uuidValido(dados.pacienteId)) return { previa: null, erro: "Paciente inválido." };
  if (dados.remarcarId && !uuidValido(dados.remarcarId)) return { previa: null, erro: "Consulta inválida." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("previsualizar_vaga", {
    _especialidade_id: dados.especialidadeId,
    _unidade_id: dados.unidadeId || null,
    _periodo: dados.periodo || null,
    _a_partir_de: dados.aPartirDe || null,
    _paciente_id: dados.pacienteId || null,
    _remarcar_consulta_id: dados.remarcarId || null,
  });
  if (error) return { previa: null, erro: mensagemBanco(error, "Não foi possível consultar a agenda agora.") };
  const linha = (data as Array<{ data_hora: string; unidade_nome: string }> | null)?.[0];
  return { previa: linha ? { data_hora: linha.data_hora, unidade: linha.unidade_nome } : null };
}

export async function cancelarConsulta(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = str(formData, "id");
  if (!uuidValido(id)) return { erro: "Consulta inválida." };
  const motivo = str(formData, "motivo");
  if (motivo && motivo.length > 200) return { erro: "O motivo deve ter até 200 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_consulta", { _consulta_id: id, _motivo: motivo });
  if (error) return { erro: mensagemBanco(error, "Não foi possível cancelar a consulta.") };

  revalidarAgendas();
  return { ok: "Consulta cancelada. O horário voltou para a agenda." };
}

export async function alterarStatusConsulta(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = str(formData, "id");
  const status = str(formData, "status");
  if (!uuidValido(id) || !status) return { erro: "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("alterar_status_consulta", { _consulta_id: id, _status: status });
  if (error) return { erro: mensagemBanco(error, "Não foi possível atualizar a consulta.") };

  revalidarAgendas();
  return { ok: "Situação atualizada." };
}

// ------------------------------------------------------------------
// Agenda do médico
// ------------------------------------------------------------------

/** Libera um bloco de horários (ex.: seg a sex, 8h às 12h, a cada 30 min, com intervalo). */
export async function liberarAgenda(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const profissionalId = str(formData, "profissional_id");
  const dataInicio = str(formData, "data_inicio");
  const dataFim = str(formData, "data_fim") ?? dataInicio;
  const horaInicio = str(formData, "hora_inicio");
  const horaFim = str(formData, "hora_fim");
  const pausaInicio = str(formData, "pausa_inicio");
  const pausaFim = str(formData, "pausa_fim");
  const duracao = Number(str(formData, "duracao") ?? "30");
  const dias = [...new Set(formData.getAll("dias").map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  if (!uuidValido(profissionalId)) return { erro: "Selecione o profissional." };
  if (!dataIsoValida(dataInicio) || !dataIsoValida(dataFim)) return { erro: "Informe as datas." };
  if (!horaValida(horaInicio) || !horaValida(horaFim)) return { erro: "Informe os horários." };
  if ((pausaInicio && !horaValida(pausaInicio)) || (pausaFim && !horaValida(pausaFim))) return { erro: "Intervalo inválido." };
  if (Boolean(pausaInicio) !== Boolean(pausaFim)) return { erro: "Informe o início e o fim do intervalo (ou deixe os dois em branco)." };
  if (!Number.isInteger(duracao) || duracao < 10 || duracao > 240) return { erro: "Duração inválida." };
  if (!dias.length) return { erro: "Marque pelo menos um dia da semana." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("liberar_agenda", {
    _profissional_id: profissionalId,
    _data_inicio: dataInicio,
    _data_fim: dataFim,
    _dias_semana: dias,
    _hora_inicio: horaInicio,
    _hora_fim: horaFim,
    _duracao_minutos: duracao,
    _pausa_inicio: pausaInicio,
    _pausa_fim: pausaFim,
  });

  if (error) return { erro: mensagemBanco(error, "Não foi possível liberar os horários.") };

  revalidarAgendas();
  const total = Number(data ?? 0);
  return {
    ok:
      total > 0
        ? `${total} horário${total === 1 ? "" : "s"} liberado${total === 1 ? "" : "s"} para agendamento.`
        : "Nenhum horário novo: eles já estavam na agenda, caíram em bloqueio/intervalo ou ficaram no passado.",
  };
}

export async function removerHorario(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = str(formData, "id");
  if (!uuidValido(id)) return { erro: "Horário inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_horario", { _agenda_id: id });
  if (error) return { erro: mensagemBanco(error, "Não foi possível remover o horário.") };
  revalidarAgendas();
  return { ok: "Horário removido." };
}

const TIPOS_BLOQUEIO = ["bloqueio", "ferias", "afastamento", "intervalo"];

export async function criarBloqueio(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const profissionalId = str(formData, "profissional_id");
  const dataInicio = str(formData, "data_inicio");
  const dataFim = str(formData, "data_fim") ?? dataInicio;
  const horaInicio = str(formData, "hora_inicio");
  const horaFim = str(formData, "hora_fim");
  const tipo = str(formData, "tipo") ?? "bloqueio";
  const motivo = str(formData, "motivo");

  if (!uuidValido(profissionalId)) return { erro: "Selecione o profissional." };
  if (!dataIsoValida(dataInicio) || !dataIsoValida(dataFim)) return { erro: "Informe as datas." };
  if ((horaInicio && !horaValida(horaInicio)) || (horaFim && !horaValida(horaFim))) return { erro: "Horário inválido." };
  if (Boolean(horaInicio) !== Boolean(horaFim)) return { erro: "Informe as duas horas ou deixe as duas em branco (dia inteiro)." };
  if (!TIPOS_BLOQUEIO.includes(tipo)) return { erro: "Tipo inválido." };
  if (motivo && motivo.length > 200) return { erro: "O motivo deve ter até 200 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("criar_bloqueio", {
    _profissional_id: profissionalId,
    _data_inicio: dataInicio,
    _data_fim: dataFim,
    _hora_inicio: horaInicio,
    _hora_fim: horaFim,
    _tipo: tipo,
    _motivo: motivo,
  });
  if (error) return { erro: mensagemBanco(error, "Não foi possível registrar o bloqueio.") };

  revalidarAgendas();
  const total = Number(data ?? 0);
  return { ok: `Bloqueio registrado. ${total} horário${total === 1 ? "" : "s"} livre${total === 1 ? "" : "s"} saí${total === 1 ? "u" : "ram"} da agenda.` };
}

export async function removerBloqueio(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = str(formData, "id");
  if (!uuidValido(id)) return { erro: "Bloqueio inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remover_bloqueio", { _bloqueio_id: id });
  if (error) return { erro: mensagemBanco(error, "Não foi possível remover o bloqueio.") };
  revalidarAgendas();
  const total = Number(data ?? 0);
  return { ok: `Bloqueio removido. ${total} horário${total === 1 ? "" : "s"} voltou/voltaram para a agenda.` };
}

// ------------------------------------------------------------------
// Prontuário
// ------------------------------------------------------------------

export async function registrarEvolucao(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const permissao = await exigirCargo(["medico", "enfermeiro"]);
  if ("erro" in permissao) return { erro: "Só médicos e enfermagem registram evoluções." };

  const pacienteId = str(formData, "paciente_id");
  const consultaId = str(formData, "consulta_id");
  const descricao = str(formData, "descricao");
  if (!uuidValido(pacienteId)) return { erro: "Paciente inválido." };
  if (consultaId && !uuidValido(consultaId)) return { erro: "Consulta inválida." };
  if (!descricao || descricao.length < 3) return { erro: "Descreva a evolução." };
  if (descricao.length > 5000) return { erro: "Texto muito longo (máximo de 5.000 caracteres)." };

  const supabase = await createClient();
  const { error } = await supabase.from("evolucoes").insert({
    paciente_id: pacienteId,
    consulta_id: consultaId,
    descricao,
    autor_id: permissao.user.id,
  });

  if (error) {
    return {
      erro: error.code === "42501" ? "Você só pode registrar evolução de pacientes que atende." : mensagemBanco(error, "Não foi possível registrar."),
    };
  }
  revalidatePath(`/medico/pacientes/${pacienteId}`);
  revalidatePath("/medico");
  return { ok: "Evolução registrada." };
}
