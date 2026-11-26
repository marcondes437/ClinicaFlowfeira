"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { hora } from '@/lib/format';
import PatientIcon from './PatientIcon';
import styles from './PatientWelcome.module.css';

type ProximaConsulta = { data_hora: string; status: string; especialidade: string; unidade: string };

export default function PatientWelcome({ proxima, cadastroCompleto, indisponivel = false }: { proxima: ProximaConsulta | null; cadastroCompleto: boolean; indisponivel?: boolean }) {
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .1 });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const date = proxima ? new Date(proxima.data_hora) : null;
  const dia = date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date) : null;
  const mes = date ? new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(date).replace('.', '') : null;

  return <section ref={element} className={`${styles.hero} ${paused || !visible ? styles.paused : ''}`} aria-labelledby="patient-heading">
    <div className={styles.copy}>
      <span className={styles.eyebrow}>PORTAL DO PACIENTE</span>
      <h2 id="patient-heading">Suas consultas,<br /><span>bem organizadas.</span></h2>
      <p>Marque uma consulta, confira seus próximos atendimentos e mantenha seus dados atualizados.</p>
      <div className={styles.actions}><Link href="/paciente/agendar" className={styles.primary}>Agendar consulta <PatientIcon kind="calendar" size={18} /></Link><Link href="/paciente/historico" className={styles.secondary}>Consultar histórico <PatientIcon kind="arrow" size={17} /></Link></div>
    </div>
    <div className={styles.summary}>
      <div className={styles.summaryHead}><span className={styles.calendarIcon}><PatientIcon kind="calendar" size={21} /></span><h3>Minha agenda</h3><span className={styles.dot} aria-hidden="true" /></div>
      {indisponivel ? <div className={styles.empty}><strong>Agenda indisponível</strong><p>Atualize a página para tentar novamente.</p></div>
        : proxima && date ? <div className={styles.appointment}><div className={styles.date}><strong>{dia}</strong><span>{mes}</span></div><div className={styles.details}><span>{proxima.status === 'em_atendimento' ? 'Em atendimento' : 'Próxima consulta'}</span><strong>{proxima.especialidade}</strong><p>{hora(proxima.data_hora)} · {proxima.unidade}</p><a href="#patient-agenda">Ver detalhes do atendimento ↓</a></div></div>
        : <div className={styles.empty}><strong>Nenhuma consulta agendada</strong><p>Escolha uma especialidade para encontrar o próximo horário disponível.</p><Link href="/paciente/agendar">Encontrar um horário <PatientIcon kind="arrow" size={16} /></Link></div>}
      <div className={styles.shortcuts}><Link href="/paciente/historico"><PatientIcon kind="history" size={18} /><span>Meu histórico</span><PatientIcon kind="arrow" size={15} /></Link><Link href="/paciente/meus-dados"><PatientIcon kind="user" size={18} /><span>{cadastroCompleto ? 'Meus dados' : 'Completar cadastro'}</span><PatientIcon kind="arrow" size={15} /></Link></div>
      <button type="button" className={styles.pause} aria-pressed={paused} onClick={() => { setPaused(value => !value); setVisible(true); }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{paused ? <path d="m5 3 8 5-8 5Z" /> : <><rect x="4" y="3" width="2" height="10" rx="1" /><rect x="10" y="3" width="2" height="10" rx="1" /></>}</svg>
        {paused ? 'Retomar animações' : 'Pausar animações'}
      </button>
    </div>
  </section>;
}