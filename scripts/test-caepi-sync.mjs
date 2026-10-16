import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractGzip, parseDelimitedRecords, toIsoDate, buildCsv, estimateImportBudget, validateApprovedHash, postgresEnvironment } from './sync-caepi-to-supabase.mjs';

const header = ['NR Registro CA','DATA DE VALIDADE','SITUACAO','RAZAO SOCIAL','EQUIPAMENTO','DESCRICAO EQUIPAMENTO'];
const row = ['39707','29/10/2026','VÁLIDO','Fabricante Teste','MACACÃO','Descrição de teste'];
const csv = (rows) => Buffer.from('\uFEFF'+rows.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(';')).join('\r\n'));
async function build(rows, check) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'caepi-test-'));
  try {
    const file = path.join(dir,'out.csv');
    const result = await buildCsv(csv(rows),file,'11111111-1111-4111-8111-111111111111');
    await check(result,await fs.readFile(file,'utf8'));
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
}

test('GZIP preserva todos os bytes binários do trailer, inclusive whitespace',()=>{
  for (const size of [9,10,13,32,151030584]) {
    // O caso oficial tem último byte do ISIZE 0x09; os pequenos casos
    // cobrem esses mesmos bytes em outras posições do campo binário.
    const raw=Buffer.alloc(size,65);
    const gzip=gzipSync(raw);
    assert.deepEqual(extractGzip(Buffer.concat([gzip,Buffer.from('\r\n\r\n<!DOCTYPE html><html/>')])).buffer,raw);
  }
});
test('aceita GZIP puro e separadores conhecidos antes do HTML',()=>{
  const raw=Buffer.from('base válida');
  const gz=gzipSync(raw);
  assert.deepEqual(extractGzip(gz).buffer,raw);
  for (const sep of ['', '\n', '\r\n', '\r\n\r\n']) {
    assert.deepEqual(extractGzip(Buffer.concat([gz,Buffer.from(sep+'<!DOCTYPE html><html/>')])).buffer,raw);
  }
});
test('rejeita truncamento, CRC alterado e lixo não reconhecido',()=>{
  const gz=gzipSync(Buffer.from('base oficial'));
  const corrupt=Buffer.from(gz); corrupt[corrupt.length-8]^=1;
  for (const bad of [gz.subarray(0,-2),corrupt,Buffer.concat([gz,Buffer.from('LIXO')])]) assert.throws(()=>extractGzip(bad));
});
test('valida datas reais inclusive ano bissexto',()=>{
  assert.equal(toIsoDate('29/02/2024'),'2024-02-29');
  assert.equal(toIsoDate(''), '');
  for (const value of ['29/02/2026','31/04/2026','00/01/2026','abc']) assert.throws(()=>toIsoDate(value));
});
test('CSV preserva aspas, delimitador e quebra dentro de campos; rejeita aspas abertas',()=>{
  assert.deepEqual([...parseDelimitedRecords('a;"b;\nc";"d""e"\r\n',';')],[['a','b;\nc','d"e']]);
  assert.throws(()=>[...parseDelimitedRecords('a;"incompleto',';')]);
  assert.throws(()=>[...parseDelimitedRecords('a;"fechado"lixo',';')]);
  assert.throws(()=>[...parseDelimitedRecords('a;in"válido',';')]);
});
test('deduplica linhas idênticas sem eliminar registros diferentes do mesmo CA',async()=>{
  await build([header,row,row,[...row.slice(0,5),'Outra descrição']],async(result,out)=>{
    assert.equal(result.sourceRows,3); assert.equal(result.prepared,2);
    assert.equal(result.ignored,1); assert.equal(result.distinctCas,1);
    assert.equal([...parseDelimitedRecords(out,',')].length,3);
    assert.ok([...parseDelimitedRecords(out,',')].slice(1).every(r=>r[13]==='{}'));
  });
});
test('hash é estável mesmo com linhas em ordem diferente',async()=>{
  let hash;
  const other=['43840',...row.slice(1)];
  await build([header,row,other],r=>{hash=r.contentHash;});
  await build([header,other,row],r=>assert.equal(r.contentHash,hash));
});
test('aborta com coluna ausente, duplicada, largura errada, CA ou data inválida',async()=>{
  for (const rows of [
    [header.slice(1),row.slice(1)],
    [[...header,header[0]],[...row,row[0]]],
    [header,row.slice(1)],
    [header,['abc',...row.slice(1)]],
    [header,[row[0],'31/02/2026',...row.slice(2)]],
    [header,[...row.slice(0,5),'texto\u0000inválido']]
  ]) await assert.rejects(build(rows,()=>{}));
});
test('orçamento inclui base existente, índices e margem, sem prometer tamanho exato',()=>{
  const budget=estimateImportBudget(50_000_000,160_282_557,123917);
  assert.ok(budget.estimatedPeakBytes>50_000_000+160_282_557);
  assert.ok(estimateImportBudget(200_000_000,160_282_557,123917).estimatedPeakBytes>budget.limitBytes);
});
test('somente conteúdo com hash revisado pode entrar no banco',()=>{
  const approved='18218bbe9b9c78d27293d0709a0365ea6932dbcbf6b01878d03841c778ae0cd2';
  assert.doesNotThrow(()=>validateApprovedHash(approved,approved));
  assert.throws(()=>validateApprovedHash('a'.repeat(64),approved),/fonte oficial mudou/);
  for(const missing of [undefined,'', 'hash-invalido']) assert.throws(()=>validateApprovedHash(approved,missing),/não configurado/);
});
test('psql recebe host/porta/banco separados; senha não vai nos argumentos',()=>{
  const env=postgresEnvironment('postgresql://postgres.projeto:exemplo%40teste@aws-1-sa-east-1.pooler.supabase.com:5432/postgres');
  assert.equal(env.PGHOST,'aws-1-sa-east-1.pooler.supabase.com');
  assert.equal(env.PGPORT,'5432');
  assert.equal(env.PGUSER,'postgres.projeto');
  assert.equal(env.PGPASSWORD,'exemplo@teste');
  assert.equal(env.PGDATABASE,'postgres');
  assert.equal(env.PGSSLMODE,'require');
});
test('SQL mantém troca atômica, lock da carga, revalidação do hash e limite real',async()=>{
  const sql=await fs.readFile(new URL('../supabase/caepi-import.sql',import.meta.url),'utf8');
  assert.match(sql,/pg_try_advisory_lock/); assert.match(sql,/source_hash = :'source_hash'/);
  assert.match(sql,/pg_database_size\(current_database\(\)\) <= :'max_db_bytes'/);
  assert.ok(sql.indexOf('begin;')<sql.indexOf('\\copy'));
  assert.ok(sql.indexOf('caepi_activate_dataset')<sql.indexOf('commit;'));
});
test('CLI bloqueia carga sem liberação, destino antigo e arquivo local em modo import',()=>{
  const script=new URL('./sync-caepi-to-supabase.mjs',import.meta.url);
  const cases=[
    { SUPABASE_DB_URL:'', CAEPI_SYNC_ENABLED:'', expected:/liberação explícita/ },
    { SUPABASE_DB_URL:'postgresql://postgres:senha@db.aqnrjjllfzirrtwvjjbl.supabase.co:5432/postgres', CAEPI_SYNC_ENABLED:'true', expected:/projeto novo esperado/ },
    { SUPABASE_DB_URL:'postgresql://postgres:senha@db.jrzviiaywfjaawwkwgze.supabase.co:5432/postgres', CAEPI_SYNC_ENABLED:'true', CAEPI_ARCHIVE_PATH:'arquivo.bin', expected:/somente em validação/ },
    { SUPABASE_DB_URL:'postgresql://supabase_admin:senha@db.railway.internal:5432/postgres', CAEPI_SYNC_ENABLED:'true', expected:/projeto novo esperado/ },
    { SUPABASE_DB_URL:'postgresql://postgres:senha@outro.railway.internal:5432/postgres', CAEPI_SYNC_ENABLED:'true', expected:/projeto novo esperado/ },
    { SUPABASE_DB_URL:'postgresql://postgres:senha@db.railway.internal:5432/postgres', CAEPI_SYNC_ENABLED:'true', CAEPI_ARCHIVE_PATH:'arquivo.bin', expected:/somente em validação/ }
  ];
  for (const {expected,...config} of cases) {
    const result=spawnSync(process.execPath,[script.pathname.replace(/^\/([A-Z]:)/i,'$1')],{
      env:{...process.env,CAEPI_DRY_RUN:'0',CAEPI_ARCHIVE_PATH:'',...config},encoding:'utf8',timeout:10000
    });
    assert.equal(result.status,1);
    assert.match(result.stderr,expected);
    assert.doesNotMatch(result.stderr,/postgresql:\/\/|senha/);
  }
});
test('workflow valida por padrão sem credencial e isola a credencial das execuções antigas',async()=>{
  const workflow=await fs.readFile(new URL('../.github/workflows/sync-caepi.yml',import.meta.url),'utf8');
  assert.match(workflow,/default: validate/);
  assert.match(workflow,/inputs\.mode == 'import' && secrets\.CAEPI_DB_URL/);
  assert.doesNotMatch(workflow,/secrets\.SUPABASE_DB_URL/);
  assert.match(workflow,/--frozen-lockfile/);
  assert.match(workflow,/contents: read/);
});
