(() => {
  'use strict';
  if (window.__EPI_NFE_STOCK_READER__) return;
  window.__EPI_NFE_STOCK_READER__ = true;
  const state = { notes: [], latest: null, saving: false };
  const cache = new WeakMap();
  const $ = (id) => document.getElementById(id);
  const normalize = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const format = (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(v || 0);
  const db = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } };
  const catalog = () => { try { return epiCatalog.filter((i) => i.ativo !== false); } catch (_) { return []; } };
  const variants = () => { try { return epiVariants.filter((i) => i.ativo !== false); } catch (_) { return []; } };
  function nodes(root, name) { return root ? [...root.getElementsByTagNameNS('*', name)] : []; }
  const first = (root, name) => nodes(root, name)[0] || null;
  const text = (root, name) => String(first(root, name)?.textContent || '').trim();
  function decimal(root, name) {
    const raw = text(root, name), value = Number(raw.replace(',', '.'));
    if (!raw || !Number.isFinite(value)) throw new Error('Valor inválido no XML: ' + name);
    return value;
  }
  function extractCas(description) {
    const matches = [...String(description || '').matchAll(/\bC\s*\.?\s*A\s*\.?\s*(?:N[º°O.]?\s*)?[:#=-]?\s*(\d{2,3}\.\d{3}|\d{3,8})(?!\d)/gi)];
    return [...new Set(matches.map((m) => m[1].replace(/\D/g, '').replace(/^0+/, '')))];
  }
  function matchItem(description, cas) {
    const items = catalog();
    if (cas.length === 1) {
      const ids = [...new Set(variants().filter((v) => String(v.ca || '').replace(/\D/g, '').replace(/^0+/, '') === cas[0]).map((v) => v.epi_id))];
      if (ids.length === 1) {
        const item = items.find((i) => i.id === ids[0]);
        if (item) return { item, method: 'ca' };
      }
      if (ids.length > 1) return null;
    }
    const source = new Set(normalize(description).split(' ')), stop = new Set(['de','da','do','das','dos','com','para','e']);
    const candidates = items.map((item) => ({ item, words: normalize(item.nome).split(' ').filter((w) => !stop.has(w)) }))
      .filter((c) => c.words.length && c.words.every((w) => source.has(w))).sort((a,b) => b.words.length - a.words.length);
    if (!candidates.length || (candidates[1] && candidates[1].words.length === candidates[0].words.length)) return null;
    return { item: candidates[0].item, method: 'descricao_exata' };
  }
  function unitQuantity(unit, quantity) {
    return ['un','und','unid','unidade','unidades','pc','pcs','pca','peca','pecas','par','pr','pares'].includes(normalize(unit)) ? quantity : null;
  }
  function totals(note) {
    note.recognizedCount = note.items.filter((i) => i.epiId).length;
    note.stockQuantity = note.items.reduce((sum,i) => sum + (i.epiId && i.stockQuantity > 0 ? i.stockQuantity : 0),0);
    note.pendingCount = note.items.filter((i) => !i.epiId || !(i.stockQuantity > 0)).length;
    return note;
  }
  function parseXml(xmlText, fileName) {
    const xml = new DOMParser().parseFromString(xmlText,'application/xml');
    if (nodes(xml,'parsererror').length) throw new Error('XML inválido ou corrompido.');
    const inf = first(xml,'infNFe');
    if (!inf) throw new Error('NF-e sem infNFe.');
    const key = String(inf.getAttribute('Id') || '').replace(/^NFe/i,'');
    if (!/^\d{44}$/.test(key)) throw new Error('A NF-e não possui chave de acesso de 44 dígitos.');
    const ide = first(inf,'ide'), emit = first(inf,'emit'), total = first(inf,'ICMSTot');
    const items = nodes(inf,'det').map((det,index) => {
      const prod = first(det,'prod'), description = text(prod,'xProd');
      const cas = extractCas(description + ' ' + text(det,'infAdProd')), match = matchItem(description,cas);
      const quantity = decimal(prod,'qCom'), unit = text(prod,'uCom');
      if (quantity <= 0) throw new Error('Quantidade inválida na linha ' + (index + 1));
      return { line:index+1, supplierCode:text(prod,'cProd'), sourceDescription:description,
        ncm:text(prod,'NCM'), cfop:text(prod,'CFOP'), unit, quantity,
        unitValue:decimal(prod,'vUnCom'), totalValue:decimal(prod,'vProd'),
        detectedCa:cas.length===1 ? cas[0] : '', detectedCas:cas,
        epiId:match?.item.id || null, itemName:match?.item.nome || description,
        matchMethod:match?.method || 'pendente', stockQuantity:match ? unitQuantity(unit,quantity) : null };
    });
    if (!items.length) throw new Error('NF-e sem itens.');
    return totals({ fileName,xmlOriginal:xmlText,key,number:text(ide,'nNF'),series:text(ide,'serie'),
      issueDate:text(ide,'dhEmi') || text(ide,'dEmi') || null,
      supplierName:text(emit,'xNome'),supplierDocument:text(emit,'CNPJ') || text(emit,'CPF'),totalNote:decimal(total,'vNF'),items });
  }
  function currentNote() {
    const original = window.EPI_NFE_VIEWER?.getCurrent();
    if (!original?.xmlOriginal) return null;
    if (!cache.has(original)) {
      const parsed = parseXml(original.xmlOriginal,original.fileName);
      const index = state.notes.findIndex((n) => n.key===parsed.key);
      if (index<0) state.notes.push(parsed);
      else {
        const previous=state.notes[index];
        parsed.savedId=previous.savedId;
        parsed.items.forEach((item) => {
          const old=previous.items.find((i) => i.line===item.line && i.supplierCode===item.supplierCode && i.sourceDescription===item.sourceDescription && i.quantity===item.quantity && i.unit===item.unit);
          if (old) { item.epiId=old.epiId;item.itemName=old.itemName;item.matchMethod=old.matchMethod;item.stockQuantity=old.stockQuantity; }
        });
        state.notes[index]=parsed;
      }
      cache.set(original,parsed);
    }
    state.latest=cache.get(original);
    return state.latest;
  }
  function message(value,error=false) {
    if (!$('nfeMsg')) return;
    $('nfeMsg').className='nfe-msg ' + (error ? 'error' : 'ok');
    $('nfeMsg').textContent=value;
  }
  function buttonState(note) {
    const button=$('nfeSaveEntryBtn'); if (!button) return;
    const importing=window.EPI_NFE_VIEWER?.isImporting?.();
    button.hidden=!note; button.disabled=state.saving || importing || !note;
    button.textContent=state.saving ? 'Salvando…' : importing ? 'Lendo XML…' : note?.savedId ? 'Atualizar entrada salva' : 'Salvar entrada';
  }
  async function saveNote(note) {
    if (state.saving) throw new Error('Aguarde o salvamento em andamento.');
    if (window.EPI_NFE_VIEWER?.isImporting?.()) throw new Error('Aguarde a leitura do XML terminar.');
    if (!db()) throw new Error('Supabase ainda não está disponível.');
    if (!note?.items?.length) throw new Error('Importe uma NF-e antes de salvar.');
    totals(note);
    if (note.items.some((i) => i.stockQuantity!==null && (!Number.isFinite(i.stockQuantity) || i.stockQuantity<=0))) throw new Error('Confira as quantidades de estoque.');
    state.saving=true; buttonState(note);
    $('nfeStockReview')?.querySelectorAll('input,select').forEach((field) => { field.disabled=true; });
    try {
      const {data,error}=await db().rpc('epi_save_nfe',{p_nota:{
        chave_acesso:note.key,numero:note.number,serie:note.series,emitente_nome:note.supplierName,
        emitente_documento:note.supplierDocument,data_emissao:note.issueDate,valor_total:note.totalNote,
        arquivo_nome:note.fileName,xml_original:note.xmlOriginal,
        dados:{recognized_count:note.recognizedCount,stock_quantity:note.stockQuantity,pending_count:note.pendingCount}
      },p_itens:note.items.map((i)=>({indice:i.line,codigo_produto:i.supplierCode,descricao:i.sourceDescription,
        ncm:i.ncm,cfop:i.cfop,unidade:i.unit,quantidade:i.quantity,quantidade_estoque:i.epiId ? i.stockQuantity : null,
        valor_unitario:i.unitValue,valor_total:i.totalValue,ca_detectado:i.detectedCa,epi_id:i.epiId,match_score:i.epiId ? 1 : null,
        dados:{item_name:i.itemName,match_method:i.matchMethod,detected_cas:i.detectedCas}
      }))});
      if (error) throw error;
      if (!data?.id) throw new Error('O banco não confirmou o salvamento.');
      note.savedId=data.id;
      window.dispatchEvent(new CustomEvent('epi:stock-changed',{detail:{source:'nfe',entryId:data.id}}));
      message('NF '+note.number+' salva com XML original. '+format(data.quantidade_estoque)+' item(ns) contabilizado(s) nesta nota.' + (data.pendentes ? ' '+data.pendentes+' linha(s) pendente(s) de vínculo ou conversão, fora do saldo.' : ''));
      return data.id;
    } finally {
      state.saving=false;
      let selected=null;
      try { selected=currentNote(); } catch (_) { /* Não encobre o resultado da RPC. */ }
      buttonState(selected); renderReview(selected);
    }
  }
  function renderReview(note) {
    if (!$('nfeFileList')) return;
    let panel=$('nfeStockReview');
    if (!panel) { panel=document.createElement('section');panel.id='nfeStockReview';panel.className='nfe-stock-review';$('nfeFileList')?.after(panel); }
    panel.hidden=!note; panel.replaceChildren(); if (!note) return;
    const heading=document.createElement('h3');heading.textContent='Conferência para estoque';panel.append(heading);
    const summary=document.createElement('p');summary.className='nfe-stock-summary';panel.append(summary);
    const update=()=>{totals(note);summary.textContent=format(note.stockQuantity)+' item(ns) para estoque · '+note.pendingCount+' linha(s) pendente(s)';};
    const hint=document.createElement('p');hint.className='nfe-stock-hint';hint.textContent='Confira o vínculo. Caixas e pacotes exigem informar a quantidade de itens. Pares contam como pares, não como duas peças.';panel.append(hint);
    note.items.forEach((item)=>{
      const row=document.createElement('div');row.className='nfe-stock-item';
      const title=document.createElement('strong');title.textContent=item.sourceDescription;
      const meta=document.createElement('small');meta.textContent='NF: '+format(item.quantity)+' '+item.unit+' · C.A.: '+(item.detectedCa || (item.detectedCas.length ? 'mais de um C.A.' : 'não informado'));
      const label=document.createElement('label');label.textContent='EPI / Item';
      const select=document.createElement('select');select.setAttribute('aria-label','EPI da linha '+item.line);
      const empty=document.createElement('option');empty.value='';empty.textContent='Sem vínculo / fora do estoque';select.append(empty);
      catalog().forEach((epi)=>{const option=document.createElement('option');option.value=epi.id;option.textContent=epi.nome;select.append(option);});
      select.value=item.epiId || '';select.disabled=state.saving;label.append(select);
      const qtyLabel=document.createElement('label');qtyLabel.textContent='Quantidade de itens para estoque';
      const qty=document.createElement('input');qty.type='number';qty.min='0.0001';qty.step='any';qty.value=item.stockQuantity ?? '';qty.placeholder='Informar conversão';
      qty.setAttribute('aria-label','Quantidade de estoque da linha '+item.line);qty.disabled=!item.epiId || state.saving;qtyLabel.append(qty);
      select.addEventListener('change',()=>{
        item.epiId=select.value || null;item.itemName=catalog().find((e)=>e.id===item.epiId)?.nome || item.sourceDescription;
        item.matchMethod='manual';item.stockQuantity=item.epiId ? unitQuantity(item.unit,item.quantity) : null;
        qty.value=item.stockQuantity ?? '';qty.disabled=!item.epiId;update();
      });
      qty.addEventListener('input',()=>{item.stockQuantity=qty.value==='' ? null : Number(qty.value);update();});
      row.append(title,meta,label,qtyLabel);panel.append(row);
    }); update();
  }
  function sync() {
    const title=document.querySelector('.nfe-page-title');if (!title) return;
    if (!$('nfeSaveEntryBtn')) {
      const button=document.createElement('button');button.id='nfeSaveEntryBtn';button.type='button';button.className='btn primary compact';
      button.addEventListener('click',async()=>{
        try {await saveNote(currentNote());}
        catch(error){console.error('[NF-e]',error);message('Não foi possível salvar: '+(error.message || error),true);}
      });title.append(button);
    }
    try {const note=currentNote();buttonState(note);renderReview(note);}
    catch(error){buttonState(null);message(error.message,true);}
  }
  window.addEventListener('epi:nfe-selected',sync);
  window.addEventListener('epi:nfe-import-start', () => buttonState(state.latest));
  window.addEventListener('epi:data-loaded', () => {
    state.notes.forEach((note) => {
      if (note.savedId) return;
      note.items.forEach((item) => {
        if (item.epiId || item.matchMethod==='manual') return;
        const match=matchItem(item.sourceDescription,item.detectedCas);
        if (match) { item.epiId=match.item.id;item.itemName=match.item.nome;item.matchMethod=match.method;item.stockQuantity=unitQuantity(item.unit,item.quantity); }
      });
    });
    sync();
  });
  window.EPI_NFE_STOCK_READER={state,parseXml,saveNote,extractCas,unitQuantity,getCurrent:currentNote,getNotes:()=>[...state.notes]};
  let attempts=0;
  const timer=setInterval(()=>{if(document.querySelector('.nfe-page-title')){clearInterval(timer);sync();}else if(++attempts>=60)clearInterval(timer);},250);
  sync();
})();
