import Panel from "@/components/Panel";
import AgendamentoForm from "@/components/AgendamentoForm";
import AgendaSlots from "@/components/AgendaSlots";
import ConsultasTable, { type ConsultaRow } from "@/components/ConsultasTable";
import { createClient } from "@/lib/local/server";
import { CONSULTA_SELECT, getAgendaEquipe, getConsultaParaRemarcar, getOpcoes } from "@/lib/queries";
import { inicioDoDia } from "@/lib/format";
import { uuidValido } from "@/lib/validacao";

export const dynamic = "force-dynamic";

export default async function AgendaRecepcao({
  searchParams,
}: {
  searchParams: Promise<{ especialidade?: string; unidade?: string; remarcar?: string }>;
}) {
  const params = await searchParams;
  const especialidade = uuidValido(params.especialidade) ? params.especialidade : "";
  const unidade = uuidValido(params.unidade) ? params.unidade : "";
  const remarcar = await getConsultaParaRemarcar(params.remarcar);
  const supabase = await createClient();

  let proximas = supabase
    .from("consultas")
    .select(CONSULTA_SELECT)
    .gte("data_hora", inicioDoDia())
    .order("data_hora")
    .limit(100);
  if (especialidade) proximas = proximas.eq("especialidade_id", especialidade);
  if (unidade) proximas = proximas.eq("unidade_id", unidade);

  const [opcoes, slots, { data }] = await Promise.all([
    getOpcoes(),
    getAgendaEquipe({ especialidadeId: especialidade, unidadeId: unidade }, 7),
    proximas,
  ]);

  return (
    <>
      <Panel
        id="agendamento"
        titulo={remarcar ? "Remarcar consulta" : "Novo agendamento"}
        descricao="Escolha o paciente e a especialidade. O sistema marca o primeiro horário livre e define o médico pela agenda."
      >
        {params.remarcar && !remarcar && (
          <div className="cx-alert cx-alert-error">Essa consulta não pode mais ser remarcada (já passou, foi cancelada ou concluída).</div>
        )}
        <AgendamentoForm
          key={remarcar?.id ?? "novo"}
          modo="equipe"
          pacientes={opcoes.pacientes}
          especialidades={opcoes.especialidades}
          unidades={opcoes.unidades}
          resumo={opcoes.resumo}
          remarcar={remarcar}
        />
      </Panel>
      <Panel
        titulo="Próximas consultas"
        descricao="Cancelar uma consulta devolve o horário para a agenda."
        acao={
          <form className="cx-filtros">
            <select name="especialidade" defaultValue={especialidade} aria-label="Especialidade">
              <option value="">Todas as especialidades</option>
              {opcoes.especialidades.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            <select name="unidade" defaultValue={unidade} aria-label="Unidade">
              <option value="">Todas as unidades</option>
              {opcoes.unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <button className="cx-btn cx-btn-ghost">Filtrar</button>
          </form>
        }
      >
        <ConsultasTable consultas={(data ?? []) as unknown as ConsultaRow[]} podeAlterarStatus linkRemarcar="/recepcao/agenda" />
      </Panel>
      <Panel titulo="Agenda médica — próximos 7 dias">
        <AgendaSlots slots={slots} podeRemover={false} />
      </Panel>
    </>
  );
}
