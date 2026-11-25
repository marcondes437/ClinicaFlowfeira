"use client";

import { useActionState } from "react";
import { atualizarProfissional, vincularAcessoProfissional, type EstadoForm } from "@/lib/actions";
import styles from "./FormCard.module.css";

type Opcao = { id: string; nome: string };
export type ProfissionalEditavel = {
  id: string;
  nome: string;
  registro_profissional: string | null;
  especialidade_id: string | null;
  unidade_id: string | null;
  telefone: string | null;
  email: string | null;
  descricao: string | null;
  status: string;
  temAcesso: boolean;
};

const inicial: EstadoForm = {};

/** Edição do profissional + vínculo do login (aparece dentro de um <details>). */
export default function ProfissionalEditar({
  profissional: p,
  especialidades,
  unidades,
}: {
  profissional: ProfissionalEditavel;
  especialidades: Opcao[];
  unidades: Opcao[];
}) {
  const [state, action, pending] = useActionState(atualizarProfissional, inicial);
  const [vinculo, acaoVinculo, vinculando] = useActionState(vincularAcessoProfissional, inicial);

  return (
    <div style={{ display: "grid", gap: "1rem", paddingTop: "0.8rem" }}>
      <form action={action} className={styles.form}>
        {state.erro && <div className={`cx-alert cx-alert-error ${styles.full}`} role="alert">{state.erro}</div>}
        {state.ok && <div className={`cx-alert cx-alert-ok ${styles.full}`} role="status">{state.ok}</div>}
        <input type="hidden" name="id" value={p.id} />
        <div className="cx-field"><label htmlFor={`n-${p.id}`}>Nome *</label><input id={`n-${p.id}`} name="nome" required defaultValue={p.nome} /></div>
        <div className="cx-field"><label htmlFor={`r-${p.id}`}>Registro</label><input id={`r-${p.id}`} name="registro_profissional" defaultValue={p.registro_profissional ?? ""} /></div>
        <div className="cx-field">
          <label htmlFor={`e-${p.id}`}>Especialidade</label>
          <select id={`e-${p.id}`} name="especialidade_id" defaultValue={p.especialidade_id ?? ""}>
            <option value="">—</option>
            {especialidades.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
        <div className="cx-field">
          <label htmlFor={`u-${p.id}`}>Unidade</label>
          <select id={`u-${p.id}`} name="unidade_id" defaultValue={p.unidade_id ?? ""}>
            <option value="">—</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="cx-field"><label htmlFor={`t-${p.id}`}>Telefone</label><input id={`t-${p.id}`} name="telefone" inputMode="tel" defaultValue={p.telefone ?? ""} /></div>
        <div className="cx-field"><label htmlFor={`m-${p.id}`}>E-mail</label><input id={`m-${p.id}`} name="email" type="email" defaultValue={p.email ?? ""} /></div>
        <div className="cx-field">
          <label htmlFor={`s-${p.id}`}>Situação</label>
          <select id={`s-${p.id}`} name="status" defaultValue={p.status}>
            <option value="ativo">Ativo (recebe consultas)</option>
            <option value="inativo">Inativo / afastado (não recebe)</option>
          </select>
        </div>
        <div className={`cx-field ${styles.full}`}><label htmlFor={`d-${p.id}`}>Descrição</label><textarea id={`d-${p.id}`} name="descricao" rows={2} defaultValue={p.descricao ?? ""} /></div>
        <div className={styles.footer}>
          <button className="cx-btn cx-btn-primary" disabled={pending}>{pending ? "Salvando..." : "Salvar alterações"}</button>
          <span style={{ color: "var(--cx-muted)", fontSize: "0.85rem" }}>Mudar especialidade/unidade vale para os próximos horários liberados.</span>
        </div>
      </form>

      <form action={acaoVinculo} className={styles.form}>
        {vinculo.erro && <div className={`cx-alert cx-alert-error ${styles.full}`} role="alert">{vinculo.erro}</div>}
        {vinculo.ok && <div className={`cx-alert cx-alert-ok ${styles.full}`} role="status">{vinculo.ok}</div>}
        <input type="hidden" name="id" value={p.id} />
        <div className={`cx-field ${styles.full}`}>
          <label htmlFor={`a-${p.id}`}>{p.temAcesso ? "Trocar a conta de acesso (e-mail)" : "Vincular acesso ao Portal do Médico (e-mail da conta)"}</label>
          <input id={`a-${p.id}`} name="email" type="email" required placeholder="medico@email.com" />
        </div>
        <div className={styles.footer}>
          <button className="cx-btn cx-btn-ghost" disabled={vinculando}>{vinculando ? "Vinculando..." : "Vincular acesso"}</button>
          <span style={{ color: "var(--cx-muted)", fontSize: "0.85rem" }}>O profissional cria a conta em /cadastro; depois vincule aqui.</span>
        </div>
      </form>
    </div>
  );
}
