import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/local/server';
import { getProfissionalDoUsuario } from '@/lib/profissional';
import styles from '@/components/medico/doctor.module.css';
export const dynamic = 'force-dynamic';
export default async function PacientesDoMedico({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  const user = await requireRole(['medico']);
  const profissional = await getProfissionalDoUsuario(user.id);
  if (!profissional) return <p className="cx-alert cx-alert-error" role="alert">Peça ao administrador para vincular seu acesso a um profissional ativo.</p>;
  const busca = ((await searchParams).busca ?? '').trim().slice(0,120);
  const supabase = await createClient();
  const {data,error} = await supabase.from('consultas').select('pacientes(id, nome_completo, celular, telefone)').eq('profissional_id',profissional.id).in('status',['agendada','confirmada','em_atendimento','concluida','faltou']).order('data_hora',{ascending:false}).limit(1000);
  type Patient = {id:string;nome_completo:string;celular:string|null;telefone:string|null};
  const mapa = new Map<string,Patient>();
  for(const c of data ?? []) {const p=c.pacientes as unknown as Patient|null;if(p)mapa.set(p.id,p);}
  const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const pacientes=[...mapa.values()].filter(p=>normalize(p.nome_completo).includes(normalize(busca))).sort((a,b)=>a.nome_completo.localeCompare(b.nome_completo,'pt-BR'));
  return <div className={styles.page}>
    <header className={styles.intro}><div><span className={styles.eyebrow}>ACOMPANHAMENTO CLÍNICO</span><h2>Meus pacientes</h2><p>Prontuários dos pacientes vinculados aos seus atendimentos.</p></div><Link href="/medico" className={styles.shortcut}>← Voltar à agenda</Link></header>
    <section className={styles.card}><h3>Encontre um paciente</h3><form className={styles.search}><div><label htmlFor="busca-paciente">Nome do paciente</label><input id="busca-paciente" name="busca" placeholder="Pesquisar pelo nome" defaultValue={busca} maxLength={120}/></div><button className="cx-btn cx-btn-primary">Pesquisar</button>{busca && <Link className={styles.shortcut} href="/medico/pacientes">Limpar</Link>}</form></section>
    {error ? <p className={styles.error} role="alert">Não foi possível carregar os pacientes. Atualize a página.</p> : <><p className={styles.muted}>{pacientes.length} paciente{pacientes.length===1?'':'s'} encontrado{pacientes.length===1?'':'s'}{(data?.length ?? 0)>=1000 ? ' · Busca nos pacientes dos últimos 1.000 atendimentos.' : '.'}</p><div className={styles.patientsGrid}>{pacientes.map(p=><article className={styles.patientCard} key={p.id}><span className={styles.avatar} aria-hidden="true">{p.nome_completo.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('')}</span><h3>{p.nome_completo}</h3><p>{p.celular ?? p.telefone ?? 'Contato não informado'}</p><Link href={`/medico/pacientes/${p.id}`}>Abrir prontuário <span aria-hidden="true">→</span></Link></article>)}</div>{!pacientes.length && <div className={styles.empty}><strong>{busca ? 'Nenhum paciente com esse nome.' : 'Nenhum paciente vinculado ainda.'}</strong><p>Os pacientes aparecem após um agendamento para seu atendimento.</p></div>}</>}
  </div>;
}
