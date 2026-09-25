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
const PUBLIC_CA_URLS = [
  'https://caepi.trabalho.gov.br/internet/ConsultaCAInternet.aspx',
  'https://caepi.mte.gov.br/internet/ConsultaCAInternet.aspx'
];
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

function* parseDelimitedRecords(text, delimiter) {
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      field = '';
      if (row.some((v) => v !== '')) yield row;
      row = [];
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    if (row.some((v) => v !== '')) yield row;
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
    .filter((h) => !h.flags?.directory && /\.(txt|csv)$/i.test(h.name || ''))
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
        if (/\/$/.test(entry.fileName) || !/\.(txt|csv)$/i.test(entry.fileName)) {
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

function htmlDecode(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"');
}

function responseCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  return values.map((v) => v.split(';')[0]).join('; ');
}

function hiddenAspNetFields(html) {
  const params = new URLSearchParams();
  for (const match of html.matchAll(/<input\b[^>]*type=["']hidden["'][^>]*>/gi)) {
    const tag = match[0];
    const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1];
    const value = tag.match(/\bvalue=["']([^"']*)["']/i)?.[1] || '';
    if (name) params.set(htmlDecode(name), htmlDecode(value));
  }
  return params;
}

function findDownloadAction(html) {
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = htmlDecode(match[1]);
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/base de dados.*caepi|download/i.test(text) || /\.zip(?:$|\?)/i.test(href)) {
      const postback = href.match(/__doPostBack\(['"]([^'"]+)['"],['"]([^'"]*)['"]\)/i);
      if (postback) return { type: 'postback', target: postback[1], argument: postback[2] || '' };
      if (!/^javascript:/i.test(href)) return { type: 'href', href };
    }
  }

  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const value = htmlDecode(tag.match(/\bvalue=["']([^"']*)["']/i)?.[1] || '');
    const name = htmlDecode(tag.match(/\bname=["']([^"']+)["']/i)?.[1] || '');
    if (name && /base de dados.*caepi|download/i.test(value)) {
      return { type: 'submit', name, value };
    }
  }

  for (const match of html.matchAll(/<(?:button|input)\b[^>]*(?:onclick|href)=["']([^"']+)["'][^>]*>/gi)) {
    const js = htmlDecode(match[1]);
    if (!/download|base.*caepi|__doPostBack/i.test(js)) continue;
    const postback = js.match(/__doPostBack\(['"]([^'"]+)['"],['"]([^'"]*)['"]\)/i);
    if (postback) return { type: 'postback', target: postback[1], argument: postback[2] || '' };
    const url = js.match(/(?:window\.open|location(?:\.href)?\s*=)\s*\(?['"]([^'"]+)['"]/i)?.[1];
    if (url) return { type: 'href', href: htmlDecode(url) };
  }

  return null;
}

