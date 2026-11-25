import Link from 'next/link';
import styles from '../login/auth.module.css';

export default function RecuperarSenhaPage() {
  return (
    <div className={styles.wrap}>
      <aside className={styles.side}>
        <Link href="/" className={styles.brand}><span className={styles.brandMark}>✚</span> ClinicxFlow</Link>
        <div><h2>Recupere seu acesso com segurança.</h2><p>Suas contas e seus dados ficam neste computador.</p></div>
        <span />
      </aside>
      <main className={styles.panel}>
        <div className={styles.form}>
          <h1>Recuperar senha</h1>
          <p className={styles.sub}>Peça ao responsável pelo computador para redefinir a senha da sua conta local.</p>
          <p>Este sistema funciona sem internet e não envia links por e-mail.</p>
          <div className={styles.links}><Link href="/portal-paciente">Voltar ao login</Link><Link href="/portal-medico">Portal do médico</Link></div>
        </div>
      </main>
    </div>
  );
}