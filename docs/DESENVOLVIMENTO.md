# Execução local

Execute os comandos na pasta `ClinicaFlow`.

```powershell
npm run dev
```

O desenvolvimento usa `http://localhost:3000` e gera os módulos em `.next-dev`.
O build de produção continua usando `.next`:

```powershell
npm run build
npm run start
```

Desenvolvimento e produção usam pastas distintas para que um build não sobrescreva
os módulos de uma sessão de desenvolvimento aberta. A configuração utiliza a
[opção distDir do Next.js](https://nextjs.org/docs/pages/api-reference/config/next-config-js/distDir).

Depois de alterar `next.config.ts`, o servidor normalmente reinicia sozinho. Se o
terminal ainda mostrar erros antigos de Client Manifest ou módulos Webpack,
interrompa o servidor com Ctrl+C, execute `npm run dev` novamente e atualize a
página com Ctrl+F5.

A primeira abertura de cada rota pode levar alguns segundos enquanto o Next.js
compila a página. Avisos de cache sobre `Serializing big strings` não são erros HTTP.

A imagem de nutrição utiliza `/fotos/nutricao.png`, sem acentos no nome do arquivo.

## Desempenho local

Para avaliar a velocidade de uso, prefira `npm run build` e `npm run start`, depois de parar o `npm run dev` na mesma porta. O modo de desenvolvimento compila páginas sob demanda e adiciona ferramentas de diagnóstico; a primeira abertura pode ser bem mais lenta.

Na medição de 12/11/2026, a página inicial no desenvolvimento levou cerca de 7,1 segundos na primeira chamada e 1,3 segundo na chamada seguinte. Duas consultas públicas ao banco remoto levaram aproximadamente 0,4–0,6 segundo cada. São amostras locais, sujeitas à rede e ao estado do cache.

A sessão e o cliente Supabase são reaproveitados apenas dentro da mesma renderização do servidor, usando React `cache`. Não há cache global de sessões entre usuários. A área administrativa mostra um estado de carregamento enquanto consulta seus dados.

As fotos de especialidades usam o otimizador de imagens do Next.js e carregamento sob demanda. A foto de dermatologia em largura de 640 px foi entregue em WebP com aproximadamente 23 KB, contra 1.976 KB do PNG original. A primeira transformação gera a imagem e as seguintes reutilizam o cache de imagens.
