import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { getProfissionalDoUsuario } from '@/lib/profissional';
import { uuidValido } from '@/lib/validacao';
import { createClient } from '@/lib/local/server';
import { CONSULTA_SELECT } from '@/lib/queries';
import { dataCurta, dataHora } from '@/lib/format';
import type { ConsultaRow } from '@/components/ConsultasTable';
import DoctorAppointments from '@/components/medico/DoctorAppointments';
import EvolucaoForm from '@/components/EvolucaoForm';
import StatusConsulta from '@/components/StatusConsulta';
import styles from '@/components/medico/doctor.module.css';
export const dynamic = 'force-dynamic';
export default async function ProntuarioMedico({ params, searchParams }: { params:Promise<{id:string}>;searchParams:Promise<{consulta?:string}> }) {
  const user=await requireRole(['medico']);
  const profissional=await getProfissionalDoUsuario(user.id);
  if(!profissional)return <p role="alert" className="cx-alert cx-alert-error">Seu acesso precisa estar vinculado a um profissional ativo.</p>;
  const {id}=await params;
  const {consulta:consultaId}=await searchParams;
  if(!uuidValido(id)||(consultaId&&!uuidValido(consultaId)))notFound();
  const supabase=await createClient();
  const [vinculo,pacienteResult,consultasResult,evolucoesResult]=await Promise.all([
    supabase.from('consultas').select('id').eq('paciente_id',id).eq('profissional_id',profissional.id).in('status',['agendada','confirmada','em_atendimento','concluida','faltou']).limit(1),
    supabase.from('pacientes').select('id,nome_completo,data_nascimento,celular,telefone,observacoes').eq('id',id).maybeSingle(),
    supabase.from('consultas').select(CONSULTA_SELECT).eq('paciente_id',id).eq('profissional_id',profissional.id).order('data_hora',{ascending:false}).limit(100),
    supabase.from('evolucoes').select('id,descricao,created_at,consulta_id').eq('paciente_id',id).order('created_at',{ascending:false}).limit(100),
  ]);
  if(vinculo.error||pacienteResult.error)return <p role="alert" className={styles.error}>Não foi possível carregar o prontuário. Atualize a página.</p>;
  if(!vinculo.data?.length||!pacienteResult.data)notFound();
  const paciente=pacienteResult.data;
  const consultas=(consultasResult.data??[]) as unknown as ConsultaRow[];
  const selecionada=consultaId?consultas.find(c=>c.id===consultaId):null;
  if(consultaId&&!selecionada&&!consultasResult.error)notFound();
  return <div className={styles.page}>
    <Link href="/medico/pacientes" className={styles.back}>← Voltar aos meus pacientes</Link>
    <header className={styles.card}><span className={styles.eyebrow}>PRONTUÁRIO DO PACIENTE</span><div className={styles.intro}><div><h2>{paciente.nome_completo}</h2><p>Informações para acompanhamento do atendimento.</p></div><span className={styles.avatar} aria-hidden="true">{paciente.nome_completo[0]}</span></div><dl className={styles.patientInfo}><div><dt>Nascimento</dt><dd>{dataCurta(paciente.data_nascimento)}</dd></div><div><dt>Contato</dt><dd>{paciente.celular??paciente.telefone??'Não informado'}</dd></div></dl>{paciente.observacoes && <p className={styles.muted} style={{marginTop:20,whiteSpace:'pre-wrap'}}>{paciente.observacoes}</p>}</header>
    {selecionada&&<section className={styles.card} aria-label="Atendimento selecionado"><div className={styles.sectionHead}><div><span className={styles.eyebrow}>ATENDIMENTO SELECIONADO</span><h3 style={{marginTop:10}}>{dataHora(selecionada.data_hora)}</h3><p className={styles.muted} style={{marginBottom:0}}>{selecionada.especialidades?.nome} · {selecionada.unidades?.nome}</p></div><StatusConsulta key={selecionada.status} id={selecionada.id} status={selecionada.status}/></div>{selecionada.motivo&&<p className={styles.muted}>Motivo: {selecionada.motivo}</p>}</section>}
    <div className={styles.recordGrid}>
      <section className={styles.card} aria-labelledby="evolucoes"><h3 id="evolucoes">Evolução clínica</h3><p className={styles.muted}>Registros do acompanhamento deste paciente, do mais recente ao mais antigo.</p>{evolucoesResult.error?<p role="alert" className={styles.error}>Não foi possível carregar as evoluções.</p>:<><ol className={styles.timeline}>{(evolucoesResult.data??[]).map(e=><li key={e.id}><time dateTime={e.created_at}>{dataHora(e.created_at)}</time><p>{e.descricao}</p></li>)}</ol>{!evolucoesResult.data?.length&&<div className={styles.empty}><strong>Nenhuma evolução registrada.</strong><p>Use o formulário ao lado para registrar o atendimento.</p></div>}{evolucoesResult.data?.length===100&&<p className={styles.muted}>Exibindo os 100 registros mais recentes.</p>}</>}</section>
      <section className={styles.card} aria-labelledby="novo-registro"><h3 id="novo-registro">Registrar atendimento</h3><p className={styles.muted}>{selecionada?'O registro será vinculado ao atendimento selecionado.':'Descreva a evolução e, se necessário, vincule a um atendimento.'}</p>{consultasResult.error?<p role="alert" className={styles.error}>Não foi possível consultar os atendimentos para registrar a evolução.</p>:<EvolucaoForm key={selecionada?.id??id} pacienteId={id} consultaId={selecionada?.id} consultas={consultas.filter(c=>c.status!=='cancelada').map(c=>({id:c.id,rotulo:`${dataHora(c.data_hora)} · ${c.especialidades?.nome??'Consulta'}`}))}/>}</section>
    </div>
    <details className={styles.disclosure}><summary>Meus atendimentos com este paciente <span>Até 100 consultas mais recentes</span></summary><div>{consultasResult.error?<p role="alert" className={styles.error}>Não foi possível carregar os atendimentos.</p>:<DoctorAppointments consultas={consultas} empty="Nenhum atendimento encontrado." showDate/>}</div></details>
  </div>;
}
