import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const CAEPI_PAGE_URL = 'https://caepi.trabalho.gov.br/internet/ConsultaCAInternet.aspx';
const DOWNLOAD_EVENT_TARGET = 'ctl00$PlaceHolderConteudo$LinkButton1';
const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl';

const MIN_ARCHIVE_BYTES = 1 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_TXT_BYTES = 256 * 1024 * 1024;
const MAX_DB_BYTES = 450_000_000; // Margem abaixo da cota Free; não é espaço livre do disco/WAL.
const MIN_TXT_BYTES = 50 * 1024 * 1024;
const MIN_ROWS = 80000;
const MIN_DISTINCT_CA = 25000;

const DB_URL = process.env.SUPABASE_DB_URL;
const DRY_RUN = process.env.CAEPI_DRY_RUN === '1';

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
  if (!m) throw new Error(`Data CAEPI inválida: ${v}`);
  const [, d, mo, y] = m;
  const parsed = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (parsed.getUTCFullYear() !== Number(y) || parsed.getUTCMonth() + 1 !== Number(mo) || parsed.getUTCDate() !== Number(d)) {
    throw new Error(`Data CAEPI inválida: ${v}`);
  }
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function csvCopyCell(value) {
  return value == null || value === '' ? '' : csvCell(value);
}

function* parseDelimitedRecords(text, delimiter) {
  let row = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (closedQuote && ch !== delimiter && ch !== '\r' && ch !== '\n') throw new Error('CSV CAEPI com conteúdo após aspas fechadas.');
    if (ch === '"') {
      if (field.length) throw new Error('CSV CAEPI com aspas em campo não delimitado.');
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      closedQuote = false;
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      field = '';
      if (row.some((v) => v !== '')) yield row;
      row = [];
      closedQuote = false;
    } else {
      field += ch;
    }
  }

  if (quoted) throw new Error('CSV CAEPI com aspas não fechadas.');
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
  if (head8[0] === 0x1f && head8[1] === 0x8b) return 'gzip';
  if (head8.subarray(0, 4).toString('ascii') === 'Rar!') return 'rar';
  if (head8.subarray(0, 2).toString('ascii') === 'PK') return 'zip';
  return 'unknown';
}

function extractGzip(buffer) {
  if (buffer.length < 18 || buffer[0] !== 0x1f || buffer[1] !== 0x8b || buffer[2] !== 8) {
    throw new Error('Cabeçalho GZIP inválido.');
  }

  // O trailer é binário: inclusive 0x09/0x0a/0x0d/0x20 podem fazer parte
  // do CRC/ISIZE. Nunca usar trim/whitespace para decidir onde ele termina.
  const options = { maxOutputLength: MAX_TXT_BYTES };
  let extracted;
  let originalError;
  try { extracted = gunzipSync(buffer, options); } catch (error) { originalError = error; }
  const searchStart = Math.max(10, buffer.length - (2 * 1024 * 1024));
  const htmlStart = buffer.indexOf(Buffer.from('<!DOCTYPE html'), searchStart);
  if (!extracted && htmlStart >= 0) {
    // Só aceitar separadores conhecidos, e só quando o GZIP completo
    // passar na verificação de CRC e tamanho feita pelo zlib.
    for (const separator of ['', '\r\n', '\r\n\r\n', '\n']) {
      const end = htmlStart - Buffer.byteLength(separator);
      if (!buffer.subarray(end, htmlStart).equals(Buffer.from(separator))) continue;
      try { extracted = gunzipSync(buffer.subarray(0, end), options); break; } catch {}
    }
  }
  if (!extracted) throw new Error('GZIP CAEPI inválido, truncado ou acima do limite.', { cause: originalError });
  if (!extracted.length) throw new Error('CSV vazio após descompactar o GZIP.');
  return { fileName: 'RelatorioCA.csv', buffer: extracted };
}

