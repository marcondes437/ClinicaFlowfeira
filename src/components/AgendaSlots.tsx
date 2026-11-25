import { removerHorario } from "@/lib/actions";
import type { SlotAgenda } from "@/lib/queries";
import { STATUS_CONSULTA_LABEL } from "@/lib/roles";
import AcaoRapida from "./AcaoRapida";

const TZ = "America/Sao_Paulo";
const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

const STATUS: Record<SlotAgenda["status"], { rotulo: string; classe: string }> = {
  disponivel: { rotulo: "Livre", classe: "cx-badge-ok" },
  reservado: { rotulo: "Ocupado", classe: "cx-badge-warn" },
  bloqueado: { rotulo: "Bloqueado", classe: "cx-badge-danger" },
};

/** Agenda da equipe agrupada por dia: livres, ocupados e bloqueados. */
export default function AgendaSlots({
  slots,
  mostrarProfissional = true,
  podeRemover = true,
}: {
  slots: SlotAgenda[];
  mostrarProfissional?: boolean;
  podeRemover?: boolean;
}) {
  if (!slots.length) {
    return <p style={{ color: "var(--cx-muted)", margin: 0 }}>Nenhum horário na agenda para o período e os filtros escolhidos.</p>;
  }

  const livres = slots.filter((s) => s.status === "disponivel").length;
  const ocupados = slots.filter((s) => s.status === "reservado").length;
  const bloqueados = slots.length - livres - ocupados;
  const porDia = new Map<string, SlotAgenda[]>();
  for (const s of slots) {
    const dia = fmtDia.format(new Date(s.data_hora));
    porDia.set(dia, [...(porDia.get(dia) ?? []), s]);
  }

  return (
    <>
      <p style={{ margin: "0 0 0.8rem", color: "var(--cx-muted)", fontSize: "0.9rem" }}>
        {slots.length} horários · <strong style={{ color: "var(--cx-ok)" }}>{livres} livres</strong> · {ocupados} ocupados · {bloqueados} bloqueados
        {slots.length >= 1000 && " · mostrando os primeiros 1.000; use os filtros"}
      </p>
      <table className="cx-table cx-table-cards">
        <thead>
          <tr>
            <th>Dia</th>
            <th>Hora</th>
            {mostrarProfissional && <th>Profissional</th>}
            <th>Especialidade · Unidade</th>
            <th>Situação</th>
            {podeRemover && <th><span className="cx-visually-hidden">Ações</span></th>}
          </tr>
        </thead>
        <tbody>
          {[...porDia.entries()].flatMap(([dia, itens]) =>
            itens.map((s, i) => (
              <tr key={s.id}>
                <td data-label="Dia">{i === 0 ? <strong>{dia}</strong> : <span className="cx-hide-desktop">{dia}</span>}</td>
                <td data-label="Hora">
                  {fmtHora.format(new Date(s.data_hora))}–{fmtHora.format(new Date(s.data_fim))}
                </td>
                {mostrarProfissional && <td data-label="Profissional">{s.profissional_nome}</td>}
                <td data-label="Especialidade">{[s.especialidade_nome, s.unidade_nome].filter(Boolean).join(" · ")}</td>
                <td data-label="Situação">
                  <span className={`cx-badge ${STATUS[s.status]?.classe ?? ""}`}>{STATUS[s.status]?.rotulo ?? s.status}</span>
                  {s.paciente_nome && (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                      {s.paciente_nome}
                      {s.consulta_status && ` (${STATUS_CONSULTA_LABEL[s.consulta_status] ?? s.consulta_status})`}
                    </span>
                  )}
                </td>
                {podeRemover && (
                  <td data-label="">
                    {s.status !== "reservado" && (
                      <AcaoRapida
                        acao={removerHorario}
                        id={s.id}
                        rotulo="Remover"
                        rotuloAria={`Remover horário ${dia} ${fmtHora.format(new Date(s.data_hora))}`}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
