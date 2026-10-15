import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function connectionEnvironment(value) {
  if (!value || value !== value.trim()) throw new Error('Secret ausente ou com espaços nas extremidades.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Secret não contém uma URI PostgreSQL válida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== 'aws-1-sa-east-1.pooler.supabase.com'
      || url.port !== '5432'
      || url.username !== 'postgres.jrzviiaywfjaawwkwgze'
      || url.pathname !== '/postgres' || url.hash) {
    throw new Error('Destino diferente do Session Pooler do projeto novo (porta 5432).');
  }
  let password;
  try { password = decodeURIComponent(url.password); } catch { throw new Error('Codificação da senha inválida.'); }
  if (!password || /YOUR.?PASSWORD/i.test(password) || /[\r\n\0]/.test(password)) {
    throw new Error('Senha ausente, placeholder ou caractere de controle inválido.');
  }
  return {
    PATH: process.env.PATH,
    PGHOST: url.hostname, PGPORT: '5432', PGDATABASE: 'postgres',
    PGUSER: url.username, PGPASSWORD: password,
    PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15',
    PGAPPNAME: 'gestao-epi-readonly-connection-check',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=10000',
    LC_ALL: 'C',
  };
}

export function checkConnection(value, run = spawnSync) {
  const env = connectionEnvironment(value);
  const result = run('psql', ['-X', '-w', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1;'], {
    env, encoding: 'utf8', timeout: 25000, maxBuffer: 65536,
  });
  if (result.status !== 0) {
    // Never print raw libpq output: it may contain connection details.
    const error = result.stderr || '';
    const category = /password authentication failed|Wrong password/i.test(error) ? 'autenticação recusada: confira a senha no secret'
      : /Tenant or user not found/i.test(error) ? 'projeto ou usuário não encontrado no pooler'
      : /timeout|timed out/i.test(error) || result.error?.code === 'ETIMEDOUT' ? 'tempo limite de conexão'
      : /could not translate host|Name or service not known/i.test(error) ? 'falha de DNS'
      : result.error?.code === 'ENOENT' ? 'cliente psql não instalado'
      : 'conexão recusada ou indisponível';
    throw new Error(`Falha no teste: ${category}. Nenhum dado foi importado.`);
  }
  if (result.stdout.trim() !== '1') throw new Error('Resposta inesperada ao SELECT 1.');
  return 'Conexão TLS e autenticação confirmadas. SELECT 1 = 1. Nenhum dado alterado.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(checkConnection(process.env.CAEPI_DB_URL)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
