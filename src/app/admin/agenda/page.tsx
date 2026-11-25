import Panel from "@/components/Panel";
import AgendamentoForm from "@/components/AgendamentoForm";
import AgendaSlots from "@/components/AgendaSlots";
import DisponibilidadeForm from "@/components/DisponibilidadeForm";
import BloqueioForm from "@/components/BloqueioForm";
import BloqueiosLista from "@/components/BloqueiosLista";
import ConsultasTable, { type ConsultaRow } from "@/components/ConsultasTable";
import { createClient } from "@/lib/local/server";
import { CONSULTA_SELECT, getAgendaEquipe, getBloqueios, getConsultaParaRemarcar, getOpcoes } from "@/lib/queries";
import { hojeIso, instanteSaoPaulo, somarDias } from "@/lib/format";
import { STATUS_CONSULTA_LABEL } from "@/lib/roles";
import { dataIsoValida, uuidValido } from "@/lib/validacao";

export const dynamic = "force-dynamic";

type Filtros = {
  status?: string;
  profissional?: string;
  especialidade?: string;
  unidade?: string;
  de?: string;
  ate?: string;
  remarcar?: string;
};

export default async function AgendaAdmin({ searchParams }: { searchParams: Promise<Filtros> }) {
  const params = await searchParams;
  const status = params.status && params.status in STATUS_CONSULTA_LABEL ? params.status : "";
  const profissional = uuidValido(params.profissional) ? params.profissional : "";
  const especialidade = uuidValido(params.especialidade) ? params.especialidade : "";
  const unidade = uuidValido(params.unidade) ? params.unidade : "";
  const de = dataIsoValida(params.de) ? params.de! : hojeIso();
  const ate = dataIsoValida(params.ate) && params.ate! >= de ? params.ate! : somarDias(de, 30);

  const supabase = await createClient();
  const [opcoes, slots, bloqueios, remarcar] = await Promise.all([
    getOpcoes(),
    getAgendaEquipe({ profissionalId: profissional, especialidadeId: especialidade, unidadeId: unidade, aPartirDe: de }, 14),
    getBloqueios(profissional || null),
    getConsultaParaRemarcar(params.remarcar),
  ]);

  let query = supabase
    .from("consultas")
    .select(CONSULTA_SELECT)
    .gte("data_hora", instanteSaoPaulo(de))
    .lt("data_hora", instanteSaoPaulo(somarDias(ate, 1)))
    .order("data_hora")
    .limit(300);
  if (status) query = query.eq("status", status);
  if (profissional) query = query.eq("profissional_id", profissional);
  if (especialidade) query = query.eq("especialidade_id", especialidade);
  if (unidade) query = query.eq("unidade_id", unidade);
  const { data: consultas } = await query;

  const filtros = (
    <form className="cx-filtros" aria-label="Filtros da agenda">
      <label className="cx-visually-hidden" htmlFor="f-de">De</label>
      <input id="f-de" type="date" name="de" defaultValue={de} />
      <label className="cx-visually-hidden" htmlFor="f-ate">Até</label>
      <input id="f-ate" type="date" name="ate" defaultValue={ate} />
      <label className="cx-visually-hidden" htmlFor="f-esp">Especialidade</label>
      <select id="f-esp" name="especialidade" defaultValue={especialidade}>
        <option value="">Todas as especialidades</option>
        {opcoes.especialidades.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
      </select>
      <label className="cx-visually-hidden" htmlFor="f-uni">Unidade</label>
      <select id="f-uni" name="unidade" defaultValue={unidade}>
        <option value="">Todas as unidades</option>
        {opcoes.unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
      </select>
      <label className="cx-visually-hidden" htmlFor="f-prof">Profissional</label>
      <select id="f-prof" name="profissional" defaultValue={profissional}>
        <option value="">Todos os profissionais</option>
        {opcoes.todosProfissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.status === "inativo" ? " (inativo)" : ""}</option>)}
      </select>
      <label className="cx-visually-hidden" htmlFor="f-status">Status</label>
      <select id="f-status" name="status" defaultValue={status}>
        <option value="">Todos os status</option>
        {Object.entries(STATUS_CONSULTA_LABEL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
      <button className="cx-btn cx-btn-ghost">Filtrar</button>
    </form>
  );

  return (
    <>
      <Panel titulo="Consultas" descricao={`De ${de.split("-").reverse().join("/")} a ${ate.split("-").reverse().join("/")}. Cancelar uma consulta devolve o horário para a agenda.`}>
        <div style={{ marginBottom: "1rem" }}>{filtros}</div>
        <ConsultasTable
          consultas={(consultas ?? []) as unknown as ConsultaRow[]}
          podeAlterarStatus
          linkPaciente="/admin/pacientes"
          linkRemarcar="/admin/agenda"
          vazio="Nenhuma consulta com esses filtros."
        />
      </Panel>

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

      <Panel titulo="Disponibilidade dos profissionais (14 dias)" descricao="Horários livres, ocupados e bloqueados, conforme os filtros acima.">
        <AgendaSlots slots={slots} />
      </Panel>

      <Panel titulo="Liberar agenda médica" descricao="Defina dias, horários, duração das consultas e o intervalo de cada profissional.">
        <DisponibilidadeForm profissionais={opcoes.profissionais} />
      </Panel>

      <Panel titulo="Férias, afastamentos e bloqueios" descricao="Os horários livres do período saem da agenda na hora; ao remover, eles voltam.">
        <BloqueioForm profissionais={opcoes.todosProfissionais} />
        <div style={{ marginTop: "1rem" }}>
          <BloqueiosLista bloqueios={bloqueios} />
        </div>
      </Panel>
    </>
  );
}
