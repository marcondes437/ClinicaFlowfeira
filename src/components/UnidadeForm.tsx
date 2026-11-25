"use client";

import { useActionState } from "react";
import { salvarUnidade } from "@/lib/actions";
import { UFS } from "@/lib/validacao";
import styles from "./FormCard.module.css";

const estado0 = {} as { ok?: string; erro?: string };

export type UnidadeEditavel = {
  id: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  email: string | null;
  horario_funcionamento: string | null;
};

/** Sem `unidade`: cadastra uma nova. Com `unidade`: edita a existente. */
export default function UnidadeForm({ unidade }: { unidade?: UnidadeEditavel }) {
  const [state, action, pending] = useActionState(salvarUnidade, estado0);
  const p = unidade?.id ?? "nova";
  const campo = (nome: keyof Omit<UnidadeEditavel, "id">, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="cx-field">
      <label htmlFor={`uni-${nome}-${p}`}>{rotulo}</label>
      <input id={`uni-${nome}-${p}`} name={nome} defaultValue={unidade?.[nome] ?? ""} {...extra} />
    </div>
  );
  return (
    <form action={action} className={styles.form}>
      {state?.erro && <div className={`cx-alert cx-alert-error ${styles.full}`} role="alert">{state.erro}</div>}
      {state?.ok && <div className={`cx-alert cx-alert-ok ${styles.full}`} role="status">{state.ok}</div>}
      {unidade && <input type="hidden" name="id" value={unidade.id} />}
      {campo("nome", "Nome *", { required: true, minLength: 3, maxLength: 120 })}
      {campo("endereco", "Endereço")}
      {campo("cidade", "Cidade")}
      <div className="cx-field">
        <label htmlFor={`uni-estado-${p}`}>Estado</label>
        <select id={`uni-estado-${p}`} name="estado" defaultValue={unidade?.estado ?? ""}>
          <option value="">—</option>
          {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
      </div>
      {campo("telefone", "Telefone", { inputMode: "tel" })}
      {campo("email", "E-mail", { type: "email" })}
      {campo("horario_funcionamento", "Horário de funcionamento", { placeholder: "Seg a Sex, 7h às 19h" })}
      <div className={styles.footer}>
        <button className="cx-btn cx-btn-primary" disabled={pending}>
          {pending ? "Salvando..." : unidade ? "Salvar alterações" : "Cadastrar unidade"}
        </button>
      </div>
    </form>
  );
}
