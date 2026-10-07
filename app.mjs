import {STAT_KEYS, STAT_LABELS, createCharacter, normalizeCharacter, calculate, formatModifier, encodeCharacter, decodeCharacter} from './model.mjs';
import {TILLO_EXAMPLE} from './example.mjs';

const STORAGE_KEY = 'pokemon-character-library-v1';
const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>', share:'<path d="M15 3h6v6M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  print:'<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6z"/><path d="M17 12h1"/>', download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>', upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>', copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>', leaf:'<path d="M20 4C8 2 2 9 6 17c8 4 15-2 14-13Z"/><path d="m4 20 10-10"/>', spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>', bag:'<path d="m8 3 2 5h4l2-5ZM10 8C5 11 3 15 5 19c2 3 12 3 14 0 2-4 0-8-5-11Z"/>', notes:'<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/>', check:'<path d="m5 12 4 4L19 6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currencyLabels = ['Rame','Argento','Electrum','Oro','Platino'];
const currencyShort = ['MR','MA','ME','MO','MP'];
function textLimit(path) {
  if (['power','appearance','equipment'].includes(path)) return 6000;
  if (path.endsWith('.notes')) return 1500;
  if (path.startsWith('abilities.')) return 500;
  if (path.startsWith('currency.') || path.endsWith('.type')) return 80;
  if (['weakness','resistance','immunity'].includes(path)) return 1000;
  if (path === 'type') return 500;
  return 120;
}
let library = [], activeId, sharedCharacter = null, startupError = '', saveTimer, toastTimer, storageReadFailed = false;
const app = document.querySelector('#app');

