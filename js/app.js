
const cfg = window.EPI_CONFIG || {};
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let movements = [];
let collaborators = [];
let epiCatalog = [];
let epiVariants = [];
let selectedEpi = null;
let editingVariantId = null;
let pendingVariantImageFile = null;
let pendingVariantImagePreviewUrl = '';
let removeVariantImageOnSave = false;
let charts = {};
let realtimeChannel = null;
let reloadTimer = null;
let currentIsAdmin = false;
let authorizedUsers = [];
let authorizationWatchTimer = null;
let authorizationCheckBusy = false;
let waitingSession = null;

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
    const [cRes,eRes,vRes,mRes] = await Promise.all([
      sb.from('colaboradores').select('id,nome,cargo,setor,ativo').order('nome'),
      sb.from('epis').select('id,nome,categoria,ativo,imagem_path,imagem_nome,imagem_updated_at').order('nome'),
      sb.from('epi_variantes')
        .select('id,epi_id,ca,fabricante,cnpj,marca,referencia,descricao,data_validade,situacao,norma,caracteristicas,preco,fornecedor,unidade,observacao,imagem_path,imagem_nome,imagem_updated_at,ativo,origem,created_at,updated_at')
        .order('created_at',{ascending:true}),
      sb.from('movimentacoes_epi')
        .select('id,data,colaborador_id,colaborador_nome_informado,epi_id,epi_nome_original,quantidade,ca,tamanho,responsavel,observacao,origem,created_at,colaboradores(nome),epis(nome)')
        .order('data',{ascending:true})
        .order('created_at',{ascending:true})
    ]);
    if(cRes.error) throw cRes.error;
    if(eRes.error) throw eRes.error;
    if(vRes.error) throw vRes.error;
    if(mRes.error) throw mRes.error;

    collaborators = cRes.data || [];
    epiCatalog = eRes.data || [];
    epiVariants = vRes.data || [];
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
  makeChart('cTempo','line',{labels:dates.map(x=>x[0].slice(0,5)),datasets:[{label:'Qtd',data:dates.map(x=>x[1]),borderColor:'#ff6600',backgroundColor:'rgba(255,102,0,.10)',fill:true,tension:.32,pointRadius:3,pointBackgroundColor:'#ff9a00'}]},{plugins:{legend:{display:false}}});

  const topE=aggregate(arr,'epi').slice(0,10).reverse();
  makeChart('cTop','bar',{labels:topE.map(x=>x[0]),datasets:[{label:'Qtd',data:topE.map(x=>x[1]),backgroundColor:'#ff6600',borderRadius:4}]},{indexAxis:'y',plugins:{legend:{display:false}}});

  const topC=aggregate(arr.filter(x=>x.colaborador&&x.colaborador!=='Bolsa Reserva'),'colaborador').slice(0,8).reverse();
  makeChart('cColab','bar',{labels:topC.map(x=>x[0]),datasets:[{label:'Qtd',data:topC.map(x=>x[1]),backgroundColor:'#ff8500',borderRadius:4}]},{indexAxis:'y',plugins:{legend:{display:false}}});

  const withC=arr.filter(x=>x.colaborador&&x.colaborador!=='Bolsa Reserva').length, without=arr.length-withC;
  makeChart('cQual','doughnut',{labels:['Com colaborador/destino','Sem colaborador'],datasets:[{data:[withC,without],backgroundColor:['#ff6600','#ff9a00'],borderColor:'#1a1a1a',borderWidth:4}]},{cutout:'68%',scales:{}});

  const topR=aggregate(arr,'responsavel');
  makeChart('cResp','bar',{labels:topR.map(x=>x[0]),datasets:[{label:'Qtd',data:topR.map(x=>x[1]),backgroundColor:'#ff5a00',borderRadius:4}]},{plugins:{legend:{display:false}}});

  const last=[...arr].sort((a,b)=>parseBR(b.data)-parseBR(a.data)||String(b.id).localeCompare(String(a.id))).slice(0,15);
  $('latestCount').textContent=`${arr.length} registros filtrados`;
  $('latestBody').innerHTML=last.map(x=>`<tr><td>${esc(x.data)}</td><td>${esc(x.colaborador||'—')}</td><td>${esc(x.epi)}</td><td>${esc(x.quantidade??'—')}</td><td>${esc(x.ca||'N/A')}</td><td>${esc(x.tamanho||'N/A')}</td><td>${esc(x.responsavel)}</td></tr>`).join('');
}

function nav(page){
  if(!currentIsAdmin && ['nova','colaboradores','epis','autorizacoes','dados'].includes(page)) return;
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.dataset.pageContent===page));
  if(page==='dashboard') renderDashboard();
  if(page==='movimentacoes') renderMovs();
  if(page==='colaboradores') renderColabs();
  if(page==='epis') renderEpis();
  if(page==='autorizacoes') loadAuthorizedUsers();
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
  const stage=$('caStage');

  if(stage){
    stage.classList.remove('ca-result-valid','ca-result-invalid','ca-result-error');
    if(kind==='valid') stage.classList.add('ca-result-valid');
    if(kind==='invalid') stage.classList.add('ca-result-invalid');
    if(kind==='error') stage.classList.add('ca-result-error');
  }

  if(!status) return;
  status.className=`ca-status ${kind}`;
  status.innerHTML=`<span class="ca-status-dot"></span>${esc(label)}`;
}

