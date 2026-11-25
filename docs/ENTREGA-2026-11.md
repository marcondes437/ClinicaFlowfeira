# ClinicaFlow — Entrega da revisão (12/11/2026)

## 1. O que já existia (preservado)

- Agendamento por especialidade com atribuição automática do médico (`agendar_por_especialidade`).
- Cadastro em duas etapas (nome/e-mail/senha → CPF, celular e nascimento no 1º acesso), login por e-mail/senha e Google.
- Remarcar (reserva a nova vaga antes de cancelar a antiga) e cancelar devolvendo a vaga.
- Agenda liberada em bloco (`liberar_agenda`), painéis por cargo, middleware por rota, RLS, assistente Clara.

## 2. Erros encontrados e corrigidos

| # | Problema | Correção |
|---|---|---|
| 1 | **Duplo clique / duas abas** criava **duas consultas** da mesma especialidade para o mesmo paciente (reproduzido no teste de concorrência com o banco antigo: 2 consultas) | Trava por paciente (`pg_advisory_xact_lock`) + índices únicos parciais em `consultas` |
| 2 | Cadastro ficava "completo" só com celular e nascimento, **sem CPF** (bastava o paciente atualizar a tabela direto) | Completo = celular + nascimento + **CPF válido**; o agendamento confere de novo no banco |
| 3 | CPF validado só pelo tamanho no banco | Dígitos verificadores no banco (`private.cpf_valido`) e gatilho em `pacientes_dados_sensiveis` |
| 4 | RPC antiga `agendar_consulta_automaticamente` continuava liberada: o paciente podia **escolher o horário exato** | Execução revogada para usuários (fica só interna) |
| 5 | O médico podia alterar direto os horários (`agenda_medica`) e soltar uma vaga reservada | Escrita na agenda só pelas funções (`liberar_agenda`, `remover_horario`, `criar_bloqueio`...) |
| 6 | Qualquer membro da equipe (inclusive médico) mudava status/médico/horário de **qualquer** consulta direto na tabela | Status só pela função `alterar_status_consulta`, com permissão (médico só as dele) e transições válidas |
| 7 | Médico via **todos** os pacientes, consultas, CPF e prontuários da clínica | Médico só vê pacientes que atende (RLS) |
| 8 | Médico sem vínculo de profissional via a agenda do dia de todos os médicos (`/medico`) | Mostra só o aviso de vínculo |
| 9 | Sem férias, afastamentos, bloqueios, intervalos e sem impedir horários sobrepostos | Tabela `agenda_bloqueios`, intervalo em `liberar_agenda`, `data_fim` e restrição de não-sobreposição |
| 10 | A prévia do horário era calculada no navegador e podia divergir (não considerava médico inativo, bloqueio, antecedência) | Prévia calculada no banco (`previsualizar_vaga`) com as mesmas regras da reserva; o paciente nem lê mais a agenda |
| 11 | A confirmação usava o retorno da função, não o banco | Confirmação relida da tabela `consultas` |
| 12 | **Horários 3h adiantados** nas páginas renderizadas no servidor (UTC) e "consultas de hoje" no dia UTC | Formatação e início/fim do dia em `America/Sao_Paulo` |
| 13 | Data de nascimento aparecia 1 dia antes em alguns navegadores | `dataCurta` trata datas puras sem fuso |
| 14 | Login com Google de membro da equipe ia para "completar cadastro de paciente" | Callback redireciona pelo cargo |
| 15 | Erros do Supabase Auth em inglês ("User already registered") | Mensagens traduzidas |
| 16 | `package-lock.json` apontava 65 pacotes para um espelho privado (Lovable), o que travava o `npm ci` em outras máquinas | URLs trocadas para `registry.npmjs.org` |
| 17 | Visitante anônimo podia inserir pacientes (`pacientes_public_request`) — não usado pelo app | Política removida |
| 18 | Visitante anônimo lia **CPF, telefone e e-mail dos profissionais** (`profissionais` com `select *` público) | Leitura por colunas; CPF nunca exposto |
| 19 | Qualquer membro da equipe podia alterar/apagar o `audit_logs` | Só leitura para gestão; escrita só pelas funções |
| 20 | Políticas duplicadas em `pacientes` e `pacientes_dados_sensiveis` (`*_fix`) | Recriadas sem duplicidade |
| 21 | Links quebrados "/recepcao/pacientes/[id]" (página não existe) | Links removidos |
| 22 | `middleware.ts` duplicado na raiz | Removido (vale o `src/middleware.ts`) |
| 23 | Data/hora no ticket do paciente com vírgula sobrando ("12/11/2026,") | Formatação separada |

