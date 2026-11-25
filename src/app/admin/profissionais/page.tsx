import Panel from "@/components/Panel";
import Link from "next/link";
import ProfissionalForm from "@/components/ProfissionalForm";
import ProfissionalEditar from "@/components/ProfissionalEditar";
import { createClient } from "@/lib/local/server";

export const dynamic = "force-dynamic";

export default async function ProfissionaisPage({ searchParams }: { searchParams: Promise<{ sem_acesso?: string }> }) {
  const { sem_acesso } = await searchParams;
  const supabase = await createClient();

  const [{ data: profissionais }, { data: especialidades }, { data: unidades }] = await Promise.all([
    supabase
      .from("profissionais")
      .select("id, user_id, nome, registro_profissional, especialidade_id, unidade_id, telefone, email, descricao, status, especialidades(nome), unidades(nome)")
      .order("nome"),
    supabase.from("especialidades").select("id, nome").order("nome"),
    supabase.from("unidades").select("id, nome").order("nome"),
  ]);
  const lista = sem_acesso === "1" ? (profissionais ?? []).filter(p => p.status === "ativo" && !p.user_id) : profissionais ?? [];

  return (
    <>
      <Panel titulo="Profissionais" descricao="Só profissionais ativos, com especialidade e unidade, recebem consultas.">
        {sem_acesso === "1" && <p className="cx-alert cx-alert-ok">Mostrando profissionais ativos sem login vinculado. <Link href="/admin/profissionais" style={{ textDecoration: "underline" }}>Ver todos os profissionais</Link></p>}
        <table className="cx-table cx-table-cards">
          <thead><tr><th>Nome</th><th>Especialidade</th><th>Unidade</th><th>Acesso</th><th>Status</th></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td data-label="Nome">
                  <details>
                    <summary style={{ cursor: "pointer" }}>
                      <strong>{p.nome}</strong>
                      {p.registro_profissional && <span style={{ color: "var(--cx-muted)", fontSize: "0.85rem" }}> · {p.registro_profissional}</span>}
                      <span style={{ color: "var(--cx-teal-700)", fontSize: "0.82rem", marginLeft: "0.5rem" }}>Editar</span>
                    </summary>
                    <ProfissionalEditar
                      profissional={{ ...p, temAcesso: Boolean(p.user_id) }}
                      especialidades={especialidades ?? []}
                      unidades={unidades ?? []}
                    />
                  </details>
                </td>
                <td data-label="Especialidade">{(p.especialidades as unknown as { nome: string } | null)?.nome ?? <span className="cx-badge cx-badge-warn">Definir</span>}</td>
                <td data-label="Unidade">{(p.unidades as unknown as { nome: string } | null)?.nome ?? <span className="cx-badge cx-badge-warn">Definir</span>}</td>
                <td data-label="Acesso">{p.user_id ? <span className="cx-badge cx-badge-ok">Vinculado</span> : <span className="cx-badge">Sem login</span>}</td>
                <td data-label="Status"><span className={`cx-badge ${p.status === "ativo" ? "cx-badge-ok" : "cx-badge-danger"}`}>{p.status}</span></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={5}>Nenhum profissional encontrado.</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Panel titulo="Cadastrar profissional">
        <ProfissionalForm
          especialidades={(especialidades ?? []).filter(Boolean)}
          unidades={(unidades ?? []).filter(Boolean)}
        />
      </Panel>
    </>
  );
}