function renderCaSource(source){
  if(!source){
    setCaValue('caBaseSummary','Base indisponível no momento.');
    setCaValue('caSourceInfo','Base: indisponível');
    return;
  }

  const now=new Date();
  const date=now.toLocaleDateString('pt-BR');
  const time=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  setCaValue('caBaseSummary',`Base carregada ${date} às ${time}`);
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
  if(!currentIsAdmin) return;
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
  $('movBody').innerHTML=arr.map(x=>`<tr><td title="${esc(x.data)}">${esc(x.data)}</td><td title="${esc(x.colaborador||'—')}">${esc(x.colaborador||'—')}</td><td title="${esc(x.epi)}">${esc(x.epi)}</td><td>${esc(x.quantidade??'—')}</td><td title="${esc(x.ca||'N/A')}">${esc(x.ca||'N/A')}</td><td title="${esc(x.tamanho||'N/A')}">${esc(x.tamanho||'N/A')}</td><td title="${esc(x.responsavel)}">${esc(x.responsavel)}</td><td class="action-cell">${currentIsAdmin&&x.custom?`<button class="btn danger delete-icon-btn" data-del="${esc(x.id)}" title="Excluir" aria-label="Excluir"><i data-lucide="trash-2" aria-hidden="true"></i></button>`:'<span class="action-placeholder">—</span>'}</td></tr>`).join('');
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
  const arr=collaborators.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  $('colabCards').innerHTML=arr.map(c=>{
    const nome=String(c.nome||'Colaborador').trim();
    const parts=nome.split(/\s+/).filter(Boolean);
    const initials=((parts[0]?.[0]||'')+(parts.length>1?(parts[parts.length-1]?.[0]||''):'')).toLocaleUpperCase('pt-BR')||'C';
    const detalhe=[c.cargo,c.setor].filter(Boolean).join(' • ')||'Sem informações adicionais';
    const ativo=c.ativo!==false;

    return `<article class="collab-card">
      <div class="collab-avatar" aria-hidden="true">${esc(initials)}</div>
      <div class="collab-info">
        <strong title="${esc(nome)}">${esc(nome)}</strong>
        <span title="${esc(detalhe)}">${esc(detalhe)}</span>
      </div>
      <span class="collab-dot ${ativo?'active':'inactive'}" title="${ativo?'Ativo':'Inativo'}"></span>
    </article>`;
  }).join('')||'<div class="empty">Nenhum colaborador.</div>';
}$('addColab').addEventListener('click',async()=>{
  if(!currentIsAdmin) return;
  const nome=$('newColabNome').value.trim(),cargo=$('newColabCargo').value.trim(),setor=$('newColabSetor').value.trim();
  if(!nome) return;
  if(collaborators.some(x=>normalize(x.nome)===normalize(nome))){alert('Esse colaborador já está cadastrado.');return}
  const {error}=await sb.from('colaboradores').insert({nome,cargo:cargo||null,setor:setor||null,ativo:true,origem:'Site Gestão EPI'});
  if(error){alert(error.message);return}
  $('newColabNome').value=''; $('newColabCargo').value=''; $('newColabSetor').value='';
  await loadAll();
});

function epiVariantCount(epiId){
  return epiVariants.filter(v=>v.epi_id===epiId && v.ativo!==false).length;
}
function epiCardIcon(epi){
  const text=normalize(`${epi?.nome||''} ${epi?.categoria||''}`);
  if(/capacete|cabeça|cabeca/.test(text)) return 'hard-hat';
  if(/luva|mão|mao/.test(text)) return 'hand';
  if(/óculos|oculos|viseira|visual/.test(text)) return 'glasses';
  if(/protetor auditivo|auricular|ouvido/.test(text)) return 'ear';
  if(/bota|calçado|calcado|sapato/.test(text)) return 'footprints';
  if(/máscara|mascara|respirador|filtro/.test(text)) return 'shield-plus';
  if(/cinto|talabarte|trava queda|trava-quedas|altura/.test(text)) return 'shield-check';
  if(/capa|chuva|impermeável|impermeavel/.test(text)) return 'cloud-rain';
  if(/macacão|macacao|uniforme|vestimenta|colete/.test(text)) return 'shirt';
  if(/cone|fita zebrada|sinalização|sinalizacao/.test(text)) return 'triangle-alert';
  if(/creme|protetor solar/.test(text)) return 'sparkles';
  if(/lanterna|pilha/.test(text)) return 'flashlight';
  return 'package-check';
}
function epiCardManufacturers(epiId){
  const names=unique(
    epiVariants
      .filter(v=>v.epi_id===epiId && v.ativo!==false)
      .map(v=>String(v.fabricante||'').trim())
      .filter(Boolean)
  );
  if(!names.length) return '';
  return names.length===1 ? names[0] : `${names[0]} +${names.length-1}`;
}
function epiCardHasValidCa(epiId){
  return epiVariants.some(v=>{
    if(v.epi_id!==epiId||v.ativo===false) return false;
    return String(v.situacao||'').toLocaleUpperCase('pt-BR').includes('VÁLID');
  });
}
function renderEpis(){
  $('epiCards').innerHTML=epiCatalog.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(c=>{
    const count=epiVariantCount(c.id);
    const fabricante=epiCardManufacturers(c.id);
    const hasValid=epiCardHasValidCa(c.id);
    const icon=epiCardIcon(c);
    const stateClass=hasValid?'has-valid':(count?'has-ca':'no-ca');
    const caLabel=`${count} ${count===1?'C.A.':'C.A.s'}`;

    return `<button class="mini-card epi-card ${stateClass}" type="button" data-epi-id="${esc(c.id)}">
      <span class="epi-card-accent" aria-hidden="true"></span>

      <div class="epi-card-topline">
        <div class="epi-card-icon" aria-hidden="true"><i data-lucide="${icon}"></i></div>

        <div class="epi-card-copy">
          <strong title="${esc(c.nome)}">${esc(c.nome)}</strong>
          <span class="epi-card-category">${esc(c.categoria||'Categoria não informada')}</span>
        </div>

        <span class="epi-card-ca-count">
          ${hasValid?'<span class="epi-card-status-dot" aria-hidden="true"></span>':''}
          ${esc(caLabel)}
        </span>
      </div>

      <div class="epi-card-meta">
        <span class="epi-card-maker" title="${esc(fabricante||'Nenhum fabricante vinculado')}">
          <i data-lucide="building-2" aria-hidden="true"></i>
          ${esc(fabricante||'Nenhum fabricante vinculado')}
        </span>
        <span class="epi-card-open">
          Abrir ficha
          <i data-lucide="arrow-up-right" aria-hidden="true"></i>
        </span>
      </div>
    </button>`;
  }).join('')||'<div class="empty">Nenhum EPI.</div>';
  refreshIcons();
}

