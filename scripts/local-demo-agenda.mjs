/** Synthetic availability for the offline academic demonstration only. */
const nomesDemo = {
  Cardiologia: 'Dra. Helena Duarte',
  'Clínica Geral': 'Dr. Lucas Almeida',
  Dermatologia: 'Dra. Camila Ribeiro',
  Enfermagem: 'Enf. Mariana Costa',
  Ginecologia: 'Dra. Beatriz Martins',
  Nutrição: 'Nutricionista Júlia Ferreira',
  Odontologia: 'Dr. André Carvalho',
  Ortopedia: 'Dr. Rafael Monteiro',
  Pediatria: 'Dra. Sofia Azevedo',
};

export async function prepararAgendaDemo(db) {
  await db.query('begin');
  try {
    await db.query('select pg_advisory_xact_lock(7692026)');
    await db.query(`create table if not exists private.local_demo_profissionais (
      especialidade_id uuid primary key references public.especialidades(id) on delete cascade,
      profissional_id uuid unique not null references public.profissionais(id) on delete cascade
    ); revoke all on private.local_demo_profissionais from public, anon, authenticated;`);
    const admin = (await db.query("select u.id from auth.users u join public.user_roles r on r.user_id=u.id where r.role='admin' order by u.email limit 1")).rows[0];
    const unidade = (await db.query("select id from public.unidades where status='ativo' order by nome limit 1")).rows[0];
    if (!admin || !unidade) throw new Error('A agenda de demonstração precisa de um administrador e uma unidade ativa.');
    const especialidades = (await db.query("select id,nome from public.especialidades where status='ativo' order by nome")).rows;
    let horarios = 0;
    for (const especialidade of especialidades) {
      const nomeDemo = nomesDemo[especialidade.nome] ?? `Profissional de ${especialidade.nome} (Demonstração)`;
      let profissional = (await db.query('select profissional_id as id from private.local_demo_profissionais where especialidade_id=$1', [especialidade.id])).rows[0];
      if (!profissional) {
        // Reuse only the explicitly seeded demo doctor, never an unrelated clinician.
        profissional = (await db.query("select p.id from public.profissionais p join auth.users u on u.id=p.user_id where u.email='medico@clinicaflow.local' and p.especialidade_id=$1 and p.status='ativo' limit 1", [especialidade.id])).rows[0];
        if (!profissional) profissional = (await db.query("insert into public.profissionais(nome,especialidade_id,unidade_id,descricao) values($1,$2,$3,'Cadastro fictício para apresentação acadêmica offline.') returning id", [nomeDemo, especialidade.id, unidade.id])).rows[0];
        await db.query('insert into private.local_demo_profissionais(especialidade_id,profissional_id) values($1,$2)', [especialidade.id, profissional.id]);
      }
      // Rename only the original synthetic placeholder; preserve names edited by the clinic.
      if (nomesDemo[especialidade.nome]) await db.query(
        `update public.profissionais set nome=$1,
          descricao=coalesce(nullif(descricao, ''), 'Cadastro fictício para apresentação acadêmica offline.')
        where id=$2 and (nome=$3 or (nome='Médico Demonstração' and user_id in (
          select id from auth.users where email='medico@clinicaflow.local'
        )))`,
        [nomeDemo, profissional.id, `Profissional de ${especialidade.nome} (Demonstração)`]
      );
      const ativo = (await db.query("select 1 from public.profissionais p join public.unidades u on u.id=p.unidade_id where p.id=$1 and p.status='ativo' and u.status='ativo' and p.especialidade_id=$2", [profissional.id, especialidade.id])).rowCount;
      if (!ativo) continue;
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: admin.id, role: 'authenticated' })]);
      // The existing RPC preserves reservations, exclusions and blocks, and ignores duplicates.
      const { rows } = await db.query(`select public.liberar_agenda(
        _profissional_id => $1,
        _data_inicio => (now() at time zone 'America/Sao_Paulo')::date + 1,
        _data_fim => (now() at time zone 'America/Sao_Paulo')::date + 30,
        _dias_semana => array[1,2,3,4,5],
        _hora_inicio => '08:00'::time, _hora_fim => '17:00'::time,
        _duracao_minutos => 30,
        _pausa_inicio => '12:00'::time, _pausa_fim => '13:00'::time
      ) as total`, [profissional.id]);
      horarios += Number(rows[0].total);
    }
    await db.query('commit');
    return { especialidades: especialidades.length, horarios };
  } catch (e) { await db.query('rollback'); throw e; }
}
