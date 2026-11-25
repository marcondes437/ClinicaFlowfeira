/**
 * Validações compartilhadas entre formulários (navegador) e server actions.
 * O banco repete as regras importantes: isto aqui é para dar retorno rápido ao usuário,
 * não para proteger regra de negócio.
 */

export function soDigitos(valor: string | null | undefined) {
  return (valor ?? "").replace(/\D/g, "");
}

/** CPF com dígitos verificadores (mesma regra de private.cpf_valido no banco). */
export function cpfValido(valor: string | null | undefined) {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string, pesoInicial: number) => {
    const soma = [...base].reduce((total, n, i) => total + Number(n) * (pesoInicial - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9), 10) === Number(cpf[9]) && digito(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

/** Celular brasileiro com DDD: 11 dígitos, começando com 9 após o DDD. */
export function celularValido(valor: string | null | undefined) {
  const d = soDigitos(valor);
  return d.length === 11 && d[0] !== "0" && d[2] === "9";
}

/** Telefone fixo ou celular com DDD (10 ou 11 dígitos). */
export function telefoneValido(valor: string | null | undefined) {
  const d = soDigitos(valor);
  return (d.length === 10 || d.length === 11) && d[0] !== "0";
}

export function emailValido(valor: string | null | undefined) {
  const email = (valor ?? "").trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Nome completo: pelo menos duas palavras, só letras, espaços, apóstrofo e hífen. */
export function nomeCompletoValido(valor: string | null | undefined) {
  const nome = (valor ?? "").trim().replace(/\s+/g, " ");
  return nome.length >= 5 && nome.length <= 120 && /^[\p{L}' -]+$/u.test(nome) && nome.split(" ").length >= 2;
}

/** Senha: 8+ caracteres com letra e número. */
export function senhaForte(valor: string | null | undefined) {
  const senha = valor ?? "";
  return senha.length >= 8 && senha.length <= 72 && /[A-Za-z]/.test(senha) && /\d/.test(senha);
}

/**
 * Data AAAA-MM-DD real, até hoje e com no máximo 130 anos. "Hoje" é o dia em
 * São Paulo: num servidor em UTC, depois das 21h o dia UTC já virou e a data de
 * amanhã passava como válida.
 */
export function nascimentoValido(valor: string | null | undefined, hoje = new Date()) {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return false;
  const hojeSp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(hoje); // AAAA-MM-DD
  return valor <= hojeSp && ano >= Number(hojeSp.slice(0, 4)) - 130;
}

export function dataIsoValida(valor: string | null | undefined) {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

export function horaValida(valor: string | null | undefined) {
  return Boolean(valor && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidValido(valor: string | null | undefined): valor is string {
  return Boolean(valor && UUID.test(valor));
}

/**
 * Texto que parece conter CPF (com ou sem pontuação). Usado para impedir que dados
 * de pacientes sejam enviados ao Trello por engano.
 */
export function contemCpf(texto: string | null | undefined) {
  return /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(texto ?? "");
}

export const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export const PERIODOS = ["manha", "tarde", "noite"] as const;
export type Periodo = (typeof PERIODOS)[number];
export function periodoValido(valor: string | null | undefined): valor is Periodo {
  return PERIODOS.includes(valor as Periodo);
}
