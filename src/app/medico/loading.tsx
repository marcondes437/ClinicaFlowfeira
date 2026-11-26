import styles from '@/components/medico/doctor.module.css';
export default function LoadingMedico() {
  return <div className={styles.loadingPage} role="status" aria-live="polite"><p>Carregando área médica…</p><div className={styles.loadingTitle}/><div className={styles.loadingStats}>{[0,1,2,3].map(i=><div key={i}/>)}</div><div className={styles.loadingBody}><div/><div/></div></div>;
}
