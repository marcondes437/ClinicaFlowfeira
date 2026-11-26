import type { ConsultaRow } from '@/components/ConsultasTable';
import StatusConsulta from '@/components/StatusConsulta';
import { dataCurta, hora } from '@/lib/format';
import styles from './doctor.module.css';

export default function DoctorAppointments({ consultas, empty, showDate = false, showReason = true }: { consultas: ConsultaRow[]; empty: string; showDate?: boolean; showReason?: boolean }) {
  if (!consultas.length) return <div className={styles.empty}><strong>{empty}</strong><p>Os atendimentos aparecem aqui conforme os agendamentos da sua agenda.</p></div>;
  return <ol className={styles.appointments}>{consultas.map(c => <li key={c.id} data-consulta-id={c.id} data-status={c.status}>
    <div className={styles.time}><strong>{hora(c.data_hora)}</strong>{showDate && <small>{dataCurta(c.data_hora)}</small>}</div>
    <span className={styles.rowAvatar} aria-hidden="true">{(c.pacientes?.nome_completo ?? 'Paciente').split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('')}</span>
    <div className={styles.patient}><strong>{c.pacientes?.nome_completo ?? 'Paciente indisponível'}</strong><span>{c.unidades?.nome ?? 'Unidade não informada'} · {c.especialidades?.nome ?? 'Consulta'}</span>{showReason && c.motivo && <p>{c.motivo}</p>}</div>
    <div className={styles.appointmentActions}><StatusConsulta key={`${c.id}-${c.status}`} id={c.id} status={c.status} />{c.pacientes && <a href={`/medico/pacientes/${c.pacientes.id}?consulta=${c.id}`}>Abrir prontuário <span aria-hidden="true">→</span></a>}</div>
  </li>)}</ol>;
}
