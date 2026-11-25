"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { agendarConsulta, previsualizarVaga, type EstadoAgendamento, type PreviaVaga } from "@/lib/actions";
import styles from "./AgendamentoForm.module.css";

type Especialidade = { id: string; nome: string; descricao?: string | null };
type Unidade = { id: string; nome: string; endereco?: string | null; cidade?: string | null };
type Resumo = { especialidade_id: string; unidade_id: string; total: number; primeira: string };
type Opcao = { id: string; nome: string };
export type ConsultaParaRemarcar = {
  id: string;
  especialidade_id: string;
  especialidade_nome: string;
  data_hora: string;
  /** Preenchidos quando a equipe remarca em nome do paciente. */
  paciente_id?: string;
  paciente_nome?: string;
};

const TZ = "America/Sao_Paulo";
const PERIODOS = [
  { valor: "", rotulo: "Qualquer horário" },
  { valor: "manha", rotulo: "Manhã" },
  { valor: "tarde", rotulo: "Tarde" },
  { valor: "noite", rotulo: "Noite" },
] as const;

const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long" });
const fmtCurto = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtIso = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

type Props = {
  especialidades: Especialidade[];
  unidades: Unidade[];
  resumo: Resumo[];
  /** Equipe (recepção/admin) escolhe o paciente; o paciente logado não vê este campo. */
  pacientes?: Opcao[];
  remarcar?: ConsultaParaRemarcar | null;
  especialidadeInicial?: string;
  modo?: "paciente" | "equipe";
};

export default function AgendamentoForm(props: Props) {
  // Trocar a chave recria o formulário (limpa o resultado e permite marcar outra).
  const [chave, setChave] = useState(0);
  return <FormularioAgendamento key={chave} {...props} onNovo={() => setChave((c) => c + 1)} />;
}