async function extractRar(buffer) {
  const unrar = require('node-unrar-js');
  const arr = Uint8Array.from(buffer);
  const data = arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
  const extractor = await unrar.createExtractorFromData({ data });
  const list = extractor.getFileList();
  const headers = [...list.fileHeaders]
    .filter((h) => !h.flags?.directory && /\.txt$/i.test(h.name || ''))
    .sort((a, b) => Number(b.unpSize || 0) - Number(a.unpSize || 0));

  if (!headers.length) throw new Error('Nenhum TXT encontrado no RAR.');

  const target = headers[0];
  if (Number(target.unpSize) > MAX_TXT_BYTES) throw new Error('TXT do RAR acima do limite.');
  const extracted = extractor.extract({ files: [target.name] });
  const files = [...extracted.files];
  const found = files.find((f) => f.fileHeader?.name === target.name) || files[0];

  if (!found?.extraction) throw new Error('Falha ao extrair TXT do RAR.');
  return { fileName: target.name, buffer: Buffer.from(found.extraction) };
}

function extractZip(buffer) {
  const yauzl = require('yauzl');
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
        if (entry.uncompressedSize > MAX_TXT_BYTES) {
          zipfile.close();
          reject(new Error('TXT do ZIP acima do limite.'));
          return;
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const chunks = [];
          let bytes = 0;
          stream.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_TXT_BYTES) {
              stream.destroy(new Error('TXT do ZIP acima do limite.'));
              zipfile.close();
              return;
            }
            chunks.push(chunk);
          });
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
  if (format === 'gzip') return { format, ...extractGzip(archiveBuffer) };
  if (format === 'rar') return { format, ...(await extractRar(archiveBuffer)) };
  if (format === 'zip') return { format, ...(await extractZip(archiveBuffer)) };
  throw new Error('Formato compactado desconhecido; atualização interrompida.');
}

