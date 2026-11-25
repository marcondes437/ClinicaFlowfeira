/**
 * Datas sempre no fuso da clínica (America/Sao_Paulo), mesmo quando a página é
 * renderizada num servidor em UTC (Vercel, etc.). Antes, horários do painel saíam
 * 3 horas adiantados no servidor e "consultas de hoje" usavam o dia em UTC.
 */
export const TZ = "America/Sao_Paulo";

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtIso = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export function dataHora(valor: string | null) {
  if (!valor) return "—";
  return fmtDataHora.format(new Date(valor)).replace(",", "");
}

/** Só a data. Datas puras (AAAA-MM-DD, ex.: nascimento) não sofrem ajuste de fuso. */
export function dataCurta(valor: string | null) {
  if (!valor) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split("-");
    return `${d}/${m}/${a}`;
  }
  return fmtData.format(new Date(valor));
}

export function hora(valor: string | null) {
  if (!valor) return "—";
  return fmtHora.format(new Date(valor));
}

export function moeda(valor: number | null | undefined) {
  return (valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Data de hoje (ou de `d`) no fuso da clínica, como AAAA-MM-DD. */
export function hojeIso(d = new Date()) {
  return fmtIso.format(d);
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d + dias));
  return data.toISOString().slice(0, 10);
}

/** Deslocamento (em minutos) de São Paulo em relação ao UTC numa data. */
function offsetMinutos(data: Date) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(data);
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const comoUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((comoUtc - data.getTime()) / 60000);
}

/** Instante (ISO, UTC) de AAAA-MM-DD às HH:MM no horário de Brasília. */
export function instanteSaoPaulo(iso: string, horaMinuto = "00:00") {
  const [a, m, d] = iso.split("-").map(Number);
  const [h, min] = horaMinuto.split(":").map(Number);
  const palpite = Date.UTC(a, m - 1, d, h, min);
  const offset = offsetMinutos(new Date(palpite));
  return new Date(palpite - offset * 60000).toISOString();
}

/** Início do dia (00:00 em São Paulo) como ISO UTC. */
export function inicioDoDia(d = new Date()) {
  return instanteSaoPaulo(hojeIso(d), "00:00");
}

/** Fim do dia (23:59:59.999 em São Paulo) como ISO UTC. */
export function fimDoDia(d = new Date()) {
  const amanha = instanteSaoPaulo(somarDias(hojeIso(d), 1), "00:00");
  return new Date(new Date(amanha).getTime() - 1).toISOString();
}
