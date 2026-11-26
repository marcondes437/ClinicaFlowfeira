import Link from "next/link";
import { dataCurta, hora } from "@/lib/format";
import { STATUS_CONSULTA_LABEL } from "@/lib/roles";
import CancelarConsulta from "./CancelarConsulta";
import styles from "./ConsultaTicket.module.css";
import type { ConsultaRow } from "../ConsultasTable";
import { consultaAlteravel } from "@/lib/consulta";
import PatientIcon from "./PatientIcon";
import { CalendarDownload } from './AppointmentTools';

export default function ConsultaTicket({ consulta }: { consulta: ConsultaRow | null }) {
  if (!consulta) {
    return (
      <div className={styles.vazio}>
        <span className={styles.emptyIcon}><PatientIcon kind="calendar" size={30} /></span>
        <p className={styles.vazioTitulo}>Nenhuma consulta agendada</p>
        <p className={styles.vazioTexto}>Quando você marcar uma consulta, a data, o médico e a unidade aparecem aqui.</p>
        <Link href="/paciente/agendar" className="cx-btn cx-btn-accent">
          Agendar consulta
        </Link>
      </div>
    );
  }

  const data = dataCurta(consulta.data_hora);
  const horario = hora(consulta.data_hora);
  const endereco = [consulta.unidades?.endereco, consulta.unidades?.cidade].filter(Boolean).join(", ");
  const podeAlterar = consultaAlteravel(consulta);

  return (
    <div className={styles.ticket}>
      <div className={styles.corpo}>
        <span className={styles.eyebrow}>{consulta.status === 'em_atendimento' ? 'Seu atendimento' : 'Próxima consulta'} · {STATUS_CONSULTA_LABEL[consulta.status] ?? consulta.status}</span>
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
        <span className={styles.reminder}>{consulta.status === 'em_atendimento' ? 'Seu atendimento está em andamento.' : 'Chegue com 15 minutos de antecedência.'}</span>
        {podeAlterar && (
          <>
            <Link href={`/paciente/agendar?remarcar=${consulta.id}`} className="cx-btn cx-btn-primary">
              Remarcar
            </Link>
            <CancelarConsulta id={consulta.id} />
            <CalendarDownload evento={{ id: consulta.id, data_hora: consulta.data_hora, especialidade: consulta.especialidades?.nome ?? 'Atendimento', profissional: consulta.profissionais?.nome ?? 'A confirmar', local: [consulta.unidades?.nome, endereco].filter(Boolean).join(' — ') }} />
          </>
        )}
      </div>
    </div>
  );
}