function FormularioAgendamento({
  especialidades,
  unidades,
  resumo,
  pacientes,
  remarcar,
  especialidadeInicial,
  modo = "paciente",
  onNovo,
}: Props & { onNovo: () => void }) {
  const [state, action, pending] = useActionState<EstadoAgendamento, FormData>(agendarConsulta, {});
  const caminho = usePathname();
  const [, iniciar] = useTransition();
  // Envio manual: evita o reset automático do React 19, que dessincroniza os campos controlados.
  const enviar = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    iniciar(() => action(dados));
  };

  const especialidadeValida = (id?: string) => (id && especialidades.some((e) => e.id === id) ? id : "");
  const [paciente, setPaciente] = useState(remarcar?.paciente_id ?? "");
  const [especialidade, setEspecialidade] = useState(remarcar?.especialidade_id ?? especialidadeValida(especialidadeInicial));
  const [unidade, setUnidade] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [aPartirDe, setAPartirDe] = useState("");
  const [motivo, setMotivo] = useState("");
  const [previa, setPrevia] = useState<PreviaVaga>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);

  // Resumo por especialidade: total de vagas e a primeira data livre.
  const porEspecialidade = useMemo(() => {
    const mapa = new Map<string, { total: number; primeira: string }>();
    for (const r of resumo) {
      const atual = mapa.get(r.especialidade_id);
      if (!atual) mapa.set(r.especialidade_id, { total: r.total, primeira: r.primeira });
      else {
        atual.total += r.total;
        if (r.primeira < atual.primeira) atual.primeira = r.primeira;
      }
    }
    return mapa;
  }, [resumo]);

  const unidadesDaEspecialidade = useMemo(() => {
    const ids = new Set(resumo.filter((r) => r.especialidade_id === especialidade).map((r) => r.unidade_id));
    return unidades.filter((u) => ids.has(u.id));
  }, [especialidade, unidades, resumo]);

  const especialidadeNome =
    especialidades.find((e) => e.id === especialidade)?.nome ?? remarcar?.especialidade_nome ?? "";
  const ordenadas = useMemo(
    () =>
      [...especialidades].sort(
        (a, b) => Number(porEspecialidade.has(b.id)) - Number(porEspecialidade.has(a.id)) || a.nome.localeCompare(b.nome)
      ),
    [especialidades, porEspecialidade]
  );

  // Prévia calculada no banco com as MESMAS regras do agendamento (sem revelar o médico).
  useEffect(() => {
    if (!especialidade) {
      setPrevia(null);
      return;
    }
    let ativo = true;
    setCarregandoPrevia(true);
    const timer = setTimeout(async () => {
      try {
        const r = await previsualizarVaga({
          especialidadeId: especialidade,
          unidadeId: unidade || null,
          periodo: periodo || null,
          aPartirDe: aPartirDe || null,
          pacienteId: modo === "equipe" ? paciente || null : null,
          remarcarId: remarcar?.id ?? null,
        });
        if (!ativo) return;
        setPrevia(r.previa);
        setErroPrevia(r.erro ?? null);
      } catch {
        // Sem conexão / sessão expirada: não deixa a tela presa em "Consultando a agenda".
        if (!ativo) return;
        setPrevia(null);
        setErroPrevia("Não foi possível consultar a agenda agora. Verifique a conexão e tente de novo.");
      } finally {
        if (ativo) setCarregandoPrevia(false);
      }
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [especialidade, unidade, periodo, aPartirDe, paciente, modo, remarcar?.id, state.erro]);

  if (state.consulta) {
    const c = state.consulta;
    const data = new Date(c.data_hora);
    return (
      <div className={styles.confirmacao} role="status" aria-live="polite">
        <span className={styles.selo}>{state.remarcada ? "Consulta remarcada" : "Consulta marcada"}</span>
        <p className={styles.confData}>{capitalizar(fmtDia.format(data))}</p>
        <p className={styles.confHora}>às {fmtHora.format(data)}</p>

        <dl className={styles.confDetalhes}>
          <div>
            <dt>{modo === "equipe" ? "Profissional" : "Seu médico"}</dt>
            <dd className={styles.medico}>{c.profissional}</dd>
          </div>
          <div>
            <dt>Especialidade</dt>
            <dd>{c.especialidade}</dd>
          </div>
          <div>
            <dt>Unidade</dt>
            <dd>
              {c.unidade}
              {c.endereco && <small>{c.endereco}</small>}
            </dd>
          </div>
        </dl>

        <p className={styles.dica}>
          {modo === "equipe"
            ? "O profissional foi definido automaticamente pela agenda disponível."
            : "O médico foi definido pela agenda disponível da especialidade. Chegue com 15 minutos de antecedência."}
        </p>

        <div className={styles.acoes}>
          {modo === "paciente" ? (
            <Link href="/paciente" className="cx-btn cx-btn-primary">Ver no meu painel</Link>
          ) : remarcar ? (
            // A consulta antiga já foi cancelada: volta para a agenda sem o parâmetro ?remarcar.
            <Link href={caminho} className="cx-btn cx-btn-primary">Voltar para a agenda</Link>
          ) : (
            <button type="button" className="cx-btn cx-btn-primary" onClick={onNovo}>Novo agendamento</button>
          )}
          {modo === "paciente" && !state.remarcada && (
            <button type="button" className="cx-btn cx-btn-ghost" onClick={onNovo}>Marcar outra especialidade</button>
          )}
        </div>
      </div>
    );
  }

  const podeEnviar = Boolean(especialidade && previa && !carregandoPrevia && (modo === "paciente" || paciente));
  const limparFiltros = () => {
    setUnidade("");
    setPeriodo("");
    setAPartirDe("");
  };
  const temFiltro = Boolean(unidade || periodo || aPartirDe);

  return (
    <form onSubmit={enviar} className={styles.form} noValidate>
      {state.erro && (
        <div className="cx-alert cx-alert-error" role="alert">
          {state.erro}
          {state.dica === "cadastro_incompleto" && (
            <> <Link href="/paciente/meus-dados?next=/paciente/agendar" style={{ fontWeight: 700, textDecoration: "underline" }}>Completar meus dados</Link></>
          )}
          {state.dica === "ja_agendada" && modo === "paciente" && (
            <> <Link href="/paciente" style={{ fontWeight: 700, textDecoration: "underline" }}>Ver minhas consultas</Link></>
          )}
          {state.dica === "sem_vagas" && temFiltro && (
            <> <button type="button" className={styles.linkBotao} onClick={limparFiltros}>Limpar preferências</button></>
          )}
        </div>
      )}

      {remarcar && (
        <div className={styles.aviso}>
          Remarcando {modo === "equipe" ? <>a consulta de <strong>{remarcar.paciente_nome ?? "paciente"}</strong> em</> : "sua consulta de"}{" "}
          <strong>{remarcar.especialidade_nome}</strong> de{" "}
          {fmtCurto.format(new Date(remarcar.data_hora))} às {fmtHora.format(new Date(remarcar.data_hora))}.
          A consulta atual só é cancelada quando a nova for confirmada.
          <input type="hidden" name="remarcar_consulta_id" value={remarcar.id} />
          {modo === "equipe" && remarcar.paciente_id && <input type="hidden" name="paciente_id" value={remarcar.paciente_id} />}
        </div>
      )}

      {modo === "equipe" && !remarcar?.paciente_id && (
        <div className={`cx-field ${styles.paciente}`}>
          <label htmlFor="paciente_id">Paciente *</label>
          <select id="paciente_id" name="paciente_id" required value={paciente} onChange={(e) => setPaciente(e.target.value)}>
            <option value="" disabled>Selecione o paciente</option>
            {(pacientes ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      )}

      <section className={styles.etapa} aria-labelledby="etapa-especialidade">
        <h3 id="etapa-especialidade"><span>1</span> Qual especialidade?</h3>
        {remarcar ? (
          <>
            <input type="hidden" name="especialidade_id" value={especialidade} />
            <p className={styles.fixa}>{remarcar.especialidade_nome}</p>
          </>
        ) : (
          <div className={styles.especialidades} role="radiogroup" aria-label="Especialidade">
            {ordenadas.map((e) => {
              const info = porEspecialidade.get(e.id);
              const ativo = especialidade === e.id;
              return (
                <label key={e.id} className={`${styles.especialidade} ${ativo ? styles.ativo : ""} ${!info ? styles.semVaga : ""}`}>
                  <input
                    type="radio"
                    name="especialidade_id"
                    value={e.id}
                    checked={ativo}
                    disabled={!info}
                    onChange={() => {
                      setEspecialidade(e.id);
                      setUnidade("");
                    }}
                  />
                  <strong>{e.nome}</strong>
                  <span>
                    {info ? `Próxima vaga: ${fmtCurto.format(new Date(info.primeira))}` : "Sem horários no momento"}
                  </span>
                </label>
              );
            })}
            {!especialidades.length && <p className={styles.vazio}>Nenhuma especialidade cadastrada.</p>}
          </div>
        )}
      </section>

      {especialidade && (
        <section className={styles.etapa} aria-labelledby="etapa-preferencias">
          <h3 id="etapa-preferencias"><span>2</span> Preferências <em>(opcional)</em></h3>
          <div className={styles.preferencias}>
            <div className="cx-field">
              <label htmlFor="unidade_id">Unidade</label>
              <select id="unidade_id" name="unidade_id" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                <option value="">Qualquer unidade (mais rápido)</option>
                {unidadesDaEspecialidade.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div className="cx-field">
              <label htmlFor="a_partir_de">A partir de</label>
              <input
                id="a_partir_de"
                name="a_partir_de"
                type="date"
                value={aPartirDe}
                min={fmtIso.format(new Date())}
                onChange={(e) => setAPartirDe(e.target.value)}
              />
            </div>
            <fieldset className={styles.periodos}>
              <legend>Período</legend>
              {PERIODOS.map((p) => (
                <label key={p.valor || "qualquer"} className={periodo === p.valor ? styles.ativo : ""}>
                  <input type="radio" name="periodo" value={p.valor} checked={periodo === p.valor} onChange={() => setPeriodo(p.valor)} />
                  {p.rotulo}
                </label>
              ))}
            </fieldset>
          </div>
        </section>
      )}

      {especialidade && (
        <section className={styles.etapa} aria-labelledby="etapa-confirmar">
          <h3 id="etapa-confirmar"><span>3</span> Confirme</h3>
          <div className={`${styles.previa} ${previa || carregandoPrevia ? "" : styles.previaVazia}`} aria-live="polite" aria-busy={carregandoPrevia}>
            {carregandoPrevia ? (
              <>
                <span>Consultando a agenda de {especialidadeNome}…</span>
                <strong>Procurando o primeiro horário livre</strong>
              </>
            ) : previa ? (
              <>
                <span>Primeiro horário livre na agenda de {especialidadeNome}</span>
                <strong>
                  {capitalizar(fmtDia.format(new Date(previa.data_hora)))} às {fmtHora.format(new Date(previa.data_hora))}
                </strong>
                <small>{previa.unidade} · o médico é definido pela agenda e aparece após a confirmação</small>
              </>
            ) : (
              <>
                <strong>{erroPrevia ?? "Sem horários com essas preferências"}</strong>
                {!erroPrevia && (
                  <small>
                    Tente outra unidade, outro período ou uma data mais próxima.
                    {temFiltro && (
                      <> <button type="button" className={styles.linkBotao} onClick={limparFiltros}>Limpar preferências</button></>
                    )}
                  </small>
                )}
              </>
            )}
          </div>

          <div className="cx-field">
            <label htmlFor="motivo">Motivo da consulta (opcional)</label>
            <input id="motivo" name="motivo" maxLength={200} placeholder="Ex.: consulta de rotina" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>

          <button className={`cx-btn cx-btn-primary ${styles.enviar}`} disabled={pending || !podeEnviar}>
            {pending ? "Marcando..." : remarcar ? "Remarcar para o primeiro horário livre" : "Marcar consulta"}
          </button>
          <p className={styles.nota}>
            O horário exibido é uma prévia. Ao confirmar, o sistema reserva o primeiro horário que estiver livre nesse momento.
          </p>
        </section>
      )}
    </form>
  );
}
