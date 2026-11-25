import type { Metadata } from "next";
import PublicSupport from "@/components/PublicSupport";
import "./globals.css";

export const metadata: Metadata = {
  icons: { icon: "/fotos/logo-transparente.png" },
  title: "ClinicxFlow — Gestão e atendimento em saúde",
  description:
    "Plataforma integrada para clínicas, consultórios e UBS: pacientes, agenda, prontuário, indicadores e gestão em um só lugar.",
  openGraph: {
    title: "ClinicxFlow — Gestão e atendimento em saúde",
    description:
      "Pacientes, agenda, prontuário eletrônico e indicadores integrados em uma única plataforma.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}<PublicSupport aiEnabled={process.env.ALLOW_ONLINE_INTEGRATIONS === 'true' && Boolean(process.env.OPENAI_API_KEY?.trim())} /></body>
    </html>
  );
}
