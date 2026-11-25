/** CSV compatível com planilhas, com proteção contra fórmulas em campos de texto. */
export function gerarCsv(linhas: (string | number)[][]) {
  const campo = (valor: string | number) => {
    let texto = String(valor);
    if (typeof valor === "string" && /^[\s]*[=+@-]/.test(texto)) texto = "'" + texto;
    return '"' + texto.replace(/"/g, '""') + '"';
  };
  return "\uFEFF" + linhas.map(linha => linha.map(campo).join(";")).join("\r\n");
}
