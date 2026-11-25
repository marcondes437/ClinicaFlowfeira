import { redirect } from "next/navigation";
import Panel from "@/components/Panel";
import AgendamentoForm, { type ConsultaParaRemarcar } from "@/components/AgendamentoForm";
import { requireRole } from "@/lib/auth";
import { getConsultaParaRemarcar, getOpcoesPaciente } from "@/lib/queries";
import { uuidValido } from "@/lib/validacao";
import { cadastroCompleto, getPacienteDoUsuario, linkCompletarCadastro } from "@/lib/paciente";

export const dynamic = "force-dynamic";

export default async function AgendarPage({
  searchParams,
}: {
  searchParams: Promise<{ remarcar?: string; especialidade?: string }>;
}) {
  const user = await requireRole(["paciente"]);
  const { remarcar: remarcarParam, especialidade } = await searchParams;
  const remarcarId = uuidValido(remarcarParam) ? remarcarParam : undefined;
  const paciente = await getPacienteDoUsuario(user.id);

  // Cadastro simples no início; os dados adicionais são exigidos antes do 1º agendamento.
  if (!cadastroCompleto(paciente)) {
    const destino = remarcarId ? `/paciente/agendar?remarcar=${remarcarId}` : "/paciente/agendar";
    redirect(linkCompletarCadastro(destino));
  }

  const opcoes = await getOpcoesPaciente();

  const remarcar: ConsultaParaRemarcar | null =
    remarcarId && paciente ? await getConsultaParaRemarcar(remarcarId, paciente.id) : null;

  return (
    <Panel
      titulo={remarcar ? "Remarcar consulta" : "Agendar consulta"}
      descricao="Você escolhe a especialidade. O sistema marca o primeiro horário livre na agenda dos médicos e mostra quem vai atender você."
    >
      {remarcarParam && !remarcar && (
        <div className="cx-alert cx-alert-error">Essa consulta não pode mais ser remarcada. Você pode fazer um novo agendamento abaixo.</div>
      )}
      <AgendamentoForm
        modo="paciente"
        especialidades={opcoes.especialidades}
        unidades={opcoes.unidades}
        resumo={opcoes.resumo}
        remarcar={remarcar}
        especialidadeInicial={especialidade}
      />
    </Panel>
  );
}
