import Panel from "@/components/Panel";
import UnidadeForm from "@/components/UnidadeForm";
import { createClient } from "@/lib/local/server";
import { alternarStatusUnidade } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function UnidadesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("unidades").select("*").order("nome");

  return (
    <>
      <Panel titulo="Unidades" descricao="Locais de atendimento. Unidades inativas não recebem agendamentos.">
        <table className="cx-table cx-table-cards">
          <thead><tr><th>Nome</th><th>Endereço</th><th>Cidade</th><th>Horário</th><th>Telefone</th><th>Status</th><th><span className="cx-visually-hidden">Ações</span></th></tr></thead>
          <tbody>
            {(data ?? []).map((u) => (
              <tr key={u.id}>
                <td data-label="Nome">
                  <details>
                    <summary style={{ cursor: "pointer" }}>
                      <strong>{u.nome}</strong>
                      <span style={{ color: "var(--cx-teal-700)", fontSize: "0.82rem", marginLeft: "0.5rem" }}>Editar</span>
                    </summary>
                    <div style={{ paddingTop: "0.8rem" }}><UnidadeForm unidade={u} /></div>
                  </details>
                </td>
                <td data-label="Endereço">{u.endereco ?? "—"}</td>
                <td data-label="Cidade">{u.cidade ?? "—"}</td>
                <td data-label="Horário">{u.horario_funcionamento ?? "—"}</td>
                <td data-label="Telefone">{u.telefone ?? "—"}</td>
                <td data-label="Status"><span className={`cx-badge ${u.status === "ativo" ? "cx-badge-ok" : "cx-badge-danger"}`}>{u.status}</span></td>
                <td data-label="">
                  <form action={alternarStatusUnidade}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="status" value={u.status === "ativo" ? "inativo" : "ativo"} />
                    <button className="cx-btn cx-btn-ghost" style={{ padding: "0.3rem 0.8rem", fontSize: "0.82rem" }}>
                      {u.status === "ativo" ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel titulo="Nova unidade"><UnidadeForm /></Panel>
    </>
  );
}
