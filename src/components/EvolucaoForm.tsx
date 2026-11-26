"use client";

import { useActionState, useEffect, useId, useRef, useTransition } from "react";
import { registrarEvolucao } from "@/lib/actions";

const estado0 = {} as { ok?: string; erro?: string };

export default function EvolucaoForm({ pacienteId, consultaId, consultas }: { pacienteId: string; consultaId?: string; consultas?: Array<{id:string;rotulo:string}> }) {
  const [state, action, pending] = useActionState(registrarEvolucao, estado0);
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  useEffect(() => { if (state.ok) formRef.current?.reset(); }, [state]);

  return (
    <form ref={formRef} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(() => action(data));
    }} style={{ marginTop: "1rem" }}>
      {state?.erro && <div className="cx-alert cx-alert-error" role="alert">{state.erro}</div>}
      {state?.ok && <div className="cx-alert cx-alert-ok" role="status">{state.ok}</div>}
      <input type="hidden" name="paciente_id" value={pacienteId} />
      {consultaId && <input type="hidden" name="consulta_id" value={consultaId} />}
      {!consultaId && consultas && <div className="cx-field"><label htmlFor={`${fieldId}-consulta`}>Atendimento (opcional)</label><select id={`${fieldId}-consulta`} name="consulta_id" defaultValue=""><option value="">Registro geral do paciente</option>{consultas.map(c=><option value={c.id} key={c.id}>{c.rotulo}</option>)}</select></div>}
      <div className="cx-field">
        <label htmlFor={fieldId}>Nova evolução</label>
        <textarea id={fieldId} name="descricao" rows={7} minLength={3} maxLength={5000} required placeholder="Descreva o atendimento, conduta e orientações." />
      </div>
      <button className="cx-btn cx-btn-primary" disabled={pending}>
        {pending ? "Registrando..." : "Registrar evolução"}
      </button>
    </form>
  );
}
