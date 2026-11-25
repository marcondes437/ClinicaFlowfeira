# Funções do dashboard administrativo

- **Planejamento:** selecione 7, 14 ou 30 dias. O período altera ocupação, disponibilidade, distribuição por especialidade, relatório e a aba de próximos atendimentos. Consultas de hoje, total de pacientes e faturamento acumulado mantêm seus próprios períodos, indicados nos cards.
- **Atualizar dados:** consulta novamente os dados no servidor. O horário exibido usa o fuso de São Paulo.
- **Exportar CSV:** gera os indicadores do período por especialidade: vagas disponíveis, reservadas e bloqueadas, consultas, cancelamentos, conclusões, faltas e ocupação. O arquivo utiliza ponto e vírgula e UTF-8. Não inclui nomes nem prontuários de pacientes.
- **Pendências:** acompanha tarefas abertas/em andamento, pacientes ativos com cadastro incompleto e profissionais ativos sem login. Os dois últimos cartões abrem as respectivas listas já filtradas, com opção para voltar à listagem completa.
- **Central de atendimentos:** alterna entre hoje e próximos dias, busca por paciente, médico ou especialidade e combina filtros de situação e unidade. A busca ignora acentos e maiúsculas. O botão de limpeza remove todos os filtros. As ações de situação, remarcação e ficha continuam disponíveis quando aplicáveis.
- **Limite da prévia:** os próximos atendimentos exibem no máximo 50 registros, com aviso quando o limite é atingido. A agenda completa permanece acessível.

## Verificação

`npm run check` valida TypeScript, testes unitários e build.

O teste de navegador está em `scripts/test-dashboard.cjs`. Ele requer `BASE_URL`, `TEST_ADMIN_EMAIL` e `TEST_ADMIN_PASSWORD`, com Chrome/Edge instalado (ou `CHROME_PATH`). Confere períodos, conteúdo do CSV, abas, filtros, limpeza, atualização, links das pendências e cinco larguras de tela. Não cria nem altera registros clínicos.

As ações de filtro com consultas existentes devem ser conferidas também em um ambiente de teste com agenda populada. Na revisão atual, o navegador confirmou estados vazios, filtros, limpeza e navegação com o banco conectado.
