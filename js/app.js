
const cfg = window.EPI_CONFIG || {};
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let movements = [];
let collaborators = [];
let epiCatalog = [];
let charts = {};
let realtimeChannel = null;
let reloadTimer = null;

const $ = (id) => document.getElementById(id);
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmt(n){return new Intl.NumberFormat('pt-BR').format(n||0)}
function parseBR(s){if(!s)return null;const [d,m,y]=s.split('/').map(Number);return new Date(Date.UTC(y,m-1,d))}
function isoToBR(s){if(!s)return'';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`}
function brToISO(s){if(!s)return'';const [d,m,y]=s.split('/');return `${y}-${m}-${d}`}
function normalize(s){return String(s||'').trim().toLocaleLowerCase('pt-BR')}
function todayLocal(){const d=new Date();const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}

function authRedirectUrl(){
  return `${window.location.origin}${window.location.pathname}`;
}

function refreshIcons(){
  if(window.lucide && typeof window.lucide.createIcons==='function'){
    window.lucide.createIcons({attrs:{'aria-hidden':'true'}});
  }
}
function setStatus(text, ok=true){
  $('statusText').textContent = text;
  const dot = document.querySelector('.status .dot');
  if(dot) dot.style.background = ok ? 'var(--green)' : 'var(--red)';
}
function setBusy(busy){
  $('epiApp').classList.toggle('loading-overlay', !!busy);
}

function unique(vals){return [...new Set(vals.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'))}
function fillSelect(id,values,label='Todos'){
  const el=$(id), old=el.value;
  el.innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option>${esc(v)}</option>`).join('');
  if([...el.options].some(o=>o.value===old))el.value=old;
}
function rebuildLists(){
  const filterColabs=unique([...collaborators.filter(x=>x.ativo!==false).map(x=>x.nome),...movements.map(x=>x.colaborador)]);
  const entryColabs=unique([...collaborators.filter(x=>x.ativo!==false).map(x=>x.nome),'Bolsa Reserva']);
  const epis=unique([...epiCatalog.filter(x=>x.ativo!==false).map(x=>x.nome),...movements.map(x=>x.epi)]);
  const resps=unique(movements.map(x=>x.responsavel));
  fillSelect('fColab',filterColabs); fillSelect('fEpi',epis); fillSelect('fResp',resps);
  $('dlColab').innerHTML=entryColabs.map(x=>`<option value="${esc(x)}">`).join('');
  $('dlEpi').innerHTML=epis.map(x=>`<option value="${esc(x)}">`).join('');
  $('dlResp').innerHTML=resps.map(x=>`<option value="${esc(x)}">`).join('');
}

function relationName(v){
  if(!v) return null;
  if(Array.isArray(v)) return v[0]?.nome || null;
  return v.nome || null;
}

async function loadAll(showBusy=true){
  if(showBusy) setBusy(true);
  setStatus('Atualizando dados...');
  try{
    const [cRes,eRes,mRes] = await Promise.all([
      sb.from('colaboradores').select('id,nome,cargo,setor,ativo').order('nome'),
      sb.from('epis').select('id,nome,categoria,ativo').order('nome'),
      sb.from('movimentacoes_epi')
        .select('id,data,colaborador_id,colaborador_nome_informado,epi_id,epi_nome_original,quantidade,ca,tamanho,responsavel,observacao,origem,created_at,colaboradores(nome),epis(nome)')
        .order('data',{ascending:true})
        .order('created_at',{ascending:true})
    ]);
    if(cRes.error) throw cRes.error;
    if(eRes.error) throw eRes.error;
    if(mRes.error) throw mRes.error;

    collaborators = cRes.data || [];
    epiCatalog = eRes.data || [];
    movements = (mRes.data || []).map((r,idx)=>({
      id:r.id,
      data:isoToBR(r.data),
      colaborador: relationName(r.colaboradores) || r.colaborador_nome_informado || null,
      colaborador_id:r.colaborador_id,
      epi: relationName(r.epis) || r.epi_nome_original || '—',
      epi_id:r.epi_id,
      epi_raw:r.epi_nome_original,
      quantidade:Number(r.quantidade)||0,
      ca:r.ca || 'N/A',
      tamanho:r.tamanho || 'N/A',
      responsavel:r.responsavel || '—',
      observacao:r.observacao || '',
      origem:r.origem || '',
      custom:(r.origem || '').startsWith('Site Gestão EPI'),
      _order:idx
    }));
    rebuildLists();
    renderDashboard();
    renderMovs();
    renderColabs();
    renderEpis();
    setStatus(`Supabase sincronizado • ${movements.length} movimentações`);
  }catch(err){
    console.error(err);
    setStatus('Erro ao carregar o Supabase', false);
    alert(`Erro ao carregar dados: ${err.message || err}`);
  }finally{
    if(showBusy) setBusy(false);
  }
}

