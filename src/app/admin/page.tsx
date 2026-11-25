import Link from "next/link";
import Panel from "@/components/Panel";
import styles from "./dashboard.module.css";
import type { ConsultaRow } from "@/components/ConsultasTable";
import { getIndicadores, getIndicadoresAgenda, CONSULTA_SELECT } from "@/lib/queries";
import { createClient } from "@/lib/local/server";
import { moeda, inicioDoDia, fimDoDia, instanteSaoPaulo, hojeIso, somarDias } from "@/lib/format";
import GraficoConsultas from "@/components/GraficoConsultas";
import AdminDashboardTools from "@/components/AdminDashboardTools";
import AdminDashboardAgenda from "@/components/AdminDashboardAgenda";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const params = await searchParams;
  const dias = ["7", "14", "30"].includes(params.dias ?? "") ? Number(params.dias) : 30;
  const supabase = await createClient();
  const [indicadores, agenda, { data: hoje }, { data: futuras }, tarefas, incompletos, semAcesso] = await Promise.all([
    getIndicadores(),
    getIndicadoresAgenda(dias),
    supabase.from("consultas").select(CONSULTA_SELECT).gte("data_hora", inicioDoDia()).lte("data_hora", fimDoDia()).order("data_hora"),
    supabase
      .from("consultas")
      .select(CONSULTA_SELECT)
      .gt("data_hora", fimDoDia())
      .lt("data_hora", instanteSaoPaulo(somarDias(hojeIso(), dias + 1)))
      .in("status", ["agendada", "confirmada"])
      .order("data_hora")
      .limit(50),
    supabase.from("tarefas_internas").select("id", { count: "exact", head: true }).in("status", ["aberta", "em_andamento"]),
    supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("status", "ativo").is("cadastro_completo_em", null),
    supabase.from("profissionais").select("id", { count: "exact", head: true }).eq("status", "ativo").is("user_id", null),
  ]);

  const dadosGrafico = agenda.linhas
    .filter((l) => l.consultas > 0)
    .map((l) => ({ nome: l.especialidade_nome, total: l.consultas }));


  const dataAtual = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  const consultasHoje = (hoje ?? []) as unknown as ConsultaRow[];
  const atualizadoEm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
  const pendencias = [
    { titulo: "Tarefas pendentes", valor: tarefas.count, erro: tarefas.error, texto: "Demandas abertas ou em andamento", href: "/admin/tarefas", icone: "tasks" },
    { titulo: "Cadastros incompletos", valor: incompletos.count, erro: incompletos.error, texto: "Pacientes ativos sem cadastro completo", href: "/admin/pacientes?incompletos=1", icone: "users" },
    { titulo: "Profissionais sem acesso", valor: semAcesso.count, erro: semAcesso.error, texto: "Vincule o login da equipe ativa", href: "/admin/profissionais?sem_acesso=1", icone: "care" },
  ];
  const cards = [
    { label: "Consultas hoje", value: indicadores.consultasHoje, hint: "Atendimentos previstos para o dia", icon: "calendar", href: "/admin/agenda" },
    { label: "Pacientes ativos", value: indicadores.pacientes, hint: "Pessoas sob os cuidados da clínica", icon: "users", href: "/admin/pacientes" },
    { label: "Ocupação da agenda", value: agenda.totais.ocupacao + "%", hint: `Das vagas ofertadas nos próximos ${dias} dias`, icon: "chart", href: "/admin/agenda" },
    { label: "Faturamento acumulado", value: moeda(indicadores.faturamento), hint: "Valor das consultas concluídas", icon: "wallet", href: "#operacao" },
  ];
  const atalhos = [
    { href: "/admin/agenda#agendamento", title: "Agendar consulta", description: "Encontre a próxima vaga disponível", icon: "calendar" },
    { href: "/admin/pacientes", title: "Gerenciar pacientes", description: "Cadastros e fichas em um só lugar", icon: "users" },
    { href: "/admin/profissionais", title: "Equipe clínica", description: "Profissionais e vínculos de acesso", icon: "care" },
    { href: "/admin/tarefas", title: "Tarefas internas", description: "Organize as demandas da operação", icon: "tasks" },
  ];
  return <div className={styles.dashboard}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>PAINEL DE GESTÃO</span><h2>Visão geral da clínica</h2><p>Acompanhe os resultados e organize o cuidado, todos os dias.</p></div>
      <div className={styles.headingActions}><span className={styles.date}><DashboardIcon kind="calendar" />{dataAtual}</span><Link href="/admin/agenda#agendamento" className={styles.primary}><span aria-hidden="true">→</span> Novo agendamento</Link></div>
    </header>

    <AdminDashboardTools dias={dias} linhas={agenda.linhas} atualizadoEm={atualizadoEm} />

    <section aria-labelledby="dashboard-pendencias"><div className={styles.blockHeading}><h2 id="dashboard-pendencias">O que precisa da sua atenção</h2><span>Pendências da operação</span></div><div className={styles.pendingGrid}>{pendencias.map(p => <Link href={p.href} key={p.titulo} className={styles.pendingCard}><span className={styles.shortcutIcon}><DashboardIcon kind={p.icone} /></span><div><strong>{p.titulo}</strong><span>{p.erro ? "Não foi possível carregar este indicador." : p.texto}</span></div><b>{p.erro ? "—" : p.valor ?? 0}</b></Link>)}</div></section>

    <section className={styles.metrics} aria-label="Indicadores principais">
      {cards.map(card => <Link href={card.href} key={card.label} className={styles.metric}>
        <div className={styles.metricTop}><span>{card.label}</span><span className={styles.metricIcon}><DashboardIcon kind={card.icon} /></span></div>
        <strong className={styles.metricValue}>{card.value}</strong><span className={styles.metricHint}>{card.hint}</span>
      </Link>)}
    </section>

    <div className={styles.overview} id="operacao">
      <section className={styles.chartCard} aria-labelledby="consultas-especialidade">
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>DISTRIBUIÇÃO DOS ATENDIMENTOS</span><h2 id="consultas-especialidade">Consultas por especialidade</h2></div><span className={styles.period}>Próximos {dias} dias</span></div>
        {dadosGrafico.length ? <GraficoConsultas dados={dadosGrafico} /> : <div className={styles.emptyChart}><span className={styles.emptyIcon}><DashboardIcon kind="chart" /></span><h3>Sua operação começa pela agenda</h3><p>Quando houver consultas nos próximos {dias} dias, a distribuição por especialidade aparecerá aqui.</p><Link href="/admin/agenda">Gerenciar disponibilidade <span aria-hidden="true">→</span></Link></div>}
        <div className={styles.chartFooter}><span className={styles.legendDot} /> Consultas registradas no período <span>{agenda.totais.consultas} no total</span></div>
      </section>
      <section className={styles.capacity} aria-labelledby="capacidade-agenda">
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>PLANEJAMENTO</span><h2 id="capacidade-agenda">Capacidade da agenda</h2></div><DashboardIcon kind="chart" /></div>
        <div className={styles.capacityNumber}><strong>{agenda.totais.ocupacao}<small>%</small></strong><span>de ocupação<br />nos próximos {dias} dias</span></div>
        <progress className={styles.progress} value={agenda.totais.ocupacao} max={100} aria-label="Ocupação da agenda" />
        <dl className={styles.capacityList}><div><dt><i className={styles.freeDot} />Vagas disponíveis</dt><dd>{agenda.totais.livres}</dd></div><div><dt><i className={styles.bookedDot} />Vagas reservadas</dt><dd>{agenda.totais.reservadas}</dd></div><div><dt><i className={styles.blockedDot} />Vagas bloqueadas</dt><dd>{agenda.totais.bloqueadas}</dd></div></dl>
        <div className={styles.capacityNote}><span>Taxa de cancelamento</span><strong>{agenda.totais.cancelamento}%</strong><small>{agenda.totais.canceladas} consulta(s) no período</small></div>
        <Link href="/admin/agenda" className={styles.capacityLink}>Organizar agenda <span aria-hidden="true">→</span></Link>
      </section>
    </div>

    <section aria-labelledby="acoes-rapidas"><div className={styles.blockHeading}><h2 id="acoes-rapidas">Sua operação, a um clique</h2><span>Acessos rápidos</span></div><div className={styles.shortcuts}>{atalhos.map(item=><Link href={item.href} key={item.href} className={styles.shortcut}><span className={styles.shortcutIcon}><DashboardIcon kind={item.icon} /></span><div><strong>{item.title}</strong><span>{item.description}</span></div><span className={styles.arrow} aria-hidden="true">→</span></Link>)}</div></section>

    <div className={styles.agendaHeading}><div><span className={styles.eyebrow}>ROTINA DA CLÍNICA</span><h2>Agenda e acompanhamento</h2></div><Link href="/admin/agenda">Ver agenda completa <span aria-hidden="true">→</span></Link></div>
    <AdminDashboardAgenda key={dias} hoje={consultasHoje} futuras={(futuras ?? []) as unknown as ConsultaRow[]} dias={dias} />
    <Panel titulo="Desempenho por especialidade" descricao={`Disponibilidade e ocupação nos próximos ${dias} dias.`}>
      {agenda.linhas.length ? <table className="cx-table cx-table-cards"><thead><tr><th>Especialidade</th><th>Disponíveis</th><th>Reservadas</th><th>Bloqueadas</th><th>Ocupação</th><th>Cancelamentos</th></tr></thead><tbody>{agenda.linhas.map(l=>{
        const total=l.vagas_livres+l.vagas_reservadas;const ocupacao=total?Math.round(l.vagas_reservadas/total*100):0;
        return <tr key={l.especialidade_id}><td data-label="Especialidade"><strong>{l.especialidade_nome}</strong></td><td data-label="Disponíveis">{l.vagas_livres}</td><td data-label="Reservadas">{l.vagas_reservadas}</td><td data-label="Bloqueadas">{l.vagas_bloqueadas}</td><td data-label="Ocupação"><div className={styles.tableProgress}><progress value={ocupacao} max={100} aria-label={"Ocupação de "+l.especialidade_nome} /><span>{total?ocupacao+"%":"Sem oferta"}</span></div></td><td data-label="Cancelamentos">{l.canceladas}</td></tr>;
      })}</tbody></table> : <p className={styles.muted}>Cadastre profissionais e libere horários para acompanhar as especialidades.</p>}
    </Panel>
    <footer className={styles.footer}><span>ClinicaFlow · Gestão integrada</span><span>{indicadores.profissionais} profissionais ativos · {indicadores.unidades} unidades ativas · {indicadores.agendadas} consultas agendadas</span></footer>
  </div>;
}

function DashboardIcon({ kind }: { kind: string }) {
  const paths: Record<string, React.ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18m-12 5h3" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /><circle cx="9" cy="7" r="4" /></>,
    chart: <><path d="M4 3v17h17M9 15v-4m5 4V7m5 8v-5" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18m-5 4h5m-5 3h1" /></>,
    care: <><path d="M6 3v5a5 5 0 0 0 10 0V3M4 3h4m6 0h4m-7 10v3a5 5 0 0 0 10 0v-2" /><circle cx="21" cy="12" r="2" /></>,
    tasks: <><rect x="4" y="4" width="16" height="17" rx="3" /><path d="M9 4V2h6v2M8 10l1 1 2-2m2 1h3m-8 6 1 1 2-2m2 1h3" /></>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind] ?? paths.chart}</svg>;
}


