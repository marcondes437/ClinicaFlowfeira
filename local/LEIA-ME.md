# Banco local do ClinicaFlow

O sistema usa PostgreSQL 17 no próprio computador, sem Docker, conta no Supabase ou serviço na nuvem. O aplicativo inicia o banco automaticamente. As bibliotecas e os binários precisam ser instalados uma vez enquanto houver internet; depois disso o funcionamento principal é offline.

## Abrir o sistema

Na pasta do projeto:

```powershell
npm run dev
```

Abra http://127.0.0.1:3000. Mantenha o terminal aberto. Ctrl+C encerra o sistema. Os dados continuam salvos ao abrir novamente.

Para apresentar usando o build de produção:

```powershell
npm run build
npm start
```

O build também funciona offline depois de instalar as dependências. Não há fontes ou recursos obrigatórios baixados durante o build.

## Contas de demonstração

A senha inicial de todas as contas abaixo é `ClinicaLocal2026`:

- `admin@clinicaflow.local`: administrador, entra pelo Portal do paciente.
- `gestor@clinicaflow.local`: gestor, entra pelo Portal do paciente.
- `recepcionista@clinicaflow.local`: recepção, entra pelo Portal do paciente.
- `enfermeiro@clinicaflow.local`: enfermagem, entra pelo Portal do paciente.
- `medico@clinicaflow.local`: médico, entra pelo Portal do médico.
- `paciente@clinicaflow.local`: paciente, entra pelo Portal do paciente.

São contas acadêmicas com dados de demonstração. Cadastros feitos pela tela pública sempre recebem o cargo paciente. Os usuários da equipe e o vínculo do médico são preparados na criação inicial do banco. A rotina não redefine senhas nem recria contas existentes em cada abertura.

## Preparar a apresentação

1. Entre como administrador e confira especialidades, unidades e profissionais.
2. A inicialização prepara profissionais fictícios e vagas para todas as especialidades ativas, nos dias úteis dos próximos 30 dias (segunda a sexta, 8h–17h, com intervalo 12h–13h). A janela cobre os próximos 30 dias corridos e é renovada a cada início, sem duplicar vagas nem alterar consultas existentes. Você também pode liberar horários manualmente em Agenda e consultas.
3. Cadastre um paciente ou entre na conta de demonstração.
4. Complete celular, data de nascimento e CPF válido nos Meus dados. Use somente dados sintéticos na apresentação.
5. Agende por especialidade, consulte o painel e teste remarcar/cancelar.

Nenhum dado do Supabase remoto foi importado. Este é um banco novo, separado, com as tabelas e regras do projeto e dados iniciais de demonstração.

A agenda automática é exclusiva da demonstração acadêmica. Para desativar a criação de novas vagas, adicione `"demoAgenda": false` em `.local/database.json`. Isso mantém os profissionais, as vagas e as consultas já existentes; novas agendas passam a ser liberadas manualmente pela equipe. Profissionais inativados e bloqueios são respeitados.

## Onde ficam os dados

- `.local/postgres/`: arquivos persistentes do PostgreSQL.
- `.local/database.json`: conexão e senha gerada para o banco; somente o servidor lê esse arquivo.
- `local/bootstrap.sql`: compatibilidade dos cargos e funções de identidade usadas nas políticas SQL existentes.
- `local/auth.sql`: credenciais e sessões locais.
- `supabase/migrations/`: estrutura, regras e dados iniciais reaproveitados do projeto original. O nome histórico da pasta não implica acesso ao serviço remoto.

Não apague `.local` para atualizar o código: é onde o banco fica. O servidor web escuta em `127.0.0.1:3000`; o PostgreSQL em `127.0.0.1:55432`. O navegador não recebe a senha do banco. Senhas dos usuários usam scrypt com salt individual, e as sessões usam cookies HttpOnly e tokens aleatórios armazenados como hash. As consultas continuam sujeitas às políticas de acesso do PostgreSQL.

## Backup

Encerre o sistema com Ctrl+C. Depois execute:

```powershell
npm run db:backup
```

