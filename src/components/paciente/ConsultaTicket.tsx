import Link from "next/link";
import { dataCurta, hora } from "@/lib/format";
import { STATUS_CONSULTA_LABEL } from "@/lib/roles";
import CancelarConsulta from "./CancelarConsulta";
import styles from "./ConsultaTicket.module.css";
import type { ConsultaRow } from "../ConsultasTable";

export default function ConsultaTicket({ consulta }: { consulta: ConsultaRow | null }) {
  if (!consulta) {
    return (
      <div className={styles.vazio}>
        <p className={styles.vazioTitulo}>Nenhuma consulta agendada</p>
        <p className={styles.vazioTexto}>Escolha a especialidade e o sistema encontra o primeiro horário livre. Leva menos de um minuto.</p>
        <Link href="/paciente/agendar" className="cx-btn cx-btn-accent">
          Agendar consulta
        </Link>
      </div>
    );
  }

  const data = dataCurta(consulta.data_hora);
  const horario = hora(consulta.data_hora);
  const endereco = [consulta.unidades?.endereco, consulta.unidades?.cidade].filter(Boolean).join(", ");
  const podeAlterar = consulta.status === "agendada" || consulta.status === "confirmada";

  return (
    <div className={styles.ticket}>
      <div className={styles.corpo}>
        <span className={styles.eyebrow}>Próxima consulta · {STATUS_CONSULTA_LABEL[consulta.status] ?? consulta.status}</span>
        <div className={styles.linha}>
          <div>
            <span className={styles.dataGrande}>{data}</span>
            <span className={styles.hora}>{horario}</span>
          </div>
        </div>
        <p className={styles.medico}>{consulta.profissionais?.nome ?? "Profissional a definir"}</p>
        <p className={styles.especialidade}>
          {consulta.especialidades?.nome} · {consulta.unidades?.nome}
          {endereco && <><br />{endereco}</>}
        </p>
      </div>
      <div className={styles.picote} aria-hidden="true" />
      <div className={styles.canhoto}>
        {podeAlterar && (
          <>
            <Link href={`/paciente/agendar?remarcar=${consulta.id}`} className="cx-btn cx-btn-primary">
              Remarcar
            </Link>
            <CancelarConsulta id={consulta.id} />
          </>
        )}
      </div>
    </div>
  );
}