function filtered(){
  const de=$('fDe').value, ate=$('fAte').value;
  const c=$('fColab').value,e=$('fEpi').value,r=$('fResp').value;
  return movements.filter(x=>{
    const iso=brToISO(x.data);
    return (!de||iso>=de)&&(!ate||iso<=ate)&&(!c||x.colaborador===c)&&(!e||x.epi===e)&&(!r||x.responsavel===r);
  });
}
['fDe','fAte','fColab','fEpi','fResp'].forEach(id=>$(id).addEventListener('change',renderDashboard));

function aggregate(arr,key){
  const m=new Map();
  arr.forEach(x=>{const k=x[key]||'(sem colaborador)';m.set(k,(m.get(k)||0)+(Number(x.quantidade)||0))});
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);
}
function chartBase(){
  return {responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aeb8c2',boxWidth:10,boxHeight:10,font:{size:10}}}},scales:{x:{ticks:{color:'#7f8a96',font:{size:9}},grid:{color:'#202a34'}},y:{ticks:{color:'#7f8a96',font:{size:9}},grid:{color:'#202a34'}}}};
}
function makeChart(id,type,data,opts={}){
  if(!window.Chart)return;
  if(charts[id])charts[id].destroy();
  charts[id]=new Chart($(id),{type,data,options:{...chartBase(),...opts}});
}
function renderDashboard(){
  rebuildLists();
  const arr=filtered(), total=arr.reduce((s,x)=>s+(Number(x.quantidade)||0),0);
  const named=unique(arr.map(x=>x.colaborador).filter(x=>x&&x!=='Bolsa Reserva'));
  const top=aggregate(arr,'epi')[0]||['—',0];
  $('kTotal').textContent=fmt(total);
  $('kMov').textContent=fmt(arr.length);
  $('kCol').textContent=fmt(named.length);
  $('kMedia').textContent=arr.length?(total/arr.length).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'0,00';
  $('kTop').textContent=top[0]; $('kTopQtd').textContent=`${fmt(top[1])} itens`;

  const byDate=new Map(); arr.forEach(x=>byDate.set(x.data,(byDate.get(x.data)||0)+(Number(x.quantidade)||0)));
  const dates=[...byDate.entries()].sort((a,b)=>parseBR(a[0])-parseBR(b[0]));
  makeChart('cTempo','line',{labels:dates.map(x=>x[0].slice(0,5)),datasets:[{label:'Qtd',data:dates.map(x=>x[1]),borderColor:'#f4b000',backgroundColor:'rgba(244,176,0,.12)',fill:true,tension:.32,pointRadius:3,pointBackgroundColor:'#f4b000'}]},{plugins:{legend:{display:false}}});

  const topE=aggregate(arr,'epi').slice(0,10).reverse();
  makeChart('cTop','bar',{labels:topE.map(x=>x[0]),datasets:[{label:'Qtd',data:topE.map(x=>x[1]),backgroundColor:'#f4b000',borderRadius:4}]},{indexAxis:'y',plugins:{legend:{display:false}}});

  const topC=aggregate(arr.filter(x=>x.colaborador&&x.colaborador!=='Bolsa Reserva'),'colaborador').slice(0,8).reverse();
  makeChart('cColab','bar',{labels:topC.map(x=>x[0]),datasets:[{label:'Qtd',data:topC.map(x=>x[1]),backgroundColor:'#38bdf8',borderRadius:4}]},{indexAxis:'y',plugins:{legend:{display:false}}});

  const withC=arr.filter(x=>x.colaborador&&x.colaborador!=='Bolsa Reserva').length, without=arr.length-withC;
  makeChart('cQual','doughnut',{labels:['Com colaborador/destino','Sem colaborador'],datasets:[{data:[withC,without],backgroundColor:['#35c98b','#f4b000'],borderColor:'#121820',borderWidth:4}]},{cutout:'68%',scales:{}});

  const topR=aggregate(arr,'responsavel');
  makeChart('cResp','bar',{labels:topR.map(x=>x[0]),datasets:[{label:'Qtd',data:topR.map(x=>x[1]),backgroundColor:'#d59400',borderRadius:4}]},{plugins:{legend:{display:false}}});

  const last=[...arr].sort((a,b)=>parseBR(b.data)-parseBR(a.data)||String(b.id).localeCompare(String(a.id))).slice(0,15);
  $('latestCount').textContent=`${arr.length} registros filtrados`;
  $('latestBody').innerHTML=last.map(x=>`<tr><td>${esc(x.data)}</td><td>${esc(x.colaborador||'—')}</td><td>${esc(x.epi)}</td><td>${esc(x.quantidade??'—')}</td><td>${esc(x.ca||'N/A')}</td><td>${esc(x.tamanho||'N/A')}</td><td>${esc(x.responsavel)}</td></tr>`).join('');
}

function nav(page){
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.dataset.pageContent===page));
  if(page==='dashboard') renderDashboard();
  if(page==='movimentacoes') renderMovs();
  if(page==='colaboradores') renderColabs();
  if(page==='epis') renderEpis();
  refreshIcons();
}
document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.page)));

