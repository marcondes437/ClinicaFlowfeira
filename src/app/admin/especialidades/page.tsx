import Panel from "@/components/Panel";
import EspecialidadeForm from "@/components/EspecialidadeForm";
import { createClient } from "@/lib/local/server";
import { alternarStatusEspecialidade } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function EspecialidadesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("especialidades").select("*").order("nome");

  return (
    <>
      <Panel titulo="Especialidades" descricao="Catálogo exibido no site público. Especialidades inativas não recebem agendamentos.">
        <table className="cx-table cx-table-cards">
          <thead><tr><th>Nome</th><th>Descrição</th><th>Status</th><th><span className="cx-visually-hidden">Ações</span></th></tr></thead>
          <tbody>
            {(data ?? []).map((e) => (
              <tr key={e.id}>
                <td data-label="Nome">
                  <details>
                    <summary style={{ cursor: "pointer" }}>
                      <strong>{e.nome}</strong>
                      <span style={{ color: "var(--cx-teal-700)", fontSize: "0.82rem", marginLeft: "0.5rem" }}>Editar</span>
                    </summary>
                    <div style={{ paddingTop: "0.8rem" }}><EspecialidadeForm especialidade={e} /></div>
                  </details>
                </td>
                <td data-label="Descrição">{e.descricao ?? "—"}</td>
                <td data-label="Status"><span className={`cx-badge ${e.status === "ativo" ? "cx-badge-ok" : "cx-badge-danger"}`}>{e.status}</span></td>
                <td data-label="">
                  <form action={alternarStatusEspecialidade}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="status" value={e.status === "ativo" ? "inativo" : "ativo"} />
                    <button className="cx-btn cx-btn-ghost" style={{ padding: "0.3rem 0.8rem", fontSize: "0.82rem" }}>
                      {e.status === "ativo" ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel titulo="Nova especialidade"><EspecialidadeForm /></Panel>
    </>
  );
}
