import { createClient } from "@/lib/local/server";

export type PacienteDoUsuario = {
  id: string;
  nome_completo: string;
  celular: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  cadastro_completo_em: string | null;
};

// Observação: cidade/CPF ficam em pacientes_dados_sensiveis (LGPD), não em pacientes.
export async function getPacienteDoUsuario(userId: string): Promise<PacienteDoUsuario | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, nome_completo, celular, telefone, email, data_nascimento, cadastro_completo_em")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) console.error("Falha ao carregar paciente do usuário:", error.message);
  return data;
}

export function cadastroCompleto(paciente: PacienteDoUsuario | null) {
  return Boolean(paciente?.cadastro_completo_em);
}

/** Aceita somente caminhos internos (evita redirecionamento aberto). */
export function caminhoSeguro(valor: string | null | undefined, padrao = "/paciente") {
  return valor && valor.startsWith("/") && !valor.startsWith("//") ? valor : padrao;
}

export function linkCompletarCadastro(destino: string) {
  return `/paciente/meus-dados?next=${encodeURIComponent(caminhoSeguro(destino))}`;
}
