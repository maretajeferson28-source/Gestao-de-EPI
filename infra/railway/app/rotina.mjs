// E-mails automáticos para o administrador (POST /api/rotina), chamados pelo
// serviço avisos-cron do Railway às 7h (horário de Brasília):
//   todo dia      -> estoque baixo (só se houver item zerado ou no mínimo)
//   segunda-feira -> C.A. vencendo (só se houver) e resumo da semana
// Corpo opcional { forcar: ['estoque','cas','resumo'] } manda mesmo fora do dia
// ou sem itens (usado no teste). Só aceita a chave de serviço no Authorization.
import { timingSafeEqual } from 'node:crypto';
import { enviarEmail, avisosLigados } from './avisos.mjs';

const { SUPABASE_URL, SERVICE_ROLE_KEY, AVISO_ADMIN_EMAIL, APP_URL = 'https://app-production-184a.up.railway.app' } = process.env;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
const dataBR = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : ''; };

function chaveOk(req) {
  const a = Buffer.from(String(req.headers.authorization || ''));
  const b = Buffer.from('Bearer ' + (SERVICE_ROLE_KEY || ''));
  return SERVICE_ROLE_KEY && a.length === b.length && timingSafeEqual(a, b);
}

function hojeBrasilia() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, segunda: p.weekday === 'Mon' };
}

