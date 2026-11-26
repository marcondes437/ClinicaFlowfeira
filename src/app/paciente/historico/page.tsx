import Panel from "@/components/Panel";
import { type ConsultaRow } from "@/components/ConsultasTable";
import HistoricoTimeline from "@/components/paciente/HistoricoTimeline";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/local/server";
import { CONSULTA_SELECT } from "@/lib/queries";
import { getPacienteDoUsuario } from "@/lib/paciente";
import { dataHora } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HistoricoPaciente() {
  const user = await requireRole(["paciente"]);
  const paciente = await getPacienteDoUsuario(user.id);
  const supabase = await createClient();

  const { data: consultas, error: erroConsultas } = paciente
    ? await supabase.from("consultas").select(CONSULTA_SELECT).eq("paciente_id", paciente.id).order("data_hora", { ascending: false })
    : { data: [], error: null };
  const { data: evolucoes, error: erroEvolucoes } = paciente
    ? await supabase.from("evolucoes").select("id, descricao, created_at").eq("paciente_id", paciente.id).order("created_at", { ascending: false })
    : { data: [], error: null };

  return (
    <>
      <Panel titulo="Meu histórico" descricao="Suas consultas, da mais recente à mais antiga." acao={<Link href="/paciente/agendar" className="cx-btn cx-btn-primary">Agendar consulta</Link>}>
        {erroConsultas || !paciente ? <p className="cx-alert cx-alert-error" role="alert">Não foi possível carregar seu histórico. Atualize a página e tente novamente.</p> : <HistoricoTimeline consultas={(consultas ?? []) as unknown as ConsultaRow[]} acoesPaciente />}
      </Panel>
      <Panel titulo="Registros disponibilizados pela equipe">
        {(evolucoes ?? []).map((e) => (
          <article key={e.id} style={{ borderLeft: "3px solid var(--cx-teal-300)", paddingLeft: "0.9rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--cx-muted)" }}>{dataHora(e.created_at)}</div>
            <p style={{ margin: "0.2rem 0 0" }}>{e.descricao}</p>
          </article>
        ))}
        {erroEvolucoes ? <p className="cx-alert cx-alert-error" role="alert">Não foi possível carregar os registros da equipe. Tente novamente.</p> : !evolucoes?.length && <p style={{ color: "var(--cx-muted)" }}>Nenhum registro disponível.</p>}
      </Panel>
    </>
  );
}
