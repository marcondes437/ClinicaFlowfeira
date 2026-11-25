"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./AppShell";
import { itemAtivo } from "@/lib/nav";
import styles from "./AppShell.module.css";

export default function NavLinks({ nav, icons = false }: { nav: NavItem[]; icons?: boolean }) {
  const caminho = usePathname() ?? "";
  const todos = nav.map((i) => i.href);
  return (
    <nav className={styles.nav} aria-label="Menu principal">
      {nav.map((item) => {
        const ativo = itemAtivo(item.href, caminho, todos);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navLink} ${ativo ? styles.navLinkAtivo : ""}`}
            aria-current={ativo ? "page" : undefined}
          >
            {icons && <NavIcon href={item.href} />}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function NavIcon({ href }: { href: string }) {
  const paths: Record<string, React.ReactNode> = {
    admin: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    pacientes: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v2" /></>,
    profissionais: <><path d="M5 3v6a5 5 0 0 0 10 0V3M3 3h4m6 0h4m-7 11v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="12" r="2" /></>,
    especialidades: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" />,
    unidades: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 21v-5h6v5M8 7h1m6 0h1m-8 4h1m6 0h1" /></>,
    agenda: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2" /></>,
    tarefas: <><rect x="5" y="4" width="15" height="17" rx="2" /><path d="M9 4V2h7v2M8 10l1 1 2-2m2 1h3m-8 6 1 1 2-2m2 1h3" /></>,
  };
  return <svg className={styles.navIcon} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[href.split("/").pop() ?? "admin"]}</svg>;
}
