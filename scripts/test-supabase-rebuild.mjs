import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('frontend e consulta CAEPI usam somente o projeto novo e chave pública',()=>{
  for(const p of ['js/config.js','api/caepi.js']) {
    assert.match(read(p),/jrzviiaywfjaawwkwgze/);
    assert.doesNotMatch(read(p),/aqnrjjllfzirrtwvjjbl|SUPABASE_SERVICE_ROLE_KEY/);
  }
  assert.doesNotMatch(read('api/caepi.js'),/Bearer.*SUPABASE_PUBLISHABLE_KEY/);
});
test('CAEPI sem agendamento, bloqueado por opt-in e sem execuções concorrentes',()=>{
  const workflow=read('.github/workflows/sync-caepi.yml');
  assert.doesNotMatch(workflow,/\bschedule:|\bcron:|aqnrjjllfzirrtwvjjbl/);
  assert.match(workflow,/vars\.CAEPI_SYNC_ENABLED == 'true'/);
  assert.match(workflow,/concurrency:/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/timeout-minutes: 20/);
});
test('sincronização testa banco antes do download e não conserva datasets arquivados',()=>{
  const sync=read('scripts/sync-caepi-to-supabase.mjs');
  const main=sync.slice(sync.indexOf('async function main()'));
  assert.ok(main.indexOf('activeHash()')<main.indexOf('await downloadPublicCaepi('));
  assert.match(read('supabase/caepi-versioned-cache.sql'),/delete from public\.caepi_datasets where status = 'archived'/);
  assert.doesNotMatch(read('supabase/caepi-versioned-cache.sql'),/security definer/i);
});
test('helpers privilegiados não ficam no schema público e autorizações não usam metadados editáveis',()=>{
  const sql=read('supabase/rebuild-app.sql');
  for(const header of sql.match(/create function public\.[\s\S]*?\$\$/gi)||[]) assert.doesNotMatch(header,/security definer/i);
  assert.match(sql,/revoke all on public\.usuarios_autorizados from public,anon,authenticated/);
  assert.match(sql,/grant execute on all functions in schema epi_private to authenticated/);
  assert.match(sql,/enable row level security/);
});
