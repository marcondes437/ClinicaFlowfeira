import Link from "next/link";
import HomeHeader from "@/components/HomeHeader";
import HomeFooter from "@/components/HomeFooter";
import UnitsSection from "@/components/UnitsSection";
import { createClient } from "@/lib/local/server";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
type Unit = { id: string; nome: string; endereco: string | null; cidade: string | null; telefone: string | null; horario_funcionamento: string | null };
const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default async function ProcurarClinicaPage({ searchParams }: {
  searchParams: Promise<{ busca?: string; cidade?: string }>;
}) {
  const params = await searchParams;
  const busca = typeof params.busca === "string" ? params.busca.slice(0, 120) : "";
  const cidade = typeof params.cidade === "string" ? params.cidade.slice(0, 120) : "";
  let unidades: Unit[] = [];
  let indisponivel = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("unidades")
      .select("id, nome, endereco, cidade, telefone, horario_funcionamento")
      .eq("status", "ativo").order("nome");
    if (error) indisponivel = true;
    else unidades = data ?? [];
  } catch {
    indisponivel = true;
  }
  const resultados = unidades.filter((unidade) =>
    normalizar(unidade.nome).includes(normalizar(busca)) &&
    normalizar([unidade.cidade, unidade.endereco].filter(Boolean).join(" ")).includes(normalizar(cidade))
  );
  return <div className={styles.page}>
    <HomeHeader />
    <main>
      <section className={styles.mainSection}>
        <div className={`cx-container ${styles.contentWrap}`}>
          <h1>Encontre uma clínica</h1>
          <p>Busque pelo nome da unidade, cidade ou bairro.</p>
          <form action="/procurar-clinica" className={styles.searchCard}>
            <div className="cx-field">
              <label htmlFor="busca">Nome da unidade</label>
              <input id="busca" name="busca" defaultValue={busca} maxLength={120} placeholder="Digite o nome da clínica" />
            </div>
            <div className="cx-field">
              <label htmlFor="cidade">Cidade ou bairro</label>
              <input id="cidade" name="cidade" defaultValue={cidade} maxLength={120} placeholder="Digite a cidade ou o bairro" />
            </div>
            <button type="submit" className={styles.searchButton}>Buscar clínicas</button>
            {(busca || cidade) && <Link href="/procurar-clinica">Limpar filtros</Link>}
          </form>
          <p role="status">{indisponivel
            ? "Não foi possível carregar as unidades. Tente novamente ou fale conosco pelos contatos abaixo."
            : `${resultados.length} unidade(s) encontrada(s).`}</p>
          {!indisponivel && resultados.length === 0 && <p>Tente outro nome ou cidade, ou limpe os filtros.</p>}
          <Link href="/agendamento-online" className="cx-btn cx-btn-primary">Buscar atendimento por especialidade</Link>
        </div>
      </section>
      {resultados.length > 0 && <UnitsSection units={resultados} />}
    </main>
    <HomeFooter />
  </div>;
}
