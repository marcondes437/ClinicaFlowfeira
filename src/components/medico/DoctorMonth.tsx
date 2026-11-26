import { dataCurta, hojeIso } from '@/lib/format';
import styles from './doctor.module.css';

export function monthRange(day: string) {
  const date = new Date(day + 'T12:00:00Z');
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { start: `${day.slice(0, 7)}-01`, next: iso(new Date(Date.UTC(year, month + 1, 1))), previous: iso(new Date(Date.UTC(year, month - 1, 1))) };
}

export default function DoctorMonth({ day, appointments, error }: { day: string; appointments: Array<{data_hora: string}>; error: boolean }) {
  const range = monthRange(day);
  const date = new Date(range.start + 'T12:00:00Z');
  const offset = (date.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const title = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  const counts = new Map<string, number>();
  for (const appointment of appointments) { const key = hojeIso(new Date(appointment.data_hora)); counts.set(key, (counts.get(key) ?? 0) + 1); }
  return <section className={styles.monthCalendar} aria-label="Calendário mensal do médico">
    <div className={styles.monthNavigation}><h3>{title.charAt(0).toUpperCase() + title.slice(1)}</h3><div><a href={`/medico?dia=${range.previous}`} aria-label="Mês anterior">‹</a><a href={`/medico?dia=${range.next}`} aria-label="Próximo mês">›</a></div></div>
    <div className={styles.monthWeekdays} aria-hidden="true">{['S','T','Q','Q','S','S','D'].map((d,i)=><span key={i}>{d}</span>)}</div>
    <div className={styles.monthDays}>{Array.from({length:offset},(_,i)=><span key={`blank-${i}`}/>)}{Array.from({length},(_,i)=>{
      const value=`${day.slice(0,7)}-${String(i+1).padStart(2,'0')}`;
      const count=counts.get(value)??0;
      return <a key={value} href={`/medico?dia=${value}`} aria-current={value===day?'date':undefined} aria-label={`${dataCurta(value)}${error?'':`: ${count} consultas não canceladas`}`} data-has-appointments={!error && count>0} data-today={value===hojeIso()}>{i+1}<i aria-hidden="true"/></a>;
    })}</div>
    <div className={styles.monthLegend}><span><i/>Com atendimento</span><a href="/medico">Hoje</a></div>
    {error && <p role="alert" className={styles.muted}>Não foi possível consultar as marcações do mês.</p>}
    {appointments.length===2000 && <p className={styles.muted}>Marcações dos primeiros 2.000 atendimentos do mês.</p>}
  </section>;
}
