import { removerBloqueio } from "@/lib/actions";
import type { Bloqueio } from "@/lib/queries";
import { dataHora } from "@/lib/format";
import AcaoRapida from "./AcaoRapida";

const TIPO: Record<Bloqueio["tipo"], string> = {
  ferias: "Férias",
  afastamento: "Afastamento",
  bloqueio: "Bloqueio",
  intervalo: "Intervalo",
};

export default function BloqueiosLista({ bloqueios, mostrarProfissional = true }: { bloqueios: Bloqueio[]; mostrarProfissional?: boolean }) {
  if (!bloqueios.length) return <p style={{ color: "var(--cx-muted)", margin: 0 }}>Nenhum bloqueio, férias ou afastamento registrado.</p>;
  return (
    <table className="cx-table cx-table-cards">
      <thead>
        <tr>
          {mostrarProfissional && <th>Profissional</th>}
          <th>Tipo</th>
          <th>De</th>
          <th>Até</th>
          <th>Motivo</th>
          <th><span className="cx-visually-hidden">Ações</span></th>
        </tr>
      </thead>
      <tbody>
        {bloqueios.map((b) => (
          <tr key={b.id}>
            {mostrarProfissional && <td data-label="Profissional">{b.profissionais?.nome ?? "—"}</td>}
            <td data-label="Tipo"><span className="cx-badge cx-badge-danger">{TIPO[b.tipo] ?? b.tipo}</span></td>
            <td data-label="De">{dataHora(b.inicio)}</td>
            <td data-label="Até">{dataHora(b.fim)}</td>
            <td data-label="Motivo">{b.motivo ?? "—"}</td>
            <td data-label="">
              <AcaoRapida acao={removerBloqueio} id={b.id} rotulo="Remover" rotuloAria={`Remover ${TIPO[b.tipo]}`} confirmar="Remover este bloqueio? Os horários livres do período voltam para a agenda." />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
