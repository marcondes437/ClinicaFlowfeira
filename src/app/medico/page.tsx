import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/local/server';
import { CONSULTA_SELECT, type SlotAgenda, type Bloqueio } from '@/lib/queries';
import { getProfissionalDoUsuario } from '@/lib/profissional';
import { hojeIso, somarDias, instanteSaoPaulo, dataCurta, dataHora } from '@/lib/format';
import { dataIsoValida } from '@/lib/validacao';
import type { ConsultaRow } from '@/components/ConsultasTable';
import DoctorAppointments from '@/components/medico/DoctorAppointments';
import DisponibilidadeForm from '@/components/DisponibilidadeForm';
import AgendaSlots from '@/components/AgendaSlots';
import BloqueioForm from '@/components/BloqueioForm';
import BloqueiosLista from '@/components/BloqueiosLista';
import DoctorRefresh from '@/components/medico/DoctorRefresh';
import DoctorAgenda from '@/components/medico/DoctorAgenda';
import DoctorMonth, { monthRange } from '@/components/medico/DoctorMonth';
import DoctorMotion, { DoctorMotionButton } from '@/components/medico/DoctorMotion';
import styles from '@/components/medico/doctor.module.css';

export const dynamic = 'force-dynamic';
export default async function AgendaMedico({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const user = await requireRole(['medico']);
  const profissional = await getProfissionalDoUsuario(user.id);
  if (!profissional) return <div className="cx-alert cx-alert-error" role="alert">Seu acesso precisa estar vinculado a um profissional ativo. Peça ao administrador para conferir o vínculo em Profissionais.</div>;
  const params = await searchParams;
  const dia = dataIsoValida(params.dia) ? params.dia! : hojeIso();
  const supabase = await createClient();
  const month = monthRange(dia);
  const [{ data: lista, error: erroDia }, futuras, slots, bloqueios, perfil, registros, consultasMes] = await Promise.all([
    supabase.from('consultas').select(CONSULTA_SELECT).eq('profissional_id', profissional.id).gte('data_hora', instanteSaoPaulo(dia)).lt('data_hora', instanteSaoPaulo(somarDias(dia, 1))).order('data_hora').limit(500),
    supabase.from('consultas').select(CONSULTA_SELECT).eq('profissional_id', profissional.id).gt('data_hora', new Date().toISOString()).in('status', ['agendada','confirmada']).order('data_hora').limit(8),
    supabase.rpc('listar_agenda', { _profissional_id: profissional.id, _dias: 14 }),
    supabase.from('agenda_bloqueios').select('id, profissional_id, inicio, fim, tipo, motivo, profissionais(nome)').eq('profissional_id', profissional.id).gte('fim', new Date().toISOString()).order('inicio').limit(200),
    supabase.from('profissionais').select('nome,registro_profissional,email,telefone,especialidades(nome),unidades(nome,cidade)').eq('id',profissional.id).maybeSingle(),
    supabase.from('evolucoes').select('id,paciente_id,descricao,created_at,pacientes(nome_completo)').eq('autor_id',user.id).order('created_at',{ascending:false}).limit(4),
    supabase.from('consultas').select('data_hora,status').eq('profissional_id',profissional.id).gte('data_hora',instanteSaoPaulo(month.start)).lt('data_hora',instanteSaoPaulo(month.next)).in('status',['agendada','confirmada','em_atendimento','concluida','faltou']).order('data_hora').limit(2000),
  ]);
  const consultas = (lista ?? []) as unknown as ConsultaRow[];
  const proximas = (futuras.data ?? []) as unknown as ConsultaRow[];
  const horarios = (slots.data ?? []) as SlotAgenda[];
  const ocupadas = consultas.filter(c=>c.status !== 'cancelada');
  const concluida = consultas.filter(c=>c.status==='concluida').length;
  const distribuicao = [{label:'Agendadas',status:'agendada',color:'#005bc8'},{label:'Confirmadas',status:'confirmada',color:'#0e8f9e'},{label:'Em atendimento',status:'em_atendimento',color:'#c98a3e'},{label:'Concluídas',status:'concluida',color:'#0b5566'},{label:'Faltas',status:'faltou',color:'#a75f46'},{label:'Canceladas',status:'cancelada',color:'#95a9b0'}];
  const especialidade = perfil.data?.especialidades as unknown as {nome:string}|null;
  const unidade = perfil.data?.unidades as unknown as {nome:string;cidade:string|null}|null;
  const stats = [
    { label: 'Consultas no dia selecionado', value: erroDia ? '—' : ocupadas.length },
    { label: 'Em atendimento no dia', value: erroDia ? '—' : consultas.filter(c=>c.status==='em_atendimento').length },
    { label: 'Concluídas no dia', value: erroDia ? '—' : consultas.filter(c=>c.status==='concluida').length },
    { label: 'Vagas livres · próximos 14 dias', value: slots.error ? '—' : horarios.filter(s=>s.status==='disponivel').length },
  ];
  return <DoctorMotion className={`${styles.page} ${styles.schedulePage}`}>
    <header className={styles.medicalHero}><div><span className={styles.heroLabel}>{dataCurta(hojeIso())} · {unidade?.nome ?? 'Área clínica'}</span><h2>Agenda médica</h2><p>{profissional.nome}{especialidade ? ` · ${especialidade.nome}` : ''}</p></div><div className={styles.headerTools}><DoctorRefresh/><DoctorMotionButton/><a href="#disponibilidade">Gerenciar horários →</a></div></header>
    <div className={styles.stats} data-doctor-reveal>{stats.map((s,index)=><div key={s.label} className={styles.metric}><div><span>{s.label}</span><strong>{s.value}</strong><small>{index===3?'Agenda liberada':'Dia '+dataCurta(dia)}</small></div></div>)}</div>

      <section data-doctor-reveal className={styles.card} aria-labelledby="agenda-dia"><div className={styles.sectionHead}><h3 id="agenda-dia">Agenda de atendimentos</h3><span>{dataCurta(dia)}</span></div>
        <div className={styles.datebar}><a href={`/medico?dia=${somarDias(dia,-1)}`}  aria-label="Dia anterior">←</a><a href="/medico">Hoje</a><a href={`/medico?dia=${somarDias(dia,1)}`}  aria-label="Próximo dia">→</a><form><label className="cx-visually-hidden" htmlFor="dia-agenda">Data da agenda</label><input key={dia} id="dia-agenda" name="dia" type="date" defaultValue={dia}/><button>Ver agenda</button></form><details className={styles.calendarPicker}><summary>Calendário</summary><DoctorMonth day={dia} appointments={consultasMes.data ?? []} error={Boolean(consultasMes.error)}/></details></div>
        {erroDia ? <p className={styles.error} role="alert">Não foi possível carregar os atendimentos. Atualize a página.</p> : <DoctorAgenda key={dia} consultas={consultas}/>}
        {consultas.length===500 && <p className={styles.muted}>Exibindo os primeiros 500 atendimentos desta data.</p>}
      </section>
    <div className={styles.insights}>
      <section data-doctor-reveal className={styles.card} aria-labelledby="resumo-clinico"><span className={styles.eyebrow}>ACOMPANHAMENTO DO DIA</span><h3 id="resumo-clinico" style={{marginTop:10}}>Situação dos atendimentos</h3><p className={styles.muted}>{dataCurta(dia)} · Inclui todas as situações registradas.</p>{erroDia?<p className={styles.error}>Dados indisponíveis.</p>:<><p className={styles.muted}>{concluida} de {ocupadas.length} consultas concluídas.</p><div className={styles.breakdown}>{distribuicao.map(s=><div key={s.status}><span><i style={{background:s.color}}/>{s.label}</span><strong>{consultas.filter(c=>c.status===s.status).length}</strong></div>)}</div></>}</section>
      <section data-doctor-reveal className={styles.card} id="registros-recentes" aria-labelledby="meus-registros"><span className={styles.eyebrow}>CONTINUIDADE DO CUIDADO</span><h3 id="meus-registros" style={{marginTop:10}}>Meus registros recentes</h3><p className={styles.muted}>As quatro evoluções mais recentes registradas por você.</p>{registros.error?<p role="alert" className={styles.error}>Não foi possível carregar as evoluções.</p>:registros.data?.length?<ol className={styles.recentNotes}>{registros.data.map(r=><li key={r.id}><time dateTime={r.created_at}>{dataHora(r.created_at)}</time><Link href={`/medico/pacientes/${r.paciente_id}`}>{(r.pacientes as unknown as {nome_completo:string}|null)?.nome_completo??'Abrir prontuário'} →</Link><p>{r.descricao.length>150?r.descricao.slice(0,150)+'…':r.descricao}</p></li>)}</ol>:<div className={styles.empty}><strong>Seus registros aparecerão aqui.</strong><p>Abra o prontuário de um paciente para registrar a evolução.</p><Link className={styles.shortcut} href="/medico/pacientes">Escolher paciente →</Link></div>}</section>
      <section data-doctor-reveal className={styles.card} aria-labelledby="meu-perfil"><span className={styles.eyebrow}>PERFIL PROFISSIONAL</span><h3 id="meu-perfil" style={{marginTop:10}}>Meus dados na clínica</h3>{perfil.error?<p className={styles.error}>Não foi possível carregar os dados.</p>:<><dl className={styles.profileDetails}><div><dt>Profissional</dt><dd>{profissional.nome}</dd></div><div><dt>Especialidade</dt><dd>{especialidade?.nome??'Não informada'}</dd></div><div><dt>Registro profissional</dt><dd>{perfil.data?.registro_profissional??'Não informado'}</dd></div><div><dt>Unidade</dt><dd>{unidade?.nome??'Não informada'}{unidade?.cidade&&<small>{unidade.cidade}</small>}</dd></div><div><dt>E-mail</dt><dd>{perfil.data?.email??user.email??'Não informado'}</dd></div><div><dt>Telefone</dt><dd>{perfil.data?.telefone??'Não informado'}</dd></div></dl><p className={styles.profileHint}>Para corrigir os dados profissionais, solicite a atualização ao administrador da clínica.</p></>}</section>
    </div>
    <details className={styles.disclosure}><summary>Próximos atendimentos <span>Até 8 consultas futuras agendadas ou confirmadas</span></summary><div>{futuras.error ? <p role="alert" className={styles.error}>Não foi possível carregar as próximas consultas.</p> : <DoctorAppointments consultas={proximas} empty="Nenhuma consulta futura." showDate/>}</div></details>
    <details className={styles.disclosure}><summary>Horários da agenda <span>Livres, ocupados e bloqueados nos próximos 14 dias</span></summary><div>{slots.error ? <p role="alert" className={styles.error}>Não foi possível carregar os horários.</p> : <AgendaSlots slots={horarios} mostrarProfissional={false}/>}</div></details>
    <div className={styles.manageGrid} id="disponibilidade">
      <details className={styles.disclosure}><summary>Liberar horários <span>Defina dias, períodos e intervalos de atendimento</span></summary><div><DisponibilidadeForm profissionalFixo={profissional}/></div></details>
      <details className={styles.disclosure}><summary>Férias e bloqueios <span>Gerencie afastamentos e períodos indisponíveis</span></summary><div><BloqueioForm profissionalFixo={profissional}/><div style={{marginTop:20}}>{bloqueios.error ? <p role="alert" className={styles.error}>Não foi possível carregar os bloqueios.</p> : <BloqueiosLista bloqueios={(bloqueios.data ?? []) as unknown as Bloqueio[]} mostrarProfissional={false}/>}</div></div></details>
    </div>
  </DoctorMotion>;
}
