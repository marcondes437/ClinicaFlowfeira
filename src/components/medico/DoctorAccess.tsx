import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './DoctorAccess.module.css';

export default function DoctorAccess({ children }: { children: ReactNode }) {
  return <main className={styles.page}>
    <section className={styles.panel} aria-labelledby="doctor-login-title">
      <Link href="/" className={styles.brand} aria-label="ClínicaFlow — página inicial"><img src="/fotos/logo-transparente.png" alt="" width="42" height="42"/><span>ClínicaFlow</span></Link>
      <h1 id="doctor-login-title">Portal do médico</h1>
      {children}
      <details className={styles.help}><summary>Não tenho acesso</summary><p>Solicite seu e-mail e senha ao administrador da clínica. Sua conta deve estar vinculada ao cadastro de profissional.</p></details>
      <Link className={styles.back} href="/">Voltar ao site</Link>
    </section>
  </main>;
}