function htmlDecode(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#x2b;|&#43;/gi, '+');
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

function curlBrowserArgs() {
  return [
    '--fail', '--silent', '--show-error', '--location',
    '--retry', '0', '--max-filesize', String(MAX_ARCHIVE_BYTES),
    '--connect-timeout', '30', '--max-time', '600',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
    '--header', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    '--header', 'Accept-Language: pt-BR,pt;q=0.9,en;q=0.7',
    '--header', 'Upgrade-Insecure-Requests: 1',
    '--header', 'Sec-Fetch-Dest: document',
    '--header', 'Sec-Fetch-Mode: navigate'
  ];
}

async function validateDownloadedArchive(archivePath, sourceBase) {
  const buffer = await fsp.readFile(archivePath);
  if (buffer.length < MIN_ARCHIVE_BYTES) {
    throw new Error(`download CAEPI abaixo de 1 MB (${buffer.length} bytes)`);
  }
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error('Download CAEPI acima de 64 MiB.');
  if (detectArchiveFormat(buffer) === 'unknown') {
    const sample = buffer.subarray(0, 300).toString('latin1').replace(/\s+/g, ' ');
    throw new Error(`download CAEPI não é GZIP/RAR/ZIP. Início: ${sample}`);
  }

  return {
    buffer,
    sourceUrl: CAEPI_PAGE_URL,
    sourceBase
  };
}

async function downloadPublicCaepiWithCurl(archivePath, tempDir) {
  const pagePath = path.join(tempDir, 'caepi-page.html');
  const cookiePath = path.join(tempDir, 'caepi-cookies.txt');
  const formPath = path.join(tempDir, 'caepi-form.txt');
  const headersPath = path.join(tempDir, 'caepi-response-headers.txt');

  execFileSync(CURL, [
    ...curlBrowserArgs(),
    '--header', 'Sec-Fetch-Site: none',
    '--cookie-jar', cookiePath,
    '--output', pagePath,
    CAEPI_PAGE_URL
  ], { stdio: 'inherit' });

  const html = await fsp.readFile(pagePath, 'utf8');
  if (!html.includes(DOWNLOAD_EVENT_TARGET)) {
    throw new Error('Botão de download CAEPI não encontrado na página pública.');
  }

  const form = hiddenAspNetFields(html);
  form.set('__EVENTTARGET', DOWNLOAD_EVENT_TARGET);
  form.set('__EVENTARGUMENT', '');
  await fsp.writeFile(formPath, form.toString(), 'utf8');

  execFileSync(CURL, [
    ...curlBrowserArgs(),
    '--header', 'Sec-Fetch-Site: same-origin',
    '--header', `Origin: ${new URL(CAEPI_PAGE_URL).origin}`,
    '--header', `Referer: ${CAEPI_PAGE_URL}`,
    '--header', 'Content-Type: application/x-www-form-urlencoded',
    '--cookie', cookiePath,
    '--data-binary', `@${formPath}`,
    '--dump-header', headersPath,
    '--output', archivePath,
    CAEPI_PAGE_URL
  ], { stdio: 'inherit' });

  return validateDownloadedArchive(archivePath, 'caepi-public-curl');
}

async function findBrowserExecutable() {
  const candidates = [
    process.env.CAEPI_BROWSER_PATH,
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fsp.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error('Google Chrome, Chromium ou Microsoft Edge não encontrado para o fallback.');
}

async function downloadPublicCaepiWithBrowser(archivePath) {
  const { chromium } = await import('playwright-core');
  const executablePath = await findBrowserExecutable();
  console.log(`[CAEPI] download oficial com navegador: ${executablePath}`);

  const browser = await chromium.launch({
    executablePath,
    // O portal CAEPI recusa navegadores headless. No GitHub Actions esta
    // janela roda dentro do Xvfb, sem interface visível nem interação humana.
    headless: process.env.CAEPI_BROWSER_HEADLESS === '1',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo'
    });
    const page = await context.newPage();
    const response = await page.goto(CAEPI_PAGE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });

    if (!response?.ok()) {
      throw new Error(`portal CAEPI respondeu HTTP ${response?.status() || 'desconhecido'} no navegador`);
    }

    const link = page.locator('a').filter({ hasText: 'Base de dados do sistema CAEPI' }).first();
    await link.waitFor({ state: 'visible', timeout: 30000 });
    const output = await fsp.open(archivePath, 'w');
    try {
      await page.exposeFunction('__writeCaepiChunk', async (base64) => {
        await output.write(Buffer.from(base64, 'base64'));
      });

      const result = await page.evaluate(async ({ eventTarget, maxArchiveBytes }) => {
        const formElement = document.querySelector('form');
        if (!formElement) throw new Error('Formulário ASP.NET não encontrado.');

        const formData = new FormData(formElement);
        formData.set('__EVENTTARGET', eventTarget);
        formData.set('__EVENTARGUMENT', '');
        const body = new URLSearchParams();
        for (const [key, value] of formData.entries()) {
          if (typeof value === 'string') body.append(key, value);
        }

        const downloadResponse = await fetch(formElement.action || location.href, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          signal: AbortSignal.timeout(180000)
        });
        if (!downloadResponse.ok) {
          return { status: downloadResponse.status, bytes: 0 };
        }
        if (!downloadResponse.body) throw new Error('Resposta CAEPI sem corpo.');

        const reader = downloadResponse.body.getReader();
        let bytes = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxArchiveBytes) {
            await reader.cancel();
            throw new Error('Download CAEPI acima do limite.');
          }
          let binary = '';
          for (let offset = 0; offset < value.length; offset += 0x8000) {
            binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
          }
          await window.__writeCaepiChunk(btoa(binary));
        }
        return { status: downloadResponse.status, bytes };
      }, { eventTarget: DOWNLOAD_EVENT_TARGET, maxArchiveBytes: MAX_ARCHIVE_BYTES });

      if (result.status < 200 || result.status >= 300) {
        throw new Error(`download CAEPI respondeu HTTP ${result.status} no navegador`);
      }
      console.log(`[CAEPI] navegador recebeu ${result.bytes} bytes.`);
    } finally {
      await output.close();
    }
    await context.close();
  } finally {
    await browser.close();
  }

  return validateDownloadedArchive(archivePath, 'caepi-public-browser');
}

async function downloadPublicCaepi(archivePath, tempDir) {
  const method = clean(process.env.CAEPI_DOWNLOAD_METHOD).toLowerCase();
  if (method === 'browser') return downloadPublicCaepiWithBrowser(archivePath);
  if (method === 'curl') return downloadPublicCaepiWithCurl(archivePath, tempDir);

  throw new Error('Defina CAEPI_DOWNLOAD_METHOD como browser ou curl; não há fallback automático.');
}

