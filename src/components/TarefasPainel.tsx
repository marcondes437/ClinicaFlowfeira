"use client";

import { useActionState } from "react";
import { alterarStatusTarefa, criarTarefa, reenviarPendentes, sincronizarDoTrello } from "@/lib/tarefas";
import styles from "./FormCard.module.css";

type Estado = { ok?: string; erro?: string };
const inicial: Estado = {};

export type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: "administrativa" | "tecnica" | "manutencao";
  status: "aberta" | "em_andamento" | "concluida";
  responsavel: string | null;
  trello_url: string | null;
  erro_sincronizacao: string | null;
  created_at: string;
};

const CATEGORIA = { administrativa: "Administrativa", tecnica: "Problema técnico", manutencao: "Manutenção" } as const;
const STATUS = { aberta: "Aberta", em_andamento: "Em andamento", concluida: "Concluída" } as const;
const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** `responsaveis`: nomes configurados em TRELLO_MEMBROS (viram membros do cartão). */
export function NovaTarefaForm({ responsaveis = [] }: { responsaveis?: string[] }) {
  const [state, action, pending] = useActionState(criarTarefa, inicial);
  return (
    <form action={action} className={styles.form}>
      {state.erro && <div className={`cx-alert cx-alert-error ${styles.full}`} role="alert">{state.erro}</div>}
      {state.ok && <div className={`cx-alert cx-alert-ok ${styles.full}`} role="status">{state.ok}</div>}
      <div className="cx-field">
        <label htmlFor="t-cat">Categoria *</label>
        <select id="t-cat" name="categoria" required defaultValue="tecnica">
          <option value="tecnica">Problema técnico</option>
          <option value="manutencao">Manutenção</option>
          <option value="administrativa">Tarefa administrativa</option>
        </select>
      </div>
      <div className="cx-field">
        <label htmlFor="t-resp">Responsável (opcional)</label>
        <input id="t-resp" name="responsavel" maxLength={80} placeholder="Ex.: TI, Manutenção, Ana (recepção)" list={responsaveis.length ? "t-resp-lista" : undefined} />
        {responsaveis.length > 0 && (
          <datalist id="t-resp-lista">
            {responsaveis.map((r) => <option key={r} value={r} />)}
          </datalist>
        )}
      </div>
      <div className={`cx-field ${styles.full}`}>
        <label htmlFor="t-tit">Título *</label>
        <input id="t-tit" name="titulo" required minLength={3} maxLength={120} placeholder="Ex.: Impressora da recepção sem conexão" />
      </div>
      <div className={`cx-field ${styles.full}`}>
        <label htmlFor="t-desc">Descrição</label>
        <textarea id="t-desc" name="descricao" rows={3} maxLength={2000} />
      </div>
      <div className={styles.footer}>
        <button className="cx-btn cx-btn-primary" disabled={pending}>{pending ? "Registrando..." : "Registrar tarefa"}</button>
        <span style={{ color: "var(--cx-muted)", fontSize: "0.85rem" }}>
          Não escreva nome, CPF, telefone ou dados de saúde de pacientes — o texto pode ir para o Trello.
        </span>
      </div>
    </form>
  );
}

function StatusTarefaSelect({ tarefa }: { tarefa: Tarefa }) {
  const [state, action, pending] = useActionState(alterarStatusTarefa, inicial);
  return (
    <form action={action} style={{ display: "grid", gap: "0.25rem" }}>
      <input type="hidden" name="id" value={tarefa.id} />
      <select
        name="status"
        defaultValue={tarefa.status}
        disabled={pending}
        aria-label={`Status de ${tarefa.titulo}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        style={{ padding: "0.35rem 0.5rem", borderRadius: 8, border: "1px solid var(--cx-line)" }}
      >
        {Object.entries(STATUS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
      {state.erro && <small role="alert" style={{ color: "var(--cx-danger)" }}>{state.erro}</small>}
      {state.ok && state.ok !== "Status atualizado." && <small style={{ color: "var(--cx-warn)" }}>{state.ok}</small>}
    </form>
  );
}

export function ListaTarefas({ tarefas }: { tarefas: Tarefa[] }) {
  if (!tarefas.length) return <p style={{ color: "var(--cx-muted)", margin: 0 }}>Nenhuma tarefa registrada.</p>;
  return (
    <table className="cx-table cx-table-cards">
      <thead>
        <tr><th>Tarefa</th><th>Categoria</th><th>Responsável</th><th>Criada em</th><th>Trello</th><th>Status</th></tr>
      </thead>
      <tbody>
        {tarefas.map((t) => (
          <tr key={t.id}>
            <td data-label="Tarefa">
              <strong>{t.titulo}</strong>
              {t.descricao && <div style={{ color: "var(--cx-muted)", fontSize: "0.85rem" }}>{t.descricao}</div>}
            </td>
            <td data-label="Categoria">{CATEGORIA[t.categoria]}</td>
            <td data-label="Responsável">{t.responsavel ?? "—"}</td>
            <td data-label="Criada em">{fmt.format(new Date(t.created_at))}</td>
            <td data-label="Trello">
              {t.trello_url ? (
                <a href={t.trello_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--cx-teal-700)", fontWeight: 600 }}>Abrir cartão</a>
              ) : t.erro_sincronizacao ? (
                <span className="cx-badge cx-badge-danger" title={t.erro_sincronizacao}>Falhou</span>
              ) : (
                <span className="cx-badge">Só no ClinicaFlow</span>
              )}
            </td>
            <td data-label="Status"><StatusTarefaSelect tarefa={t} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AcoesTrello() {
  const [sync, acaoSync, sincronizando] = useActionState(sincronizarDoTrello, inicial);
  const [reenvio, acaoReenvio, reenviando] = useActionState(reenviarPendentes, inicial);
  const msg = sync.erro ?? reenvio.erro ?? sync.ok ?? reenvio.ok;
  const erro = Boolean(sync.erro ?? reenvio.erro);
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <form action={acaoSync}><button className="cx-btn cx-btn-ghost" disabled={sincronizando}>{sincronizando ? "Sincronizando..." : "Trazer status do Trello"}</button></form>
        <form action={acaoReenvio}><button className="cx-btn cx-btn-ghost" disabled={reenviando}>{reenviando ? "Enviando..." : "Reenviar pendentes"}</button></form>
      </div>
      {msg && <small role="status" style={{ color: erro ? "var(--cx-danger)" : "var(--cx-ok)" }}>{msg}</small>}
    </div>
  );
}
