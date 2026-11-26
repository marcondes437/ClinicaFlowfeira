import Link from "next/link";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import LogoutButton from "./LogoutButton";
import NavLinks from "./NavLinks";
import styles from "./AppShell.module.css";

export type NavItem = { href: string; label: string };

export default function AppShell({
  role,
  nome,
  email,
  nav,
  titulo,
  descricao,
  children,
}: {
  role: AppRole;
  nome: string;
  email: string | null;
  nav: NavItem[];
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  if (String(role) === "medico") return <div className={styles.medicalLayout}>
    <header className={`cx-glass-header ${styles.medicalHeader}`}>
      <a href="/" className={styles.brand}><img className={styles.brandLogo} src="/fotos/logo-transparente.png" alt=""/><span>ClinicaFlow</span></a>
      <nav className={styles.medicalNavigation} aria-label="Menu principal">{nav.map(item=><a key={item.href} href={item.href}>{item.label}</a>)}<a href="/medico#disponibilidade">Disponibilidade</a></nav>
      <div className={styles.topbarActions}><div className={styles.headerUser}><strong>{nome}</strong><span title={email??undefined}>{email}</span></div><LogoutButton/></div>
    </header>
    <main className={styles.medicalContent}>{children}</main>
  </div>;
  return (
    <div className={`${styles.shell} ${styles[role]}`}>
      <aside className={`${styles.sidebar} ${role === "paciente" ? "cx-glass-header" : ""}`}>
        <Link href="/" className={styles.brand}>
          <img className={styles.brandLogo} src="/fotos/logo-transparente.png" alt="" />
          <span>ClinicaFlow</span>
        </Link>
        <span className={styles.roleTag}>{ROLE_LABEL[role]}</span>

        {role === "admin" && <span className={styles.navCaption}>ESPAÇO DE TRABALHO</span>}
        <NavLinks nav={nav} icons={role === "admin" || role === "medico"} />

        <div className={styles.spacer} />
        {role === "medico" && <div className={styles.doctorSidebarTools}><Link href="/medico#disponibilidade"><span aria-hidden="true">＋</span><div>Disponibilidade<small>Liberar e bloquear horários</small></div></Link><Link href="/">← Voltar ao site</Link></div>}
        {role !== "medico" && <div className={styles.userBox}>
          {role === "admin" && <span className={styles.avatar} aria-hidden="true">{nome.trim().slice(0, 1).toUpperCase()}</span>}
          <div>
          <strong>{nome}</strong>
          <span>{email}</span>
          </div>
        </div>}
      </aside>

      <div className={styles.main}>
        <header className={`${styles.topbar} ${role !== "paciente" ? "cx-glass-header" : ""}`}>
          <div>
            {role === "admin" && <span className={styles.breadcrumb}>Workspace <span aria-hidden="true">/</span> Administração</span>}
            <h1>{role === "admin" ? "Gestão da clínica" : titulo}</h1>
            {descricao && role !== "admin" && <p>{descricao}</p>}
          </div>
          <div className={styles.topbarActions}>{role === "medico" && <div className={styles.headerUser}><strong>{nome}</strong><span title={email ?? undefined}>{email}</span></div>}{role === "admin" && <Link href="/" className={styles.siteLink}>Ver site <span aria-hidden="true">↗</span></Link>}<LogoutButton /></div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
