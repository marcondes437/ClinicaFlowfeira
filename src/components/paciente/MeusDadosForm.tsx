"use client";

import { useActionState, useState, useTransition } from "react";
import { salvarMeusDados } from "@/lib/actions";
import styles from "./MeusDadosForm.module.css";
import { celularValido, cpfValido, nascimentoValido, UFS } from "@/lib/validacao";

type Valores = {
  celular: string;
  data_nascimento: string;
  cpf: string;
  cep: string;
  cidade: string;
  estado: string;
  contato_emergencia: string;
};

const ESTADOS = UFS;
const inicial = {} as { erro?: string; ok?: string };

function soDigitos(valor: string, limite: number) {
  return valor.replace(/\D/g, "").slice(0, limite);
}

function mascaraCpf(valor: string) {
  const d = soDigitos(valor, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

function mascaraCelular(valor: string) {
  const d = soDigitos(valor, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function mascaraCep(valor: string) {
  const d = soDigitos(valor, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export default function MeusDadosForm({
  valores,
  next,
  primeiroAcesso,
}: {
  valores: Valores;
  next: string;
  primeiroAcesso: boolean;
}) {
  const [state, action, pending] = useActionState(salvarMeusDados, inicial);
  const [, iniciar] = useTransition();
  // Envio manual: evita o reset automático do React 19, que dessincroniza os campos controlados.
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const enviar = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    // Retorno imediato; o servidor e o banco validam de novo.
    if (!celularValido(form.celular)) return setErroLocal("Informe o celular com DDD (ex.: (11) 98888-7777).");
    if (!nascimentoValido(form.data_nascimento)) return setErroLocal("Informe uma data de nascimento válida.");
    if (!cpfValido(form.cpf)) return setErroLocal("CPF inválido. Confira os números.");
    setErroLocal(null);
    const dados = new FormData(evento.currentTarget);
    iniciar(() => action(dados));
  };
  const [form, setForm] = useState(valores);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  const set = (campo: keyof Valores, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  return (
    <form onSubmit={enviar} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      {(erroLocal || state.erro) && <div className={`cx-alert cx-alert-error ${styles.full}`} role="alert">{erroLocal ?? state.erro}</div>}
      {state.ok && <div className={`cx-alert cx-alert-ok ${styles.full}`} role="status">{state.ok}</div>}

      <fieldset className={styles.grupo}>
        <legend>Obrigatórios para agendar</legend>
        <div className="cx-field">
          <label htmlFor="celular">Celular com DDD *</label>
          <input
            id="celular" name="celular" inputMode="tel" autoComplete="tel" required
            placeholder="(11) 98888-7777"
            value={form.celular}
            onChange={(e) => set("celular", mascaraCelular(e.target.value))}
          />
        </div>
        <div className="cx-field">
          <label htmlFor="data_nascimento">Data de nascimento *</label>
          <input
            id="data_nascimento" name="data_nascimento" type="date" required
            min="1900-01-01" max={hoje} autoComplete="bday"
            value={form.data_nascimento}
            onChange={(e) => set("data_nascimento", e.target.value)}
          />
        </div>
        <div className="cx-field">
          <label htmlFor="cpf">CPF *</label>
          <input
            id="cpf" name="cpf" inputMode="numeric" required placeholder="000.000.000-00"
            value={form.cpf}
            onChange={(e) => set("cpf", mascaraCpf(e.target.value))}
          />
        </div>
      </fieldset>

      <fieldset className={styles.grupo}>
        <legend>Opcionais</legend>
        <div className="cx-field">
          <label htmlFor="cep">CEP</label>
          <input
            id="cep" name="cep" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000"
            value={form.cep}
            onChange={(e) => set("cep", mascaraCep(e.target.value))}
          />
        </div>
        <div className="cx-field">
          <label htmlFor="cidade">Cidade</label>
          <input id="cidade" name="cidade" autoComplete="address-level2" value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
        </div>
        <div className="cx-field">
          <label htmlFor="estado">UF</label>
          <select id="estado" name="estado" value={form.estado} onChange={(e) => set("estado", e.target.value)}>
            <option value="">—</option>
            {ESTADOS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
        <div className={`cx-field ${styles.full}`}>
          <label htmlFor="contato_emergencia">Contato de emergência</label>
          <input
            id="contato_emergencia" name="contato_emergencia" placeholder="Nome e telefone"
            value={form.contato_emergencia}
            onChange={(e) => set("contato_emergencia", e.target.value)}
          />
        </div>
      </fieldset>

      <p className={styles.privacidade}>
        CPF e endereço ficam protegidos (LGPD): só você, a recepção, a enfermagem e o médico que atende você têm acesso.
        Para corrigir ou excluir seus dados, fale com a recepção.
      </p>

      <div className={styles.footer}>
        <button className="cx-btn cx-btn-primary" disabled={pending}>
          {pending ? "Salvando..." : primeiroAcesso ? "Salvar e continuar" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