function loadLibrary() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored && Array.isArray(stored.characters)) {
      library = stored.characters.slice(0, 100).flatMap(item => {
        try { return [normalizeCharacter(item)]; }
        catch { storageReadFailed=true;return []; }
      });
      activeId = stored.activeId;
      if (storageReadFailed) startupError='Alcune schede salvate non erano leggibili. Le schede valide sono state recuperate; esportale prima di modificare il salvataggio.';
    }
  } catch { storageReadFailed=true;startupError = 'Non è stato possibile leggere il salvataggio locale. Puoi importare una scheda esportata.'; }
  if (!library.length) library = [createCharacter()];
  if (!library.some(item => item.id === activeId)) activeId = library[0].id;
}
function active() { return sharedCharacter || library.find(item => item.id === activeId) || library[0]; }
function getPath(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); }
function setPath(object, path, value) { const keys = path.split('.'); const key = keys.pop(); keys.reduce((o,k) => o[k], object)[key] = value; }
function field(label, path, {number=false, min, max, placeholder='', className='', multiline=false, rows=3}={}) {
  const c = active(), value = getPath(c,path), id = `field-${path.replaceAll('.','-')}`;
  const readonly = sharedCharacter ? 'readonly' : '';
  const attrs = `id="${id}" data-field="${path}" ${number?'data-number="true"':''} ${readonly} placeholder="${esc(placeholder)}"`;
  const accessible = label ? '' : `aria-label="${esc({power:'Potere Pokémon',appearance:'Aspetto e note',equipment:'Equipaggiamento'}[path] || path)}"`;
  return `<label class="field ${className}" for="${id}">${label}${multiline ? `<textarea ${attrs} ${accessible} rows="${rows}" maxlength="${textLimit(path)}">${esc(value)}</textarea>` : `<input ${attrs} type="${number?'number':'text'}" ${number?`step="1" ${min!==undefined?`min="${min}"`:''} ${max!==undefined?`max="${max}"`:''}`:`maxlength="${textLimit(path)}"`} value="${esc(value)}">`}</label>`;
}
function listMarkup() {
  return library.map(c => `<button class="character-item ${!sharedCharacter&&c.id===activeId?'active':''}" data-action="select" data-id="${esc(c.id)}" ${!sharedCharacter&&c.id===activeId?'aria-current="true"':''}><span class="character-avatar">${esc((c.nickname||c.pokemon||'?').slice(0,1).toUpperCase())}</span><span><strong>${esc(c.nickname||'Nuovo personaggio')}</strong><small>${esc(c.pokemon||'Pokémon da scegliere')} · Lv. ${c.level}</small></span></button>`).join('');
}
function renderLibrary() { const list = document.querySelector('.character-list'); if (list) list.innerHTML = listMarkup(); }
function render() {
  const c=active(), d=calculate(c), read=sharedCharacter?'readonly':'';
  document.title = `${c.nickname || 'Scheda personaggio'} · Schede Pokémon`;
  app.innerHTML = `<header class="topbar"><div class="brand"><svg class="brand-icon" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="10" fill="#243e35"/><path d="M10 25C7 13 17 7 28 9c0 12-8 20-18 16Z" fill="#d5dfaa"/><path d="m10 28 13-13" stroke="#243e35" stroke-width="2"/></svg><span>Diario d'avventura<small>Pokémon & Dungeons & Dragons</small></span></div><div class="topbar-note"><span class="save-dot"></span><span id="save-status">${sharedCharacter?'Copia condivisa · sola lettura':'Salvata in questo browser'}</span></div></header>
  <div class="workspace"><aside class="sidebar"><div><h2 class="sidebar-heading">I tuoi personaggi</h2><nav class="character-list" aria-label="Personaggi salvati">${listMarkup()}</nav><div class="sidebar-new"><button class="button ghost" data-action="new">${icon('plus')} Nuova scheda</button></div></div><div class="sidebar-tools"><h2 class="sidebar-heading">Al tavolo</h2><button class="text-button" data-action="example">${icon('leaf')} Carica l'esempio di Tillo</button><button class="text-button" data-action="import">${icon('upload')} Importa una scheda</button><button class="text-button" data-action="export">${icon('download')} Esporta questa scheda</button></div><div class="sidebar-footer"><strong>Ogni avventura ha una storia.</strong>Le tue schede si salvano in questo browser. Esportale per conservarne una copia o portarle su un altro dispositivo.</div></aside>
  <main class="content"><div class="page-header"><div><h1>Scheda personaggio</h1><p>Un compagno, tante avventure.</p></div><div class="header-actions"><button class="button" data-action="print">${icon('print')} Stampa / PDF</button><button class="button primary" data-action="share">${icon('share')} Condividi</button></div></div>
  ${startupError?`<div class="error-banner" role="alert">${esc(startupError)}</div>`:''}
  ${sharedCharacter?`<div class="share-banner"><div><strong>Una scheda da leggere e portare con te.</strong><p>Questa è una copia condivisa. Crea la tua copia per modificarla e salvarla nel tuo browser.</p></div><button class="button primary" data-action="save-copy">${icon('copy')} Crea una copia</button></div>`:''}
  <article class="sheet" aria-label="Scheda del personaggio"><section class="identity" aria-label="Identità">${field('Soprannome','nickname',{className:'name',placeholder:'Il tuo personaggio'})}${field('Pokémon','pokemon',{placeholder:'Specie Pokémon'})}${field('Natura','nature',{placeholder:'Es. Gentile'})}${field('Livello','level',{number:true,min:1,max:1000})}${field('Esperienza','experience',{number:true,min:0})}</section>
  <section class="stats-section" aria-label="Statistiche">${STAT_KEYS.map(key=>`<div class="stat"><label for="stat-${key}">${esc(STAT_LABELS[key])}</label><input id="stat-${key}" data-field="stats.${key}" data-number="true" type="number" step="1" min="0" max="999" value="${c.stats[key]}" ${read}><div class="stat-mod"><span>Mod.</span><output id="modifier-${key}" for="stat-${key}">${formatModifier(d.modifiers[key])}</output></div></div>`).join('')}</section>
  <section class="combat" aria-label="Combattimento"><div class="combat-block"><span class="combat-label">CA</span><output id="armor-class" title="10 + modificatore Difesa">${d.armorClass}</output></div><div class="combat-block"><span class="combat-label">Iniziativa</span><output id="initiative" title="Modificatore Velocità">${formatModifier(d.initiative)}</output></div><div class="combat-block"><label class="combat-label" for="save">Save</label><input id="save" data-field="save" value="${esc(c.save)}" ${read} placeholder="—" maxlength="400" aria-label="Save"></div><div class="combat-block health"><label class="combat-label" for="current-hp">Punti ferita</label><div class="health-values"><input id="current-hp" type="number" min="0" step="1" data-field="currentHP" data-number="true" value="${c.currentHP}" aria-label="Punti ferita attuali" ${read}><span class="slash">/</span><output id="max-hp" title="Livello × (6 + modificatore HP)">${d.maxHP}</output></div><div class="health-track" aria-hidden="true"><span id="health-fill"></span></div><span id="health-warning" class="health-warning"></span>${!sharedCharacter?'<button class="health-restore" data-action="restore">Ripristina al massimo</button>':''}</div></section>
  <div class="sheet-body"><section class="sheet-column"><h2 class="section-title">${icon('spark')} Abilità</h2><p class="section-caption">Talenti e competenze del personaggio.</p><div class="abilities">${c.abilities.map((a,i)=>`<div class="ability-row"><span class="ability-dot" aria-hidden="true"></span><input data-field="abilities.${i}" aria-label="Abilità ${i+1}" value="${esc(a)}" placeholder="Abilità ${String(i+1).padStart(2,'0')}" ${read} maxlength="400"></div>`).join('')}</div><div class="paired-fields">${field('Amicizia','friendship')}${field('Bonus di competenza','proficiency',{number:true})}</div></section>
  <section class="sheet-column"><h2 class="section-title">${icon('leaf')} Mosse</h2><div class="moves">${c.moves.map((m,i)=>`<div class="move"><div class="move-heading"><span class="move-index">${String(i+1).padStart(2,'0')}</span><input data-field="moves.${i}.name" value="${esc(m.name)}" placeholder="Nome della mossa" aria-label="Nome mossa ${i+1}" ${read} maxlength="400"></div><div class="move-properties">${field('Attacco / Save',`moves.${i}.attack`,{placeholder:'Es. +5'})}${field('Danni',`moves.${i}.damage`,{placeholder:'Es. 2d6+2'})}${field('Tipo',`moves.${i}.type`,{placeholder:'Es. Erba'})}</div><div class="note"><label class="field"><textarea data-field="moves.${i}.notes" aria-label="Note mossa ${i+1}" rows="2" placeholder="Effetti e dettagli della mossa…" ${read} maxlength="12000">${esc(m.notes)}</textarea></label></div></div>`).join('')}</div><div class="power"><h2 class="section-title">Potere Pokémon</h2>${field('','power',{multiline:true,rows:4,placeholder:'Descrivi il potere del tuo Pokémon…'})}</div></section>
  <div class="sheet-column"><section class="notes"><h2 class="section-title">${icon('notes')} Aspetto e note</h2>${field('','appearance',{multiline:true,rows:8,placeholder:'Aspetto, personalità e appunti di avventura…'})}</section><section class="inventory"><h2 class="section-title">${icon('bag')} Equipaggiamento</h2>${field('','equipment',{multiline:true,rows:6,placeholder:'Strumenti, bacche e oggetti nello zaino…'})}<div class="currency">${c.currency.map((v,i)=>`<label class="coin" title="Monete di ${currencyLabels[i].toLowerCase()}"><span>${currencyShort[i]}</span><input data-field="currency.${i}" aria-label="Monete di ${currencyLabels[i].toLowerCase()}" value="${esc(v)}" inputmode="decimal" placeholder="0" ${read} maxlength="400"></label>`).join('')}</div></section></div></div>
  <section class="types" aria-label="Affinità">${field('Tipo Pokémon','type',{placeholder:'Es. Erba / Terra'})}${field('Debolezza','weakness',{placeholder:'Es. Fuoco'})}${field('Resistenza','resistance',{placeholder:'Es. Acqua'})}${field('Immunità','immunity',{placeholder:'Nessuna'})}</section></article>
  <div class="sheet-footer"><details class="formula-note"><summary>Come funzionano i calcoli automatici</summary><p>Modificatori = ⌊(statistica − 10) / 2⌋, con arrotondamento verso il basso.<br>Iniziativa = modificatore Velocità. CA = 10 + modificatore Difesa.<br>Punti ferita massimi = livello × (6 + modificatore HP).<br>Save, competenza, abilità e mosse sono campi da compilare.</p></details><div class="footer-actions"><button class="text-button mobile-tools" data-action="example">Esempio di Tillo</button><button class="text-button" data-action="import">Importa</button><button class="text-button" data-action="export">Esporta</button>${!sharedCharacter?'<button class="text-button" data-action="duplicate">Duplica</button><button class="text-button" data-action="delete">Elimina</button>':''}</div></div></main></div>`;
  updateCalculated();
  app.querySelectorAll('[data-field]').forEach(input=>{
    if (!input.dataset.number) input.maxLength=textLimit(input.dataset.field);
    if (input.dataset.field==='currentHP')input.max='1000000';
    if (input.dataset.field==='experience')input.max='1000000000000';
    if (input.dataset.field==='proficiency'){input.min='-999';input.max='999';}
  });
}

