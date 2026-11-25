import Panel from "@/components/Panel";
import MeusDadosForm from "@/components/paciente/MeusDadosForm";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/local/server";
import { caminhoSeguro, getPacienteDoUsuario } from "@/lib/paciente";

export const dynamic = "force-dynamic";

function formatarCpf(cpf: string | null | undefined) {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}

function formatarCep(cep: string | null | undefined) {
  const d = (cep ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export default async function MeusDadosPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await requireRole(["paciente"]);
  const { next } = await searchParams;
  const paciente = await getPacienteDoUsuario(user.id);
  const primeiroAcesso = !paciente?.cadastro_completo_em;

  let sensiveis: { cpf: string | null; cep: string | null; cidade: string | null; estado: string | null; contato_emergencia: string | null } | null = null;
  if (paciente) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("pacientes_dados_sensiveis")
      .select("cpf, cep, cidade, estado, contato_emergencia")
      .eq("paciente_id", paciente.id)
      .maybeSingle();
    sensiveis = data;
  }

  return (
    <Panel
      titulo={primeiroAcesso ? "Complete seu cadastro" : "Meus dados"}
      descricao={
        primeiroAcesso
          ? "É só desta vez. Com esses dados a clínica confirma sua identidade e entra em contato sobre suas consultas."
          : "Mantenha seus dados de contato atualizados."
      }
    >
      <MeusDadosForm
        primeiroAcesso={primeiroAcesso}
        next={caminhoSeguro(next, primeiroAcesso ? "/paciente/agendar" : "/paciente/meus-dados")}
        valores={{
          celular: paciente?.celular ?? paciente?.telefone ?? "",
          data_nascimento: paciente?.data_nascimento ?? "",
          cpf: formatarCpf(sensiveis?.cpf),
          cep: formatarCep(sensiveis?.cep),
          cidade: sensiveis?.cidade ?? "",
          estado: sensiveis?.estado ?? "",
          contato_emergencia: sensiveis?.contato_emergencia ?? "",
        }}
      />
    </Panel>
  );
}
