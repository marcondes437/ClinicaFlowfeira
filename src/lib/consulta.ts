/** Consulta futura que ainda pode ser remarcada ou cancelada (o banco confere de novo). */
export function consultaAlteravel(c: { status: string; data_hora: string }, agora = Date.now()) {
  return (c.status === "agendada" || c.status === "confirmada") && new Date(c.data_hora).getTime() > agora;
}
