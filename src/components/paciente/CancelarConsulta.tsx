"use client";

import { useActionState, useState } from "react";
import { cancelarConsulta } from "@/lib/actions";

const inicial = {} as { ok?: string; erro?: string };

/** Cancelamento em dois passos (sem janela de confirmação do navegador). */
export default function CancelarConsulta({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelarConsulta, inicial);
  const [confirmando, setConfirmando] = useState(false);

  if (state.ok) return <p className="cx-alert cx-alert-ok" style={{ margin: 0 }}>{state.ok}</p>;

  if (!confirmando) {
    return (
      <button type="button" className="cx-btn cx-btn-ghost" onClick={() => setConfirmando(true)}>
        Cancelar
      </button>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: "0.5rem" }}>
      <input type="hidden" name="id" value={id} />
      {state.erro && <p className="cx-alert cx-alert-error" style={{ margin: 0 }}>{state.erro}</p>}
      <span style={{ fontSize: "0.85rem", color: "var(--cx-muted)" }}>Cancelar esta consulta?</span>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <button className="cx-btn cx-btn-accent" disabled={pending}>{pending ? "Cancelando..." : "Sim, cancelar"}</button>
        <button type="button" className="cx-btn cx-btn-ghost" onClick={() => setConfirmando(false)} disabled={pending}>
          Voltar
        </button>
      </div>
    </form>
  );
}
