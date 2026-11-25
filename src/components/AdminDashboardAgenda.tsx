"use client";

import { useState } from "react";
import Link from "next/link";
import ConsultasTable, { type ConsultaRow } from "./ConsultasTable";
import Panel from "./Panel";
import { STATUS_CONSULTA_LABEL } from "@/lib/roles";
import styles from "@/app/admin/dashboard.module.css";

const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function AdminDashboardAgenda({ hoje, futuras, dias }: {
  hoje: ConsultaRow[]; futuras: ConsultaRow[]; dias: number;
}) {
  const [aba, setAba] = useState("hoje");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [unidade, setUnidade] = useState("");
  const consultas = aba === "hoje" ? hoje : futuras;
  const unidades = [...new Set([...hoje, ...futuras].map(c => c.unidades?.nome).filter((v): v is string => Boolean(v)))].sort();
  const filtradas = consultas.filter(c => (!status || c.status === status) && (!unidade || c.unidades?.nome === unidade) &&
    normalizar([c.pacientes?.nome_completo, c.profissionais?.nome, c.especialidades?.nome].filter(Boolean).join(" ")).includes(normalizar(busca.trim())));
  function limpar() { setBusca(""); setStatus(""); setUnidade(""); }
  return <Panel titulo="Central de atendimentos" descricao="Consulte pacientes, encontre atendimentos e atualize a situação das consultas." acao={<Link href="/admin/agenda" className="cx-btn cx-btn-ghost">Abrir agenda completa →</Link>}>
    <div className={styles.agendaTabs} aria-label="Exibição de atendimentos">{[["hoje", "Hoje", hoje.length], ["futuras", `Próximos ${dias} dias`, futuras.length]].map(([id, label, count]) => <button key={id} type="button" aria-pressed={aba === id} onClick={() => setAba(String(id))}>{label}<span>{count}</span></button>)}</div>
    <div className={styles.agendaFilters}>
      <div><label htmlFor="dashboard-busca">Buscar atendimento</label><input id="dashboard-busca" type="search" placeholder="Paciente, médico ou especialidade" value={busca} onChange={e => setBusca(e.target.value)} /></div>
      <div><label htmlFor="dashboard-status">Situação</label><select id="dashboard-status" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todas as situações</option>{Object.entries(STATUS_CONSULTA_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div><label htmlFor="dashboard-unidade">Unidade</label><select id="dashboard-unidade" value={unidade} onChange={e => setUnidade(e.target.value)}><option value="">Todas as unidades</option>{unidades.map(nome => <option key={nome}>{nome}</option>)}</select></div>
      {(busca || status || unidade) && <button type="button" onClick={limpar}>Limpar filtros</button>}
    </div>
    <p className={styles.resultsCount} role="status">{filtradas.length} de {consultas.length} atendimento(s) nesta listagem.</p>
    <ConsultasTable consultas={filtradas} podeAlterarStatus linkPaciente="/admin/pacientes" linkRemarcar="/admin/agenda" vazio={busca || status || unidade ? "Nenhum atendimento corresponde aos filtros. Tente outra busca ou limpe os filtros." : "Nenhum atendimento neste período."} />
    {aba === "futuras" && futuras.length >= 50 && <p className={styles.muted}>Mostrando os primeiros 50 agendamentos. Consulte a agenda completa para ver os demais.</p>}
  </Panel>;
}