async function readDownloadResponse(response, archivePath, sourceUrl) {
  if (!response.ok) throw new Error(`download respondeu HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  const disposition = String(response.headers.get('content-disposition') || '');

  if (buffer.length < MIN_ARCHIVE_BYTES) {
    const sample = buffer.subarray(0, 400).toString('latin1').replace(/\s+/g, ' ');
    throw new Error(`download abaixo de 1 MB (${buffer.length} bytes). content-type=${type}. início=${sample}`);
  }

  const format = detectArchiveFormat(buffer);
  if (format === 'unknown' && !/zip|octet-stream/i.test(type + disposition)) {
    const sample = buffer.subarray(0, 400).toString('latin1').replace(/\s+/g, ' ');
    throw new Error(`resposta não parece arquivo compactado. content-type=${type}. início=${sample}`);
  }

  await fsp.writeFile(archivePath, buffer);
  return {
    buffer,
    sourceUrl: response.url || sourceUrl,
    sourceBase: 'caepi-public'
  };
}

async function downloadPublicCaepi(archivePath) {
  const browserHeaders = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7'
  };

  let lastError;

  for (const pageUrl of PUBLIC_CA_URLS) {
    try {
      const page = await fetch(pageUrl, { headers: browserHeaders, redirect: 'follow' });
      if (!page.ok) throw new Error(`página pública respondeu HTTP ${page.status}`);

      const cookies = responseCookies(page);
      const html = await page.text();
      const action = findDownloadAction(html);

      if (!action) {
        throw new Error('controle de download não encontrado na página pública');
      }

      const commonHeaders = {
        ...browserHeaders,
        'referer': page.url || pageUrl,
        ...(cookies ? { cookie: cookies } : {})
      };

      if (action.type === 'href') {
        const url = new URL(action.href, page.url || pageUrl).href;
        const response = await fetch(url, { headers: commonHeaders, redirect: 'follow' });
        return await readDownloadResponse(response, archivePath, url);
      }

      const body = hiddenAspNetFields(html);
      if (action.type === 'postback') {
        body.set('__EVENTTARGET', action.target);
        body.set('__EVENTARGUMENT', action.argument || '');
      } else {
        body.set(action.name, action.value);
      }

      const response = await fetch(page.url || pageUrl, {
        method: 'POST',
        headers: {
          ...commonHeaders,
          'content-type': 'application/x-www-form-urlencoded',
          'origin': new URL(page.url || pageUrl).origin
        },
        body: body.toString(),
        redirect: 'follow'
      });

      const type = String(response.headers.get('content-type') || '').toLowerCase();
      const disposition = String(response.headers.get('content-disposition') || '').toLowerCase();

      if (/zip|octet-stream/.test(type) || /attachment/.test(disposition)) {
        return await readDownloadResponse(response, archivePath, response.url || pageUrl);
      }

      const html2 = await response.text();
      const action2 = findDownloadAction(html2);
      if (action2?.type === 'href') {
        const url = new URL(action2.href, response.url || pageUrl).href;
        const fileResponse = await fetch(url, { headers: commonHeaders, redirect: 'follow' });
        return await readDownloadResponse(fileResponse, archivePath, url);
      }

      throw new Error(`clique de download retornou HTML sem arquivo (HTTP ${response.status})`);
    } catch (error) {
      lastError = error;
      console.warn(`[CAEPI] página ${pageUrl} falhou: ${error.message}`);
    }
  }

  throw lastError || new Error('Não foi possível baixar a base pública atual do CAEPI.');
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
  const client = new ftp.Client(180000);
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
    sourceBase: 'ftp',
    directTxt: true,
    fileName: 'tgg_export_caepi.txt'
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
  const text = new TextDecoder('windows-1252').decode(txtBuffer);
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const semicolons = (firstLine.match(/;/g) || []).length;
  const pipes = (firstLine.match(/\|/g) || []).length;
  const delimiter = semicolons > pipes ? ';' : '|';
  console.log(`[CAEPI] delimitador detectado: ${delimiter === ';' ? 'ponto e vírgula' : 'pipe'}`);
  const iterator = delimiter === ';'
    ? parseDelimitedRecords(text, ';')
    : parsePipeRecords(text);
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
  // psql não expande variáveis :name dentro do metacomando \\copy.
  // Renderizamos um SQL temporário com o caminho real do CSV do runner,
  // mantendo o \\copy no cliente para que o arquivo local seja acessível.
  const templatePath = path.resolve('supabase/caepi-import.sql');
  const renderedPath = path.join(path.dirname(csvPath), 'caepi-import-rendered.sql');
  const escapedCsvPath = csvPath.replace(/'/g, "''");
  const template = fs.readFileSync(templatePath, 'utf8');

  if (!template.includes('__CSV_PATH__')) {
    throw new Error('Placeholder __CSV_PATH__ ausente em supabase/caepi-import.sql');
  }

  fs.writeFileSync(
    renderedPath,
    template.replace('__CSV_PATH__', escapedCsvPath),
    'utf8'
  );

  execFileSync(
    'psql',
    [
      `--dbname=${DB_URL}`,
      '-v', 'ON_ERROR_STOP=1',
      '-v', `dataset_id=${datasetId}`,
      '-v', `source_type=${sourceType}`,
      '-v', `source_url=${sourceUrl}`,
      '-v', `source_hash=${sourceHash}`,
      '-v', `ignored_rows=${ignoredRows}`,
      '-v', `archive_bytes=${archiveBytes}`,
      '-v', `txt_bytes=${txtBytes}`,
      '-v', `metadata=${JSON.stringify(metadata)}`,
      '-f', renderedPath
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
      console.log('[CAEPI] baixando base atual pela consulta pública oficial do CAEPI...');
      download = await downloadPublicCaepi(archivePath);
    } catch (publicError) {
      // A publicação oficial mudou em 2026 para download pela página pública do CAEPI.
      // Se ela estiver indisponível, abortamos e mantemos o dataset ativo anterior.
      throw new Error(`download público oficial do CAEPI indisponível: ${publicError.message}`);
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
