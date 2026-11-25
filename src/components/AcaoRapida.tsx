"use client";

import { useActionState } from "react";
import type { EstadoForm } from "@/lib/actions";

const inicial: EstadoForm = {};

/** Botão de ação única (remover horário, remover bloqueio...) com retorno de erro. */
export default function AcaoRapida({
  acao,
  id,
  rotulo,
  rotuloAria,
  confirmar,
}: {
  acao: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  id: string;
  rotulo: string;
  rotuloAria?: string;
  confirmar?: string;
}) {
  const [state, action, pending] = useActionState(acao, inicial);
  if (state.ok) return <small style={{ color: "var(--cx-ok)" }}>{state.ok}</small>;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
      style={{ display: "grid", gap: "0.25rem", justifyItems: "start" }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="cx-btn cx-btn-ghost" style={{ padding: "0.3rem 0.8rem", fontSize: "0.82rem" }} aria-label={rotuloAria ?? rotulo} disabled={pending}>
        {pending ? "Aguarde..." : rotulo}
      </button>
      {state.erro && <small role="alert" style={{ color: "var(--cx-danger)" }}>{state.erro}</small>}
    </form>
  );
}