function activeHash() {
  return execFileSync(
    'psql',
    [
      '-X',
      '-At',
      '-v', 'ON_ERROR_STOP=1',
      '-c', "select source_hash from public.caepi_datasets where status = 'active' limit 1"
    ],
    { encoding: 'utf8', timeout: 30000, env: { ...process.env, PGDATABASE: DB_URL, PGCONNECT_TIMEOUT: '15' } }
  ).trim();
}

function estimateImportBudget(databaseBytes, csvBytes, rows) {
  // Estimativa conservadora para a NOVA versão + índices + margem.
  // A versão atual permanece incluída em databaseBytes durante a troca.
  const estimatedGrowth = Math.ceil(csvBytes * 2 + rows * 384 + 32 * 1024 * 1024);
  return { databaseBytes, csvBytes, estimatedGrowth, estimatedPeakBytes: databaseBytes + estimatedGrowth, limitBytes: MAX_DB_BYTES };
}

function checkDatabaseBudget(csvBytes, rows) {
  const bytes = Number(execFileSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
    'select pg_database_size(current_database())'], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PGDATABASE: DB_URL, PGCONNECT_TIMEOUT: '15' }
  }).trim());
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Tamanho do banco não pôde ser verificado.');
  const budget = estimateImportBudget(bytes, csvBytes, rows);
  console.log('[CAEPI] orçamento estimado (bytes):', JSON.stringify(budget));
  if (budget.estimatedPeakBytes > MAX_DB_BYTES) {
    throw new Error('Carga bloqueada: estimativa ultrapassa o orçamento de 450 MB. Dimensionar antes de importar.');
  }
  return budget;
}

