import { notFound } from "next/navigation";
import Panel from "@/components/Panel";
import ConsultasTable, { type ConsultaRow } from "@/components/ConsultasTable";
import { createClient } from "@/lib/local/server";
import { CONSULTA_SELECT } from "@/lib/queries";
import { dataCurta } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FichaPaciente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: paciente } = await supabase.from("pacientes").select("*, pacientes_dados_sensiveis(*)").eq("id", id).maybeSingle();
  if (!paciente) notFound();

  const { data: consultas } = await supabase
    .from("consultas")
    .select(CONSULTA_SELECT)
    .eq("paciente_id", id)
    .order("data_hora", { ascending: false });

  // CPF/endereço: o RLS só libera para recepção, enfermagem e o médico do paciente (LGPD); para o admin vem vazio.
  const sens = (paciente.pacientes_dados_sensiveis ?? {}) as Record<string, string | null>;
  const info: [string, string][] = [
    ["CPF", sens.cpf ? "•••.•••.•••-" + String(sens.cpf).slice(-2) : "Restrito"],
    ["Nascimento", dataCurta(paciente.data_nascimento)],
    ["Telefone", paciente.telefone ?? "—"],
    ["Celular", paciente.celular ?? "—"],
    ["E-mail", paciente.email ?? "—"],
    ["Endereço", sens.endereco ?? "—"],
    ["Cidade/UF", `${sens.cidade ?? "—"} / ${sens.estado ?? "—"}`],
    ["CEP", sens.cep ?? "—"],
    ["Contato de emergência", sens.contato_emergencia ?? "—"],
    ["Status", paciente.status],
  ];

  return (
    <>
      <Panel titulo={paciente.nome_completo} descricao="Ficha completa do paciente.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.9rem" }}>
          {info.map(([label, valor]) => (
            <div key={label}>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--cx-muted)" }}>{label}</div>
              <div style={{ fontWeight: 600 }}>{valor}</div>
            </div>
          ))}
        </div>
        {paciente.observacoes && <p style={{ marginTop: "1rem", color: "var(--cx-muted)" }}>{paciente.observacoes}</p>}
      </Panel>

      <Panel titulo="Consultas do paciente">
        <ConsultasTable consultas={(consultas ?? []) as unknown as ConsultaRow[]} podeAlterarStatus />
      </Panel>

      <Panel titulo="Prontuário">
        <p style={{ margin: 0, color: "var(--cx-muted)" }}>
          Evoluções clínicas, CPF e endereço são visíveis apenas para o próprio paciente, a recepção (dados cadastrais),
          a enfermagem e o médico que o atende (LGPD — minimização de acesso).
        </p>
      </Panel>
    </>
  );
}
