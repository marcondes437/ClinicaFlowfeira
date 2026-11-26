export const slides = [
  {
    label: 'Conheça o projeto', title: 'Um só lugar para cuidar de toda a jornada.', image: 'inicio',
    description: 'ClínicaFlow conecta quem precisa de atendimento com quem organiza a clínica.',
    points: ['Site com serviços e especialidades', 'Portal próprio para o paciente', 'Áreas de trabalho para a equipe'],
    narration: 'Bem-vindos ao ClínicaFlow. Nosso projeto reúne em um único sistema o site da clínica, o portal do paciente e as áreas de trabalho da equipe. A proposta é acompanhar a jornada completa: encontrar uma especialidade, escolher um atendimento, organizar a agenda e consultar o histórico. Nesta apresentação, vamos percorrer as telas reais do projeto com dados fictícios, sem alterar nenhum cadastro durante a exibição.',
  },
  {
    label: 'O espaço do paciente', title: 'O próximo atendimento, sempre à mão.', image: 'painel',
    description: 'O painel reúne a agenda, o histórico e os atalhos para os dados do paciente.',
    points: ['Próximas consultas em destaque', 'Histórico de atendimentos', 'Acesso aos dados cadastrais'],
    narration: 'Depois de entrar em sua conta, o paciente encontra um painel feito para facilitar as tarefas mais frequentes. Ele pode acompanhar suas próximas consultas, abrir o histórico e atualizar os dados de contato. Os atalhos ajudam a localizar cada função sem depender da recepção para toda consulta de informação. O painel usa os registros do banco local, e cada paciente acessa os dados vinculados à própria conta.',
  },
  {
    label: 'Preferências de atendimento', title: 'A consulta começa com uma escolha simples.', image: 'preferencias',
    description: 'A busca permite indicar especialidade, unidade, profissional, data e período.',
    points: ['Busca por especialidade', 'Profissionais da área escolhida', 'Calendário para definir a data inicial'],
    narration: 'Para agendar, o paciente começa escolhendo a especialidade. Em seguida, pode informar a unidade e o profissional de preferência, além de uma data inicial e do período mais conveniente. Essas preferências são opcionais: deixá-las em aberto permite buscar mais opções. A lista de profissionais acompanha a especialidade e a unidade selecionadas. No calendário, datas passadas ficam bloqueadas e o paciente pode navegar pelos próximos meses.',
  },
  {
    label: 'Opções disponíveis', title: 'Compare os horários antes de decidir.', image: 'horarios',
    description: 'A pesquisa apresenta atendimentos com data, endereço, profissional e duração.',
    points: ['Horários da agenda disponível', 'Unidade e endereço visíveis', 'Escolha do horário exato'],
    narration: 'A pesquisa consulta a agenda e apresenta as opções disponíveis. Cada cartão identifica a data, a unidade, o endereço e o profissional, junto com a duração prevista do atendimento. O paciente escolhe um horário específico, em vez de receber uma reserva automática sem revisão. Caso as opções não sejam convenientes, o botão alterar pesquisa permite voltar às preferências e consultar outras datas ou períodos.',
  },
  {
    label: 'Revisão da consulta', title: 'Todos os detalhes antes de confirmar.', image: 'revisao',
    description: 'A escolha aparece em um resumo claro antes da reserva.',
    points: ['Data, horário e profissional', 'Unidade e duração previstas', 'Motivo da consulta opcional'],
    narration: 'Escolher um horário ainda não cria uma consulta. Primeiro, o sistema apresenta uma revisão com a especialidade, o profissional, a unidade e a hora escolhida. O paciente também pode informar o motivo da consulta. A reserva só acontece ao confirmar o agendamento. Nesse momento, o banco verifica novamente a disponibilidade, para que uma vaga ocupada por outra pessoa não seja reservada duas vezes.',
  },
  {
    label: 'Agendamento confirmado', title: 'Uma reserva registrada, com confirmação.', image: 'confirmacao',
    description: 'A confirmação mostra o atendimento que foi salvo no banco local.',
    points: ['Detalhes da consulta confirmada', 'Acesso ao painel do paciente', 'Possibilidade de agendar outra especialidade'],
    narration: 'Depois da confirmação, a consulta fica registrada e seus detalhes aparecem na tela. O paciente pode voltar ao painel para acompanhar o atendimento. O sistema também oferece remarcação e cancelamento dentro das regras da agenda. Na remarcação, a consulta anterior só é cancelada depois que a nova reserva está garantida. Assim, uma tentativa sem vaga disponível não faz o paciente perder o atendimento que já tinha.',
  },
  {
    label: 'Organização da equipe', title: 'A agenda também chega a quem atende.', image: 'equipe',
    description: 'A equipe acompanha as consultas e organiza o atendimento em sua área de trabalho.',
    points: ['Agenda com filtros de consulta', 'Status dos atendimentos', 'Acesso conforme a função da equipe'],
    narration: 'Do outro lado, a equipe encontra uma área de trabalho para acompanhar as consultas. Os filtros ajudam a localizar atendimentos por data, profissional, especialidade e unidade. O sistema possui áreas para administração, gestão, recepção, médicos e enfermagem, com permissões de acordo com a função. A tela mostrada foi capturada com uma consulta fictícia isolada para esta apresentação, sem expor cadastros de outros pacientes.',
  },
  {
    label: 'Continuidade do cuidado', title: 'O atendimento fica no histórico.', image: 'historico',
    description: 'O paciente acompanha os registros e as situações de suas consultas.',
    points: ['Histórico organizado por atendimento', 'Situação de cada consulta', 'Informações concentradas no portal'],
    narration: 'O acompanhamento continua depois do agendamento. O histórico reúne os registros das consultas e ajuda o paciente a identificar atendimentos anteriores e suas situações. A proposta é manter as informações organizadas ao longo da jornada, desde a primeira busca até o acompanhamento posterior. Os exemplos desta apresentação usam uma paciente fictícia, e a exibição automática mostra apenas capturas: nenhuma ação é executada nas contas de quem está usando o sistema.',
  },
  {
    label: 'Funcionamento local', title: 'Preparado para funcionar sem internet.', image: 'painel',
    description: 'O site e o PostgreSQL rodam no computador da apresentação.',
    points: ['Banco PostgreSQL local', 'Fluxos principais disponíveis offline', 'Esta apresentação também funciona offline'],
    narration: 'Para a feira, o ClínicaFlow funciona com o site e o banco PostgreSQL no próprio computador. Os fluxos principais podem ser utilizados sem internet depois da instalação inicial. Isso inclui o acesso local, o cadastro, o agendamento e o acompanhamento das consultas. Recursos que dependem de serviços externos não fazem parte dessa operação offline. A apresentação automática também utiliza arquivos locais e pode repetir o percurso para novos visitantes.',
  },
  {
    label: 'Conheça de perto', title: 'Agora é a sua vez de conhecer o ClínicaFlow.', image: 'inicio',
    description: 'Nossa equipe está aqui para mostrar o sistema e responder suas perguntas.',
    points: ['Veja os fluxos funcionando', 'Explore o portal do paciente', 'Conheça a organização da clínica'],
    narration: 'Esse foi o percurso pelo ClínicaFlow: um site para apresentar os serviços, um portal para organizar a jornada do paciente e áreas de trabalho para acompanhar a rotina da clínica. Se quiser conhecer uma função com mais detalhes, nossa equipe pode pausar a apresentação e abrir o sistema. Obrigado pela visita. Em instantes, a apresentação recomeça automaticamente para que o próximo grupo também conheça o projeto.',
  },
] as const;