function updateCalculated() {
  const c=active(), d=calculate(c);
  STAT_KEYS.forEach(key=>document.querySelector(`#modifier-${key}`).textContent=formatModifier(d.modifiers[key]));
  document.querySelector('#armor-class').textContent=d.armorClass;
  document.querySelector('#initiative').textContent=formatModifier(d.initiative);
  document.querySelector('#max-hp').textContent=d.maxHP;
  document.querySelector('#health-fill').style.width=`${Math.min(100,Math.max(0,c.currentHP/d.maxHP*100))}%`;
  document.querySelector('#health-warning').textContent = c.currentHP>d.maxHP?'PF attuali superiori al massimo':'';
}
function toast(message) {
  const node=document.querySelector('#toast');node.textContent=message;node.classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('visible'),4200);
}
function persist() {
  if (sharedCharacter || storageReadFailed) return;
  clearTimeout(saveTimer);saveTimer=null;
  try {
    localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,activeId,characters:library}));
    const status=document.querySelector('#save-status'); if(status)status.textContent='Salvata in questo browser';
  } catch {
    const status=document.querySelector('#save-status');if(status)status.textContent='Salvataggio non disponibile · esporta la scheda';
    toast('Salvataggio locale non disponibile. Esporta la scheda per conservarla.');
  }
}
function scheduleSave() {
  storageReadFailed=false;
  const status=document.querySelector('#save-status');if(status)status.textContent='Salvataggio…';
  clearTimeout(saveTimer);saveTimer=setTimeout(persist,300);
}
function addCharacter(c, message) {
  if(library.length>=100){toast('Hai raggiunto 100 schede. Esportane ed eliminane una prima di aggiungerne altre.');return;}
  if (!sharedCharacter && saveTimer) persist();
  storageReadFailed=false;
  sharedCharacter=null;history.replaceState(null,'',location.pathname+location.search);
  library.push(c);activeId=c.id;startupError='';render();persist();if(message)toast(message);
}
function downloadCharacter() {
  const blob=new Blob([JSON.stringify({version:1,character:active()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;
  link.download=`${(active().nickname||'scheda-pokemon').replace(/[^\p{L}\p{N}_-]/gu,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Scheda esportata. Conserva il file per importarla su un altro dispositivo.');
}
async function share() {
  if(location.protocol==='file:'){toast('Apri la versione online per creare un link condivisibile. Qui puoi esportare la scheda JSON.');return;}
  const button=document.querySelector('[data-action="share"]');button.disabled=true;
  try {
    const snapshot=await encodeCharacter(active());
    const url=new URL(location.href);url.hash=`scheda=${snapshot}`;
    document.querySelector('#share-url').value=url.href;
    document.querySelector('#copy-share').textContent='Copia link';
    document.querySelector('#share-dialog').showModal();
  } catch(error) {toast(error.message || 'Non è stato possibile creare il link. Esporta la scheda.');}
  finally{button.disabled=false;}
}
async function copyShare() {
  const input=document.querySelector('#share-url');
  try {await navigator.clipboard.writeText(input.value);document.querySelector('#copy-share').textContent='Link copiato';toast('Link copiato. Puoi inviarlo ai tuoi compagni di avventura.');}
  catch {input.focus();input.select();toast('Seleziona e copia il link dal campo.');}
}
function renderPrint() {
  const c=active(), d=calculate(c);
  const block=(title,text)=>`<section class="print-section"><h2>${title}</h2><p>${esc(text||'—')}</p></section>`;
  document.querySelector('#print-sheet').innerHTML=`<header class="print-header"><h1>${esc(c.nickname||'Scheda personaggio')}</h1><p>Pokémon · Dungeons & Dragons</p></header><div class="print-facts">${[['Pokémon',c.pokemon],['Natura',c.nature],['Livello',c.level],['Esperienza',c.experience],['Tipo',c.type]].map(([l,v])=>`<div><span class="print-label">${l}</span><p>${esc(v)}</p></div>`).join('')}</div><div class="print-stats">${STAT_KEYS.map(k=>`<div class="print-stat"><span class="print-label">${STAT_LABELS[k]}</span><strong>${c.stats[k]}</strong><span>Mod. ${formatModifier(d.modifiers[k])}</span></div>`).join('')}</div><div class="print-combat"><span>CA <strong>${d.armorClass}</strong></span><span>Iniziativa <strong>${formatModifier(d.initiative)}</strong></span><span>Save <strong>${esc(c.save||'—')}</strong></span><span>Punti ferita <strong>${c.currentHP} / ${d.maxHP}</strong></span><span>Amicizia <strong>${esc(c.friendship)}</strong></span><span>Competenza <strong>${esc(c.proficiency)}</strong></span></div><div class="print-columns"><div><section class="print-section"><h2>Abilità</h2><ul>${c.abilities.filter(Boolean).map(v=>`<li>${esc(v)}</li>`).join('')||'<li>—</li>'}</ul></section>${block('Potere Pokémon',c.power)}</div><section class="print-section"><h2>Mosse</h2>${c.moves.map((m,i)=>`<div class="print-move"><h3>${i+1}. ${esc(m.name||'—')}</h3><p class="print-label">Att/Save ${esc(m.attack||'—')} · Danni ${esc(m.damage||'—')} · Tipo ${esc(m.type||'—')}</p><p>${esc(m.notes)}</p></div>`).join('')}</section><div>${block('Aspetto e note',c.appearance)}${block('Equipaggiamento',c.equipment)}<section class="print-section"><h2>Monete</h2><p>${c.currency.map((v,i)=>`${currencyShort[i]} ${esc(v||0)}`).join(' · ')}</p></section></div></div><div class="print-type"><span>Debolezza: ${esc(c.weakness||'—')}</span><span>Resistenza: ${esc(c.resistance||'—')}</span><span>Immunità: ${esc(c.immunity||'—')}</span></div>`;
}
const actions={
  new:()=>addCharacter(createCharacter(),'Nuova scheda pronta.'),
  select:button=>{if(!sharedCharacter&&saveTimer)persist();sharedCharacter=null;activeId=button.dataset.id;history.replaceState(null,'',location.pathname+location.search);render();persist();},
  example:()=>addCharacter(createCharacter(TILLO_EXAMPLE),'Esempio di Tillo caricato con i calcoli richiesti.'),
  import:()=>document.querySelector('#import-file').click(), export:downloadCharacter,
  duplicate:()=>addCharacter(createCharacter({...active(),id:undefined,nickname:`${active().nickname||'Personaggio'} (copia)`}),'Scheda duplicata.'),
  'save-copy':()=>addCharacter(createCharacter({...active(),id:undefined}),'La tua copia è pronta da modificare.'),
  restore:()=>{storageReadFailed=false;active().currentHP=calculate(active()).maxHP;document.querySelector('#current-hp').value=active().currentHP;updateCalculated();persist();toast('Punti ferita ripristinati.');},
  share, print:()=>{renderPrint();window.print();},delete:()=>document.querySelector('#confirm-dialog').showModal(),
  'cancel-delete':()=>document.querySelector('#confirm-dialog').close(),
  'confirm-delete':()=>{document.querySelector('#confirm-dialog').close();storageReadFailed=false;library=library.filter(c=>c.id!==activeId);if(!library.length)library=[createCharacter()];activeId=library[0].id;render();persist();toast('Scheda eliminata.');}
};
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button)actions[button.dataset.action]?.(button);});
app.addEventListener('input',event=>{
  const input=event.target;if(!input.dataset.field||sharedCharacter)return;
  let value=input.value;
  if(input.dataset.number){if(value===''||!Number.isFinite(Number(value)))return;value=Number(value);if(!input.validity.valid)return;}
  setPath(active(),input.dataset.field,value);updateCalculated();scheduleSave();
});
app.addEventListener('focusout',event=>{
  const input=event.target;if(!input.dataset.field||sharedCharacter)return;
  if(input.dataset.number){input.value=getPath(active(),input.dataset.field);}
  renderLibrary();document.title=`${active().nickname||'Scheda personaggio'} · Schede Pokémon`;
});
document.querySelector('#copy-share').addEventListener('click',copyShare);
document.querySelector('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try{
    if(file.size>200_000)throw new Error('Il file è troppo grande. Usa una scheda JSON esportata dall’app.');
    const data=JSON.parse(await file.text());const raw=data?.character||data;
    if (!raw?.stats || !Array.isArray(raw.abilities) || !Array.isArray(raw.moves)) throw new Error('Usa un file JSON di scheda esportato da questa app.');
    const c=normalizeCharacter(raw);
    addCharacter(createCharacter({...c,id:undefined}),'Scheda importata.');
  }catch(error){toast(`Importazione non riuscita: ${error.message}`);}
});
window.addEventListener('beforeprint',renderPrint);
window.addEventListener('pagehide',()=>{if(!sharedCharacter&&saveTimer)persist();});
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY||saveTimer||!event.newValue)return;
  const previousId=activeId;
  loadLibrary();
  if(library.some(c=>c.id===previousId))activeId=previousId;
  if(!document.querySelector('dialog[open]'))render();
});
window.addEventListener('hashchange',async()=>{await loadShared();render();});
async function loadShared(){
  if(!location.hash.startsWith('#scheda=')){sharedCharacter=null;return;}
  try{sharedCharacter=await decodeCharacter(location.hash.slice(8));startupError='';}
  catch{sharedCharacter=null;startupError='Il link della scheda non è valido o è incompleto. Chiedi un nuovo link a chi lo ha condiviso.';}
}
loadLibrary();await loadShared();render();if(!sharedCharacter&&!storageReadFailed)persist();
