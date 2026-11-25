import Panel from "@/components/Panel";
import { AcoesTrello, ListaTarefas, NovaTarefaForm, type Tarefa } from "@/components/TarefasPainel";
import { createClient } from "@/lib/local/server";
import { diagnosticoTrello, lerConfigTrello, lerMembros, listarListas, listarMembros } from "@/lib/trello";

/** Página de tarefas internas (admin, gestão e recepção). Server Component. */
export default async function TarefasPagina({ gestao }: { gestao: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tarefas_internas")
    .select("id, titulo, descricao, categoria, status, responsavel, trello_url, erro_sincronizacao, created_at")
    .order("status")
    .order("created_at", { ascending: false })
    .limit(200);

  const config = lerConfigTrello();
  let listas: Array<{ id: string; name: string }> = [];
  let membros: Array<{ id: string; fullName: string; username: string }> = [];
  let erroListas: string | null = null;
  if (gestao && config) {
    try {
      [listas, membros] = await Promise.all([listarListas(config), listarMembros(config)]);
    } catch (e) {
      erroListas = e instanceof Error ? e.message : "Falha ao consultar o Trello.";
    }
  }

  return (
    <>
      <Panel
        titulo="Tarefas internas"
        descricao={config ? "Integradas ao Trello: cada tarefa vira um cartão no quadro configurado." : "Registradas no ClinicaFlow. O envio ao Trello é opcional e ainda não está configurado."}
        acao={gestao && config ? <AcoesTrello /> : undefined}
      >
        <ListaTarefas tarefas={(data ?? []) as Tarefa[]} />
      </Panel>

      <Panel titulo="Nova tarefa" descricao="Tarefas administrativas, problemas técnicos e solicitações de manutenção.">
        <NovaTarefaForm responsaveis={lerMembros().map((m) => m.nome)} />
      </Panel>

      {gestao && (
        <Panel titulo="Configuração do Trello" descricao="As credenciais ficam só no servidor (variáveis de ambiente).">
          <table className="cx-table cx-table-cards">
            <thead><tr><th>Variável</th><th>Situação</th></tr></thead>
            <tbody>
              {diagnosticoTrello().map((v) => (
                <tr key={v.nome}>
                  <td data-label="Variável"><code>{v.nome}</code>{v.obrigatoria ? " *" : ""}</td>
                  <td data-label="Situação">
                    <span className={`cx-badge ${v.definida ? "cx-badge-ok" : v.obrigatoria ? "cx-badge-danger" : ""}`}>
                      {v.definida ? "Definida" : v.obrigatoria ? "Faltando" : "Opcional"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {erroListas && <div className="cx-alert cx-alert-error" style={{ marginTop: "1rem" }}>{erroListas}</div>}
          {listas.length > 0 && (
            <>
              <p style={{ margin: "1rem 0 0.5rem", fontWeight: 600 }}>Listas do quadro (copie os IDs para as variáveis TRELLO_LIST_*):</p>
              <ul style={{ margin: 0 }}>
                {listas.map((l) => <li key={l.id}>{l.name}: <code>{l.id}</code></li>)}
              </ul>
            </>
          )}
          {membros.length > 0 && (
            <>
              <p style={{ margin: "1rem 0 0.5rem", fontWeight: 600 }}>
                Membros do quadro (opcional: <code>TRELLO_MEMBROS=Nome do responsável=ID;Outro=ID</code> atribui o cartão a eles):
              </p>
              <ul style={{ margin: 0 }}>
                {membros.map((m) => <li key={m.id}>{m.fullName} (@{m.username}): <code>{m.id}</code></li>)}
              </ul>
            </>
          )}
          {!config && (
            <p style={{ color: "var(--cx-muted)", marginTop: "1rem", marginBottom: 0 }}>
              Passo a passo em <code>docs/TRELLO.md</code>. Depois de configurar, reinicie o servidor (ou faça novo deploy).
            </p>
          )}
        </Panel>
      )}
    </>
  );
}