function moneyBR(v){
  if(v===null||v===undefined||v==='') return '—';
  return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}
function dateBR(v){
  if(!v) return '—';
  return isoToBR(String(v).slice(0,10));
}
function clearEpiVariantForm(){
  editingVariantId=null;
  ['epiVarCa','epiVarFabricante','epiVarCnpj','epiVarMarca','epiVarReferencia','epiVarValidade','epiVarSituacao','epiVarNorma','epiVarDescricao','epiVarCaracteristicas','epiVarPreco','epiVarFornecedor','epiVarObservacao'].forEach(id=>{if($(id)) $(id).value='';});
  if($('epiVarCa')) $('epiVarCa').readOnly=false;
  if($('epiVarUnidade')) $('epiVarUnidade').value='un';
  if($('epiVariantMsg')) $('epiVariantMsg').textContent='';
  if($('epiVarLookupStatus')) $('epiVarLookupStatus').textContent='Digite um C.A. para buscar os dados oficiais.';
  if($('epiVariantEditorTitle')) $('epiVariantEditorTitle').textContent='Adicionar C.A.';
  if($('epiVariantSave')) $('epiVariantSave').innerHTML='<i data-lucide="save" aria-hidden="true"></i>Salvar C.A.';
  if($('epiVariantCancelEdit')) $('epiVariantCancelEdit').classList.add('hidden');
  resetVariantImageEditor();
  refreshIcons();
}
function renderEpiVariantList(){
  const list=$('epiVariantList');
  if(!list||!selectedEpi) return;
  const rows=epiVariants.filter(v=>v.epi_id===selectedEpi.id && v.ativo!==false)
    .sort((a,b)=>String(a.ca||'').localeCompare(String(b.ca||''),'pt-BR',{numeric:true}));
  $('epiDetailCount').textContent=`${rows.length} ${rows.length===1?'C.A. vinculado':'C.A.s vinculados'}`;
  if(!rows.length){
    list.innerHTML='<div class="epi-variant-empty"><i data-lucide="badge-plus" aria-hidden="true"></i><strong>Nenhum C.A. vinculado</strong><span>Use o formulário ao lado para cadastrar a primeira opção deste item.</span></div>';
    refreshIcons();
    return;
  }
  list.innerHTML=rows.map(v=>{
    const situacao=String(v.situacao||'').trim();
    const upper=situacao.toLocaleUpperCase('pt-BR');
    const state=upper.includes('VÁLID')?'valid':(upper.includes('VENC')||upper.includes('CANCEL')||upper.includes('SUSP')?'invalid':'neutral');
    return `<article class="epi-variant-card ${state}">
      <div class="epi-variant-card-layout">
        <div class="epi-variant-thumb ${v.imagem_path?'has-image':''}">
          <img data-variant-image="${esc(v.id)}" alt="Imagem do modelo C.A. ${esc(v.ca||'')}" hidden>
          <span data-variant-image-empty="${esc(v.id)}"><i data-lucide="image" aria-hidden="true"></i><small>Sem foto</small></span>
        </div>

        <div class="epi-variant-card-content">
          <div class="epi-variant-top">
            <div>
              <span class="epi-variant-ca">C.A. ${esc(v.ca||'—')}</span>
              <strong>${esc(v.fabricante||'Fabricante não informado')}</strong>
              <small>${esc([v.marca,v.referencia].filter(Boolean).join(' • ')||'Marca / referência não informada')}</small>
            </div>
            <span class="epi-variant-state">${esc(situacao||'Sem situação')}</span>
          </div>
          <div class="epi-variant-meta">
            <span><i data-lucide="calendar-days"></i><b>Validade</b><strong class="epi-variant-meta-value">${esc(dateBR(v.data_validade))}</strong></span>
            <span><i data-lucide="badge-dollar-sign"></i><b>Preço</b><strong class="epi-variant-meta-value">${esc(moneyBR(v.preco))}</strong></span>
            <span><i data-lucide="truck"></i><b>Fornecedor</b><strong class="epi-variant-meta-value" title="${esc(v.fornecedor||'—')}">${esc(v.fornecedor||'—')}</strong></span>
          </div>
          ${v.caracteristicas?`<p class="epi-variant-features">${esc(v.caracteristicas)}</p>`:''}
          <div class="epi-variant-actions">
            <button class="btn compact" type="button" data-variant-edit="${esc(v.id)}"><i data-lucide="pencil"></i>Editar</button>
            <button class="btn compact danger" type="button" data-variant-delete="${esc(v.id)}"><i data-lucide="trash-2"></i>Excluir</button>
          </div>
        </div>
      </div>
    </article>`;
  }).join('');
  refreshIcons();
  hydrateVariantCardImages(rows);
}

async function hydrateVariantCardImages(rows){
  await Promise.all(rows.filter(v=>v.imagem_path).map(async v=>{
    try{
      const {data,error}=await sb.storage.from('epi-imagens').createSignedUrl(v.imagem_path,3600);
      if(error||!data?.signedUrl) return;
      const img=document.querySelector(`[data-variant-image="${CSS.escape(v.id)}"]`);
      const empty=document.querySelector(`[data-variant-image-empty="${CSS.escape(v.id)}"]`);
      if(img){
        img.src=data.signedUrl;
        img.hidden=false;
      }
      if(empty) empty.hidden=true;
    }catch(err){
      console.warn('[VARIANT IMAGE CARD]',err);
    }
  }));
}

