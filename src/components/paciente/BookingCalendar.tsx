"use client";

import { useState } from 'react';
import PatientIcon from './PatientIcon';
import styles from './BookingCalendar.module.css';

const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' });
const weekdays = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const asIso = (date: Date) => date.toISOString().slice(0, 10);
const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;

export default function BookingCalendar({ value, min, onChange }: { value: string; min: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(firstOfMonth(value || min));
  const [focused, setFocused] = useState(value || min);
  const maxDate = asDate(min);
  maxDate.setUTCDate(maxDate.getUTCDate() + 365);
  const max = asIso(maxDate);
  const start = asDate(month);
  const offset = (start.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Math.ceil((offset + count) / 7) * 7;
  const title = monthFormat.format(start);
  const previous = month <= firstOfMonth(min);
  const next = month >= firstOfMonth(max);

  function moveMonth(amount: number) {
    const date = asDate(month);
    date.setUTCMonth(date.getUTCMonth() + amount);
    const newMonth = asIso(date);
    setMonth(newMonth);
    setFocused(newMonth < min ? min : newMonth);
  }

  function close() {
    setOpen(false);
    document.getElementById('booking-date')?.focus();
  }

  function keyboard(event: React.KeyboardEvent<HTMLButtonElement>, iso: string) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    const date = asDate(iso);
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in steps) date.setUTCDate(date.getUTCDate() + steps[event.key]);
    else if (event.key === 'Home') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    else if (event.key === 'End') date.setUTCDate(date.getUTCDate() + 6 - (date.getUTCDay() + 6) % 7);
    else return;
    event.preventDefault();
    const target = asIso(date) < min ? min : asIso(date) > max ? max : asIso(date);
    setMonth(firstOfMonth(target));
    setFocused(target);
    requestAnimationFrame(() => document.getElementById(`booking-day-${target}`)?.focus());
  }

  return <div className={styles.calendar}>
    <input type="hidden" name="a_partir_de" value={value} />
    <button id="booking-date" type="button" className={styles.trigger} aria-expanded={open} aria-controls="booking-date-panel" onClick={() => {
      if (!open) { setMonth(firstOfMonth(value || min)); setFocused(value || min); }
      setOpen(!open);
    }}>
      <span className={styles.icon}><PatientIcon kind="calendar" /></span>
      <span className={styles.copy}><span>A partir de qual data você prefere agendar?</span><strong>{value ? value.split('-').reverse().join('/') : 'Próxima data disponível'}</strong></span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg>
    </button>
    {open && <div id="booking-date-panel" className={styles.panel} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
      <div className={styles.navigation}>
        <button type="button" aria-label="Mês anterior" disabled={previous} onClick={() => moveMonth(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button>
        <span id="booking-month" aria-live="polite">{title.charAt(0).toUpperCase() + title.slice(1)}</span>
        <button type="button" aria-label="Próximo mês" disabled={next} onClick={() => moveMonth(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></button>
      </div>
      <table className={styles.days} aria-labelledby="booking-month">
        <thead><tr>{weekdays.map(day => <th scope="col" key={day}><abbr title={day}>{day[0]}</abbr></th>)}</tr></thead>
        <tbody>{Array.from({ length: cells / 7 }, (_, week) => <tr key={week}>{Array.from({ length: 7 }, (_, column) => {
          const day = week * 7 + column - offset + 1;
          if (day < 1 || day > count) return <td key={column} />;
          const iso = `${month.slice(0, 7)}-${String(day).padStart(2, '0')}`;
          return <td key={column}><button type="button" id={`booking-day-${iso}`} data-date={iso} disabled={iso < min || iso > max} tabIndex={iso === focused ? 0 : -1} aria-label={dayFormat.format(asDate(iso))} aria-pressed={value === iso} aria-current={iso === min ? 'date' : undefined} onFocus={() => setFocused(iso)} onKeyDown={e => keyboard(e, iso)} onClick={() => { onChange(iso); close(); }}>{day}</button></td>;
        })}</tr>)}</tbody>
      </table>
      <div className={styles.footer}><button type="button" onClick={() => { setMonth(firstOfMonth(min)); setFocused(min); requestAnimationFrame(() => document.getElementById(`booking-day-${min}`)?.focus()); }}>Hoje</button><button type="button" onClick={() => { onChange(''); close(); }}>Sem preferência de data</button></div>
      <p className={styles.note}>A data indica a partir de quando buscar. Os horários disponíveis aparecem na pesquisa.</p>
    </div>}
  </div>;
}
