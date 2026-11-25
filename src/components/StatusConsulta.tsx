"use client";

import { useActionState, useRef, useState } from "react";
import { alterarStatusConsulta, type EstadoForm } from "@/lib/actions";
import { STATUS_CONSULTA_LABEL } from "@/lib/roles";

/** Próximas situações permitidas (o banco aplica a mesma regra). */
const TRANSICOES: Record<string, string[]> = {
  agendada: ["confirmada", "em_atendimento", "concluida", "faltou", "cancelada"],
  confirmada: ["agendada", "em_atendimento", "concluida", "faltou", "cancelada"],
  em_atendimento: ["concluida", "faltou"],
  faltou: ["em_atendimento", "concluida"],
  concluida: [],
  cancelada: [],
};

const inicial: EstadoForm = {};

export default function StatusConsulta({
  id,
  status,
  disabled,
}: {
  id: string;
  status: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(alterarStatusConsulta, inicial);
  // Cancelar devolve a vaga e não tem volta: pede confirmação antes de enviar.
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const opcoes = TRANSICOES[status] ?? [];

  if (disabled || opcoes.length === 0) {
    const classe = status === "cancelada" || status === "faltou" ? "cx-badge-danger" : status === "concluida" ? "cx-badge-ok" : "";
    return <span className={`cx-badge ${classe}`}>{STATUS_CONSULTA_LABEL[status] ?? status}</span>;
  }

  const voltar = () => {
    setConfirmarCancelamento(false);
    if (selectRef.current) selectRef.current.value = status;
  };

  return (
    <form action={action} style={{ display: "grid", gap: "0.3rem" }}>
      <input type="hidden" name="id" value={id} />
      <select
        ref={selectRef}
        name="status"
        defaultValue={status}
        disabled={pending}
        aria-label="Situação da consulta"
        onChange={(e) => {
          if (e.currentTarget.value === "cancelada") {
            setConfirmarCancelamento(true);
            return;
          }
          setConfirmarCancelamento(false);
          e.currentTarget.form?.requestSubmit();
        }}
        style={{ padding: "0.35rem 0.5rem", borderRadius: 8, border: "1px solid var(--cx-line)", maxWidth: 170 }}
      >
        <option value={status}>{STATUS_CONSULTA_LABEL[status] ?? status}</option>
        {opcoes.map((s) => (
          <option key={s} value={s}>{STATUS_CONSULTA_LABEL[s]}</option>
        ))}
      </select>
      {confirmarCancelamento && (
        <div role="group" aria-label="Confirmar cancelamento" style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
          <button className="cx-btn cx-btn-accent" style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }} disabled={pending}>
            {pending ? "Cancelando..." : "Confirmar cancelamento"}
          </button>
          <button type="button" className="cx-btn cx-btn-ghost" style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }} onClick={voltar} disabled={pending}>
            Voltar
          </button>
        </div>
      )}
      {state.erro && <small role="alert" style={{ color: "var(--cx-danger)", maxWidth: 220 }}>{state.erro}</small>}
    </form>
  );
}
