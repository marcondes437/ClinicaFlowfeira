"use client";

import { useActionState } from "react";
import { salvarEspecialidade } from "@/lib/actions";
import styles from "./FormCard.module.css";

const estado0 = {} as { ok?: string; erro?: string };

export type EspecialidadeEditavel = { id: string; nome: string; descricao: string | null };

/** Sem `especialidade`: cadastra uma nova. Com `especialidade`: edita a existente. */
export default function EspecialidadeForm({ especialidade }: { especialidade?: EspecialidadeEditavel }) {
  const [state, action, pending] = useActionState(salvarEspecialidade, estado0);
  const p = especialidade?.id ?? "nova";
  return (
    <form action={action} className={styles.form}>
      {state?.erro && <div className={`cx-alert cx-alert-error ${styles.full}`} role="alert">{state.erro}</div>}
      {state?.ok && <div className={`cx-alert cx-alert-ok ${styles.full}`} role="status">{state.ok}</div>}
      {especialidade && <input type="hidden" name="id" value={especialidade.id} />}
      <div className="cx-field">
        <label htmlFor={`esp-nome-${p}`}>Nome *</label>
        <input id={`esp-nome-${p}`} name="nome" required minLength={3} maxLength={80} defaultValue={especialidade?.nome} />
      </div>
      <div className="cx-field">
        <label htmlFor={`esp-desc-${p}`}>Descrição</label>
        <input id={`esp-desc-${p}`} name="descricao" maxLength={500} defaultValue={especialidade?.descricao ?? ""} />
      </div>
      <div className={styles.footer}>
        <button className="cx-btn cx-btn-primary" disabled={pending}>
          {pending ? "Salvando..." : especialidade ? "Salvar alterações" : "Adicionar especialidade"}
        </button>
      </div>
    </form>
  );
}
