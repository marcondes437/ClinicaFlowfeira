import Panel from "@/components/Panel";
import PacienteForm from "@/components/PacienteForm";
import { createClient } from "@/lib/local/server";
import { dataCurta } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PacientesRecepcao({
  searchParams,
}: { searchParams: Promise<{ busca?: string }> }) {
  const { busca } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("pacientes").select("*, pacientes_dados_sensiveis(cpf, cidade)").order("nome_completo");
  if (busca) query = query.ilike("nome_completo", `%${busca}%`);
  const { data } = await query;

  return (
    <>
      <Panel
        titulo="Pacientes"
        acao={
          <form className="cx-filtros" role="search">
            <input name="busca" defaultValue={busca ?? ""} placeholder="Buscar por nome" aria-label="Buscar paciente por nome" maxLength={80} />
            <button className="cx-btn cx-btn-ghost">Buscar</button>
          </form>
        }
      >
        <table className="cx-table cx-table-cards">
          <thead><tr><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Celular</th></tr></thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id}>
                <td data-label="Nome"><strong>{p.nome_completo}</strong></td>
                <td data-label="CPF">{p.pacientes_dados_sensiveis?.cpf ?? "—"}</td>
                <td data-label="Nascimento">{dataCurta(p.data_nascimento)}</td>
                <td data-label="Celular">{p.celular ?? p.telefone ?? "—"}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={4}>Nenhum paciente encontrado.</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Panel titulo="Cadastrar novo paciente"><PacienteForm /></Panel>
    </>
  );
}