// Moldura dos e-mails: cabeçalho escuro com o logo, cartão branco e rodapé.
// Tudo em tabela com estilo inline, que é o que Gmail e Outlook respeitam.
const LARANJA = '#f97316';
function moldura({ etiqueta, titulo, intro, conteudo = '', botao = 'Abrir o Gestão de EPI', rodape = '', resumo = '' }) {
  const hoje = dataBR(hojeBrasilia().iso);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#eef0f3">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(resumo || intro.replace(/<[^>]+>/g, ''))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e6ea;font-family:Roboto,Arial,Helvetica,sans-serif;color:#1f2937">
  <tr><td style="background:#141414;padding:18px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="44" style="vertical-align:middle"><img src="${esc(APP_URL)}/assets/app-brand/favicon-192.png" width="38" height="38" alt="" style="display:block;border:0"></td>
      <td style="vertical-align:middle;padding-left:10px">
        <div style="font-size:17px;font-weight:900;letter-spacing:.02em;color:#ffffff">GESTÃO DE <span style="color:${LARANJA}">EPI</span></div>
        <div style="font-size:10px;letter-spacing:.18em;color:#9ca3af;margin-top:2px">CONTROLE OPERACIONAL</div>
      </td>
      <td align="right" style="vertical-align:middle;font-size:12px;color:#9ca3af">${esc(hoje)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;line-height:4px;font-size:0;background:${LARANJA}">&nbsp;</td></tr>
  <tr><td style="padding:28px 28px 8px">
    <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${LARANJA}">${esc(etiqueta)}</div>
    <h1 style="margin:6px 0 10px;font-size:22px;line-height:1.3;color:#111827">${titulo}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4b5563">${intro}</p>
    ${conteudo}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 20px"><tr><td style="border-radius:10px;background:${LARANJA}">
      <a href="${esc(APP_URL)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${esc(botao)} &rarr;</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#f8f9fb;border-top:1px solid #eceef1;padding:16px 28px;font-size:12px;line-height:1.6;color:#6b7280">
    ${rodape ? `${rodape}<br>` : ''}<span style="color:#9ca3af">E-mail automático do Gestão de EPI, enviado ao administrador.</span>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// Quadros de números lado a lado (no celular continuam numa linha só).
function quadros(lista) {
  const largura = Math.floor(100 / lista.length);
  const tds = lista.map(([valor, rotulo, cor = '#111827']) => `<td width="${largura}%" style="padding:4px"><div style="background:#f8f9fb;border:1px solid #eceef1;border-radius:12px;padding:14px 8px;text-align:center">
    <div style="font-size:26px;font-weight:900;line-height:1;color:${cor}">${valor}</div>
    <div style="margin-top:6px;font-size:11px;line-height:1.3;color:#6b7280">${esc(rotulo)}</div></div></td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;table-layout:fixed"><tr>${tds}</tr></table>`;
}

function tabela(cabecalho, linhas) {
  const th = cabecalho.map((c, i) => `<th style="text-align:${i ? 'right' : 'left'};padding:0 0 8px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase">${esc(c)}</th>`).join('');
  const tr = linhas.map((l) => `<tr>${l.map((c, i) => `<td style="text-align:${i ? 'right' : 'left'};padding:12px 0 12px ${i ? '10px' : '0'};border-bottom:1px solid #f1f2f4;font-size:14px;vertical-align:middle">${c}</td>`).join('')}</tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 4px">${th ? `<tr>${th}</tr>` : ''}${tr}</table>`;
}

const titulo2 = (t) => `<div style="margin:22px 0 4px;font-size:13px;font-weight:700;color:#111827">${t}</div>`;
const CORES = { vermelho: ['#b91c1c', '#fee2e2'], amarelo: ['#b45309', '#fef3c7'], verde: ['#047857', '#d1fae5'] };
const selo = (texto, tom) => { const [cor, fundo] = CORES[tom]; return `<span style="display:inline-block;white-space:nowrap;padding:3px 10px;border-radius:999px;background:${fundo};color:${cor};font-size:11px;font-weight:700">${esc(texto)}</span>`; };

function emailEstoque(itens) {
  const criticos = itens.filter((i) => i.situacao === 'critico').length;
  const baixos = itens.length - criticos;
  const titulo = itens.length
    ? `${itens.length} ${itens.length === 1 ? 'EPI precisa' : 'EPIs precisam'} de reposição`
    : 'Nada para repor hoje';
  const intro = itens.length
    ? 'Confira a lista e faça o pedido antes que falte na hora da entrega.'
    : 'Nenhum EPI está zerado ou abaixo do mínimo.';
  const linhas = itens.map((i) => [
    `<strong style="color:#111827">${esc(i.nome)}</strong>`,
    `<strong style="font-size:16px;color:${i.situacao === 'critico' ? '#b91c1c' : '#b45309'}">${num(i.saldo)}</strong>`,
    `<span style="color:#6b7280">${i.minimo == null ? '—' : num(i.minimo)}</span>`,
    i.situacao === 'critico' ? selo('Zerado', 'vermelho') : selo('Baixo', 'amarelo')
  ]);
  return {
    assunto: itens.length ? `Estoque baixo: ${itens.length} ${itens.length === 1 ? 'EPI' : 'EPIs'} para repor` : 'Estoque: nada para repor hoje',
    html: moldura({
      etiqueta: 'Estoque', titulo: esc(titulo), intro: esc(intro), botao: 'Abrir o Estoque',
      conteudo: itens.length ? quadros([[num(criticos), 'zerados', '#b91c1c'], [num(baixos), 'no mínimo ou abaixo', '#b45309']]) + tabela(['EPI', 'Em estoque', 'Mínimo', ''], linhas) : '',
      rodape: '<strong>Zerado</strong>: estoque acabou. <strong>Baixo</strong>: chegou no mínimo definido ou abaixo dele. O mínimo de cada EPI se define no Estoque, clicando no cartão do item.'
    })
  };
}

function emailCas(cas) {
  const vencidos = cas.filter((c) => c.dias < 0).length;
  const titulo = cas.length
    ? `${cas.length} C.A. ${cas.length === 1 ? 'precisa' : 'precisam'} de atenção`
    : 'Nenhum C.A. vencendo';
  const intro = cas.length
    ? 'EPI com C.A. vencido não pode ser entregue. Veja quais vencem nos próximos 30 dias.'
    : 'Nenhum C.A. ativo vence nos próximos 30 dias.';
  const linhas = cas.map((c) => [
    `<strong style="color:#111827">${esc(c.epi)}</strong><div style="margin-top:2px;font-size:12px;color:#6b7280">C.A. ${esc(c.ca)}${c.fornecedor ? ' · ' + esc(c.fornecedor) : ''}</div>`,
    `<span style="color:#374151">${dataBR(c.validade)}</span>`,
    c.dias < 0 ? selo(`Vencido há ${-c.dias} dia${c.dias === -1 ? '' : 's'}`, 'vermelho')
      : c.dias === 0 ? selo('Vence hoje', 'vermelho') : selo(`Vence em ${c.dias} dia${c.dias === 1 ? '' : 's'}`, 'amarelo')
  ]);
  return {
    assunto: cas.length ? `C.A. vencendo: ${cas.length} para conferir` : 'C.A.: nenhum vencendo',
    html: moldura({
      etiqueta: 'Certificados de Aprovação', titulo: esc(titulo), intro: esc(intro), botao: 'Abrir os EPIs',
      conteudo: cas.length ? quadros([[num(vencidos), 'já vencidos', '#b91c1c'], [num(cas.length - vencidos), 'vencem em 30 dias', '#b45309']]) + tabela(['EPI / C.A.', 'Validade', ''], linhas) : '',
      rodape: 'Para trocar, cadastre o C.A. novo no prontuário do EPI (EPIs / Itens) e desative o antigo no Estoque.'
    })
  };
}

function emailResumo(r) {
  const periodo = `${dataBR(r.inicio)} a ${dataBR(r.fim)}`;
  const entradas = Number(r.entradas_manuais) + Number(r.entradas_notas);
  const numeros = quadros([[num(r.entregas), 'entregas'], [num(r.itens_entregues), 'itens entregues'], [num(r.colaboradores_atendidos), 'colaboradores'], [num(entradas), 'itens que entraram']]);
  const mais = r.mais_entregues || [];
  const maior = Math.max(1, ...mais.map((t) => Number(t.qtd) || 0));
  const barra = (q) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f1f2f4;border-radius:999px;height:6px;line-height:6px;font-size:0"><div style="width:${Math.max(4, Math.round((Number(q) || 0) / maior * 100))}%;background:${LARANJA};border-radius:999px;height:6px;line-height:6px;font-size:0">&nbsp;</div></td></tr></table>`;
  const top = mais.length
    ? titulo2('Mais entregues') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${mais.map((t) => `<tr>
        <td style="padding:8px 0 2px;font-size:14px;color:#111827">${esc(t.nome)}</td>
        <td align="right" style="padding:8px 0 2px;font-size:14px;font-weight:700;color:#111827">${num(t.qtd)}</td></tr>
        <tr><td colspan="2" style="padding:0 0 6px">${barra(t.qtd)}</td></tr>`).join('')}</table>`
    : `<p style="margin:16px 0 0;font-size:14px;color:#6b7280">Nenhuma entrega na semana.</p>`;
  const sem = r.sem_termo || [];
  const termo = sem.length
    ? `<div style="margin:22px 0 0;padding:14px 16px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa">
        <div style="font-size:13px;font-weight:700;color:#9a3412">${num(sem.length)} colaborador${sem.length === 1 ? '' : 'es'} ativo${sem.length === 1 ? '' : 's'} sem termo assinado</div>
        <div style="margin-top:4px;font-size:13px;line-height:1.6;color:#7c2d12">${sem.slice(0, 10).map(esc).join(', ')}${sem.length > 10 ? ` e mais ${num(sem.length - 10)}.` : '.'}</div>
        <div style="margin-top:6px;font-size:12px;color:#9a3412">Sem o termo, o app não deixa entregar EPI para eles.</div></div>`
    : `<div style="margin:22px 0 0;font-size:14px">${selo('Tudo certo', 'verde')} <span style="color:#374151">Todos os colaboradores ativos têm termo assinado.</span></div>`;
  return {
    assunto: `Resumo da semana: ${num(r.entregas)} ${r.entregas == 1 ? 'entrega' : 'entregas'} (${periodo})`,
    html: moldura({
      etiqueta: 'Resumo da semana', titulo: `Semana de ${esc(periodo)}`, intro: 'Como foram as entregas e o estoque nos últimos 7 dias.',
      resumo: `${num(r.entregas)} entregas, ${num(r.itens_entregues)} itens entregues na semana.`,
      conteudo: numeros + top + termo,
      rodape: 'Itens que entraram somam as notas fiscais lançadas e as entradas sem nota da semana.'
    })
  };
}

export async function handleRotina(req, res, send) {
  const json = (status, obj) => send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(obj));
  if (!chaveOk(req)) return json(401, { erro: 'chave inválida' });
  if (!avisosLigados) return json(200, { resultado: 'desligado' });
  let body = '';
  for await (const parte of req) { body += parte; if (body.length > 2000) return json(413, { erro: 'grande demais' }); }
  let forcar = [];
  try { forcar = JSON.parse(body || '{}').forcar || []; } catch { return json(400, { erro: 'JSON inválido' }); }
  try {
    const hoje = hojeBrasilia();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/epi_relatorio_avisos`, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_hoje: hoje.iso })
    });
    if (!r.ok) throw new Error('banco ' + r.status);
    const d = await r.json();
    const enviados = [];
    const manda = async (nome, email) => { await enviarEmail(AVISO_ADMIN_EMAIL, email.assunto, email.html); enviados.push(nome); };
    if (d.estoque.length || forcar.includes('estoque')) await manda('estoque', emailEstoque(d.estoque));
    if ((hoje.segunda && d.cas.length) || forcar.includes('cas')) await manda('cas', emailCas(d.cas));
    if (hoje.segunda || forcar.includes('resumo')) await manda('resumo', emailResumo(d.resumo));
    console.log(`[ROTINA] ${hoje.iso}: ${enviados.join(', ') || 'nada a enviar'}`);
    return json(200, { hoje: hoje.iso, enviados });
  } catch (e) {
    console.error('[ROTINA]', e.message);
    return json(500, { erro: 'falha na rotina' });
  }
}
