import Link from "next/link";
import { dataHora } from "@/lib/format";
import StatusConsulta from "./StatusConsulta";
import CancelarConsulta from "./paciente/CancelarConsulta";
import { consultaAlteravel } from "@/lib/consulta";

export type ConsultaRow = {
  id: string;
  data_hora: string;
  status: string;
  motivo: string | null;
  especialidade_id?: string | null;
  pacientes: { id: string; nome_completo: string } | null;
  profissionais: { nome: string } | null;
  especialidades: { nome: string } | null;
  unidades: { nome: string; endereco?: string | null; cidade?: string | null } | null;
};

/** Tabela de consultas. No celular, cada linha vira um cartão (ver .cx-table-cards). */
export default function ConsultasTable({
  consultas,
  podeAlterarStatus = false,
  linkPaciente,
  linkRemarcar,
  acoesPaciente = false,
  ocultarPaciente = false,
  vazio = "Nenhuma consulta encontrada.",
}: {
  consultas: ConsultaRow[];
  podeAlterarStatus?: boolean;
  linkPaciente?: string;
  /** Equipe: página que abre o formulário de remarcação (recebe ?remarcar=ID). */
  linkRemarcar?: string;
  /** Paciente: mostra "Remarcar" e "Cancelar" nas consultas futuras. */
  acoesPaciente?: boolean;
  ocultarPaciente?: boolean;
  vazio?: string;
}) {
  if (!consultas.length) return <p style={{ color: "var(--cx-muted)", margin: 0 }}>{vazio}</p>;

  const agora = Date.now();
  const comAcoes = Boolean(linkRemarcar) || acoesPaciente;

  return (
    <table className="cx-table cx-table-cards">
      <thead>
        <tr>
          <th>Data e hora</th>
          {!ocultarPaciente && <th>Paciente</th>}
          <th>Profissional</th>
          <th>Especialidade</th>
          <th>Unidade</th>
          <th>Status</th>
          {comAcoes && <th><span className="cx-visually-hidden">Ações</span></th>}
        </tr>
      </thead>
      <tbody>
        {consultas.map((c) => {
          const alteravel = consultaAlteravel(c, agora);
          return (
            <tr key={c.id}>
              <td data-label="Data e hora">{dataHora(c.data_hora)}</td>
              {!ocultarPaciente && (
                <td data-label="Paciente">
                  {linkPaciente && c.pacientes ? (
                    <Link href={`${linkPaciente}/${c.pacientes.id}`} style={{ color: "var(--cx-teal-700)", fontWeight: 600 }}>
                      {c.pacientes.nome_completo}
                    </Link>
                  ) : (
                    c.pacientes?.nome_completo ?? "—"
                  )}
                </td>
              )}
              <td data-label="Profissional">{c.profissionais?.nome ?? "—"}</td>
              <td data-label="Especialidade">{c.especialidades?.nome ?? "—"}</td>
              <td data-label="Unidade">{c.unidades?.nome ?? "—"}</td>
              <td data-label="Status"><StatusConsulta id={c.id} status={c.status} disabled={!podeAlterarStatus} /></td>
              {comAcoes && (
                <td data-label="">
                  {alteravel && (
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                      <Link
                        href={acoesPaciente ? `/paciente/agendar?remarcar=${c.id}` : `${linkRemarcar}?remarcar=${c.id}#agendamento`}
                        className="cx-btn cx-btn-ghost"
                        style={{ padding: "0.3rem 0.8rem", fontSize: "0.82rem" }}
                        aria-label={`Remarcar consulta de ${dataHora(c.data_hora)}`}
                      >
                        Remarcar
                      </Link>
                      {acoesPaciente && <CancelarConsulta id={c.id} />}
                    </div>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
