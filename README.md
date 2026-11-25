# ClinicaFlow — versão local

Sistema de gestão de clínicas com Next.js, React, TypeScript e PostgreSQL 17 local. Cadastro, login, pacientes, profissionais, agenda, consultas, prontuário, indicadores e tarefas funcionam sem internet após a preparação inicial.

## Usar neste computador

```powershell
npm run dev
```

Abra http://127.0.0.1:3000. O comando cria/atualiza o banco e inicia o sistema. Os dados ficam na pasta `.local` e permanecem salvos após encerrar. Não apague essa pasta.

Administrador: `admin@clinicaflow.local`, senha inicial `ClinicaLocal2026`, pelo Portal do paciente. Médico: `medico@clinicaflow.local`, mesma senha inicial, pelo Portal do médico. São contas de demonstração acadêmica.

## Apresentação offline

Prepare as dependências com internet antes de levar o projeto:

```powershell
npm ci
npm run db:setup
npm run build
npm start
```

Após preparar, basta `npm start` sem internet. Node.js 22 ou superior é necessário. Não é necessário instalar Docker, PostgreSQL separado ou configurar Supabase.

Veja o [guia completo do banco local](local/LEIA-ME.md) para todas as contas, liberação de horários, backup, redefinição de senha e transferência para outro computador.

## Verificar

```powershell
npm run lint
npm test
npm run test:local
npm run build
```

O teste local usa um banco separado e verifica permissões, agendamento, remarcação, cancelamento, concorrência, autenticação e acesso SQL. Não apaga os dados da aplicação.

## Integrações

A configuração remota do Supabase foi removida da aplicação. As migrations SQL originais permanecem em `supabase/migrations` como fonte da estrutura e das regras locais. Dados da nuvem não foram importados.

Google e envio de e-mail não fazem parte do modo local. A Clara tem respostas básicas offline. Mapas e WhatsApp são links externos opcionais. IA e Trello só são ativados com `ALLOW_ONLINE_INTEGRATIONS=true` e credenciais próprias.

A documentação anterior foi preservada em [docs/README-SUPABASE-ANTIGO.md](docs/README-SUPABASE-ANTIGO.md) como referência histórica.