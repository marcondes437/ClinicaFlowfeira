# ClinicaFlow

Plataforma de gestão para clínicas de saúde.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · CSS Modules / CSS tradicional · Supabase (Banco de dados, Auth, RLS)

---

## 1. Pré-requisitos

- Node.js 18.18 ou superior
- Uma conta gratuita no [Supabase](https://supabase.com)

## 2. Criar o projeto no Supabase

1. Acesse https://supabase.com e crie um novo projeto.
2. No painel, abra **SQL Editor**.
3. Execute, em ordem, os arquivos de `supabase/migrations/`.
   Eles criam tabelas, agenda médica, atribuição automática, funções, políticas de RLS,
   o gatilho de cadastro e os dados iniciais.
4. Em **Project Settings → API**, copie a `Project URL` e a chave `Publishable`.

## 3. Configurar as variáveis de ambiente

Crie um arquivo `.env.local` na raiz do projeto (use `.env.example` como base):

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave-publicavel
```

## 4. Instalar e rodar

```bash
npm install
npm run dev
```

Acesse **http://localhost:3000**.

Para produção:

```bash
npm run build
npm run start
```

## 5. Criar o primeiro administrador

Todo cadastro feito pela tela pública nasce com o cargo **paciente** (regra de segurança).
Para promover um usuário a administrador, cadastre-se normalmente em `/cadastro` e depois
execute no **SQL Editor** do Supabase:

```sql
update public.user_roles
set role = 'admin'
where user_id = (select id from auth.users where email = 'seu@email.com');
```

Faça logout e login novamente para entrar na área `/admin`.

## 6. Vincular usuários a profissionais

Para que um médico ou enfermeiro veja a própria agenda, o registro em `public.profissionais`
precisa ter o campo `user_id` preenchido com o id do usuário em `auth.users`:

```sql
update public.profissionais
set user_id = (select id from auth.users where email = 'medico@email.com')
where nome = 'Nome do Profissional';
```

## 7. Estrutura

```
src/
  app/
    page.tsx                landing page pública (dados reais do banco)
    login/ cadastro/ recuperar-senha/ nova-senha/
    admin/                  dashboard, pacientes, profissionais, especialidades, unidades, agenda
    gestor/                 indicadores e agenda geral
    medico/                 agenda própria, pacientes e prontuário
    enfermagem/             atendimentos do dia
    recepcao/               painel do dia, pacientes e agendamentos
    paciente/               painel, agendamento e histórico
  components/               AppShell, painéis, tabelas e formulários
  lib/
    supabase/               clientes browser, server e middleware de sessão
    actions.ts              server actions (escrita no banco)
    queries.ts              indicadores e listagens
    roles.ts nav.ts auth.ts controle de acesso por cargo
  middleware.ts             proteção de rotas por cargo
supabase/migrations/        schema + RLS + seed
```

## 8. Cargos

`admin`, `gestor`, `medico`, `enfermeiro`, `recepcionista`, `paciente`.

Cada cargo é redirecionado automaticamente para sua área após o login, e o middleware
bloqueia o acesso a áreas de outros cargos. Todas as regras também são aplicadas no
banco por Row Level Security.

## 9. Fluxo de agendamento (por especialidade)

O paciente **não escolhe o médico nem o horário exato**. A consulta é marcada de acordo
com a agenda disponível dos médicos:

1. O administrador cadastra o profissional com especialidade e unidade.
2. Em `/admin/agenda` (ou o próprio médico em `/medico`), a agenda é liberada em bloco:
   período de datas, dias da semana, faixa de horário e duração de cada consulta.
3. O paciente escolhe só a **especialidade**. Se quiser, indica preferências opcionais:
   unidade, período (manhã/tarde/noite) e "a partir de" uma data.
4. O banco (`agendar_por_especialidade`) reserva, numa transação, o **primeiro horário livre**
   da agenda dos médicos daquela especialidade. Em empate de horário, vai para o médico
   com menos consultas no dia.
5. Só depois de marcada a consulta o paciente vê **data, hora, unidade e o nome do médico**.

Regras garantidas pelo banco:

- o navegador nunca recebe o `profissional_id` da agenda antes da reserva;
- pacientes não inserem consultas diretamente (RLS) — só pela função;
- uma consulta futura por especialidade (para trocar, use **Remarcar**);
- o paciente não fica com duas consultas no mesmo horário;
- antecedência mínima de 1 hora;
- **Remarcar** reserva a nova vaga primeiro e só então cancela a antiga; a nova vaga nunca se
  sobrepõe à consulta atual. O paciente remarca pelo painel/histórico; a recepção e o admin, pelo
  botão "Remarcar" das listas de consultas (`/recepcao/agenda` e `/admin/agenda`);
- **Cancelar** (paciente, recepção ou admin) devolve o horário para a agenda;
- consulta cancelada não pode ser reativada (a vaga pode já ter outro paciente).

## 10. Cadastro em duas etapas

1. **Cadastro** (`/cadastro`): só nome, e-mail e senha (ou Google).
2. **Primeiro login**: o paciente é levado a `/paciente/meus-dados` para informar celular,
   data de nascimento e CPF (obrigatórios) e, se quiser, CEP, cidade/UF e contato de
   emergência. Esses dados são salvos de uma vez pela função `salvar_meus_dados`.
3. Sem esses dados o agendamento não é liberado. Depois o paciente pode editá-los
   em **Meus dados**.

CPF e endereço ficam em `pacientes_dados_sensiveis` (LGPD): só o próprio paciente e a
equipe clínica (médico, enfermagem, recepção) conseguem ler.

## 11. Revisão de novembro/2026

Veja `docs/ENTREGA-2026-11.md` (erros corrigidos, migration, testes e pendências) e
`docs/TRELLO.md` (integração opcional com o Trello).

Testes:

```bash
npm run lint             # TypeScript
npm test                 # unitários (validações, fuso, Trello simulado, menu, Clara)
npm run test:db          # regras do banco num PostgreSQL de TESTE, inclui concorrência real
npm run build
npm run test:responsivo  # depois do build: páginas públicas em 360/390/768/1280 px num Chrome/Edge local
```

- `test:db` não precisa de `psql` (usa o pacote `pg`). Precisa de um PostgreSQL 15+ com
  `btree_gist` e das variáveis `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` (superusuário).
  Ele **apaga e recria** o banco `clinicaflow_test` (ou `TEST_DB`): nunca aponte para o Supabase.
- `test:responsivo` usa o Chrome/Edge instalado (ou `CHROME_PATH`) e sobe `next start` na porta 3100
  (ou usa `BASE_URL`). As áreas logadas não são abertas: exigem Supabase com usuários reais.

## 12. Atualizando um banco existente

Execute no SQL Editor, nesta ordem, as migrations que ainda não rodaram:

1. `20261027120000_agendamento_por_especialidade.sql`
2. `20261112120000_revisao_agendamento_seguranca.sql` — segura para rodar sobre as anteriores; também
   corrige as permissões das funções usadas pelo RLS (`is_staff`, `is_admin_gestor`...), cuja
   revogação impedia usuários logados de ler pacientes e consultas.
3. `20261112180000_ajustes_agendamento.sql` — destrava a remarcação, libera a prévia da recepção
   antes de escolher o paciente e grava os CPFs antigos só com dígitos. Pode ser executada de novo sem erro.

## Assistente virtual

O botão flutuante Clara aparece nas páginas públicas. Sem configuração de IA, funciona em modo de demonstração com respostas básicas, identificado na interface.

Para ativar respostas por IA, configure `OPENAI_API_KEY` e, opcionalmente, `OPENAI_MODEL` em `.env.local` (ou nas variáveis do servidor) e reinicie o Next.js. Use um modelo compatível com a Responses API disponível na sua conta. Nunca use o prefixo `NEXT_PUBLIC_` para a chave.

A integração usa a [Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create), com `store: false`. A conversa fica no estado da página, sem gravação no banco ou localStorage. Quando a IA está ativa, o histórico recente é enviado à OpenAI. O assistente orienta sobre navegação e serviços; não acessa dados de pacientes nem realiza agendamentos. A base de orientações fica em `src/lib/assistant.ts`.

O endpoint limita o tamanho do histórico e aplica um limite global de 30 requisições por minuto por processo. Para publicar com múltiplas instâncias, aplique também limitação distribuída no gateway e limites de gastos do provedor. O limite em memória reinicia com o servidor.

### Configuração da Clara

A Clara agora está integrada ao layout público, com respostas em streaming, links internos clicáveis, cópia de respostas, interrupção e nova conversa. O botão fica separado do menu de serviços, inclusive no celular.

Configure no servidor:

```dotenv
OPENAI_API_KEY=sua-chave-secreta
OPENAI_MODEL=gpt-6-astra
```

`OPENAI_MODEL` é opcional: o padrão é `gpt-6-astra`. O modelo precisa estar disponível na conta da API, com faturamento habilitado. Para alterar custo e latência, escolha outro modelo compatível com a Responses API. A chave nunca é enviada ao navegador. Reinicie o servidor após configurar as variáveis; em produção, gere um novo build para atualizar também o indicador inicial de IA.

Sem chave, a interface identifica o modo de demonstração. Com chave inválida ou provedor indisponível, apresenta um erro e permite reenviar a pergunta. Respostas interrompidas são identificadas. Interromper cancela a requisição em andamento, mas o provedor pode cobrar tokens já processados.

A conversa permanece apenas na memória da página. A Clara usa os últimos dez itens (até 1.200 caracteres por item), não consulta prontuários e não executa agendamentos. A API aceita até 64 KB por requisição e mantém o limite global por processo descrito acima.

Referências: [modelo GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) e [streaming da Responses API](https://developers.openai.com/api/docs/guides/streaming-responses).
