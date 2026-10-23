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

// Moldura igual à dos outros e-mails do app.
function moldura(intro, conteudo, rodape) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
  <h2 style="margin:0 0 16px;font-size:20px">Gestão de <span style="color:#f97316">EPI</span></h2>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.5">${intro}</p>
  ${conteudo}
  <p style="margin:20px 0 20px"><a href="${esc(APP_URL)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Abrir o Gestão de EPI</a></p>
  <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280">${rodape}</p>
</div>`;
}

function tabela(cabecalho, linhas) {
  const th = cabecalho.map((c, i) => `<th style="text-align:${i ? 'right' : 'left'};padding:8px 6px;border-bottom:2px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:uppercase">${esc(c)}</th>`).join('');
  const tr = linhas.map((l) => `<tr>${l.map((c, i) => `<td style="text-align:${i ? 'right' : 'left'};padding:8px 6px;border-bottom:1px solid #f1f1f1;font-size:14px">${c}</td>`).join('')}</tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 8px">${th ? `<tr>${th}</tr>` : ''}${tr}</table>`;
}

const selo = (texto, cor) => `<span style="display:inline-block;padding:1px 8px;border-radius:999px;border:1px solid ${cor};color:${cor};font-size:11px;font-weight:bold">${esc(texto)}</span>`;

function emailEstoque(itens) {
  const criticos = itens.filter((i) => i.situacao === 'critico').length;
  const intro = itens.length
    ? `${itens.length} ${itens.length === 1 ? 'EPI precisa' : 'EPIs precisam'} de reposição${criticos ? ` (${criticos} zerado${criticos > 1 ? 's' : ''})` : ''}.`
    : 'Nenhum EPI está zerado ou abaixo do mínimo hoje.';
  const linhas = itens.map((i) => [
    `<strong>${esc(i.nome)}</strong>`,
    `<strong style="color:${i.situacao === 'critico' ? '#dc2626' : '#d97706'}">${num(i.saldo)}</strong>`,
    i.minimo == null ? '—' : num(i.minimo),
    i.situacao === 'critico' ? selo('Crítico', '#dc2626') : selo('Baixo', '#d97706')
  ]);
  return {
    assunto: itens.length ? `Estoque baixo: ${itens.length} ${itens.length === 1 ? 'EPI' : 'EPIs'} para repor` : 'Estoque: nada para repor hoje',
    html: moldura(esc(intro), itens.length ? tabela(['EPI', 'Em estoque', 'Mínimo', ''], linhas) : '',
      'Crítico = estoque zerado. Baixo = no mínimo definido ou abaixo dele. O mínimo de cada EPI se define no Estoque, clicando no cartão do item.')
  };
}

function emailCas(cas) {
  const vencidos = cas.filter((c) => c.dias < 0).length;
  const intro = cas.length
    ? `${cas.length} C.A. ${cas.length === 1 ? 'precisa' : 'precisam'} de atenção${vencidos ? `: ${vencidos} já ${vencidos === 1 ? 'venceu' : 'venceram'}` : ''}.`
    : 'Nenhum C.A. ativo vence nos próximos 30 dias.';
  const linhas = cas.map((c) => [
    `<strong>${esc(c.epi)}</strong><br><span style="font-size:12px;color:#6b7280">C.A. ${esc(c.ca)}${c.fornecedor ? ' • ' + esc(c.fornecedor) : ''}</span>`,
    dataBR(c.validade),
    c.dias < 0 ? selo(`Vencido há ${-c.dias} dia${c.dias === -1 ? '' : 's'}`, '#dc2626')
      : c.dias === 0 ? selo('Vence hoje', '#dc2626') : selo(`Vence em ${c.dias} dia${c.dias === 1 ? '' : 's'}`, '#d97706')
  ]);
  return {
    assunto: cas.length ? `C.A. vencendo: ${cas.length} para conferir` : 'C.A.: nenhum vencendo',
    html: moldura(esc(intro), cas.length ? tabela(['EPI / C.A.', 'Validade', ''], linhas) : '',
      'Para trocar, cadastre o C.A. novo no prontuário do EPI (EPIs / Itens) e desative o antigo no Estoque.')
  };
}

function emailResumo(r) {
  const periodo = `${dataBR(r.inicio)} a ${dataBR(r.fim)}`;
  const bloco = (titulo, valor) => `<td style="padding:10px;border:1px solid #f1f1f1;border-radius:8px;text-align:center"><div style="font-size:22px;font-weight:bold;color:#1f2937">${valor}</div><div style="font-size:12px;color:#6b7280">${esc(titulo)}</div></td>`;
  const numeros = `<table style="width:100%;border-collapse:separate;border-spacing:6px;margin:0 0 12px"><tr>
    ${bloco('entregas', num(r.entregas))}${bloco('itens entregues', num(r.itens_entregues))}${bloco('colaboradores', num(r.colaboradores_atendidos))}${bloco('itens que entraram', num(Number(r.entradas_manuais) + Number(r.entradas_notas)))}
  </tr></table>`;
  const top = (r.mais_entregues || []).length
    ? `<p style="margin:12px 0 6px;font-size:14px;font-weight:bold">Mais entregues</p>${tabela([], r.mais_entregues.map((t) => [esc(t.nome), num(t.qtd)]))}`
    : '<p style="margin:12px 0;font-size:14px;color:#6b7280">Nenhuma entrega na semana.</p>';
  const sem = r.sem_termo || [];
  const termo = sem.length
    ? `<p style="margin:16px 0 6px;font-size:14px;font-weight:bold">${num(sem.length)} colaborador${sem.length === 1 ? '' : 'es'} ativo${sem.length === 1 ? '' : 's'} sem termo assinado</p>
       <p style="margin:0;font-size:13px;line-height:1.6;color:#374151">${sem.slice(0, 10).map(esc).join(', ')}${sem.length > 10 ? ` e mais ${num(sem.length - 10)}.` : '.'}</p>`
    : '<p style="margin:16px 0 0;font-size:14px">Todos os colaboradores ativos têm termo assinado.</p>';
  return {
    assunto: `Resumo da semana: ${num(r.entregas)} ${r.entregas == 1 ? 'entrega' : 'entregas'} (${periodo})`,
    html: moldura(`Resumo de <strong>${esc(periodo)}</strong>.`, numeros + top + termo,
      'Entradas somam as notas fiscais lançadas e as entradas sem nota da semana.')
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
