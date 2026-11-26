import { dataHora } from "@/lib/format";
import StatusConsulta from "../StatusConsulta";
import styles from "./HistoricoTimeline.module.css";
import type { ConsultaRow } from "../ConsultasTable";
import Link from "next/link";
import CancelarConsulta from "./CancelarConsulta";
import { consultaAlteravel } from "@/lib/consulta";

export default function HistoricoTimeline({ consultas, acoesPaciente = false }: { consultas: ConsultaRow[]; acoesPaciente?: boolean }) {
  if (!consultas.length) {
    return <p className={styles.vazio}>Seu histórico aparece aqui depois da primeira consulta.</p>;
  }

  return (
    <ol className={styles.linha}>
      {consultas.map((c) => (
        <li key={c.id} className={styles.item}>
          <span className={styles.marcador} aria-hidden="true" />
          <div className={styles.conteudo}>
            <div className={styles.topo}>
              <span className={styles.data}>{dataHora(c.data_hora)}</span>
              <StatusConsulta id={c.id} status={c.status} disabled />
            </div>
            <p className={styles.medico}>
              {c.profissionais?.nome ?? "Profissional não informado"}
              {c.especialidades?.nome ? ` · ${c.especialidades.nome}` : ""}
            </p>
            {c.motivo && <p className={styles.motivo}>{c.motivo}</p>}
            {c.unidades?.nome && <p className={styles.motivo}>{c.unidades.nome}</p>}
            {acoesPaciente && consultaAlteravel(c) && <div className={styles.actions}><Link href={`/paciente/agendar?remarcar=${c.id}`} className="cx-btn cx-btn-ghost">Remarcar</Link><CancelarConsulta id={c.id} /></div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

