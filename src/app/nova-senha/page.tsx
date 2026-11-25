"use client";

import { useState } from "react";
import { createClient } from "@/lib/local/client";
import styles from "../login/auth.module.css";
import { senhaForte } from "@/lib/validacao";
import { traduzirErroAuth } from "@/lib/erros";

export default function NovaSenhaPage() {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!senhaForte(senha)) {
      setErro("Use pelo menos 8 caracteres, com letras e números (máximo de 72).");
      return;
    }
    setCarregando(true);
    try {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) setErro(traduzirErroAuth(error.message));
    else {
      await supabase.auth.signOut();
      window.location.replace("/portal-paciente?senha=alterada");
    }
    } catch {
      setErro("Não foi possível salvar a senha. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <aside className={styles.side}>
        <span className={styles.brand}><span className={styles.brandMark}>✚</span> ClinicxFlow</span>
        <div><h2>Defina uma nova senha.</h2></div>
        <span />
      </aside>
      <main className={styles.panel}>
        <form className={styles.form} onSubmit={onSubmit}>
          <h1>Nova senha</h1>
          {erro && <div className="cx-alert cx-alert-error">{erro}</div>}
          <div className="cx-field">
            <label htmlFor="senha">Nova senha</label>
            <input id="senha" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <p>Use pelo menos 8 caracteres, com letras e números.</p>
          <button disabled={carregando} className={`cx-btn cx-btn-primary ${styles.full}`}>{carregando ? "Salvando..." : "Salvar"}</button>
        </form>
      </main>
    </div>
  );
}