function formatCaDate(value){
  if(!value) return '—';
  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
}

function formatCaDateTime(value){
  if(!value) return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-BR');
}

function setCaValue(id,value,fallback='—'){
  const el=$(id);
  if(el) el.textContent=(value==null||String(value).trim()==='')?fallback:String(value);
}

function resetCaStage(ca=''){
  setCaValue('caStageTitle','Informações do EPI');
  setCaValue('caStageNumber',ca?`C.A. ${ca}`:'C.A. —');
  setCaValue('caStageHint','Digite um número ao lado para consultar a base oficial.');
  setCaValue('caSituation','—');
  setCaValue('caEquipamento','—');
  setCaValue('caFabricante','—');
  setCaValue('caCnpj','—');
  setCaValue('caMarca','—');
  setCaValue('caReferencia','—');
  setCaValue('caValidade','—');
  setCaValue('caNorma','—');
  setCaValue('caDescricao','Os dados oficiais do equipamento aparecerão aqui.');
  setCaValue('caHistoryInfo','Histórico: —');
  setCaValue('caSourceInfo','Base: —');
}

function setCaStatus(label,kind='waiting'){
  const status=$('caStageStatus');
  if(!status) return;
  status.className=`ca-status ${kind}`;
  status.innerHTML=`<span class="ca-status-dot"></span>${esc(label)}`;
}

function renderCaSource(source){
  if(!source){
    setCaValue('caBaseSummary','Nenhum dataset ativo encontrado no Supabase.');
    setCaValue('caSourceInfo','Base: indisponível');
    return;
  }

  const summary=`${fmt(source.total_cas)} CAs • ${fmt(source.total_linhas)} registros • ${source.tipo_fonte||'fonte oficial'}`;
  setCaValue('caBaseSummary',summary);
  setCaValue('caSourceInfo',`Base: ${formatCaDateTime(source.importado_em)}`);
}

