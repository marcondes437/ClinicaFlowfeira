"use client";

import { createClient } from "@/lib/local/client";

export default function LogoutButton() {

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/portal-paciente");
  }

  return (
    <button onClick={sair} className="cx-btn cx-btn-ghost" style={{ padding: "0.45rem 1rem" }}>
      Sair
    </button>
  );
}
