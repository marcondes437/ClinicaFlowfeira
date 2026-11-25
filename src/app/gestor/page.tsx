import Panel from "@/components/Panel";
import StatCards from "@/components/StatCards";
import GraficoConsultas from "@/components/GraficoConsultas";
import { getIndicadores, getIndicadoresAgenda } from "@/lib/queries";
import { createClient } from "@/lib/local/server";
import { moeda } from "@/lib/format";
import { STATUS_CONSULTA_LABEL } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function GestorDashboard() {
  const supabase = await createClient();
  const status = Object.keys(STATUS_CONSULTA_LABEL);
  // Contagem feita no banco (head + count): ler as linhas parava em 1.000 (limite do PostgREST).
  const [indicadores, agenda, ...porStatus] = await Promise.all([
    getIndicadores(),
    getIndicadoresAgenda(30),
    ...status.map((s) => supabase.from("consultas").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);

  const contagem = new Map<string, number>();
  status.forEach((s, i) => {
    const total = porStatus[i]?.count ?? 0;
    if (total > 0) contagem.set(STATUS_CONSULTA_LABEL[s], total);
  });

  return (
    <>
      <StatCards
        stats={[
          { label: "Consultas hoje", value: indicadores.consultasHoje },
          { label: "Ocupação da agenda", value: `${agenda.totais.ocupacao}%`, hint: "próximos 30 dias" },
          { label: "Cancelamentos", value: `${agenda.totais.cancelamento}%`, hint: "próximos 30 dias" },
          { label: "Vagas livres", value: agenda.totais.livres, hint: "próximos 30 dias" },
          { label: "Pacientes ativos", value: indicadores.pacientes },
          { label: "Concluídas", value: indicadores.concluidas },
          { label: "Faturamento", value: moeda(indicadores.faturamento) },
        ]}
      />
      <Panel titulo="Consultas por status">
        <GraficoConsultas dados={[...contagem.entries()].map(([nome, total]) => ({ nome, total }))} />
      </Panel>
    </>
  );
}
