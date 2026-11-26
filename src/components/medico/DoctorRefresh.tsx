"use client";
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import styles from './doctor.module.css';
export default function DoctorRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" className={styles.refresh} disabled={pending} aria-busy={pending} onClick={() => start(() => router.refresh())}><span className={pending ? styles.refreshSpin : ''} aria-hidden="true">↻</span> {pending ? 'Atualizando…' : 'Atualizar painel'}</button>;
}