A cópia completa de `.local` é salva numa pasta com data em `backups/`, incluindo configuração e credenciais. Guarde em lugar privado. A restauração física exige a mesma versão do PostgreSQL e a mesma plataforma/arquitetura. Para restaurar, mantenha o sistema fechado, preserve a pasta `.local` atual e copie o conteúdo do backup para uma nova pasta `.local`. Para uma cópia completa do ambiente no mesmo Windows/arquitetura, encerre o sistema e copie toda a pasta, incluindo `.local` e `node_modules`. Não copie os arquivos de `.local/postgres` enquanto o banco estiver rodando.

## Redefinir uma senha esquecida

Com o sistema aberto, execute em outro terminal:

```powershell
npm run db:senha
```

Informe e-mail e nova senha quando solicitado. As sessões antigas são revogadas. Esta é uma operação local do responsável pelo computador; não há envio de e-mail.

## Testes

```powershell
npm run lint
npm test
npm run test:local
npm run build
```

`test:local` cria/recria somente `clinicaflow_offline_test`, executa as migrations, testes SQL, concorrência e o adaptador de acesso local. Não apaga o banco usado pela aplicação. Não execute dois `test:local` simultaneamente.

O teste `scripts/test-offline.cjs` usa Chrome/Edge instalado e o sistema aberto em `BASE_URL` (padrão http://127.0.0.1:3000); bloqueia requisições externas e verifica cadastro, login, gravação de dados, agendamento, remarcação e cancelamento. Cria registros sintéticos e remove os registros desse teste ao terminar.

## Outro computador sem internet

Prepare antes em um computador com internet e com o mesmo sistema/arquitetura de destino:

```powershell
npm ci
npm run db:setup
npm run build
```

Leve a pasta completa, incluindo os arquivos ocultos `.local`, `.next` e `node_modules`. É necessário Node.js 22 ou superior instalado no destino. No destino, execute `npm start`. Não rode `npm ci` sem internet: esse comando pode precisar baixar pacotes e recria `node_modules`. Para outra plataforma, prepare as dependências e o PostgreSQL naquela plataforma e transfira os dados com backup/restore.

## Recursos com internet

No painel do paciente, consultas futuras podem ser baixadas em um arquivo `.ics` pelo botão **Adicionar ao calendário**. O arquivo é gerado localmente; abra-o no aplicativo de calendário de sua preferência. A lista **Tudo pronto para ir?** permite conferir os itens para a visita e mantém a seleção somente enquanto a página estiver aberta.

Google Login foi removido do fluxo local; recuperação por e-mail está indisponível. A Clara responde localmente em modo básico. Tarefas ficam no banco local. Mapas e WhatsApp são links externos opcionais e exigem conexão quando abertos. Imagens e demais recursos carregados automaticamente são locais.

OpenAI e Trello só podem ser ativados explicitamente com `ALLOW_ONLINE_INTEGRATIONS=true` e suas respectivas credenciais. Isso não é necessário para usar ou apresentar o sistema.

Referência do PostgreSQL embarcado: https://github.com/leinelissen/embedded-postgres.

## Apresenta??o autom?tica para a feira

Com o site aberto, acesse http://127.0.0.1:3000/apresentacao ou use o atalho **Modo feira** na p?gina inicial. Clique em **Come?ar apresenta??o** e, se quiser, em **Tela cheia**. O ciclo padr?o dura 4 minutos e 30 segundos; tamb?m h? op??es de 4 ou 5 minutos. Ele recome?a sozinho ao terminar.

Use **Pausar**, **Reiniciar**, os bot?es de etapa ou as setas do teclado. A tecla Espa?o pausa e continua. O tempo para quando a aba fica oculta. A narra??o opcional usa somente uma voz local em portugu?s, quando instalada e dispon?vel no navegador; as legendas e o roteiro funcionam sem voz e sem internet.

As imagens s?o capturas reais em `public/apresentacao/`, com dados fict?cios. A exibi??o n?o consulta contas nem grava agendamentos. Para atualizar as capturas depois de mudar o visual, com o site rodando execute `npm run demo:capturar`. Esse comando cria uma conta, profissional e consultas fict?cias tempor?rias, captura as telas e remove esses registros ao final. Em seguida, gere um novo build.
