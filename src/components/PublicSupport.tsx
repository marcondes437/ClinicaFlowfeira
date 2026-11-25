"use client";

import { usePathname } from "next/navigation";
import ServicesWidget from "./ServicesWidget";
import SiteAssistant from "./SiteAssistant";
import styles from "./SupportDock.module.css";

const PAGINAS_PUBLICAS = new Set(["/", "/sobre", "/procurar-clinica", "/agendamento-online"]);

export default function PublicSupport({ aiEnabled }: { aiEnabled: boolean }) {
  const pathname = usePathname();
  // Os atalhos flutuantes encobriam os botões dos formulários de autenticação.
  if (!PAGINAS_PUBLICAS.has(pathname)) return null;
  return <div className={styles.dock}><ServicesWidget /><SiteAssistant aiEnabled={aiEnabled} /></div>;
}