async function lookupCaepi(){
  const input=$('caInput');
  const button=$('caSearchBtn');
  if(!input||!button) return;

  const ca=String(input.value||'').replace(/\D+/g,'').slice(0,8);
  input.value=ca;

  if(!ca){
    resetCaStage();
    setCaStatus('Informe um C.A.','waiting');
    return;
  }

  resetCaStage(ca);
  setCaStatus('Consultando...','loading');
  setCaValue('caStageHint','Consultando a base CAEPI oficial...');
  button.disabled=true;

  try{
    const response=await fetch(`/api/caepi?ca=${encodeURIComponent(ca)}`,{
      method:'GET',
      headers:{Accept:'application/json'}
    });

    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error||`HTTP ${response.status}`);

    renderCaSource(data.source);

    if(!data.source){
      setCaStatus('Base indisponível','error');
      setCaValue('caStageHint','A base CAEPI ainda não possui um dataset ativo.');
      return;
    }

    if(!data.found||!data.current){
      setCaStatus('Não encontrado','error');
      setCaValue('caStageHint','C.A. não encontrado no dataset oficial ativo.');
      setCaValue('caHistoryInfo','Histórico: 0 registros');
      return;
    }

    const current=data.current;
    const situation=String(current.situacao||'').trim()||'—';
    const upper=situation.toLocaleUpperCase('pt-BR');
    const statusKind=upper.includes('VÁLID')?'valid':(upper.includes('VENC')||upper.includes('CANCEL')||upper.includes('SUSP')?'invalid':'result');

    setCaValue('caStageTitle',current.equipamento||'Informações do EPI');
    setCaValue('caStageNumber',`C.A. ${data.ca||ca}`);
    setCaValue('caStageHint','Registro atual localizado na base oficial CAEPI.');
    setCaValue('caSituation',situation);
    setCaValue('caEquipamento',current.equipamento);
    setCaValue('caFabricante',current.fabricante);
    setCaValue('caCnpj',current.cnpj);
    setCaValue('caMarca',current.marca);
    setCaValue('caReferencia',current.referencia);
    setCaValue('caValidade',formatCaDate(current.data_validade));
    setCaValue('caNorma',current.norma);
    setCaValue('caDescricao',current.descricao,'Descrição não informada na base oficial.');
    setCaValue('caHistoryInfo',`Histórico: ${fmt(data.history?.length||0)} registro(s)`);
    setCaStatus(situation,statusKind);
  }catch(err){
    console.error('[CAEPI]',err);
    setCaStatus('Erro na consulta','error');
    setCaValue('caStageHint','Não foi possível consultar a base CAEPI agora.');
  }finally{
    button.disabled=false;
    refreshIcons();
  }
}

if($('caInput')){
  $('caInput').addEventListener('input',()=>{
    const cleaned=$('caInput').value.replace(/\D+/g,'').slice(0,8);
    if($('caInput').value!==cleaned) $('caInput').value=cleaned;
  });
  $('caInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      lookupCaepi();
    }
  });
}
if($('caSearchBtn')) $('caSearchBtn').addEventListener('click',lookupCaepi);


async function ensureEpi(nome){
  let epi=epiCatalog.find(x=>normalize(x.nome)===normalize(nome));
  if(epi) return epi;
  const {data,error}=await sb.from('epis').insert({nome,categoria:null,ativo:true,origem:'Site Gestão EPI'}).select('id,nome,categoria,ativo').single();
  if(error) throw error;
  epiCatalog.push(data);
  return data;
}
function findCollaborator(nome){
  return collaborators.find(x=>normalize(x.nome)===normalize(nome)) || null;
}

