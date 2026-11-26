"use client";
import { useState } from 'react';
import { calendarioConsulta, type EventoConsulta } from '@/lib/calendario';
import PatientIcon from './PatientIcon';
import styles from './AppointmentTools.module.css';

export function CalendarDownload({ evento }: { evento: EventoConsulta }) {
  const [message, setMessage] = useState('');
  function baixar() {
    try {
      const url = URL.createObjectURL(new Blob([calendarioConsulta(evento)], { type: 'text/calendar;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `consulta-${evento.id}.ics`; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Arquivo pronto. Abra no seu calendário.');
    } catch { setMessage('Não foi possível preparar o arquivo. Tente novamente.'); }
  }
  return <div className={styles.download}><button type="button" onClick={baixar} title="Baixar arquivo .ics para abrir no seu calendário"><PatientIcon kind="calendar" size={17} /> Adicionar ao calendário</button><span role="status">{message}</span></div>;
}

export function AppointmentPreparation() {
  const items = ['Documento com foto', 'Carteirinha do convênio, se usar', 'Exames anteriores, se tiver'];
  const [checked, setChecked] = useState<boolean[]>(items.map(() => false));
  const count = checked.filter(Boolean).length;
  return <section className={styles.preparation} aria-labelledby="prepare-heading">
    <div className={styles.heading}><span>PARA O DIA DA CONSULTA</span><PatientIcon kind="check" size={20} /></div>
    <h2 id="prepare-heading">Tudo pronto para ir?</h2><p>Uma pequena lista para organizar sua visita.</p>
    <div className={styles.progress}><span style={{ width: `${count / items.length * 100}%` }} /></div>
    <span className={styles.count} aria-live="polite">{count} de {items.length} itens conferidos</span>
    <div className={styles.items}>{items.map((item, index) => <label key={item}><input type="checkbox" checked={checked[index]} onChange={() => setChecked(values => values.map((value, i) => i === index ? !value : value))} /><span>{item}</span></label>)}</div>
    <small>A seleção é temporária, enquanto esta página estiver aberta. Confira com a clínica se há orientações específicas para sua consulta.</small>
  </section>;
}