## 3. Melhorias

- **Agendamento:** prévia real, mensagens por situação (sem vagas → "Limpar preferências"; cadastro incompleto → link; já agendada → painel), remarcação só na mesma especialidade, auditoria de agendar/remarcar/cancelar.
- **Agenda médica:** intervalo (almoço), duração, férias/afastamentos/bloqueios (dia inteiro ou faixa diária), visão livres/ocupados/bloqueados, remover horário com retorno de erro. Bloqueio por cima de consulta marcada é recusado com a data da 1ª consulta.
- **Admin:** consultas de hoje e dos próximos 7 dias, ocupação e cancelamentos por especialidade, filtros por período/especialidade/unidade/médico/status, editar/inativar médicos, vincular login do médico por e-mail, ativar/desativar especialidades e unidades.
- **Cadastro/LGPD:** validação de nome, e-mail, senha (8+ com letras e números), CPF, celular e nascimento no navegador, no servidor e no banco; aceite LGPD no cadastro; CPF mascarado/oculto para o admin; prontuário restrito à equipe clínica.
- **Celular:** tabelas viram cartões em telas pequenas; filtros que quebram linha; botões com 44px de altura.
- **Trello:** integração opcional (ver `docs/TRELLO.md`).

> Mudança de comportamento intencional (LGPD): **admin e gestor não veem mais CPF, endereço nem prontuário** (o README já dizia isso; o banco real permitia). Recepção, enfermagem e o médico que atende continuam vendo.

## 4. Migration criada

`supabase/migrations/20261112120000_revisao_agendamento_seguranca.sql` — idempotente, não apaga dados,
compatível com as migrations do repositório e com o banco atual do Supabase (que tem colunas/tabelas a mais).

Funções novas/alteradas (públicas, chamadas pelo app): `agendar_por_especialidade`, `previsualizar_vaga`,
`resumo_vagas`, `cancelar_consulta`, `alterar_status_consulta`, `liberar_agenda` (+ intervalo), `remover_horario`,
`criar_bloqueio`, `remover_bloqueio`, `listar_agenda` (+ filtros), `indicadores_agenda`,
`vincular_acesso_profissional`, `salvar_meus_dados`.
Tabelas novas: `agenda_bloqueios`, `tarefas_internas` (e `audit_logs`, se ainda não existir).

## 5. Testes

| Teste | Situação |
|---|---|
| TypeScript (`npm run lint`) | ✅ passou |
| Build de produção (`npm run build`) | ✅ passou (35 rotas) |
| Unitários (`npm test`): validações, fuso, erros, cargos, redirecionamento, Trello com fetch simulado | ✅ 22/22 (17 novos + 5 da Clara) |
| Banco (`npm run test:db`, PostgreSQL 16 local com as migrations): itens 1, 3, 4, 5, 6, 7, 8, 10, 11, 12 e 14 da lista | ✅ 67/67 |
| Concorrência real (2 conexões): última vaga e duplo clique | ✅ 3/3 (no banco antigo, o duplo clique falha) |
| 2. Login com Supabase Auth de verdade (e-mail/senha e Google) | ⚠️ não executado: exige o Supabase online e contas reais. Coberto pela simulação de sessão do banco e pelo teste do callback/cargos |
| 13. Responsividade em celular | ⚠️ não executado em navegador; CSS revisado (tabelas em cartões ≤640px) |
| 14. Trello real | ⚠️ não executado (sem credenciais); testado com respostas simuladas |
| Migration no Supabase real | ⏳ **pendente** — veja a seção 7 |

