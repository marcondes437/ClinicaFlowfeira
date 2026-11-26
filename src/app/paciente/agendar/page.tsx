import { redirect } from "next/navigation";
import Link from 'next/link';
import styles from './agendar.module.css';
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
    <div className={styles.bookingPage}>
      <div className={styles.topline}><Link href="/paciente">← Voltar ao meu painel</Link><span>CLINICAFLOW · PORTAL DO PACIENTE</span></div>
      <div className={styles.surface}>
      {remarcarParam && !remarcar && (
        <div className="cx-alert cx-alert-error">Essa consulta não pode mais ser remarcada. Você pode fazer um novo agendamento abaixo.</div>
      )}
      {opcoes.erro ? <div className="cx-alert cx-alert-error" role="alert">{opcoes.erro}</div> : <>
      {!opcoes.resumo.length && <div className="cx-alert" role="status" style={{ background: '#fff8e8', color: '#775818', border: '1px solid #eedfb8' }}>Não há horários liberados para agendamento. A equipe precisa disponibilizar a agenda dos profissionais. Tente novamente após a liberação de novas vagas.</div>}
      <AgendamentoForm
        modo="paciente"
        especialidades={opcoes.especialidades}
        unidades={opcoes.unidades}
        resumo={opcoes.resumo}
        profissionais={opcoes.profissionais}
        remarcar={remarcar}
        especialidadeInicial={especialidade}
      />
      </>}
      </div>
    </div>
  );
}
