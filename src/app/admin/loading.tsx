export default function AdminLoading() {
  return <section aria-busy="true" role="status" aria-label="Carregando painel administrativo" style={{ padding: 24, border: "1px solid #e5edf0", borderRadius: 16, background: "#fff" }}>
    <p style={{ margin: "0 0 20px", color: "#65848f", fontSize: 13 }}>Carregando dados da clínica...</p>
    <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16 }}>
      {[0, 1, 2, 3].map(item => <div key={item} style={{ height: 110, borderRadius: 12, background: "#f1f6f8" }} />)}
    </div>
    <div aria-hidden="true" style={{ marginTop: 20, height: 200, borderRadius: 12, background: "#f5f8fa" }} />
  </section>;
}
