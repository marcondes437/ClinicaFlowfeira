import Panel from "@/components/Panel";
import StatCards from "@/components/StatCards";
import ConsultasTable, { type ConsultaRow } from "@/components/ConsultasTable";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/local/server";
import { CONSULTA_SELECT, getAgendaEquipe, getBloqueios } from "@/lib/queries";
import DisponibilidadeForm from "@/components/DisponibilidadeForm";
import AgendaSlots from "@/components/AgendaSlots";
import BloqueioForm from "@/components/BloqueioForm";
import BloqueiosLista from "@/components/BloqueiosLista";
import { getProfissionalDoUsuario } from "@/lib/profissional";
import { fimDoDia, inicioDoDia } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgendaMedico() {
  const user = await requireRole(["medico"]);
  const profissional = await getProfissionalDoUsuario(user.id);

  // Sem vínculo com um cadastro de profissional, não mostra a agenda de ninguém.
  if (!profissional) {
    return (
      <div className="cx-alert cx-alert-error" role="alert">
        Seu usuário ainda não está vinculado a um cadastro de profissional. Peça ao administrador para
        vincular seu e-mail em <strong>Profissionais → Vincular acesso</strong>.
      </div>
    );
  }

  const supabase = await createClient();
  const base = () => supabase.from("consultas").select(CONSULTA_SELECT).eq("profissional_id", profissional.id).order("data_hora");

  const [{ data: hoje }, { data: proximas }, slots, bloqueios] = await Promise.all([
    base().gte("data_hora", inicioDoDia()).lte("data_hora", fimDoDia()),
    base().gt("data_hora", fimDoDia()).in("status", ["agendada", "confirmada"]).limit(50),
    getAgendaEquipe({ profissionalId: profissional.id }, 14),
    getBloqueios(profissional.id),
  ]);

  return (
    <>
      <StatCards
        stats={[
          { label: "Atendimentos hoje", value: hoje?.length ?? 0 },
          { label: "Próximos agendados", value: proximas?.length ?? 0 },
          { label: "Vagas livres (14 dias)", value: slots.filter((s) => s.status === "disponivel").length },
          { label: "Profissional", value: profissional.nome },
        ]}
      />

      <Panel titulo="Minha agenda de hoje" descricao="Atualize a situação conforme o atendimento avança.">
        <ConsultasTable consultas={(hoje ?? []) as unknown as ConsultaRow[]} podeAlterarStatus linkPaciente="/medico/pacientes" vazio="Nenhum atendimento hoje." />
      </Panel>

      <Panel titulo="Próximos atendimentos">
        <ConsultasTable consultas={(proximas ?? []) as unknown as ConsultaRow[]} podeAlterarStatus linkPaciente="/medico/pacientes" vazio="Nenhuma consulta futura." />
      </Panel>

      <Panel titulo="Meus horários nos próximos 14 dias" descricao="Livres, ocupados e bloqueados.">
        <AgendaSlots slots={slots} mostrarProfissional={false} />
      </Panel>

      <Panel
        titulo="Minha disponibilidade"
        descricao="Os pacientes agendam pela especialidade: o sistema só usa os horários que você liberar aqui."
      >
        <DisponibilidadeForm profissionalFixo={profissional} />
      </Panel>

      <Panel titulo="Férias, afastamentos e bloqueios">
        <BloqueioForm profissionalFixo={profissional} />
        <div style={{ marginTop: "1rem" }}>
          <BloqueiosLista bloqueios={bloqueios} mostrarProfissional={false} />
        </div>
      </Panel>
    </>
  );
}