function openEpiDetail(epiId){
  selectedEpi=epiCatalog.find(x=>x.id===epiId)||null;
  if(!selectedEpi) return;
  $('epiDetailTitle').textContent=selectedEpi.nome;
  $('epiDetailCategory').textContent=selectedEpi.categoria||'Categoria não informada';
  $('epiVariantEditor').hidden=!currentIsAdmin;
  clearEpiVariantForm();
  renderEpiVariantList();
  $('epiDetailModal').classList.remove('hidden');
  refreshIcons();
}
function closeEpiDetail(){
  if($('epiDetailModal')) $('epiDetailModal').classList.add('hidden');
  selectedEpi=null;
  clearEpiVariantForm();
}
function resetVariantImageEditor(){
  pendingVariantImageFile=null;
  removeVariantImageOnSave=false;

  if(pendingVariantImagePreviewUrl){
    URL.revokeObjectURL(pendingVariantImagePreviewUrl);
    pendingVariantImagePreviewUrl='';
  }

  if($('epiVariantImageInput')) $('epiVariantImageInput').value='';
  if($('epiVariantImagePreview')){
    $('epiVariantImagePreview').hidden=true;
    $('epiVariantImagePreview').removeAttribute('src');
  }
  if($('epiVariantImageEmpty')) $('epiVariantImageEmpty').hidden=false;
  if($('epiVariantImageRemove')) $('epiVariantImageRemove').hidden=true;
  if($('epiVariantImageName')) $('epiVariantImageName').textContent='Nenhuma imagem selecionada.';
}

async function renderVariantImageEditor(v=null){
  resetVariantImageEditor();
  if(!v?.imagem_path) return;

  try{
    const {data,error}=await sb.storage.from('epi-imagens').createSignedUrl(v.imagem_path,3600);
    if(error) throw error;

    if($('epiVariantImagePreview')&&data?.signedUrl){
      $('epiVariantImagePreview').src=data.signedUrl;
      $('epiVariantImagePreview').hidden=false;
      $('epiVariantImageEmpty').hidden=true;
      $('epiVariantImageRemove').hidden=false;
      $('epiVariantImageName').textContent=v.imagem_nome||'Imagem cadastrada';
    }
  }catch(err){
    console.warn('[VARIANT IMAGE EDITOR]',err);
    if($('epiVariantImageName')) $('epiVariantImageName').textContent='Não foi possível carregar a imagem atual.';
  }
}

function chooseVariantImage(){
  if(currentIsAdmin && $('epiVariantImageInput')) $('epiVariantImageInput').click();
}

function previewVariantImageFile(file){
  if(!file) return;
  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type)){
    $('epiVariantMsg').textContent='Imagem inválida. Use JPG, PNG ou WEBP.';
    return;
  }
  if(file.size>5*1024*1024){
    $('epiVariantMsg').textContent='A imagem do modelo ultrapassa 5 MB.';
    return;
  }

  if(pendingVariantImagePreviewUrl) URL.revokeObjectURL(pendingVariantImagePreviewUrl);
  pendingVariantImageFile=file;
  removeVariantImageOnSave=false;
  pendingVariantImagePreviewUrl=URL.createObjectURL(file);

  $('epiVariantImagePreview').src=pendingVariantImagePreviewUrl;
  $('epiVariantImagePreview').hidden=false;
  $('epiVariantImageEmpty').hidden=true;
  $('epiVariantImageRemove').hidden=false;
  $('epiVariantImageName').textContent=file.name;
  $('epiVariantMsg').textContent='Imagem pronta. Salve o C.A. para gravar.';
}

function markVariantImageForRemoval(){
  pendingVariantImageFile=null;
  removeVariantImageOnSave=true;
  if(pendingVariantImagePreviewUrl){
    URL.revokeObjectURL(pendingVariantImagePreviewUrl);
    pendingVariantImagePreviewUrl='';
  }
  $('epiVariantImagePreview').hidden=true;
  $('epiVariantImagePreview').removeAttribute('src');
  $('epiVariantImageEmpty').hidden=false;
  $('epiVariantImageRemove').hidden=true;
  $('epiVariantImageName').textContent='Imagem será removida ao salvar.';
  $('epiVariantMsg').textContent='A imagem será removida ao salvar as alterações.';
}

async function persistVariantImage(saved,previous){
  let row=saved;

  if(removeVariantImageOnSave && previous?.imagem_path){
    const {data,error}=await sb.from('epi_variantes')
      .update({imagem_path:null,imagem_nome:null,imagem_updated_at:new Date().toISOString()})
      .eq('id',saved.id)
      .select()
      .single();
    if(error) throw error;
    row=data;
    const {error:removeError}=await sb.storage.from('epi-imagens').remove([previous.imagem_path]);
    if(removeError) console.warn('[VARIANT IMAGE REMOVE]',removeError);
    return row;
  }

  if(!pendingVariantImageFile) return row;

  const file=pendingVariantImageFile;
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
  const path=`variantes/${saved.id}/modelo-${Date.now()}.${ext}`;

  const {error:uploadError}=await sb.storage.from('epi-imagens').upload(path,file,{
    cacheControl:'3600',
    upsert:false,
    contentType:file.type
  });
  if(uploadError) throw uploadError;

  const {data,error:updateError}=await sb.from('epi_variantes')
    .update({
      imagem_path:path,
      imagem_nome:file.name,
      imagem_updated_at:new Date().toISOString()
    })
    .eq('id',saved.id)
    .select()
    .single();

  if(updateError){
    await sb.storage.from('epi-imagens').remove([path]);
    throw updateError;
  }

  if(previous?.imagem_path && previous.imagem_path!==path){
    const {error:removeOldError}=await sb.storage.from('epi-imagens').remove([previous.imagem_path]);
    if(removeOldError) console.warn('[VARIANT IMAGE OLD]',removeOldError);
  }

  return data;
}

