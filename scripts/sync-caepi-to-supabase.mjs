import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ftp = require('basic-ftp');
const unrar = require('node-unrar-js');
const yauzl = require('yauzl');

const GOV_URL = 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/equipamentos-de-protecao-individual-epi/tgg_export_caepi.zip/@@download/file';
const FTP_HOST = 'ftp.mtps.gov.br';
const FTP_REMOTE = '/portal/fiscalizacao/seguranca-e-saude-no-trabalho/caepi/tgg_export_caepi.zip';

const MIN_ARCHIVE_BYTES = 1 * 1024 * 1024;
const MIN_TXT_BYTES = 50 * 1024 * 1024;
const MIN_ROWS = 80000;
const MIN_DISTINCT_CA = 25000;

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  throw new Error('SUPABASE_DB_URL não configurada.');
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const onlyDigits = (value) => String(value || '').replace(/\D+/g, '');
const clean = (value) => String(value ?? '').replace(/^\uFEFF/, '').trim();

function normalizeKey(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toIsoDate(value) {
  const v = clean(value);
  if (!v) return '';
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function* parsePipeRecords(text) {
  // O TXT oficial do CAEPI possui aspas soltas/sem fechamento em diversos registros.
  // Por isso as aspas não podem controlar multiline/quoting: cada linha física é um registro.
  // Essa é a mesma estratégia indicada pelas implementações estáveis que tratam esse dataset.
  const sanitized = text.replace(/"/g, '');

  for (const physicalLine of sanitized.split(/\r?\n/)) {
    const line = physicalLine.replace(/\r$/, '');
    if (!line.trim()) continue;
    yield line.split('|');
  }
}

function pick(obj, aliases) {
  for (const alias of aliases) {
    if (obj[alias] != null && clean(obj[alias]) !== '') return clean(obj[alias]);
  }
  return '';
}

function detectArchiveFormat(buffer) {
  const head8 = buffer.subarray(0, 8);
  if (head8.subarray(0, 4).toString('ascii') === 'Rar!') return 'rar';
  if (head8.subarray(0, 2).toString('ascii') === 'PK') return 'zip';
  return 'unknown';
}

async function extractRar(buffer) {
  const arr = Uint8Array.from(buffer);
  const data = arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
  const extractor = await unrar.createExtractorFromData({ data });
  const list = extractor.getFileList();
  const headers = [...list.fileHeaders]
    .filter((h) => !h.flags?.directory && /\.txt$/i.test(h.name || ''))
    .sort((a, b) => Number(b.unpSize || 0) - Number(a.unpSize || 0));

  if (!headers.length) throw new Error('Nenhum TXT encontrado no RAR.');

  const target = headers[0];
  const extracted = extractor.extract({ files: [target.name] });
  const files = [...extracted.files];
  const found = files.find((f) => f.fileHeader?.name === target.name) || files[0];

  if (!found?.extraction) throw new Error('Falha ao extrair TXT do RAR.');
  return { fileName: target.name, buffer: Buffer.from(found.extraction) };
}

function extractZip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      let resolved = false;

      zipfile.on('error', reject);
      zipfile.on('end', () => {
        if (!resolved) reject(new Error('Nenhum TXT encontrado no ZIP.'));
      });

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName) || !/\.txt$/i.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            resolved = true;
            resolve({ fileName: entry.fileName, buffer: Buffer.concat(chunks) });
            try { zipfile.close(); } catch {}
          });
        });
      });
    });
  });
}

async function extractTxt(archiveBuffer) {
  const format = detectArchiveFormat(archiveBuffer);
  if (format === 'rar') return { format, ...(await extractRar(archiveBuffer)) };
  if (format === 'zip') return { format, ...(await extractZip(archiveBuffer)) };
  throw new Error('Formato compactado desconhecido; atualização interrompida.');
}

