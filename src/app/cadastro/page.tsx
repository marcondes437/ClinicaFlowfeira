"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/local/client";
import PatientPortal from "@/components/PatientPortal";
import styles from "@/components/PortalLogin.module.css";
import { traduzirErroAuth } from "@/lib/erros";
import { emailValido, nomeCompletoValido, senhaForte } from "@/lib/validacao";

function safeRedirect(value: string | null) {
  return value?.startsWith("/paciente") && !value.startsWith("//") ? value : "/paciente";
}

function CadastroForm() {
  const params = useSearchParams();
  const [form, setForm] = useState({ nome: "", email: "", senha: "" });
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  function set(campo: keyof typeof form, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    const nome = form.nome.trim().replace(/\s+/g, " ");
    const email = form.email.trim().toLowerCase();
    if (!nomeCompletoValido(nome)) return setErro("Informe seu nome completo (nome e sobrenome).");
    if (!emailValido(email)) return setErro("Informe um e-mail válido.");
    if (!senhaForte(form.senha)) return setErro("A senha precisa ter pelo menos 8 caracteres, com letras e números.");
    if (!aceite) return setErro("Para criar a conta, aceite o uso dos seus dados para o atendimento.");

    setCarregando(true);
    const supabase = createClient();
    const destino = safeRedirect(params.get("redirect"));
    const { data, error } = await supabase.auth.signUp({
      email,
      password: form.senha,
      options: {
        data: { nome, consentimento_lgpd_em: new Date().toISOString() },
      },
    });

    setCarregando(false);
    if (error) {
      setErro(traduzirErroAuth(error.message));
      return;
    }
    if (data.session) {
      // Conta criada: os dados adicionais (celular, CPF...) são pedidos agora, uma única vez.
      window.location.replace(`/paciente/meus-dados?next=${encodeURIComponent(destino)}`);
      return;
    }
    setOk("Conta criada. Entre com seu e-mail e senha locais.");
  }

  return (
    <PatientPortal
      accessTitle="Criar conta"
      accessIntro="Só nome, e-mail e senha. Celular e CPF são pedidos uma única vez, no primeiro acesso."
      accessLink={{ href: "/portal-paciente", label: "Já tenho conta" }}
    >
      <form onSubmit={onSubmit} className={styles.form}>
        {erro && <div className={styles.error} role="alert">{erro}</div>}
        {ok && <div className={styles.success} role="status">{ok}</div>}

        <label htmlFor="nome">Nome completo</label>
        <input id="nome" autoComplete="name" required minLength={5} maxLength={120} value={form.nome} onChange={(e) => set("nome", e.target.value)} />

        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="seu@email.com" />

        <label htmlFor="senha">Senha</label>
        <input id="senha" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={form.senha} onChange={(e) => set("senha", e.target.value)} placeholder="8+ caracteres, com letras e números" aria-describedby="senha-ajuda" />
        <small id="senha-ajuda" style={{ color: "var(--cx-muted)", marginTop: "-0.4rem" }}>Use pelo menos 8 caracteres, com letras e números.</small>

        <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontWeight: 400, fontSize: "0.85rem", lineHeight: 1.4 }}>
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} style={{ marginTop: "0.2rem", width: "auto" }} required />
          <span>
            Concordo com o uso dos meus dados pela clínica para agendamento e atendimento, conforme a LGPD. Posso
            pedir correção ou exclusão a qualquer momento na recepção. <Link href="/sobre">Saiba mais</Link>
          </span>
        </label>

        <button type="submit" disabled={carregando}>
          {carregando ? "Criando..." : "Criar conta"}
        </button>
        <p>Seu cadastro é salvo neste computador. Não é necessário confirmar por e-mail.</p>
      </form>
    </PatientPortal>
  );
}

export default function CadastroPage() {
  return (
    <Suspense fallback={<p>Carregando...</p>}>
      <CadastroForm />
    </Suspense>
  );
}
