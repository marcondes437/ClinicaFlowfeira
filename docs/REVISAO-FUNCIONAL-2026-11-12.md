# Revisão funcional — 12/11/2026

## Correções

- `/procurar-clinica`: substituída a interface sem ações por busca real das unidades ativas do Supabase, com filtros por nome, cidade/bairro, limpeza de filtros, resultados, contatos e localização. Busca ignora acentos e maiúsculas. Falhas do banco são informadas na tela.
- Recuperação de senha: o callback respeita `/nova-senha` antes de redirecionar por cargo ou cadastro incompleto. A nova senha usa a mesma regra do cadastro (8–72 caracteres, letras e números), informa carregamento e mostra confirmação no login.
- Sessão: redirecionamentos do middleware preservam cookies atualizados. A área médica sem sessão encaminha ao portal médico.
- Formulários: removidos os painéis flutuantes de autenticação e das áreas internas. No navegador de 800×600, o painel de serviços interceptava o clique no botão de login médico.
- Navegação: corrigida a orientação de agendamento na página inicial e configurado o ícone da aplicação.
- Banco: com autorização explícita, aplicadas as migrations existentes `20261112120000_revisao_agendamento_seguranca.sql` e `20261112180000_ajustes_agendamento.sql` no projeto Supabase ClinicaFlow. Antes, faltavam tabelas de tarefas/bloqueios e RPCs usadas pela interface.

## Evidências

- `npm run check`: TypeScript, 29 testes e build de produção aprovados.
- Navegador real: nove páginas públicas e busca filtrada em 360, 390, 768 e 1280 px; checagem de JavaScript, rolagem horizontal, rótulos e botões.
- Busca com o Supabase real: duas unidades retornadas; envio de filtro inexistente retorna zero; limpar filtros restaura a busca.
- Logins reais dos seis perfis: 21 rotas internas e duas fichas individuais abertas; tentativa de acessar área de outro cargo bloqueada para todos os perfis.
- Paciente no celular: primeiro login, preenchimento e gravação de dados sintéticos pelo formulário, seguido da liberação de `/paciente/agendar`.
- Banco com `role authenticated` e RLS: cadastro, resumo de vagas, agendamento, remarcação, cancelamento, devolução da vaga, prévia da recepção e listagem da agenda aprovados em transação revertida.
- Gravação/leitura de tarefas e evolução médica testadas no banco, em transação revertida. O envio desses dois formulários pelo navegador não foi executado; a revisão automática bloqueou gravações clínicas persistentes e foi usada a alternativa transacional.
- Não foram criadas vagas fictícias visíveis ao público. A consulta histórica sintética usada para abrir fichas foi removida.
- As seis contas temporárias, o profissional, pacientes, consulta histórica, dados sintéticos e arquivo local de senhas foram removidos ao concluir. Confirmado: zero contas temporárias restantes.

## Limites

O envio efetivo de e-mails, o login pelo Google, a IA paga e a sincronização externa com Trello dependem das configurações e serviços correspondentes e não foram validados ponta a ponta. A recuperação de senha tem teste de regressão do callback; não foi enviado e-mail real. As ações de agendar/remarcar/cancelar foram verificadas no banco, enquanto a abertura da tela e a conclusão do cadastro foram verificadas pelo navegador.

Os avisos de segurança preexistentes do Supabase sobre funções públicas SECURITY DEFINER e proteção contra senhas vazadas continuam fora desta revisão funcional. Referências: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable e https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Repetir verificações

```powershell
npm run check
npm run test:responsivo
```

`test:responsivo` inicia uma instância na porta 3100 ou usa `BASE_URL` para um servidor existente. O arquivo `verificacao-responsiva.log` registra a execução final com o Supabase real.

`scripts/test-internas.cjs` exige servidor em `BASE_URL` e `TEST_ACCOUNTS_FILE` apontando para JSON com objetos `{ role, email, password }` de contas de um ambiente de teste. `TEST_PATIENT_ID` habilita a conferência de ficha e prontuário individuais. Nenhuma senha é incluída neste relatório. As contas desta revisão foram excluídas.