$('saidaForm').addEventListener('submit',async e=>{
  e.preventDefault();
  $('saidaMsg').textContent='';
  const epiNome=$('nEpi').value.trim(), resp=$('nResp').value.trim(), qtd=Number($('nQtd').value), colNome=$('nColab').value.trim();
  if(!epiNome||!resp||!Number.isInteger(qtd)||qtd<1){$('saidaMsg').textContent='Confira EPI, quantidade e responsável.';return}
  try{
    setBusy(true);
    const epi=await ensureEpi(epiNome);
    const col=(colNome && colNome!=='Bolsa Reserva') ? findCollaborator(colNome) : null;
    const payload={
      data:$('nData').value,
      colaborador_id:col?.id || null,
      colaborador_nome_informado:colNome || null,
      epi_id:epi.id,
      epi_nome_original:epiNome,
      quantidade:qtd,
      ca:$('nCA').value.trim()||'N/A',
      tamanho:$('nTam').value.trim()||'N/A',
      responsavel:resp,
      observacao:$('nObs').value.trim()||null,
      origem:'Site Gestão EPI'
    };
    const {error}=await sb.from('movimentacoes_epi').insert(payload);
    if(error) throw error;
    e.target.reset();
    $('nQtd').value=1; $('nResp').value='Jeferson'; $('nData').value=todayLocal();
    $('saidaMsg').textContent='Movimentação salva no Supabase.';
    await loadAll(false);
  }catch(err){
    console.error(err);
    $('saidaMsg').textContent=`Erro: ${err.message || err}`;
  }finally{setBusy(false)}
});

function renderMovs(){
  const q=$('movSearch').value.trim().toLowerCase();
  const arr=[...movements].sort((a,b)=>parseBR(b.data)-parseBR(a.data)||String(b.id).localeCompare(String(a.id))).filter(x=>!q||[x.data,x.colaborador,x.epi,x.ca,x.responsavel].some(v=>String(v||'').toLowerCase().includes(q)));
  $('movBody').innerHTML=arr.map(x=>`<tr><td title="${esc(x.data)}">${esc(x.data)}</td><td title="${esc(x.colaborador||'—')}">${esc(x.colaborador||'—')}</td><td title="${esc(x.epi)}">${esc(x.epi)}</td><td>${esc(x.quantidade??'—')}</td><td title="${esc(x.ca||'N/A')}">${esc(x.ca||'N/A')}</td><td title="${esc(x.tamanho||'N/A')}">${esc(x.tamanho||'N/A')}</td><td title="${esc(x.responsavel)}">${esc(x.responsavel)}</td><td class="action-cell">${x.custom?`<button class="btn danger" data-del="${esc(x.id)}"><i data-lucide="trash-2" aria-hidden="true"></i>Excluir</button>`:'<span class="action-placeholder">—</span>'}</td></tr>`).join('');
  document.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('Excluir esta movimentação criada pelo site?')) return;
    const {error}=await sb.from('movimentacoes_epi').delete().eq('id',b.dataset.del).eq('origem','Site Gestão EPI');
    if(error){alert(error.message);return}
    await loadAll();
  }));
  refreshIcons();
}
$('movSearch').addEventListener('input',renderMovs);

function renderColabs(){
  $('colabCards').innerHTML=collaborators.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(c=>`<div class="mini-card"><strong>${esc(c.nome)}</strong><span>${esc(c.cargo||'Cargo não informado')}</span><span>${esc(c.setor||'Setor não informado')}</span></div>`).join('')||'<div class="empty">Nenhum colaborador.</div>';
}
$('addColab').addEventListener('click',async()=>{
  const nome=$('newColabNome').value.trim(),cargo=$('newColabCargo').value.trim(),setor=$('newColabSetor').value.trim();
  if(!nome) return;
  if(collaborators.some(x=>normalize(x.nome)===normalize(nome))){alert('Esse colaborador já está cadastrado.');return}
  const {error}=await sb.from('colaboradores').insert({nome,cargo:cargo||null,setor:setor||null,ativo:true,origem:'Site Gestão EPI'});
  if(error){alert(error.message);return}
  $('newColabNome').value=''; $('newColabCargo').value=''; $('newColabSetor').value='';
  await loadAll();
});

