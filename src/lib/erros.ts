/** Erro devolvido pelo Supabase/PostgREST. */
export type ErroBanco = { code?: string; message: string; hint?: string | null; details?: string | null } | null;

/**
 * Mensagens de RAISE EXCEPTION (código P0001) foram escritas para o usuário final.
 * Qualquer outro erro (permissão, rede, restrição) vira uma mensagem genérica,
 * para não expor detalhes internos do banco.
 */
export function mensagemBanco(error: ErroBanco, padrao: string) {
  if (!error) return padrao;
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "42501") return "Você não tem permissão para fazer isso.";
  if (error.code === "23505") return "Esse registro já existe.";
  return padrao;
}

/** Código curto que o banco coloca em HINT (ex.: "sem_vagas") para a tela reagir. */
export function dicaBanco(error: ErroBanco) {
  return error?.code === "P0001" && error.hint ? error.hint : null;
}

/** Traduz os erros mais comuns do Supabase Auth. */
export function traduzirErroAuth(mensagem: string | null | undefined) {
  const m = (mensagem ?? "").toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already exists")) {
    return "Já existe uma conta com este e-mail. Entre ou recupere a senha.";
  }
  if (m.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (m.includes("password should be") || m.includes("weak password") || m.includes("password is too weak")) {
    return "Senha fraca: use pelo menos 8 caracteres, com letras e números.";
  }
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("security purposes")) {
    return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  }
  if (m.includes("invalid email") || m.includes("unable to validate email")) return "E-mail inválido.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "Cadastro temporariamente desativado.";
  return "Não foi possível concluir. Tente novamente em instantes.";
}
