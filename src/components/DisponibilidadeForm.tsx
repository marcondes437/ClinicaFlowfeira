"use client";

import { useActionState, useState, useTransition } from "react";
import { liberarAgenda } from "@/lib/actions";
import styles from "./FormCard.module.css";

type Opcao = { id: string; nome: string };
const estadoInicial = {} as { ok?: string; erro?: string };
const DIAS = [
  { valor: 1, rotulo: "Seg" },
  { valor: 2, rotulo: "Ter" },
  { valor: 3, rotulo: "Qua" },
  { valor: 4, rotulo: "Qui" },
  { valor: 5, rotulo: "Sex" },
  { valor: 6, rotulo: "Sáb" },
  { valor: 0, rotulo: "Dom" },
];

function isoLocal(data: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data);
}

/**
 * Libera vários horários de uma vez na agenda do médico.
 * Com `profissionalFixo`, o próprio médico gerencia a agenda dele.
 */
export default function DisponibilidadeForm({
  profissionais = [],
  profissionalFixo,
}: {
  profissionais?: Opcao[];
  profissionalFixo?: Opcao;
}) {
  const [state, action, pending] = useActionState(liberarAgenda, estadoInicial);
  const [, iniciar] = useTransition();
  // Envio manual: evita o reset automático do React 19, que dessincroniza os campos controlados.
  const enviar = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    iniciar(() => action(dados));
  };
  const hoje = isoLocal(new Date());
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(isoLocal(new Date(Date.now() + 13 * 864e5)));
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFim, setHoraFim] = useState("12:00");
  const [duracao, setDuracao] = useState("30");
  const [pausaInicio, setPausaInicio] = useState("");
  const [pausaFim, setPausaFim] = useState("");
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [profissional, setProfissional] = useState("");

  const alternarDia = (d: number) => setDias((atual) => (atual.includes(d) ? atual.filter((x) => x !== d) : [...atual, d]));

  // Estimativa para o usuário entender o que será criado (descontando o intervalo).
  const porDia = (() => {
    const min = (h: string) => {
      const [a, b] = h.split(":").map(Number);
      return a * 60 + b;
    };
    if (!horaInicio || !horaFim) return 0;
    const d = Number(duracao);
    let total = 0;
    for (let t = min(horaInicio); t + d <= min(horaFim); t += d) {
      if (pausaInicio && pausaFim && t < min(pausaFim) && t + d > min(pausaInicio)) continue;
      total += 1;
    }
    return total;
  })();

  return (
    <form onSubmit={enviar} className={styles.form}>
      {state.erro && <div className={`cx-alert cx-alert-error ${styles.full}`}>{state.erro}</div>}
      {state.ok && <div className={`cx-alert cx-alert-ok ${styles.full}`}>{state.ok}</div>}

      {profissionalFixo ? (
        <input type="hidden" name="profissional_id" value={profissionalFixo.id} />
      ) : (
        <div className="cx-field">
          <label htmlFor="disp-prof">Profissional *</label>
          <select id="disp-prof" name="profissional_id" required value={profissional} onChange={(e) => setProfissional(e.target.value)}>
            <option value="" disabled>Selecione</option>
            {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      )}

      <div className="cx-field">
        <label htmlFor="disp-inicio">De *</label>
        <input id="disp-inicio" name="data_inicio" type="date" required min={hoje} value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </div>
      <div className="cx-field">
        <label htmlFor="disp-fim">Até *</label>
        <input id="disp-fim" name="data_fim" type="date" required min={inicio} value={fim} onChange={(e) => setFim(e.target.value)} />
      </div>
      <div className="cx-field">
        <label htmlFor="disp-h1">Das *</label>
        <input id="disp-h1" name="hora_inicio" type="time" required step={300} value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
      </div>
      <div className="cx-field">
        <label htmlFor="disp-h2">Às *</label>
        <input id="disp-h2" name="hora_fim" type="time" required step={300} value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
      </div>
      <div className="cx-field">
        <label htmlFor="disp-dur">Duração de cada consulta</label>
        <select id="disp-dur" name="duracao" value={duracao} onChange={(e) => setDuracao(e.target.value)}>
          {["15", "20", "30", "40", "45", "60"].map((m) => <option key={m} value={m}>{m} minutos</option>)}
        </select>
      </div>

      <div className="cx-field">
        <label htmlFor="disp-p1">Intervalo das (opcional)</label>
        <input id="disp-p1" name="pausa_inicio" type="time" step={300} value={pausaInicio} onChange={(e) => setPausaInicio(e.target.value)} />
      </div>
      <div className="cx-field">
        <label htmlFor="disp-p2">Intervalo até</label>
        <input id="disp-p2" name="pausa_fim" type="time" step={300} value={pausaFim} onChange={(e) => setPausaFim(e.target.value)} />
      </div>

      <fieldset className={`cx-field ${styles.full}`} style={{ border: 0, padding: 0, margin: "0 0 0.9rem" }}>
        <legend style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--cx-muted)", marginBottom: "0.4rem" }}>Dias da semana *</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {DIAS.map((d) => {
            const ativo = dias.includes(d.valor);
            return (
              <label
                key={d.valor}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: 999,
                  border: `1px solid ${ativo ? "var(--cx-teal-700)" : "var(--cx-line)"}`,
                  background: ativo ? "var(--cx-teal-700)" : "#fff",
                  color: ativo ? "#fff" : "var(--cx-ink)",
                  cursor: "pointer",
                  fontSize: "0.88rem",
                }}
              >
                <input type="checkbox" name="dias" value={d.valor} checked={ativo} onChange={() => alternarDia(d.valor)} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} />
                {d.rotulo}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.footer}>
        <button className="cx-btn cx-btn-primary" disabled={pending || (!profissionalFixo && profissionais.length === 0)}>
          {pending ? "Liberando..." : "Liberar horários"}
        </button>
        <span style={{ color: "var(--cx-muted)", fontSize: "0.85rem" }}>
          {porDia > 0 ? `${porDia} vaga${porDia === 1 ? "" : "s"} por dia selecionado. Horários repetidos, sobrepostos ou em bloqueio são ignorados.` : "Confira o horário inicial e final."}
        </span>
      </div>
    </form>
  );
}