function renderEpis(){
  $('epiCards').innerHTML=epiCatalog.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(c=>`<div class="mini-card"><strong>${esc(c.nome)}</strong><span>${esc(c.categoria||'Categoria não informada')}</span></div>`).join('')||'<div class="empty">Nenhum EPI.</div>';
}
$('addEpi').addEventListener('click',async()=>{
  const nome=$('newEpiNome').value.trim(),categoria=$('newEpiCat').value.trim();
  if(!nome) return;
  if(epiCatalog.some(x=>normalize(x.nome)===normalize(nome))){alert('Esse EPI/item já está cadastrado.');return}
  const {error}=await sb.from('epis').insert({nome,categoria:categoria||null,ativo:true,origem:'Site Gestão EPI'});
  if(error){alert(error.message);return}
  $('newEpiNome').value=''; $('newEpiCat').value='';
  await loadAll();
});

function dl(name,content,type='application/octet-stream'){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type}));
  a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
$('exportJson').addEventListener('click',()=>dl('backup_epi_supabase.json',JSON.stringify({exportado_em:new Date().toISOString(),movements,collaborators,epiCatalog},null,2),'application/json'));
$('exportCsv').addEventListener('click',()=>{
  const head=['Data','Colaborador','EPI','Quantidade','CA','Tamanho','Responsavel'];
  const rows=movements.map(x=>[x.data,x.colaborador||'',x.epi,x.quantidade??'',x.ca||'',x.tamanho||'',x.responsavel].map(v=>`"${String(v).replaceAll('"','""')}"`).join(';'));
  dl('movimentacoes_epi.csv','\ufeff'+head.join(';')+'\n'+rows.join('\n'),'text/csv;charset=utf-8');
});
$('refreshData').addEventListener('click',()=>loadAll());
$('refreshData2').addEventListener('click',()=>loadAll());

function scheduleReload(){
  clearTimeout(reloadTimer);
  reloadTimer=setTimeout(()=>loadAll(false),350);
}
function startRealtime(){
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel=sb.channel('gestao-epi-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'movimentacoes_epi'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'colaboradores'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'epis'},scheduleReload)
    .subscribe(status=>{
      if(status==='SUBSCRIBED') setStatus(`Tempo real ativo • ${movements.length} movimentações`);
    });
}

async function showApp(session){
  $('authScreen').classList.add('hidden');
  $('epiApp').classList.remove('app-hidden');
  $('userEmail').textContent=session?.user?.email || '';
  refreshIcons();
  await loadAll();
  startRealtime();
}
function showAuth(message=''){
  $('epiApp').classList.add('app-hidden');
  $('authScreen').classList.remove('hidden');
  $('authMsg').textContent=message;
  if(realtimeChannel){sb.removeChannel(realtimeChannel);realtimeChannel=null}
  refreshIcons();
}

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('authEmail').value.trim(), password=$('authPassword').value;
  $('authMsg').textContent='Entrando...';
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error){$('authMsg').textContent=error.message;return}
  await showApp(data.session);
});
$('signupBtn').addEventListener('click',async()=>{
  const email=$('authEmail').value.trim(), password=$('authPassword').value;
  if(!email||password.length<6){$('authMsg').textContent='Informe e-mail e senha com pelo menos 6 caracteres.';return}
  $('authMsg').textContent='Criando conta...';
  const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:authRedirectUrl()}});
  if(error){$('authMsg').textContent=error.message;return}
  if(data.session){await showApp(data.session)}
  else $('authMsg').textContent='Conta criada. Confirme o e-mail enviado pelo Supabase e depois entre.';
});
$('googleBtn').addEventListener('click',async()=>{
  $('authMsg').textContent='Abrindo o Google...';
  const {error}=await sb.auth.signInWithOAuth({
    provider:'google',
    options:{redirectTo:authRedirectUrl()}
  });
  if(error) $('authMsg').textContent=error.message;
});
$('signOutBtn').addEventListener('click',async()=>{
  await sb.auth.signOut();
  showAuth('Sessão encerrada.');
});

sb.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT') showAuth();
  if(event==='SIGNED_IN' && session) {
    $('userEmail').textContent=session.user.email||'';
  }
});

(async function init(){
  $('nData').value=todayLocal();
  $('nQtd').value=1;
  $('nResp').value='Jeferson';
  refreshIcons();
  const {data:{session}}=await sb.auth.getSession();
  if(session) await showApp(session);
  else showAuth();
})();
