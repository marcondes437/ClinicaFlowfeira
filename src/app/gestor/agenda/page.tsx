import Panel from "@/components/Panel";
import ConsultasTable, { type ConsultaRow } from "@/components/ConsultasTable";
import { createClient } from "@/lib/local/server";
import { CONSULTA_SELECT } from "@/lib/queries";
import { inicioDoDia } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgendaGestor() {
  const supabase = await createClient();
  const { data } = await supabase.from("consultas").select(CONSULTA_SELECT).gte("data_hora", inicioDoDia()).order("data_hora").limit(200);

  return (
    <Panel titulo="Agenda geral" descricao="Consultas de hoje em diante.">
      <ConsultasTable consultas={(data ?? []) as unknown as ConsultaRow[]} podeAlterarStatus />
    </Panel>
  );
}
