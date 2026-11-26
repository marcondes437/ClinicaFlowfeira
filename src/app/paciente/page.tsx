import Link from 'next/link';
import ConsultaTicket from '@/components/paciente/ConsultaTicket';
import CancelarConsulta from '@/components/paciente/CancelarConsulta';
import HistoricoTimeline from '@/components/paciente/HistoricoTimeline';
import PatientIcon from '@/components/paciente/PatientIcon';
import { AppointmentPreparation } from '@/components/paciente/AppointmentTools';
import PatientWelcome from '@/components/paciente/PatientWelcome';
import PatientMotion from '@/components/paciente/PatientMotion';
import { type ConsultaRow } from '@/components/ConsultasTable';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/local/server';
import { CONSULTA_SELECT, STATUS_ATIVOS } from '@/lib/queries';
import { cadastroCompleto, getPacienteDoUsuario, linkCompletarCadastro } from '@/lib/paciente';
import { consultaAlteravel } from '@/lib/consulta';
import { dataHora } from '@/lib/format';
import styles from './painel.module.css';

export const dynamic = 'force-dynamic';

export default async function PainelPaciente() {
  const user = await requireRole(['paciente']);
  const paciente = await getPacienteDoUsuario(user.id);
  const banco = await createClient();
  const agora = new Date().toISOString();
  const [agenda, historico, concluidas] = paciente
    ? await Promise.all([
        banco.from('consultas').select(CONSULTA_SELECT).eq('paciente_id', paciente.id)
          .in('status', [...STATUS_ATIVOS]).or(`data_hora.gte."${agora}",status.eq.em_atendimento`).order('data_hora'),
        banco.from('consultas').select(CONSULTA_SELECT).eq('paciente_id', paciente.id)
          .in('status', ['agendada', 'confirmada', 'concluida', 'cancelada', 'faltou'])
          .or(`data_hora.lt."${agora}",status.eq.cancelada`).order('data_hora', { ascending: false }).limit(4),
        banco.from('consultas').select('id', { count: 'exact', head: true }).eq('paciente_id', paciente.id).eq('status', 'concluida'),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { count: null, error: null }];
  const proximas = (agenda.data ?? []) as unknown as ConsultaRow[];
  const anteriores = (historico.data ?? []) as unknown as ConsultaRow[];
  const completo = cadastroCompleto(paciente);
  const falhaCadastro = !paciente;

  return <PatientMotion className={styles.dashboard}>
    <PatientWelcome cadastroCompleto={completo} indisponivel={Boolean(agenda.error || falhaCadastro)} proxima={proximas[0] ? { data_hora: proximas[0].data_hora, status: proximas[0].status, especialidade: proximas[0].especialidades?.nome ?? 'Consulta', unidade: proximas[0].unidades?.nome ?? 'Unidade a confirmar' } : null} />

    {falhaCadastro ? <div className="cx-alert cx-alert-error" role="alert">Não foi possível carregar seu cadastro. Atualize a página e tente novamente.</div>
      : !completo && <div className={styles.notice} role="status"><span className={styles.noticeIcon}><PatientIcon kind="user" /></span><div><strong>Vamos completar seu cadastro?</strong><p>Informe celular, nascimento e CPF para liberar seu primeiro agendamento.</p></div><Link href={linkCompletarCadastro('/paciente/agendar')}>Completar dados <PatientIcon kind="arrow" size={17} /></Link></div>}

    <section className={styles.stats} aria-label="Resumo do seu atendimento">
      <div className={styles.stat}><span className={styles.statIcon}><PatientIcon kind="calendar" /></span><div><span>Consultas na agenda</span><strong>{agenda.error || falhaCadastro ? '—' : proximas.length}<small>{proximas.length === 1 ? 'consulta' : 'consultas'}</small></strong></div></div>
      <div className={styles.stat}><span className={styles.statIcon}><PatientIcon kind="check" /></span><div><span>Atendimentos realizados</span><strong>{concluidas.error || falhaCadastro ? '—' : concluidas.count ?? 0}<small>concluídos</small></strong></div></div>
      <Link href="/paciente/meus-dados" className={styles.stat}><span className={styles.statIcon}><PatientIcon kind="user" /></span><div><span>Meu cadastro</span><strong className={styles.registration}>{falhaCadastro ? 'Indisponível' : completo ? 'Completo' : 'Pendente'}</strong></div><PatientIcon kind="arrow" size={18} /></Link>
    </section>

    <div className={styles.columns}>
      <div className={styles.mainColumn}>
        <section aria-labelledby="patient-agenda" data-patient-reveal>
          <div className={styles.sectionHead}><div><span className={styles.sectionEyebrow}>SEU PRÓXIMO PASSO</span><h2 id="patient-agenda">Minha agenda</h2><p>Os detalhes do seu próximo atendimento.</p></div><span className={styles.tag}>{proximas[0]?.status === 'em_atendimento' ? 'Em atendimento' : 'Próxima consulta'}</span></div>
          {agenda.error || falhaCadastro ? <div className={styles.error} role="alert">Não foi possível carregar suas consultas. Atualize a página para tentar novamente.</div> : <ConsultaTicket consulta={proximas[0] ?? null} />}
          {proximas.length > 1 && <ul className={styles.lista}>{proximas.slice(1).map(c => <li key={c.id}><div><strong>{dataHora(c.data_hora)}</strong><span>{c.especialidades?.nome} · {c.profissionais?.nome ?? 'Profissional a definir'}<br />{c.unidades?.nome}</span></div>{consultaAlteravel(c) && <div className={styles.listaAcoes}><Link href={`/paciente/agendar?remarcar=${c.id}`} className="cx-btn cx-btn-ghost">Remarcar</Link><CancelarConsulta id={c.id} /></div>}</li>)}</ul>}
        </section>
        <section className={styles.history} aria-labelledby="patient-history" data-patient-reveal>
          <div className={styles.sectionHead}><div><h2 id="patient-history">Atendimentos anteriores</h2><p>Acompanhe suas consultas mais recentes.</p></div><Link href="/paciente/historico" className={styles.textLink}>Ver histórico <PatientIcon kind="arrow" size={17} /></Link></div>
          {historico.error || falhaCadastro ? <p className={styles.error} role="alert">Não foi possível carregar seu histórico. Tente novamente.</p>
            : anteriores.length ? <HistoricoTimeline consultas={anteriores} />
            : <div className={styles.emptyHistory}><span><PatientIcon kind="history" size={25} /></span><div><h3>Seu histórico começa aqui</h3><p>Depois do primeiro atendimento, você poderá acompanhar suas consultas neste espaço.</p></div></div>}
        </section>
      </div>
      <aside className={styles.aside} aria-label="Orientações e dados do paciente" data-patient-reveal>
        {proximas.length > 0 && <AppointmentPreparation />}
        <section className={styles.profile}><span className={styles.profileIcon}><PatientIcon kind="user" size={25} /></span><h2>Seus dados, sempre em dia</h2><p>Mantenha seu contato atualizado para facilitar seu atendimento na clínica.</p><div className={styles.profileName}><strong>{paciente?.nome_completo ?? user.nome}</strong><span>{paciente?.email ?? user.email}</span></div><Link href="/paciente/meus-dados" className={styles.secondaryAction}>{completo ? 'Ver meus dados' : 'Completar meus dados'} <PatientIcon kind="arrow" size={17} /></Link></section>
        {proximas.length === 0 && <section className={styles.steps}><h2>Como agendar</h2><ol><li><span>1</span><div><strong>Escolha a especialidade</strong><p>Selecione o cuidado que você precisa.</p></div></li><li><span>2</span><div><strong>Confira a próxima vaga</strong><p>Encontramos o primeiro horário livre.</p></div></li><li><span>3</span><div><strong>Confirme sua consulta</strong><p>Veja o médico, a data e a unidade.</p></div></li></ol></section>}
        <div className={styles.privacy}><PatientIcon kind="shield" size={21} /><p>Seus dados de saúde são acessados conforme as permissões de cada profissional.</p></div>
      </aside>
    </div>
  </PatientMotion>;
}
