export default function DoctorMetricIcon({ index }: { index: number }) {
  const shapes = [
    <g key="agenda"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-12 5h2m3 0h2"/></g>,
    <g key="atendimento"><path d="M5 3v6a5 5 0 0 0 10 0V3M3 3h4m6 0h4m-7 11v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="12" r="2"/></g>,
    <g key="concluidas"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></g>,
    <g key="horarios"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M4 4 2 6m18-2 2 2"/></g>,
  ];
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[index % shapes.length]}</svg>;
}