function fillEpiVariantForm(v){
  editingVariantId=v.id;
  $('epiVarCa').value=v.ca||'';
  $('epiVarFabricante').value=v.fabricante||'';
  $('epiVarCnpj').value=v.cnpj||'';
  $('epiVarMarca').value=v.marca||'';
  $('epiVarReferencia').value=v.referencia||'';
  $('epiVarValidade').value=v.data_validade?String(v.data_validade).slice(0,10):'';
  $('epiVarSituacao').value=v.situacao||'';
  $('epiVarNorma').value=v.norma||'';
  $('epiVarDescricao').value=v.descricao||'';
  $('epiVarCaracteristicas').value=v.caracteristicas||'';
  $('epiVarPreco').value=v.preco??'';
  $('epiVarFornecedor').value=v.fornecedor||'';
  $('epiVarUnidade').value=v.unidade||'un';
  $('epiVarObservacao').value=v.observacao||'';
  $('epiVarCa').readOnly=true;
  $('epiVariantEditorTitle').textContent='Editar C.A.';
  $('epiVariantSave').innerHTML='<i data-lucide="save" aria-hidden="true"></i>Salvar alterações';
  $('epiVariantCancelEdit').classList.remove('hidden');
  $('epiVarLookupStatus').textContent='Registro carregado para edição.';
  renderVariantImageEditor(v);
  refreshIcons();
}
async function lookupEpiVariantCa(){
  const ca=String($('epiVarCa').value||'').replace(/\D+/g,'').slice(0,8);
  $('epiVarCa').value=ca;
  if(!ca){$('epiVarLookupStatus').textContent='Informe o número do C.A.';return}
  const btn=$('epiVarLookup');
  btn.disabled=true;
  $('epiVarLookupStatus').textContent='Consultando a base CAEPI...';
  try{
    const response=await fetch(`/api/caepi?ca=${encodeURIComponent(ca)}`,{headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error||`HTTP ${response.status}`);
    if(!data.found||!data.current){
      $('epiVarLookupStatus').textContent='C.A. não encontrado no dataset ativo.';
      return;
    }
    const c=data.current;
    $('epiVarFabricante').value=c.fabricante||'';
    $('epiVarCnpj').value=c.cnpj||'';
    $('epiVarMarca').value=c.marca||'';
    $('epiVarReferencia').value=c.referencia||'';
    $('epiVarValidade').value=c.data_validade?String(c.data_validade).slice(0,10):'';
    $('epiVarSituacao').value=c.situacao||'';
    $('epiVarNorma').value=c.norma||'';
    $('epiVarDescricao').value=c.descricao||'';
    $('epiVarLookupStatus').textContent='Dados oficiais carregados da base CAEPI.';
  }catch(err){
    console.error('[EPI CAEPI]',err);
    $('epiVarLookupStatus').textContent='Falha ao consultar o CAEPI. Tente novamente.';
  }finally{
    btn.disabled=false;
  }
}
async function saveEpiVariant(){
  if(!currentIsAdmin||!selectedEpi) return;

  const previous=editingVariantId ? epiVariants.find(v=>v.id===editingVariantId)||null : null;
  const typedCa=String($('epiVarCa').value||'').replace(/\D+/g,'').slice(0,8);
  const ca=typedCa || String(previous?.ca||'').replace(/\D+/g,'').slice(0,8);

  if(!ca){
    $('epiVariantMsg').textContent='Informe o C.A.';
    return;
  }
  $('epiVarCa').value=ca;

  const payload={
    epi_id:selectedEpi.id,
    ca,
    fabricante:$('epiVarFabricante').value.trim()||null,
    cnpj:$('epiVarCnpj').value.trim()||null,
    marca:$('epiVarMarca').value.trim()||null,
    referencia:$('epiVarReferencia').value.trim()||null,
    descricao:$('epiVarDescricao').value.trim()||null,
    data_validade:$('epiVarValidade').value||null,
    situacao:$('epiVarSituacao').value.trim()||null,
    norma:$('epiVarNorma').value.trim()||null,
    caracteristicas:$('epiVarCaracteristicas').value.trim()||null,
    preco:$('epiVarPreco').value===''?null:Number($('epiVarPreco').value),
    fornecedor:$('epiVarFornecedor').value.trim()||null,
    unidade:$('epiVarUnidade').value.trim()||'un',
    observacao:$('epiVarObservacao').value.trim()||null,
    ativo:true,
    origem:'Site Gestão EPI',
    updated_at:new Date().toISOString()
  };

  $('epiVariantMsg').textContent='Salvando...';

  let result;
  if(editingVariantId){
    result=await sb.from('epi_variantes').update(payload).eq('id',editingVariantId).select().single();
  }else{
    result=await sb.from('epi_variantes').insert(payload).select().single();
  }

  if(result.error){
    $('epiVariantMsg').textContent=result.error.code==='23505'?'Este C.A. já está vinculado a este item.':result.error.message;
    return;
  }

  let saved=result.data;

  try{
    saved=await persistVariantImage(saved,previous);
  }catch(err){
    console.error('[VARIANT IMAGE SAVE]',err);
    $('epiVariantMsg').textContent=`C.A. salvo, mas a imagem falhou: ${err.message||err}`;
  }

  const idx=epiVariants.findIndex(v=>v.id===saved.id);
  if(idx>=0) epiVariants[idx]=saved;
  else epiVariants.push(saved);

  const imageFailed=$('epiVariantMsg').textContent.startsWith('C.A. salvo, mas');
  if(!imageFailed) $('epiVariantMsg').textContent='C.A. salvo.';

  clearEpiVariantForm();
  renderEpiVariantList();
  renderEpis();
}

async function deleteEpiVariant(id){
  if(!currentIsAdmin) return;
  const row=epiVariants.find(v=>v.id===id);
  if(!row) return;
  if(!confirm(`Excluir o C.A. ${row.ca} deste item?`)) return;
  const {error}=await sb.from('epi_variantes').delete().eq('id',id);
  if(error){alert(error.message);return}
  if(row.imagem_path){
    const {error:imgError}=await sb.storage.from('epi-imagens').remove([row.imagem_path]);
    if(imgError) console.warn('[VARIANT IMAGE DELETE]',imgError);
  }
  epiVariants=epiVariants.filter(v=>v.id!==id);
  renderEpiVariantList();
  renderEpis();
}
if($('epiCards')) $('epiCards').addEventListener('click',e=>{
  const card=e.target.closest('[data-epi-id]');
  if(card) openEpiDetail(card.dataset.epiId);
});
if($('epiDetailClose')) $('epiDetailClose').addEventListener('click',closeEpiDetail);
if($('epiDetailModal')) $('epiDetailModal').addEventListener('click',e=>{if(e.target===$('epiDetailModal')) closeEpiDetail();});
if($('epiVarLookup')) $('epiVarLookup').addEventListener('click',lookupEpiVariantCa);
if($('epiVarCa')) $('epiVarCa').addEventListener('input',()=>{$('epiVarCa').value=$('epiVarCa').value.replace(/\D+/g,'').slice(0,8);});
if($('epiVariantImageSelect')) $('epiVariantImageSelect').addEventListener('click',chooseVariantImage);
if($('epiVariantImageChange')) $('epiVariantImageChange').addEventListener('click',chooseVariantImage);
if($('epiVariantImageRemove')) $('epiVariantImageRemove').addEventListener('click',markVariantImageForRemoval);
if($('epiVariantImageInput')) $('epiVariantImageInput').addEventListener('change',e=>{
  const file=e.target.files?.[0];
  if(file) previewVariantImageFile(file);
});
if($('epiVariantSave')) $('epiVariantSave').addEventListener('click',saveEpiVariant);
if($('epiVariantCancelEdit')) $('epiVariantCancelEdit').addEventListener('click',clearEpiVariantForm);
if($('epiVariantList')) $('epiVariantList').addEventListener('click',e=>{
  const edit=e.target.closest('[data-variant-edit]');
  if(edit){
    const row=epiVariants.find(v=>v.id===edit.dataset.variantEdit);
    if(row) fillEpiVariantForm(row);
    return;
  }
  const del=e.target.closest('[data-variant-delete]');
  if(del) deleteEpiVariant(del.dataset.variantDelete);
});

$('addEpi').addEventListener('click',async()=>{
  if(!currentIsAdmin) return;
  const nome=$('newEpiNome').value.trim(),categoria=$('newEpiCat').value.trim();
  if(!nome) return;
  if(epiCatalog.some(x=>normalize(x.nome)===normalize(nome))){alert('Esse EPI/item já está cadastrado.');return}
  const {error}=await sb.from('epis').insert({nome,categoria:categoria||null,ativo:true,origem:'Site Gestão EPI'});
  if(error){alert(error.message);return}
  $('newEpiNome').value=''; $('newEpiCat').value='';
  await loadAll();
});

async function loadAdminAccess(){
  const {data,error}=await sb.rpc('epi_admin_is_admin');
  currentIsAdmin=!error && data===true;

  document.querySelectorAll('[data-admin-only]').forEach(el=>{
    el.hidden=!currentIsAdmin;
  });

  const currentPage=document.querySelector('.page.active')?.dataset?.pageContent;
  if(!currentIsAdmin && ['nova','colaboradores','epis','autorizacoes','dados'].includes(currentPage)){
    nav('dashboard');
  }

  refreshIcons();
  return currentIsAdmin;
}

function renderAuthorizedUsers(){
  const body=$('authzBody');
  const count=$('authzCount');
  if(!body||!count) return;

  count.textContent=`${authorizedUsers.length} usuário(s) cadastrado(s)`;

  body.innerHTML=authorizedUsers.map(u=>{
    const statusClass=u.ativo?'authz-status active':'authz-status inactive';
    const statusLabel=u.ativo?'Ativo':'Inativo';
    const role=u.admin?'<span class="authz-role"><i data-lucide="shield-check" aria-hidden="true"></i>Administrador</span>':'';
    const actions=u.admin
      ? '<span class="authz-protected" title="Conta administrativa protegida"><i data-lucide="lock-keyhole" aria-hidden="true"></i></span>'
      : `<div class="authz-actions">
          <button class="btn compact authz-toggle" type="button" data-authz-toggle="${esc(u.email)}" data-active="${u.ativo?'1':'0'}" title="${u.ativo?'Desativar':'Ativar'}" aria-label="${u.ativo?'Desativar':'Ativar'}">
            <i data-lucide="${u.ativo?'user-x':'user-check'}" aria-hidden="true"></i>
          </button>
          <button class="btn compact danger authz-delete" type="button" data-authz-delete="${esc(u.email)}" title="Remover" aria-label="Remover">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>`;

    return `<tr>
      <td><div class="authz-user"><strong>${esc(u.nome||'Sem nome')}</strong>${role}</div></td>
      <td title="${esc(u.email)}">${esc(u.email)}</td>
      <td><span class="${statusClass}"><span></span>${statusLabel}</span></td>
      <td class="authz-action-cell">${actions}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="empty">Nenhum usuário autorizado.</td></tr>';

  document.querySelectorAll('[data-authz-toggle]').forEach(btn=>btn.addEventListener('click',async()=>{
    const email=btn.dataset.authzToggle;
    const nextActive=btn.dataset.active!=='1';
    btn.disabled=true;
    const {error}=await sb.rpc('epi_admin_set_active',{p_email:email,p_ativo:nextActive});
    if(error){alert(error.message);btn.disabled=false;return}
    await loadAuthorizedUsers();
  }));

  document.querySelectorAll('[data-authz-delete]').forEach(btn=>btn.addEventListener('click',async()=>{
    const email=btn.dataset.authzDelete;
    if(!confirm(`Remover a autorização de ${email}?`)) return;
    btn.disabled=true;
    const {error}=await sb.rpc('epi_admin_delete_user',{p_email:email});
    if(error){alert(error.message);btn.disabled=false;return}
    await loadAuthorizedUsers();
  }));

  refreshIcons();
}

async function loadAuthorizedUsers(){
  if(!currentIsAdmin) return;
  const body=$('authzBody');
  const count=$('authzCount');
  if(body) body.innerHTML='<tr><td colspan="4" class="empty">Carregando autorizações...</td></tr>';
  if(count) count.textContent='Carregando...';

  const {data,error}=await sb.rpc('epi_admin_list_users');
  if(error){
    console.error('[AUTORIZAÇÕES]',error);
    if(body) body.innerHTML='<tr><td colspan="4" class="empty">Não foi possível carregar as autorizações.</td></tr>';
    if(count) count.textContent='Erro ao carregar';
    return;
  }

  authorizedUsers=data||[];
  renderAuthorizedUsers();
}

if($('authzForm')) $('authzForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!currentIsAdmin) return;

  const email=$('authzEmail').value.trim().toLowerCase();
  const nome=$('authzName').value.trim();
  const msg=$('authzMsg');

  if(!email){
    msg.textContent='Informe o e-mail do usuário.';
    return;
  }

  msg.textContent='Salvando autorização...';
  const {error}=await sb.rpc('epi_admin_save_user',{
    p_email:email,
    p_nome:nome||null,
    p_ativo:true
  });

  if(error){
    console.error('[AUTORIZAÇÕES]',error);
    msg.textContent=`Erro: ${error.message||error}`;
    return;
  }

  e.target.reset();
  msg.textContent='Usuário autorizado com sucesso.';
  await loadAuthorizedUsers();
});

if($('authzRefresh')) $('authzRefresh').addEventListener('click',loadAuthorizedUsers);

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

function clearAuthorizationWatch(){
  if(authorizationWatchTimer){
    clearInterval(authorizationWatchTimer);
    authorizationWatchTimer=null;
  }
  authorizationCheckBusy=false;
}

async function registerCurrentUserAccess(){
  const {data,error}=await sb.rpc('epi_register_access_request');
  if(error){
    console.error('[AUTORIZAÇÕES] Falha ao registrar solicitação de acesso:',error);
    return null;
  }
  const row=Array.isArray(data)?data[0]:data;
  return row||null;
}

async function userIsAuthorized(){
  const {data,error}=await sb.rpc('epi_user_is_authorized');
  if(error){
    console.error('[AUTORIZAÇÕES] Falha ao verificar acesso:',error);
    return false;
  }
  return data===true;
}

function showWaitingAccess(session){
  waitingSession=session||null;
  currentIsAdmin=false;
  authorizedUsers=[];
  if($('authzNavBtn')) $('authzNavBtn').hidden=true;

  $('authScreen').classList.add('hidden');
  $('epiApp').classList.add('app-hidden');
  $('accessWaitScreen').classList.remove('hidden');
  $('accessWaitEmail').textContent=session?.user?.email || 'Conta autenticada';
  refreshIcons();

  clearAuthorizationWatch();
  authorizationWatchTimer=setInterval(async()=>{
    if(authorizationCheckBusy) return;
    authorizationCheckBusy=true;
    try{
      if(await userIsAuthorized()){
        const current=waitingSession;
        clearAuthorizationWatch();
        await showApp(current);
      }
    }finally{
      authorizationCheckBusy=false;
    }
  },3000);
}

async function checkWaitingAccessNow(){
  if(authorizationCheckBusy) return;
  authorizationCheckBusy=true;
  const button=$('accessWaitCheckBtn');
  if(button) button.disabled=true;
  try{
    if(await userIsAuthorized()){
      const current=waitingSession;
      clearAuthorizationWatch();
      await showApp(current);
    }
  }finally{
    authorizationCheckBusy=false;
    if(button) button.disabled=false;
  }
}

function profileData(session){
  const user=session?.user;
  const meta=user?.user_metadata||{};
  const email=user?.email||'';
  return {
    name:String(meta.epi_display_name||email.split('@')[0]||'Usuário').trim(),
    avatar:String(meta.epi_avatar_url||'').trim()
  };
}

function setProfileImage(img,initial,name,avatar){
  if(!img||!initial) return;
  initial.textContent=(name.charAt(0)||'U').toLocaleUpperCase('pt-BR');

  if(avatar){
    img.src=avatar;
    img.alt=`Foto de ${name}`;
    img.hidden=false;
    initial.hidden=true;
    img.onerror=()=>{
      img.hidden=true;
      initial.hidden=false;
    };
  }else{
    img.removeAttribute('src');
    img.hidden=true;
    initial.hidden=false;
  }
}

function renderSideUserProfile(session){
  const {name,avatar}=profileData(session);
  if($('sideUserName')) $('sideUserName').textContent=name;
  setProfileImage($('sideUserAvatar'),$('sideUserInitial'),name,avatar);
}

let profilePreviewObjectUrl='';

function closeProfileEditor(){
  if(profilePreviewObjectUrl){
    URL.revokeObjectURL(profilePreviewObjectUrl);
    profilePreviewObjectUrl='';
  }
  if($('profileModal')) $('profileModal').classList.add('hidden');
  if($('profilePhotoInput')) $('profilePhotoInput').value='';
  if($('profileFileName')) $('profileFileName').textContent='Nenhuma nova imagem selecionada.';
  if($('profileMsg')) $('profileMsg').textContent='';
}

async function openProfileEditor(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session) return;

  const {name,avatar}=profileData(session);
  $('profileNameInput').value=name;
  $('profileFileName').textContent='Nenhuma nova imagem selecionada.';
  $('profileMsg').textContent='';
  setProfileImage($('profilePreviewImg'),$('profilePreviewInitial'),name,avatar);
  $('profileModal').classList.remove('hidden');
  refreshIcons();
}

if($('sideUserProfile')) $('sideUserProfile').addEventListener('click',openProfileEditor);
if($('profileModalClose')) $('profileModalClose').addEventListener('click',closeProfileEditor);
if($('profileCancelBtn')) $('profileCancelBtn').addEventListener('click',closeProfileEditor);

if($('profileModal')) $('profileModal').addEventListener('click',e=>{
  if(e.target===$('profileModal')) closeProfileEditor();
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && $('profileModal') && !$('profileModal').classList.contains('hidden')){
    closeProfileEditor();
  }
});

if($('profilePhotoInput')) $('profilePhotoInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];
  if(!file) return;

  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type)){
    e.target.value='';
    $('profileFileName').textContent='Formato inválido. Use JPG, PNG ou WEBP.';
    return;
  }
  if(file.size>2*1024*1024){
    e.target.value='';
    $('profileFileName').textContent='A imagem ultrapassa 2 MB.';
    return;
  }

  if(profilePreviewObjectUrl) URL.revokeObjectURL(profilePreviewObjectUrl);
  profilePreviewObjectUrl=URL.createObjectURL(file);
  $('profileFileName').textContent=file.name;

  const name=$('profileNameInput').value.trim()||'Usuário';
  setProfileImage($('profilePreviewImg'),$('profilePreviewInitial'),name,profilePreviewObjectUrl);
});

if($('profileNameInput')) $('profileNameInput').addEventListener('input',()=>{
  const name=$('profileNameInput').value.trim()||'Usuário';
  const initial=$('profilePreviewInitial');
  if(initial) initial.textContent=(name.charAt(0)||'U').toLocaleUpperCase('pt-BR');
});

if($('profileForm')) $('profileForm').addEventListener('submit',async e=>{
  e.preventDefault();

  const msg=$('profileMsg');
  const name=$('profileNameInput').value.trim();
  const file=$('profilePhotoInput').files?.[0]||null;

  if(!name){
    msg.textContent='Informe o nome que deseja exibir.';
    return;
  }

  msg.textContent='Salvando perfil...';

  try{
    const {data:{session}}=await sb.auth.getSession();
    const user=session?.user;
    if(!user) throw new Error('Sessão não encontrada.');

    const meta=user.user_metadata||{};
    let avatarUrl=String(meta.epi_avatar_url||'');

    if(file){
      const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
      const path=`${user.id}/avatar-${Date.now()}.${ext||'jpg'}`;

      const {error:uploadError}=await sb.storage
        .from('profile-avatars')
        .upload(path,file,{
          cacheControl:'3600',
          upsert:false,
          contentType:file.type
        });

      if(uploadError) throw uploadError;

      const {data:publicData}=sb.storage.from('profile-avatars').getPublicUrl(path);
      avatarUrl=publicData?.publicUrl||'';
    }

    const {error:updateError}=await sb.auth.updateUser({
      data:{
        epi_display_name:name,
        epi_avatar_url:avatarUrl
      }
    });
    if(updateError) throw updateError;

    const {data:{session:updatedSession}}=await sb.auth.getSession();
    renderSideUserProfile(updatedSession);
    msg.textContent='Perfil atualizado.';

    setTimeout(()=>closeProfileEditor(),550);
  }catch(err){
    console.error('[PERFIL]',err);
    msg.textContent=`Erro: ${err.message||err}`;
  }
});

async function showApp(session){
  await registerCurrentUserAccess();
  const authorized=await userIsAuthorized();

  if(!authorized){
    showWaitingAccess(session);
    return;
  }

  clearAuthorizationWatch();
  waitingSession=null;
  $('accessWaitScreen').classList.add('hidden');
  $('authScreen').classList.add('hidden');
  $('epiApp').classList.remove('app-hidden');
  $('userEmail').textContent=session?.user?.email || '';
  renderSideUserProfile(session);
  refreshIcons();

  await loadAdminAccess();
  await loadAll();
  startRealtime();
}
function showAuth(message=''){
  clearAuthorizationWatch();
  waitingSession=null;
  currentIsAdmin=false;
  authorizedUsers=[];
  document.querySelectorAll('[data-admin-only]').forEach(el=>{el.hidden=true});
  $('epiApp').classList.add('app-hidden');
  $('accessWaitScreen').classList.add('hidden');
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
async function signOutCurrentSession(){
  clearAuthorizationWatch();
  await sb.auth.signOut();
  showAuth('Sessão encerrada.');
}
$('signOutBtn').addEventListener('click',signOutCurrentSession);
if($('accessWaitSignOutBtn')) $('accessWaitSignOutBtn').addEventListener('click',signOutCurrentSession);
if($('accessWaitCheckBtn')) $('accessWaitCheckBtn').addEventListener('click',checkWaitingAccessNow);

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