async function buildCsv(txtBuffer, csvPath, datasetId) {
  const hasUtf8Bom = txtBuffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
  const encoding = hasUtf8Bom ? 'utf-8' : 'windows-1252';
  const text = new TextDecoder(encoding).decode(txtBuffer).replace(/^\uFEFF+/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/\|/g) || []).length
    ? ';'
    : '|';
  const iterator = parseDelimitedRecords(text, delimiter);
  const first = iterator.next();

  if (first.done || !first.value?.length) {
    throw new Error('Arquivo CAEPI sem cabeçalho.');
  }

  console.log(`[CAEPI] codificação detectada: ${encoding}`);
  console.log(`[CAEPI] delimitador detectado: ${delimiter === ';' ? 'ponto e vírgula' : 'pipe'}`);
  const originalHeaders = first.value.map((h) => clean(h));
  const normalizedHeaders = originalHeaders.map(normalizeKey);
  if (normalizedHeaders.some((h) => !h) || new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error('Cabeçalhos CAEPI vazios ou duplicados.');
  }
  for (const aliases of [
    ['nrregistroca','nr_registro_ca','numero_ca','ca'],
    ['datavalidade','data_validade','data_de_validade','validade'],
    ['situacao','situacao_ca','status'],
    ['razaosocial','razao_social','fabricante'],
    ['nomeequipamento','equipamento','nome_equipamento'],
    ['descricaoequipamento','descricao_equipamento','descricao']
  ]) {
    if (!aliases.some((key) => normalizedHeaders.includes(key))) throw new Error(`Coluna obrigatória CAEPI ausente: ${aliases[0]}`);
  }
  console.log('[CAEPI] cabeçalho oficial:', originalHeaders.join(' | '));
  console.log('[CAEPI] cabeçalho normalizado:', normalizedHeaders.join(' | '));

  const stream = fs.createWriteStream(csvPath, { encoding: 'utf8' });
  stream.write([
    'dataset_id','record_hash','ca','data_validade','situacao','fabricante','cnpj',
    'equipamento','descricao','marca','referencia','norma','laudos','raw'
  ].map(csvCell).join(',') + '\n');

  let prepared = 0;
  let ignored = 0;
  const distinct = new Set();
  const recordHashes = [];
  const seenRecordHashes = new Set();
  const validationSamples = new Map();
  let sourceRows = 0;
  const emptyFields = {};
  let streamError;
  stream.on('error', (error) => { streamError = error; });

  try {
    for (const values of iterator) {
      sourceRows += 1;
      if (streamError) throw streamError;
      if (values.length !== originalHeaders.length) throw new Error(`Linha ${sourceRows + 1}: número de colunas incorreto.`);
      const row = {};
      const raw = {};

      for (let i = 0; i < originalHeaders.length; i += 1) {
        const original = originalHeaders[i] || `campo_${i + 1}`;
        const key = normalizedHeaders[i] || `campo_${i + 1}`;
        const value = clean(values[i]);
        if (value.includes('\u0000') || value.includes('\uFFFD')) throw new Error(`Linha ${sourceRows + 1}: caracteres inválidos.`);
        if (!value) emptyFields[key] = (emptyFields[key] || 0) + 1;
        row[key] = value;
        raw[original] = value;
      }

      const caOriginal = pick(row, [
        'nrregistroca','nr_registro_ca','numero_ca','n_do_ca','n_ca','ca','registro_ca','certificado_de_aprovacao'
      ]);
      const ca = onlyDigits(caOriginal);

      if (!/^\d{1,10}$/.test(caOriginal)) throw new Error(`Linha ${sourceRows + 1}: número de CA inválido.`);

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

      if (ca === '39707' || ca === '43840') {
        const previous = validationSamples.get(ca);
        if (!previous || dataValidade > previous.dataValidade) {
          validationSamples.set(ca, { dataValidade, situacao, equipamento });
        }
      }

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
      if (seenRecordHashes.has(recordHash)) {
        ignored += 1;
        continue;
      }
      seenRecordHashes.add(recordHash);
      recordHashes.push(recordHash);
      const line = [
        datasetId,
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
        '{}'
      ].map(csvCopyCell).join(',') + '\n';

      if (!stream.write(line)) await once(stream, 'drain');
      prepared += 1;
      distinct.add(ca);
    }

    stream.end();
    await once(stream, 'finish');
    if (streamError) throw streamError;
  } finally {
    stream.destroy();
  }

  return {
    sourceRows,
    emptyFields,
    prepared,
    ignored,
    distinctCas: distinct.size,
    originalHeaders,
    contentHash: sha256(recordHashes.sort().join('\n')),
    validationSamples: Object.fromEntries(validationSamples)
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
      '-X',
      '-v', 'ON_ERROR_STOP=1',
      '-v', `dataset_id=${datasetId}`,
      '-v', `source_type=${sourceType}`,
      '-v', `source_url=${sourceUrl}`,
      '-v', `source_hash=${sourceHash}`,
      '-v', `ignored_rows=${ignoredRows}`,
      '-v', `archive_bytes=${archiveBytes}`,
      '-v', `txt_bytes=${txtBytes}`,
      '-v', `metadata=${JSON.stringify(metadata)}`,
      '-v', `max_db_bytes=${MAX_DB_BYTES}`,
      '-f', renderedPath
    ],
    { stdio: 'inherit', timeout: 18 * 60 * 1000, env: { ...process.env, PGDATABASE: DB_URL, PGCONNECT_TIMEOUT: '15' } }
  );
}

