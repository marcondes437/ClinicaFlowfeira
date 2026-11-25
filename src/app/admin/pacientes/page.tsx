import Link from "next/link";
import Panel from "@/components/Panel";
import PacienteForm from "@/components/PacienteForm";
import { createClient } from "@/lib/local/server";
import { dataCurta } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; incompletos?: string }>;
}) {
  const { busca, incompletos } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("pacientes").select("*, pacientes_dados_sensiveis(cpf, cidade)").order("nome_completo");
  if (busca) query = query.ilike("nome_completo", `%${busca}%`);
  if (incompletos === "1") query = query.eq("status", "ativo").is("cadastro_completo_em", null);
  const { data: pacientes } = await query;

  return (
    <>
      <Panel
        titulo="Pacientes"
        descricao="Lista completa com busca por nome."
        acao={
          <form className="cx-filtros" role="search">
            {incompletos === "1" && <input type="hidden" name="incompletos" value="1" />}
            <input name="busca" defaultValue={busca ?? ""} placeholder="Buscar paciente..." aria-label="Buscar paciente por nome" maxLength={80} />
            <button className="cx-btn cx-btn-ghost">Buscar</button>
          </form>
        }
      >
        {incompletos === "1" && <p className="cx-alert cx-alert-ok">Mostrando pacientes ativos com cadastro incompleto. <Link href="/admin/pacientes" style={{ textDecoration: "underline" }}>Ver todos os pacientes</Link></p>}
        <table className="cx-table cx-table-cards">
          <thead>
            <tr><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Celular</th><th>Cidade</th><th>Status</th><th><span className="cx-visually-hidden">Ações</span></th></tr>
          </thead>
          <tbody>
            {(pacientes ?? []).map((p) => (
              <tr key={p.id}>
                <td data-label="Nome"><strong>{p.nome_completo}</strong></td>
                <td data-label="CPF">{p.pacientes_dados_sensiveis?.cpf ? "•••.•••.•••-" + String(p.pacientes_dados_sensiveis.cpf).slice(-2) : "Restrito"}</td>
                <td data-label="Nascimento">{dataCurta(p.data_nascimento)}</td>
                <td data-label="Celular">{p.celular ?? p.telefone ?? "—"}</td>
                <td data-label="Cidade">{p.pacientes_dados_sensiveis?.cidade ?? "—"}</td>
                <td data-label="Status"><span className={`cx-badge ${p.status === "ativo" ? "cx-badge-ok" : ""}`}>{p.status}</span></td>
                <td data-label=""><Link href={`/admin/pacientes/${p.id}`} style={{ color: "var(--cx-teal-700)", fontWeight: 600 }}>Ver ficha</Link></td>
              </tr>
            ))}
            {!pacientes?.length && <tr><td colSpan={7}>Nenhum paciente encontrado.</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Panel titulo="Cadastrar paciente" descricao="Os dados são gravados no banco imediatamente.">
        <PacienteForm />
      </Panel>
    </>
  );
}
