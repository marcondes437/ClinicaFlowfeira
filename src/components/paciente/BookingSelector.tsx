"use client";
import { useState } from 'react';
import PatientIcon from './PatientIcon';
import styles from './BookingSelector.module.css';
type Option = { value: string; label: string; detail?: string; disabled?: boolean };
export default function BookingSelector({ id, label, value, placeholder, options, onChange, kind = 'calendar', searchable = false }: { id: string; label: string; value: string; placeholder: string; options: Option[]; onChange: (value: string) => void; kind?: 'calendar' | 'user' | 'plus'; searchable?: boolean }) {
 const [open, setOpen] = useState(false);
 const [query, setQuery] = useState('');
 const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
 const filtered = options.filter(o => normalize(o.label).includes(normalize(query)));
 return <div className={styles.selector}>
  <button id={id} type="button" className={styles.trigger} aria-expanded={open} aria-controls={id + '-options'} onClick={() => setOpen(!open)}>
   <span className={styles.icon}><PatientIcon kind={kind} /></span><span className={styles.copy}><span>{label}</span><strong>{options.find(o => o.value === value)?.label ?? placeholder}</strong></span><span className={styles.chevron} aria-hidden="true">{open ? '−' : '+'}</span>
  </button>
  {open && <div id={id + '-options'} className={styles.panel}>
   {searchable && <input autoFocus type="search" aria-label={'Buscar ' + label.toLowerCase()} placeholder="Digite para pesquisar..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') e.preventDefault(); if(e.key === 'Escape') {setOpen(false); document.getElementById(id)?.focus();} }} />}
   <div className={styles.options} aria-label={label}>{filtered.map(o => <button key={o.value} type="button" disabled={o.disabled} aria-pressed={o.value === value} onClick={() => {onChange(o.value);setOpen(false);setQuery('');document.getElementById(id)?.focus();}}><span><strong>{o.label}</strong>{o.detail && <small>{o.detail}</small>}</span>{o.value === value && <PatientIcon kind="check" size={17} />}</button>)}{!filtered.length && <p>Nenhuma opção encontrada.</p>}</div>
  </div>}
 </div>;
}