## 6. Variáveis de ambiente

Ver `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (obrigatórias),
`OPENAI_API_KEY`/`OPENAI_MODEL` (opcionais), `TRELLO_*` (opcionais).

## 7. Configuração manual pendente

1. **Aplicar a migration** no Supabase (SQL Editor → colar o arquivo da seção 4 → Run).
   Sem ela, o código novo não encontra `resumo_vagas`/`previsualizar_vaga` e o agendamento não funciona.
2. Configurar as variáveis de ambiente na hospedagem e publicar o código novo **junto** com a migration.
3. Cadastrar profissionais (com especialidade e unidade), vincular o login de cada médico e liberar as agendas.
4. Supabase → Authentication → URL Configuration: incluir `https://SEU-DOMINIO/auth/callback` nas Redirect URLs (Google e confirmação de e-mail).
5. Opcional: senha mínima de 8 caracteres também em Authentication → Policies, e o Trello (`docs/TRELLO.md`).
6. O banco real tem tabelas que não estão nas migrations do repositório (transporte, exames, prescrições, `agenda_regras`...). Exporte o schema (`supabase db pull`) para versionar.

---

# 2ª rodada da revisão (12/11/2026, tarde)

Tudo o que está acima foi conferido de novo, rodando os testes contra um PostgreSQL 16 real.
Esta rodada corrigiu o que ainda estava errado e fechou lacunas, sem refazer o que já funcionava.

## A. Erros encontrados e corrigidos

| # | Problema | Como foi confirmado | Correção |
|---|---|---|---|
| 24 | **Remarcação travada**: em especialidades com mais de um médico, o 1º horário livre era o MESMO horário da consulta atual com outro médico; a reserva batia no índice único (paciente, horário) e falhava sempre com "Esse horário acabou de ser ocupado" | Reproduzido no banco: duas tentativas seguidas, mesmo erro | `vagas_candidatas` passa a considerar a consulta atual na checagem de sobreposição (migration nova) |
| 25 | Recepção/admin viam "Paciente inválido para este usuário" na prévia antes de escolher o paciente | Reproduzido no banco | `previsualizar_vaga` aceita equipe sem paciente |
| 26 | CPFs antigos gravados com máscara não contavam na checagem de duplicidade (outra conta podia usar o mesmo CPF) | Teste de banco com CPF "529.982.247-25" legado | Normalização dos CPFs existentes, linha a linha, sem abortar e sem CPF nos logs |
| 27 | A equipe não tinha como **remarcar** pela interface (o banco já permitia) | Leitura do código | Botão "Remarcar" nas listas de consultas do admin e da recepção, com o paciente fixo no formulário |
| 28 | No histórico, o paciente não podia cancelar nem remarcar | Leitura do código | Ações "Remarcar"/"Cancelar" nas consultas futuras do histórico |
| 29 | Escolher "Cancelada" no menu de situação cancelava na hora, sem confirmação | Leitura do código | Confirmação em linha antes de cancelar |
| 30 | Trello: sem a lista "Em andamento" configurada, "Trazer status do Trello" voltava a tarefa para "Aberta" | Teste unitário | Regra `statusParaSincronizar` + aviso ao mudar status sem lista configurada |
| 31 | Painel do gestor e faturamento liam as linhas da tabela: paravam em 1.000 (limite do PostgREST) | Leitura do código | Contagem no banco por status e soma paginada |
| 32 | Prévia do agendamento ficava presa em "Consultando a agenda…" se a requisição falhasse | Leitura do código | `try/finally` com mensagem de erro |
| 33 | Celular (equipe): o menu lateral inteiro empilhava antes do conteúdo; nenhum menu indicava a página atual | Leitura do CSS | Menu horizontal rolável no celular, item atual destacado com `aria-current="page"` |
| 34 | Botões de busca com menos de 40 px de altura no celular (home e /sobre) e campo sem rótulo em /procurar-clinica | **Teste de navegador** (`test:responsivo`) | Alvos de toque maiores e `aria-label` |
| 35 | `test:db` exigia `psql` e bash (não rodava no Windows) | Ambiente sem `psql` | Executor em Node (`scripts/test-db.cjs`, pacote `pg`) com 4 cenários de concorrência |

