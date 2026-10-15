import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionEnvironment, checkConnection } from './check-db-connection.mjs';

const uri = 'postgresql://postgres.jrzviiaywfjaawwkwgze:fake%40password@aws-1-sa-east-1.pooler.supabase.com:5432/postgres';
test('destino restrito, TLS e sessão somente leitura', () => {
  const env = connectionEnvironment(uri);
  assert.equal(env.PGPASSWORD, 'fake@password');
  assert.equal(env.PGDATABASE, 'postgres');
  assert.equal(env.PGSSLMODE, 'require');
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  for (const invalid of ['', ' '+uri, uri.replace(':5432', ':6543'), uri.replace('jrzviiaywfjaawwkwgze', 'oldproject'), uri.replace('fake%40password', '[YOUR-PASSWORD]')]) {
    assert.throws(() => connectionEnvironment(invalid));
  }
});
test('apenas SELECT 1; senha não vai nos argumentos', () => {
  assert.match(checkConnection(uri, (command, args, options) => {
    assert.equal(command, 'psql');
    assert.equal(args.at(-1), 'SELECT 1;');
    assert.ok(!args.join(' ').includes('password'));
    assert.equal(options.env.PGPASSWORD, 'fake@password');
    return { status: 0, stdout: '1\n' };
  }), /confirmadas/);
});
test('falha não expõe stderr nem senha', () => {
  assert.throws(() => checkConnection(uri, () => ({status: 2, stderr: 'password authentication failed fake@password'})), error => {
    assert.match(error.message, /autenticação recusada/);
    assert.ok(!error.message.includes('fake@password'));
    return true;
  });
});
