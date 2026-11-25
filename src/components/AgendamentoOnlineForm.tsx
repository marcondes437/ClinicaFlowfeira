import Link from "next/link";
import styles from "./AgendamentoOnlineForm.module.css";

export default function AgendamentoOnlineForm() {
  return (
    <div className={styles.form}>
      <div className={styles.grid}>
        <div className={styles.field}>
          <strong>1. Entre ou crie sua conta</strong>
          <span>O cadastro pede só nome, e-mail e senha. Celular e CPF são pedidos uma vez, no primeiro acesso.</span>
        </div>
        <div className={styles.field}>
          <strong>2. Escolha a especialidade</strong>
          <span>Se quiser, indique unidade e período. Você não escolhe o médico.</span>
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <strong>3. Receba o horário e o médico</strong>
          <span>O sistema marca o primeiro horário livre na agenda dos médicos da especialidade e mostra quem vai atender você.</span>
        </div>
      </div>
      <p className={styles.note}>Se você já possui conta, entre para acessar seus dados salvos.</p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link href="/portal-paciente?redirect=/paciente/agendar" className="cx-btn cx-btn-primary">Entrar e agendar</Link>
        <Link href="/cadastro?redirect=/paciente/agendar" className="cx-btn cx-btn-ghost">Criar conta</Link>
      </div>
    </div>
  );
}
