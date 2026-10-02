import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function reader(rpc = async () => ({ data: { id: 'saved', quantidade_estoque: 2, pendentes: 0 } })) {
  const context = { window: { addEventListener() {}, dispatchEvent() {} },
    document: { querySelector: () => null, getElementById: () => null },
    setInterval: () => 1, clearInterval() {}, CustomEvent: class {}, console,
    sb: { rpc }, epiCatalog: [], epiVariants: [] };
  vm.createContext(context); vm.runInContext(read('js/nfe-stock-reader.js'), context);
  return context.window.EPI_NFE_STOCK_READER;
}
const note = () => ({ key:'9'.repeat(44),number:'1',xmlOriginal:'<xml/>',items:[{line:1,quantity:2,stockQuantity:2,epiId:'epi',detectedCas:['39707']}] });
test('C.A. detectado com pontos, espaços, nº e número pontuado', () => {
  const api = reader();
  for (const input of ['CA 39707','C.A. 39707.','C. A. nº 39707','CA: 39.707','CA39707','CA 0039707']) assert.equal(api.extractCas(input).join(','),'39707');
  assert.equal(api.extractCas('CODIGO 39707').length,0);
  assert.equal(api.extractCas('CA 39707 e CA 43840').length,2);
});
test('pacotes não viram unidades por adivinhação; pares não são duplicados', () => {
  const api=reader();
  assert.equal(api.unitQuantity('PAR',10),10);
  assert.equal(api.unitQuantity('UN',2.5),2.5);
  assert.equal(api.unitQuantity('CX',10),null);
  assert.equal(api.unitQuantity('PCT',10),null);
});
test('salvar envia XML e todos os itens numa única RPC', async () => {
  let calls=0,payload;
  const api=reader(async(name,p)=>{assert.equal(name,'epi_save_nfe');calls++;payload=p;return {data:{id:'saved',quantidade_estoque:2,pendentes:0}};});
  assert.equal(await api.saveNote(note()),'saved');
  assert.equal(calls,1);assert.equal(payload.p_nota.xml_original,'<xml/>');
  assert.equal(payload.p_itens[0].quantidade,2);assert.equal(payload.p_itens[0].quantidade_estoque,2);
});
test('falha do banco libera botão e não marca nota como salva', async () => {
  const api=reader(async()=>({error:new Error('falha simulada')})),n=note();
  await assert.rejects(api.saveNote(n),/falha simulada/);
  assert.equal(api.state.saving,false);assert.equal(n.savedId,undefined);
});
test('duplo clique não dispara salvamentos concorrentes', async () => {
  let resolve;
  const api=reader(()=>new Promise(r=>{resolve=r;}));
  const first=api.saveNote(note());
  await assert.rejects(api.saveNote(note()),/Aguarde/);
  resolve({data:{id:'saved',quantidade_estoque:2,pendentes:0}});await first;
});
test('linha sem vínculo conserva quantidade fiscal e fica fora do saldo', async () => {
  const api=reader(async(_,p)=>{assert.equal(p.p_itens[0].quantidade,2);assert.equal(p.p_itens[0].quantidade_estoque,null);return {data:{id:'saved',quantidade_estoque:0,pendentes:1}};});
  const n=note();n.items[0].epiId=null;n.items[0].stockQuantity=null;await api.saveNote(n);
});
test('botão sem loop de observador e nota selecionada vem de fonte única', () => {
  const source=read('js/nfe-stock-reader.js');
  assert.ok(!source.includes('MutationObserver'));assert.ok(!source.includes("addEventListener('change', () => readFiles"));
  assert.ok(source.includes('window.EPI_NFE_VIEWER?.getCurrent()'));
  assert.ok(read('js/nfe.js').includes("CustomEvent('epi:nfe-selected'"));
});
test('estoque usa agregado completo no banco e atualiza com movimentações', () => {
  assert.ok(read('js/stock-nav.js').includes("rpc('epi_stock_summary'"));
  assert.ok(read('js/app.js').includes("CustomEvent('epi:data-loaded'"));
  assert.ok(read('supabase/nfe-stock.sql').includes('coalesce(a.qtd,0)-coalesce(b.qtd,0)'));
});