## B. Migration criada nesta rodada

`supabase/migrations/20261112180000_ajustes_agendamento.sql` — recria `private.vagas_candidatas` e
`private.previsualizar_vaga` (mesmas assinaturas e permissões) e cria `private.normalizar_cpfs()`.
A única alteração de dados é tirar a máscara de CPFs antigos. Pode ser executada de novo sem erro
(o teste de banco reaplica a última migration para conferir).

## C. Testes desta rodada (executados de verdade)

| Teste | Resultado |
|---|---|
| `npm run lint` (TypeScript) | ✅ sem erros |
| `npm test` (unitários) | ✅ 26/26 (4 novos: sincronização Trello, mover sem lista, menu ativo, ações do paciente) |
| `npm run test:db` (PostgreSQL 16.15 local, todas as migrations) | ✅ 95 verificações: 67 anteriores + reexecução da migration + 19 novas + 8 de concorrência |
| `npm run build` | ✅ 35 rotas |
| `npm run test:responsivo` (Chrome real, 360/390/768/1280 px, 8 páginas públicas + 8 rotas protegidas) | ✅ após as correções do item 34 (antes: 7 falhas) |

Itens da lista do pedido cobertos pelo banco: 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 e 14 (Trello com respostas simuladas).

**Não executados** (exigem serviços externos): login real no Supabase Auth com e-mail/senha e Google (item 2);
telas logadas no celular (precisam de usuários reais; o CSS foi revisado e as páginas públicas testadas no navegador);
Trello real (sem credenciais).

## D. Pendências manuais (somam-se às da seção 7)

1. Aplicar `20261112180000_ajustes_agendamento.sql` no Supabase **depois** da `20261112120000`.
   Se aparecer aviso de CPF duplicado/inválido, una ou corrija esses cadastros pela recepção.
2. Recomendado: configurar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` na hospedagem
   e depois remover os valores padrão de `src/lib/supabase/config.ts`. A chave ali é a **publicável**
   (não é segredo), mas faz cópias do projeto sem `.env.local` apontarem para o banco de produção.

---

# 3ª rodada (12/11/2026)

| # | Melhoria | Testes |
|---|---|---|
| 36 | Admin **edita** especialidades (nome, descrição) e unidades (todos os dados), em "Editar" na própria linha; rótulos acessíveis nos formulários | Banco: admin edita; recepção e paciente não |
| 37 | Trello: responsável vira **membro do cartão** via `TRELLO_MEMBROS`; a configuração lista os membros do quadro com IDs; o formulário sugere os nomes | Unitário com fetch simulado |
| 38 | Data de nascimento comparada com o dia em **São Paulo** no app e no banco (antes, depois das 21h, a data de amanhã passava) | Unitário (23h30 em SP) e banco |

A migration `20261112180000_ajustes_agendamento.sql` agora também recria `private.salvar_meus_dados` (item 38).

Resultados: lint ✅ · unitários 28/28 ✅ · banco 102 verificações ✅ · build ✅ · responsividade ✅.

**Supabase real (projeto clinicaflow):** conferido por leitura — aplicada até `agendamento_por_especialidade`;
15 usuários/pacientes, 0 consultas, 0 profissionais, 0 horários; todas as colunas usadas pelas migrations existem.
As migrations `20261112120000` e `20261112180000` **ainda não foram aplicadas** (a aplicação automática foi bloqueada
pela política de permissões do ambiente).
