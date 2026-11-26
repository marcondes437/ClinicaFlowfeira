"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConsultaRow } from '@/components/ConsultasTable';
import DoctorAppointments from './DoctorAppointments';
import styles from './doctor.module.css';
import { useDoctorMotion } from './DoctorMotion';

const filters = [
  { id: 'todos', label: 'Todos', statuses: [] as string[] },
  { id: 'aguardando', label: 'Aguardando', statuses: ['agendada', 'confirmada'] },
  { id: 'andamento', label: 'Em atendimento', statuses: ['em_atendimento'] },
  { id: 'concluidos', label: 'Concluídos', statuses: ['concluida'] },
  { id: 'outros', label: 'Faltas e cancelamentos', statuses: ['faltou', 'cancelada'] },
];

export default function DoctorAgenda({ consultas }: { consultas: ConsultaRow[] }) {
  const [filter, setFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [showReason, setShowReason] = useState(true);
  const results = useRef<HTMLDivElement>(null);
  const { enabled } = useDoctorMotion();
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const result = useMemo(() => {
    const statuses = filters.find(f => f.id === filter)!.statuses;
    return consultas.filter(c => (!statuses.length || statuses.includes(c.status)) && normalize(c.pacientes?.nome_completo ?? '').includes(normalize(search.trim())));
  }, [consultas, filter, search]);
  useEffect(() => {
    if (!enabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = results.current?.animate([{opacity:.45,transform:'translateY(4px)'},{opacity:1,transform:'none'}], {duration:180,easing:'ease-out'});
    return () => animation?.cancel();
  }, [result, enabled]);
  return <div>
    <div className={styles.agendaFilters} role="group" aria-label="Filtrar atendimentos por situação">{filters.map(f => <button type="button" key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}<span>{f.statuses.length ? consultas.filter(c => f.statuses.includes(c.status)).length : consultas.length}</span></button>)}</div>
    <div className={styles.agendaSearch}><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><label className="cx-visually-hidden" htmlFor="buscar-na-agenda">Buscar paciente nesta agenda</label><input id="buscar-na-agenda" type="search" placeholder="Buscar paciente nesta agenda" value={search} onChange={e => setSearch(e.target.value)} /></div><label><input type="checkbox" checked={showReason} onChange={e => setShowReason(e.target.checked)} />Mostrar motivo</label></div>
    <p className={styles.resultCount} role="status">{result.length} de {consultas.length} atendimento{consultas.length === 1 ? '' : 's'} nesta data</p>
    <div ref={results} data-agenda-results>{result.length ? <DoctorAppointments consultas={result} empty="Nenhum atendimento nesta data." showReason={showReason} /> : <div className={styles.empty}><strong>{consultas.length ? 'Nenhum atendimento com esses filtros.' : 'Nenhum atendimento nesta data.'}</strong><p>{consultas.length ? 'Escolha outra situação ou pesquise por outro nome.' : 'Use a navegação por data para consultar os próximos dias.'}</p>{(search || filter !== 'todos') && <button type="button" className={styles.clearAgenda} onClick={() => {setSearch('');setFilter('todos');}}>Limpar filtros</button>}</div>}</div>
  </div>;
}