async function downloadGovBr(archivePath) {
  const response = await fetch(GOV_URL, {
    redirect: 'follow',
    headers: { 'user-agent': 'Gestao-EPI-CAEPI-Sync/1.0' }
  });

  if (!response.ok) {
    throw new Error(`gov.br respondeu HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < MIN_ARCHIVE_BYTES) {
    throw new Error(`arquivo gov.br abaixo de 1 MB (${buffer.length} bytes)`);
  }

  await fsp.writeFile(archivePath, buffer);
  return {
    buffer,
    sourceUrl: GOV_URL,
    sourceBase: 'govbr'
  };
}

async function downloadFtp(archivePath) {
  const client = new ftp.Client(60000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: FTP_HOST,
      user: 'anonymous',
      password: 'anonymous@',
      secure: false
    });
    await client.downloadTo(archivePath, FTP_REMOTE);
  } finally {
    client.close();
  }

  const buffer = await fsp.readFile(archivePath);
  if (buffer.length < MIN_ARCHIVE_BYTES) {
    throw new Error(`arquivo FTP abaixo de 1 MB (${buffer.length} bytes)`);
  }

  return {
    buffer,
    sourceUrl: `ftp://${FTP_HOST}${FTP_REMOTE}`,
    sourceBase: 'ftp'
  };
}

function activeHash() {
  return execFileSync(
    'psql',
    [
      `--dbname=${DB_URL}`,
      '-At',
      '-v', 'ON_ERROR_STOP=1',
      '-c', "select source_hash from public.caepi_datasets where status = 'active' limit 1"
    ],
    { encoding: 'utf8' }
  ).trim();
}

async function buildCsv(txtBuffer, csvPath) {
  const text = txtBuffer.toString('latin1');
  const iterator = parsePipeRecords(text);
  const first = iterator.next();

  if (first.done || !first.value?.length) {
    throw new Error('TXT CAEPI sem cabeçalho.');
  }

  const originalHeaders = first.value.map((h) => clean(h));
  const normalizedHeaders = originalHeaders.map(normalizeKey);
  console.log('[CAEPI] cabeçalho oficial:', originalHeaders.join(' | '));
  console.log('[CAEPI] cabeçalho normalizado:', normalizedHeaders.join(' | '));

  const stream = fs.createWriteStream(csvPath, { encoding: 'utf8' });
  stream.write([
    'record_hash','ca','data_validade','situacao','fabricante','cnpj',
    'equipamento','descricao','marca','referencia','norma','laudos','raw'
  ].map(csvCell).join(',') + '\n');

  let prepared = 0;
  let ignored = 0;
  const distinct = new Set();

  for (const values of iterator) {
    const row = {};
    const raw = {};

    for (let i = 0; i < originalHeaders.length; i += 1) {
      const original = originalHeaders[i] || `campo_${i + 1}`;
      const key = normalizedHeaders[i] || `campo_${i + 1}`;
      const value = clean(values[i]);
      row[key] = value;
      raw[original] = value;
    }

    const ca = onlyDigits(pick(row, [
      'nrregistroca','nr_registro_ca','numero_ca','n_do_ca','n_ca','ca','registro_ca','certificado_de_aprovacao'
    ]));

    if (!ca) {
      ignored += 1;
      continue;
    }

    const dataValidade = toIsoDate(pick(row, [
      'datavalidade','data_validade','data_de_validade','validade','validade_ca'
    ]));
    const situacao = pick(row, ['situacao','situacao_ca','status','status_ca']);
    const fabricante = pick(row, [
      'razaosocial','fabricante','razao_social','razao_social_fabricante','nome_fabricante','empresa'
    ]);
    const cnpj = pick(row, ['cnpj','cnpj_empresa','cnpj_fabricante']);
    const equipamento = pick(row, [
      'nomeequipamento','equipamento','tipo_equipamento','natureza','natureza_equipamento','nome_equipamento'
    ]);
    const descricao = pick(row, [
      'descricaoequipamento','descricao','descricao_equipamento','descricao_do_equipamento'
    ]);
    const marca = pick(row, ['marcaca','marca','marca_ca','marca_equipamento']);
    const referencia = pick(row, [
      'referencia','referencia_ca','referencia_equipamento','modelo'
    ]);
    const norma = pick(row, [
      'norma','normas','norma_tecnica','referencia_norma','norma_referencia'
    ]);

    const laudos = {};
    for (const [key, value] of Object.entries(row)) {
      if (
        value &&
        (
          key.includes('laudo') ||
          key.includes('restricao') ||
          key.includes('aprovadopara') ||
          key.includes('aprovado_para') ||
          key.includes('observacao')
        )
      ) {
        laudos[key] = value;
      }
    }

    const recordHash = sha256(JSON.stringify(raw));
    const line = [
      recordHash,
      ca,
      dataValidade,
      situacao,
      fabricante,
      cnpj,
      equipamento,
      descricao,
      marca,
      referencia,
      norma,
      JSON.stringify(laudos),
      JSON.stringify(raw)
    ].map(csvCell).join(',') + '\n';

    if (!stream.write(line)) await once(stream, 'drain');
    prepared += 1;
    distinct.add(ca);
  }

  stream.end();
  await once(stream, 'finish');

  return {
    prepared,
    ignored,
    distinctCas: distinct.size,
    originalHeaders
  };
}

function importDataset({
  csvPath, datasetId, sourceType, sourceUrl, sourceHash,
  ignoredRows, archiveBytes, txtBytes, metadata
}) {
  execFileSync(
    'psql',
    [
      `--dbname=${DB_URL}`,
      '-v', 'ON_ERROR_STOP=1',
      '-v', `csv_path=${csvPath}`,
      '-v', `dataset_id=${datasetId}`,
      '-v', `source_type=${sourceType}`,
      '-v', `source_url=${sourceUrl}`,
      '-v', `source_hash=${sourceHash}`,
      '-v', `ignored_rows=${ignoredRows}`,
      '-v', `archive_bytes=${archiveBytes}`,
      '-v', `txt_bytes=${txtBytes}`,
      '-v', `metadata=${JSON.stringify(metadata)}`,
      '-f', 'supabase/caepi-import.sql'
    ],
    { stdio: 'inherit' }
  );
}

async function main() {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'caepi-'));
  const archivePath = path.join(tempDir, 'tgg_export_caepi.bin');
  const txtPath = path.join(tempDir, 'tgg_export_caepi.txt');
  const csvPath = path.join(tempDir, 'caepi.csv');

  console.log(`[CAEPI] temporário: ${tempDir}`);

  try {
    let download;
    try {
      console.log('[CAEPI] baixando fonte principal gov.br...');
      download = await downloadGovBr(archivePath);
    } catch (govError) {
      console.warn(`[CAEPI] gov.br falhou: ${govError.message}`);
      console.log('[CAEPI] tentando FTP oficial...');
      download = await downloadFtp(archivePath);
    }

    const archiveBytes = download.buffer.length;
    const extracted = await extractTxt(download.buffer);
    const txtBytes = extracted.buffer.length;

    if (txtBytes < MIN_TXT_BYTES) {
      throw new Error(`TXT extraído abaixo de 50 MB (${txtBytes} bytes)`);
    }

    await fsp.writeFile(txtPath, extracted.buffer);

    console.log(`[CAEPI] fonte: ${download.sourceBase}-${extracted.format}`);
    console.log(`[CAEPI] compactado: ${archiveBytes} bytes`);
    console.log(`[CAEPI] TXT: ${txtBytes} bytes`);

    const sourceHash = sha256(extracted.buffer);

    console.log('[CAEPI] normalizando e gerando CSV UTF-8...');
    const built = await buildCsv(extracted.buffer, csvPath);

    console.log(`[CAEPI] preparados: ${built.prepared}`);
    console.log(`[CAEPI] CAs distintos: ${built.distinctCas}`);
    console.log(`[CAEPI] ignorados: ${built.ignored}`);

    if (built.prepared < MIN_ROWS) {
      throw new Error(`Validação recusada: ${built.prepared} registros; mínimo ${MIN_ROWS}`);
    }

    if (built.distinctCas < MIN_DISTINCT_CA) {
      throw new Error(`Validação recusada: ${built.distinctCas} CAs distintos; mínimo ${MIN_DISTINCT_CA}`);
    }

    const currentHash = activeHash();
    if (currentHash && currentHash === sourceHash) {
      console.log('[CAEPI] hash idêntico ao dataset ativo. Nenhuma nova versão será criada.');
      return;
    }

    const datasetId = crypto.randomUUID();
    const sourceType = `${download.sourceBase}-${extracted.format}`;
    const metadata = {
      archive_file: path.basename(archivePath),
      extracted_file: extracted.fileName,
      header_columns: built.originalHeaders,
      generated_at: new Date().toISOString()
    };

    console.log(`[CAEPI] importando dataset ${datasetId}...`);
    importDataset({
      csvPath,
      datasetId,
      sourceType,
      sourceUrl: download.sourceUrl,
      sourceHash,
      ignoredRows: built.ignored,
      archiveBytes,
      txtBytes,
      metadata
    });

    console.log('[CAEPI] dataset ativado com sucesso.');
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[CAEPI] ERRO:', error);
  process.exitCode = 1;
});