async function main() {
  if (!DRY_RUN) {
    if (!DB_URL || process.env.CAEPI_SYNC_ENABLED !== 'true') throw new Error('Carga bloqueada: credencial e liberação explícita são obrigatórias.');
    const url = new URL(DB_URL);
    const ref = 'jrzviiaywfjaawwkwgze';
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !(
      url.hostname === `db.${ref}.supabase.co` ||
      (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${ref}`)
    )) throw new Error('Carga bloqueada: a conexão não aponta para o projeto novo esperado.');
  }
  if (process.env.CAEPI_ARCHIVE_PATH && !DRY_RUN) throw new Error('Arquivo local permitido somente em validação sem banco.');
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'caepi-'));
  const archivePath = path.join(tempDir, 'caepi-oficial.bin');
  const txtPath = path.join(tempDir, 'caepi-oficial.csv');
  const csvPath = path.join(tempDir, 'caepi.csv');

  console.log(`[CAEPI] temporário: ${tempDir}`);

  try {
    // Falha cedo se o banco estiver indisponível, antes de baixar/processar 150 MB.
    const currentHash = DRY_RUN ? '' : activeHash();
    console.log('[CAEPI] baixando exportação atual da consulta pública oficial...');
    let download;
    if (process.env.CAEPI_ARCHIVE_PATH) {
      await fsp.copyFile(path.resolve(process.env.CAEPI_ARCHIVE_PATH), archivePath);
      download = await validateDownloadedArchive(archivePath, 'caepi-local-validation');
    } else {
      download = await downloadPublicCaepi(archivePath, tempDir);
    }

    const archiveBytes = download.buffer.length;
    const extracted = await extractTxt(download.buffer);
    const txtBytes = extracted.buffer.length;

    if (txtBytes < MIN_TXT_BYTES || txtBytes > MAX_TXT_BYTES) {
      throw new Error(`TXT extraído fora dos limites de 50 a 256 MiB (${txtBytes} bytes)`);
    }

    await fsp.writeFile(txtPath, extracted.buffer);

    console.log(`[CAEPI] fonte: ${download.sourceBase}-${extracted.format}`);
    console.log(`[CAEPI] compactado: ${archiveBytes} bytes`);
    console.log(`[CAEPI] TXT: ${txtBytes} bytes`);

    console.log('[CAEPI] normalizando e gerando CSV UTF-8...');
    const datasetId = crypto.randomUUID();
    const built = await buildCsv(extracted.buffer, csvPath, datasetId);
    const sourceHash = built.contentHash;
    const csvBytes = (await fsp.stat(csvPath)).size;
    if (csvBytes > MAX_TXT_BYTES) throw new Error('CSV preparado acima de 256 MiB.');

    console.log(`[CAEPI] preparados: ${built.prepared}`);
    console.log(`[CAEPI] CAs distintos: ${built.distinctCas}`);
    console.log(`[CAEPI] ignorados: ${built.ignored}`);
    for (const [ca, sample] of Object.entries(built.validationSamples)) {
      console.log(`[CAEPI] teste CA ${ca}: ${sample.dataValidade} • ${sample.situacao} • ${sample.equipamento}`);
    }

    if (built.prepared < MIN_ROWS) {
      throw new Error(`Validação recusada: ${built.prepared} registros; mínimo ${MIN_ROWS}`);
    }

    if (built.distinctCas < MIN_DISTINCT_CA) {
      throw new Error(`Validação recusada: ${built.distinctCas} CAs distintos; mínimo ${MIN_DISTINCT_CA}`);
    }

    if (DRY_RUN) {
      if (process.env.CAEPI_REPORT_PATH) {
        await fsp.writeFile(path.resolve(process.env.CAEPI_REPORT_PATH), JSON.stringify({
          validated_at: new Date().toISOString(), source_url: CAEPI_PAGE_URL,
          archiveBytes, txtBytes, csvBytes, ...built,
          database: 'not connected; no writes',
          budget: estimateImportBudget(0, csvBytes, built.prepared),
          budget_note: 'Estimativa apenas. Importação consulta tamanho real do banco antes da carga.'
        }, null, 2));
      }
      console.log(`[CAEPI] hash da fonte: ${sourceHash}`);
      console.log('[CAEPI] dry-run concluído; banco não foi consultado nem alterado.');
      return;
    }

    if (currentHash && currentHash === sourceHash) {
      console.log('[CAEPI] hash idêntico ao dataset ativo. Nenhuma nova versão será criada.');
      return;
    }
    checkDatabaseBudget(csvBytes, built.prepared);

    const sourceType = `${download.sourceBase}-${extracted.format}`;
    const metadata = {
      archive_file: path.basename(archivePath),
      extracted_file: extracted.fileName,
      header_columns: built.originalHeaders,
      raw_storage: 'omitted; source_hash calculated from complete official rows',
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

export { extractGzip, extractTxt, parseDelimitedRecords, toIsoDate, buildCsv, estimateImportBudget };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = String(error.message).replaceAll(DB_URL || '\u0000', '[CONEXÃO REDIGIDA]');
    console.error('[CAEPI] ERRO:', message);
    process.exitCode = 1;
  });
}
