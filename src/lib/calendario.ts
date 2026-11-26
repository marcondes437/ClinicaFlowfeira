export type EventoConsulta = { id: string; data_hora: string; especialidade: string; profissional: string; local: string };
const escapar = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function instante(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Data da consulta inválida.');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
// Fold at 75 UTF-8 octets without splitting accented characters (RFC 5545).
function dobrar(line: string) {
  const encoder = new TextEncoder(); let chunk = '', size = 0; const parts = [];
  for (const char of line) { const bytes = encoder.encode(char).length; if (size + bytes > 75) { parts.push(chunk); chunk = ' '; size = 1; } chunk += char; size += bytes; }
  parts.push(chunk); return parts.join('\r\n');
}
export function calendarioConsulta(evento: EventoConsulta, agora = new Date()) {
  if (!/^[a-zA-Z0-9-]+$/.test(evento.id)) throw new Error('Identificador inválido.');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ClinicaFlow//Consultas//PT-BR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${evento.id}@clinicaflow.local`, `DTSTAMP:${instante(agora)}`, `DTSTART:${instante(evento.data_hora)}`,
    `SUMMARY:${escapar('Consulta de ' + evento.especialidade)}`, `DESCRIPTION:${escapar('Profissional: ' + evento.profissional + '\nConfira os detalhes no seu Portal do paciente.')}`,
    `LOCATION:${escapar(evento.local)}`, 'END:VEVENT', 'END:VCALENDAR', '',
  ].map(dobrar).join('\r\n');
}
