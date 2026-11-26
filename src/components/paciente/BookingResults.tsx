import type { HorarioDisponivel } from '@/lib/actions';
import PatientIcon from './PatientIcon';
import styles from './BookingResults.module.css';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

export default function BookingResults({ horarios, loading, error, selected, onSelect, specialty }: { horarios: HorarioDisponivel[]; loading: boolean; error: string | null; selected: string; onSelect: (id: string) => void; specialty: string }) {
  const groups = new Map<string, HorarioDisponivel[]>();
  for (const slot of horarios) {
    const key = `${dayFormat.format(new Date(slot.data_hora))}:${slot.unidade_id}:${slot.profissional}`;
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  return <section className={styles.results} aria-label="Resultado da pesquisa" aria-live="polite" aria-busy={loading}>
    <header><span>ESCOLHA SEU ATENDIMENTO</span><h4>{loading ? 'Buscando horários…' : error ? 'Não foi possível consultar a agenda' : horarios.length ? `Horários para ${specialty}` : 'Nenhum horário encontrado'}</h4><p>{error ?? (horarios.length ? 'Selecione um horário abaixo para revisar e confirmar sua consulta.' : loading ? 'Estamos consultando a disponibilidade.' : 'Tente outra unidade, profissional, data ou período.')}</p></header>
    {!loading && !error && Array.from(groups.entries()).map(([key, slots]) => {
      const first = slots[0];
      return <article key={key} className={styles.card}>
        <div className={styles.date}><PatientIcon kind="calendar" size={17} /><strong>{dateFormat.format(new Date(first.data_hora))}</strong></div>
        <div className={styles.location}><PatientIcon kind="plus" size={17} /><div><strong>{first.unidade}</strong>{first.endereco && <small>{first.endereco}</small>}</div></div>
        <div className={styles.professional}><span className={styles.avatar}><PatientIcon kind="user" size={20} /></span><div><strong>{first.profissional}</strong><small>{specialty}</small></div></div>
        <div className={styles.times} role="group" aria-label={`Horários de ${first.profissional} em ${dateFormat.format(new Date(first.data_hora))}`}>
          {slots.map(slot => <button type="button" key={slot.agenda_id} data-slot-id={slot.agenda_id} aria-pressed={selected === slot.agenda_id} onClick={() => onSelect(slot.agenda_id)}>{timeFormat.format(new Date(slot.data_hora))}<span>Escolher</span></button>)}
        </div>
        <p className={styles.duration}>Duração prevista: <strong>{first.duracao} minutos</strong><span>Disponibilidade sujeita à confirmação.</span></p>
      </article>;
    })}
    {!loading && horarios.length > 0 && <p className={styles.note}>Exibimos até quatro horários por profissional e dia nas primeiras opções encontradas. Ajuste a data ou o período para buscar outros horários.</p>}
  </section>;
}
