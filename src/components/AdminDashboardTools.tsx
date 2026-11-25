"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { gerarCsv } from "@/lib/csv";
import type { IndicadorEspecialidade } from "@/lib/queries";
import styles from "@/app/admin/dashboard.module.css";

export default function AdminDashboardTools({ dias, linhas, atualizadoEm }: {
  dias: number; linhas: IndicadorEspecialidade[]; atualizadoEm: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState("");
  function exportar() {
    const csv = gerarCsv([
      ["Período", `Próximos ${dias} dias`],
      ["Atualizado em", atualizadoEm],
      ["Especialidade", "Vagas disponíveis", "Reservadas", "Bloqueadas", "Consultas", "Canceladas", "Concluídas", "Faltas", "Ocupação (%)"],
      ...linhas.map(l => {
        const total = l.vagas_livres + l.vagas_reservadas;
        return [l.especialidade_nome, l.vagas_livres, l.vagas_reservadas, l.vagas_bloqueadas, l.consultas, l.canceladas, l.concluidas, l.faltas, total ? Math.round(l.vagas_reservadas / total * 100) : 0];
      }),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `indicadores-clinicaflow-${dias}-dias.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMensagem("Relatório CSV gerado com os indicadores por especialidade.");
  }
  return <section className={styles.tools} aria-label="Controles do dashboard">
    <div><span className={styles.toolsLabel}>Planejamento da agenda</span><nav className={styles.range} aria-label="Período dos indicadores">{[7, 14, 30].map(n => <Link key={n} href={`/admin?dias=${n}`} aria-current={dias === n ? "page" : undefined}>{n} dias</Link>)}</nav></div>
    <div className={styles.toolActions}><span className={styles.updated}>Atualizado às {atualizadoEm}</span><button disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Atualizando..." : "Atualizar dados"}</button><button onClick={exportar} disabled={!linhas.length}>Exportar CSV <span aria-hidden="true">↓</span></button></div>
    <span className={styles.toolMessage} role="status">{mensagem}</span>
  </section>;
}
