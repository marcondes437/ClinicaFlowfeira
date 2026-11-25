import Link from "next/link";
import ConsultaTicket from "@/components/paciente/ConsultaTicket";
import CancelarConsulta from "@/components/paciente/CancelarConsulta";
import HistoricoTimeline from "@/components/paciente/HistoricoTimeline";
import Panel from "@/components/Panel";
import { type ConsultaRow } from "@/components/ConsultasTable";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/local/server";
import { CONSULTA_SELECT, STATUS_ATIVOS } from "@/lib/queries";
import { cadastroCompleto, getPacienteDoUsuario, linkCompletarCadastro } from "@/lib/paciente";
import { dataHora } from "@/lib/format";
import styles from "./painel.module.css";

export const dynamic = "force-dynamic";

export default async function PainelPaciente() {
  const user = await requireRole(["paciente"]);
  const paciente = await getPacienteDoUsuario(user.id);
  const supabase = await createClient();

  const agora = new Date().toISOString();
  const [{ data: proximas }, { data: anteriores }] = paciente
    ? await Promise.all([
        supabase
          .from("consultas")
          .select(CONSULTA_SELECT)
          .eq("paciente_id", paciente.id)
          .gte("data_hora", agora)
          .in("status", [...STATUS_ATIVOS])
          .order("data_hora"),
        supabase
          .from("consultas")
          .select(CONSULTA_SELECT)
          .eq("paciente_id", paciente.id)
          .or(`data_hora.lt."${agora}",status.eq.cancelada`)
          .order("data_hora", { ascending: false })
          .limit(10),
      ])
    : [{ data: [] }, { data: [] }];

  const proximasLista = (proximas ?? []) as unknown as ConsultaRow[];
  const anterioresLista = (anteriores ?? []) as unknown as ConsultaRow[];
  const realizadas = anterioresLista.filter((c) => c.status === "concluida").length;
  const outras = proximasLista.slice(1);

  return (
    <>
      {!cadastroCompleto(paciente) && (
        <div className="cx-alert cx-alert-error" role="status">
          Falta pouco: complete seus dados (celular, nascimento e CPF) para poder agendar.{" "}
          <Link href={linkCompletarCadastro("/paciente/agendar")} style={{ fontWeight: 700, textDecoration: "underline" }}>
            Completar agora
          </Link>
        </div>
      )}

      <section className={styles.hero}>
        <span>Portal do paciente</span>
        <h2>O que você precisa hoje?</h2>
        <p>Escolha a especialidade e nós encontramos o primeiro horário livre com um médico disponível.</p>
        <div className={styles.quickActions}>
          <Link href="/paciente/agendar" className={styles.primaryAction}>Agendar consulta <b aria-hidden="true">→</b></Link>
          <Link href="/paciente/historico" className={styles.secondaryAction}>Ver meu histórico</Link>
        </div>
      </section>

      <div className={styles.sectionLabel}><span>Minha agenda</span><p>Próximo atendimento</p></div>
      <ConsultaTicket consulta={proximasLista[0] ?? null} />

      <div className={styles.resumo}>
        <span>{realizadas} atendimento{realizadas === 1 ? "" : "s"} realizado{realizadas === 1 ? "" : "s"}</span>
        <span className={styles.ponto} aria-hidden="true">·</span>
        <span>Cadastro: {paciente?.nome_completo ?? user.nome}</span>
      </div>

      {outras.length > 0 && (
        <Panel titulo="Outras consultas marcadas">
          <ul className={styles.lista}>
            {outras.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{dataHora(c.data_hora)}</strong>
                  <span>
                    {c.especialidades?.nome} · {c.profissionais?.nome ?? "Profissional a definir"} · {c.unidades?.nome}
                  </span>
                </div>
                {(c.status === "agendada" || c.status === "confirmada") && (
                  <div className={styles.listaAcoes}>
                    <Link href={`/paciente/agendar?remarcar=${c.id}`} className="cx-btn cx-btn-ghost">Remarcar</Link>
                    <CancelarConsulta id={c.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        titulo="Atendimentos anteriores"
        descricao="Suas consultas mais recentes aparecem aqui."
        acao={<Link href="/paciente/agendar" className="cx-btn cx-btn-ghost">Agendar outra</Link>}
      >
        <HistoricoTimeline consultas={anterioresLista} />
      </Panel>
    </>
  );
}
