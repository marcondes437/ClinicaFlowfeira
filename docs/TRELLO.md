# Integração com o Trello (opcional)

Não havia nenhuma integração com o Trello no projeto. Foi criada uma integração **opcional**:

- As tarefas são sempre salvas no ClinicaFlow (tabela `tarefas_internas`).
- Se as variáveis abaixo estiverem configuradas, cada tarefa também vira um cartão no Trello.
- Áreas: **Admin → Tarefas / Trello**, **Gestor → Tarefas / Trello** e **Recepção → Tarefas internas**.
- Categorias: tarefa administrativa, problema técnico e manutenção.
- Status: Aberta / Em andamento / Concluída, ligados às listas do quadro.
  - Mudar o status no ClinicaFlow move o cartão.
  - "Trazer status do Trello" atualiza o ClinicaFlow com a lista atual dos cartões (cartão arquivado = concluída).
  - "Reenviar pendentes" envia as tarefas que falharam (ex.: Trello fora do ar).
  - Se `TRELLO_LIST_EM_ANDAMENTO` ou `TRELLO_LIST_CONCLUIDA` não estiverem configuradas, mudar para
    esse status não move o cartão (a tela avisa) e "Trazer status do Trello" **não** desfaz o status
    local dessas tarefas — só um cartão arquivado as marca como concluídas.

## Segurança e LGPD

- As credenciais ficam **só no servidor** (variáveis sem `NEXT_PUBLIC_`). Elas vão no cabeçalho
  `Authorization`, nunca na URL, e não chegam ao navegador (conferido no build).
- O sistema **recusa** títulos/descrições com CPF, telefone ou e-mail (no app e, para CPF, também no banco).
- Não escreva nome de paciente nem dados de saúde nas tarefas.

## Como configurar

1. Entre em https://trello.com/power-ups/admin, crie um Power-Up (pode ser privado) e, na aba **API Key**,
   gere a chave → `TRELLO_API_KEY`.
2. Na mesma tela, clique no link para gerar um **Token** manualmente e autorize → `TRELLO_TOKEN`.
3. Abra o quadro no navegador e acrescente `.json` ao final da URL; o campo `"id"` do início é o
   `TRELLO_BOARD_ID` (ou use o código curto da URL, ex.: `AbCd1234`).
4. Configure `TRELLO_API_KEY`, `TRELLO_TOKEN`, `TRELLO_BOARD_ID` e reinicie o servidor.
   Em **Admin → Tarefas / Trello** aparecem as listas do quadro com os IDs.
5. Copie os IDs para:
   - `TRELLO_LIST_ABERTA` (obrigatória: onde os cartões novos entram)
   - `TRELLO_LIST_EM_ANDAMENTO` (opcional)
   - `TRELLO_LIST_CONCLUIDA` (opcional)
6. Reinicie o servidor (ou faça novo deploy na hospedagem, ex.: Vercel → Settings → Environment Variables).

## Responsáveis

O campo "Responsável" é texto livre e sempre vai na descrição do cartão. Para que o cartão também
seja **atribuído a um membro do Trello**, configure (opcional):

```
TRELLO_MEMBROS=TI=5f1a2b3c4d5e6f7a8b9c0d1e;Manutenção=60b2c3d4e5f6a7b8c9d0e1f2
```

- Formato: `nome do responsável=ID do membro`, separados por `;`.
- Os IDs aparecem em **Admin → Tarefas / Trello → Configuração do Trello** (lista "Membros do quadro").
- O formulário de nova tarefa sugere esses nomes; a comparação ignora maiúsculas e acentos.
- Use nomes de setores ou da equipe — nunca de pacientes.
