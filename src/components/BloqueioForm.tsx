"use client";

import { useActionState, useState, useTransition } from "react";
import { criarBloqueio, type EstadoForm } from "@/lib/actions";
import styles from "./FormCard.module.css";

type Opcao = { id: string; nome: string };
const inicial: EstadoForm = {};

const TIPOS = [
  { valor: "ferias", rotulo: "Férias" },
  { valor: "afastamento", rotulo: "Afastamento" },
  { valor: "bloqueio", rotulo: "Bloqueio de data/horário" },
  { valor: "intervalo", rotulo: "Intervalo (todos os dias do período)" },
];

function isoLocal(data: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data);
}

/** Férias, afastamentos, bloqueios e intervalos. Os horários livres do período saem da agenda. */
export default function BloqueioForm({
  profissionais = [],
  profissionalFixo,
}: {
  profissionais?: Opcao[];
  profissionalFixo?: Opcao;
}) {
  const [state, action, pending] = useActionState(criarBloqueio, inicial);
  const [, iniciar] = useTransition();
  const hoje = isoLocal(new Date());
  const [form, setForm] = useState({
    profissional_id: "",
    tipo: "ferias",
    data_inicio: hoje,
    data_fim: hoje,
    dia_inteiro: true,
    hora_inicio: "12:00",
    hora_fim: "13:00",
    motivo: "",
  });
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(() => action(dados));
  };

  return (
    <form onSubmit={enviar} className={styles.form}>
      {state.erro && <div className={`cx-alert cx-alert-error ${styles.full}`} role="alert">{state.erro}</div>}
      {state.ok && <div className={`cx-alert cx-alert-ok ${styles.full}`} role="status">{state.ok}</div>}

      {profissionalFixo ? (
        <input type="hidden" name="profissional_id" value={profissionalFixo.id} />
      ) : (
        <div className="cx-field">
          <label htmlFor="bloq-prof">Profissional *</label>
          <select id="bloq-prof" name="profissional_id" required value={form.profissional_id} onChange={(e) => set("profissional_id", e.target.value)}>
            <option value="" disabled>Selecione</option>
            {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      )}

      <div className="cx-field">
        <label htmlFor="bloq-tipo">Tipo</label>
        <select
          id="bloq-tipo"
          name="tipo"
          value={form.tipo}
          onChange={(e) => {
            set("tipo", e.target.value);
            if (e.target.value === "intervalo") set("dia_inteiro", false);
          }}
        >
          {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
        </select>
      </div>
      <div className="cx-field">
        <label htmlFor="bloq-de">De *</label>
        <input id="bloq-de" name="data_inicio" type="date" required min={hoje} value={form.data_inicio}
          onChange={(e) => { set("data_inicio", e.target.value); if (form.data_fim < e.target.value) set("data_fim", e.target.value); }} />
      </div>
      <div className="cx-field">
        <label htmlFor="bloq-ate">Até *</label>
        <input id="bloq-ate" name="data_fim" type="date" required min={form.data_inicio} value={form.data_fim} onChange={(e) => set("data_fim", e.target.value)} />
      </div>

      <label className={styles.full} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.8rem", fontSize: "0.9rem" }}>
        <input type="checkbox" checked={form.dia_inteiro} onChange={(e) => set("dia_inteiro", e.target.checked)} />
        Dia inteiro
      </label>

      {!form.dia_inteiro && (
        <>
          <div className="cx-field">
            <label htmlFor="bloq-h1">Das</label>
            <input id="bloq-h1" name="hora_inicio" type="time" step={300} required value={form.hora_inicio} onChange={(e) => set("hora_inicio", e.target.value)} />
          </div>
          <div className="cx-field">
            <label htmlFor="bloq-h2">Às</label>
            <input id="bloq-h2" name="hora_fim" type="time" step={300} required value={form.hora_fim} onChange={(e) => set("hora_fim", e.target.value)} />
          </div>
        </>
      )}

      <div className={`cx-field ${styles.full}`}>
        <label htmlFor="bloq-motivo">Motivo (opcional, uso interno)</label>
        <input id="bloq-motivo" name="motivo" maxLength={200} value={form.motivo} onChange={(e) => set("motivo", e.target.value)} placeholder="Ex.: congresso, manutenção da sala" />
      </div>

      <div className={styles.footer}>
        <button className="cx-btn cx-btn-primary" disabled={pending || (!profissionalFixo && !form.profissional_id)}>
          {pending ? "Salvando..." : "Registrar bloqueio"}
        </button>
        <span style={{ color: "var(--cx-muted)", fontSize: "0.85rem" }}>
          Se houver consulta marcada no período, o sistema avisa: remarque-a antes.
        </span>
      </div>
    </form>
  );
}
