"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/local/client";
import { getPrimaryRole, HOME_BY_ROLE, normalizeRoles, type AppRole } from "@/lib/roles";
import styles from "./PortalLogin.module.css";
import PatientPortal from "./PatientPortal";
import DoctorAccess from "./medico/DoctorAccess";
import { traduzirErroAuth } from "@/lib/erros";

type PortalLoginProps = {
  role: Extract<AppRole, "medico" | "paciente">;
};

const PORTAL = {
  paciente: {
    label: "Portal do cliente",
    title: "Bem-vindo ao seu cuidado",
    description: "Acompanhe suas consultas, histórico e informações de saúde em um só lugar.",
    image: "/fotos/clinicageral.jpg",
    emailLabel: "E-mail",
    help: "Ainda não tem conta? Use “Me cadastrar”: leva menos de um minuto.",
    destination: "/paciente",
  },
  medico: {
    label: "Portal do médico",
    title: "Portal do médico",
    description: "Consulte sua agenda, acompanhe seus pacientes e registre cada atendimento com segurança.",
    image: "/fotos/enfermagem.jpg",
    emailLabel: "E-mail profissional",
    help: "Acesso exclusivo para profissionais cadastrados pela ClinicaFlow.",
    destination: "/medico",
  },
} as const;

function destinoSeguro(valor: string | null, padrao: string) {
  return valor && (valor === padrao || valor.startsWith(padrao + "/")) ? valor : padrao;
}

export default function PortalLogin({ role }: PortalLoginProps) {
  const searchParams = useSearchParams();
  const portal = PORTAL[role];
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });

    if (error || !data.user) {
      setErro(traduzirErroAuth(error?.message ?? "invalid login credentials"));
      setCarregando(false);
      return;
    }

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const cargos = normalizeRoles((roles ?? []).map((item) => item.role));

    // Equipe (admin, gestor, recepção, enfermagem) entra pelo Portal do Paciente
    // e vai direto para a própria área, sem passar pelo fluxo de paciente.
    const principal = getPrimaryRole(cargos);
    if (role === "paciente" && principal !== "paciente" && principal !== "medico") {
      window.location.replace(HOME_BY_ROLE[principal]);
      return;
    }

    const temAcesso = cargos.includes(role);

    if (!temAcesso) {
      await supabase.auth.signOut();
      setErro(`Este acesso é exclusivo para ${role === "medico" ? "médicos" : "pacientes"}.`);
      setCarregando(false);
      return;
    }

    let destino = destinoSeguro(searchParams.get("redirect"), portal.destination);

    // Paciente: no primeiro login pedimos os dados adicionais (celular, nascimento, CPF).
    if (role === "paciente") {
      const { data: paciente } = await supabase
        .from("pacientes")
        .select("cadastro_completo_em")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (!paciente?.cadastro_completo_em) {
        destino = `/paciente/meus-dados?next=${encodeURIComponent(destino)}`;
      }
    }

    // Reload after changing the HttpOnly session so cached redirects cannot
    // send a successfully authenticated user back to the login screen.
    window.location.replace(destino);
  }

  const loginForm = (
    <form onSubmit={onSubmit} className={styles.form}>
      {searchParams.get("senha") === "alterada" && <div className={styles.success} role="status">Senha alterada. Entre com sua nova senha.</div>}
      {(erro || searchParams.has("erro")) && <div className={styles.error} role="alert">{erro || "Este sistema usa contas locais. Entre com seu e-mail e senha."}</div>}
      <label htmlFor={`${role}-email`}>{portal.emailLabel}</label>
      <input
        id={`${role}-email`}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={role === 'medico' ? 'Informe seu e-mail' : 'seu@email.com'}
      />

      <div className={styles.passwordLabel}>
        <label htmlFor={`${role}-senha`}>Senha</label>
        {role === 'paciente' && <Link href="/recuperar-senha">Esqueci minha senha</Link>}
      </div>
      <input
        id={`${role}-senha`}
        type={mostrarSenha ? "text" : "password"}
        autoComplete="current-password"
        required
        value={senha}
        onChange={(event) => setSenha(event.target.value)}
        placeholder={role === 'medico' ? 'Informe sua senha' : 'Digite sua senha'}
      />
      {role === 'medico' && <button type="button" className={styles.showPassword} aria-pressed={mostrarSenha} onClick={() => setMostrarSenha(v => !v)}>{mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}</button>}

      <button type="submit" disabled={carregando}>
        {carregando ? "Entrando..." : role === "paciente" ? "Continuar" : "Entrar no portal"}
      </button>
      {role === 'medico' && <Link href="/recuperar-senha">Esqueci minha senha</Link>}
      <p className={styles.help}>Acesso local: funciona sem internet.</p>
    </form>
  );

  if (role === "paciente") {
    const redirect = searchParams.get("redirect");
    const cadastro = redirect ? `/cadastro?redirect=${encodeURIComponent(redirect)}` : "/cadastro";
    return <PatientPortal accessLink={{ href: cadastro, label: "Me cadastrar" }}>{loginForm}</PatientPortal>;
  }

  return <DoctorAccess>{loginForm}</DoctorAccess>;
}
