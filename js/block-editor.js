import { supabase } from './supabase.js';
const $ = id => document.getElementById(id);
const groups = [
  {name:'PERSONAL',icon:'✧',pages:[['About Me','♡','Your identity, personality, and backstory.'],['Appearance','✧','Describe your appearance and style.'],['Wardrobe','♧','Outfits, clothing, and style inspiration.']]},
  {name:'RELATIONSHIPS',icon:'♡',pages:[['My Friends','♧','The friends who are part of your story.'],['My Family','⌂','Your family and traditions.'],['My S/O','♡','Your significant other and relationship.'],['My Pets','♧','Your beloved animal companions.']]},
  {name:'CAREER',icon:'✦',pages:[['Career','✦','Work, education, and achievements.'],['Timeline','◷','Important events and dates in order.']]},
  {name:'BELONGINGS',icon:'⌂',pages:[['My Home','⌂','Your homes, rooms, and surroundings.'],['My Vehicles','◇','Cars and other vehicles.'],['Other Items','▣','Treasured possessions and belongings.']]},
  {name:'IMPORTANT',icon:'☼',pages:[['Scenarios','✎','Write scenes and moments.'],['Information & Rules','☼','World details, rules, and affirmations.'],['LIFA Diary','☷','Diary entries, memories, and reflections.']]}
];
const templates=groups.flatMap(group=>group.pages.map((p,i)=>({category:group.name,title:p[0],icon:p[1],hint:p[2],position:i})));
const drId=new URLSearchParams(location.search).get('dr');
let user,dr,pages=[],synced=[],current=null,blocks=[],version=0,savedVersion=0,savingPromise=null,timer=null,changing=false;
const status=msg=>$('save-state').textContent=msg;
const error=msg=>$('page-error').textContent=msg||'';
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls||'';if(text!==undefined)el.textContent=text;return el;};
const id=()=>crypto.randomUUID();
function normalize(content){
  if(typeof content==='string')return [{id:id(),type:'paragraph',text:content}];
  if(!Array.isArray(content))return [];
  return content.filter(b=>b&&typeof b==='object').map(b=>({
    id:typeof b.id==='string'?b.id:id(),
    type:['paragraph','heading','quote','checklist','divider','synced'].includes(b.type)?b.type:'paragraph',
    text:typeof b.text==='string'?b.text:'',
    checked:!!b.checked,
    syncId:typeof b.syncId==='string'?b.syncId:null
  }));
}
function changed(){version++;status('Unsaved changes…');clearTimeout(timer);timer=setTimeout(savePage,750);}
async function savePage(){
  clearTimeout(timer);
  if(!current||version===savedVersion)return true;
  if(savingPromise){await savingPromise;if(version===savedVersion)return true;}
  const page=current,v=version,content=structuredClone(blocks);
  status('Saving…');
  savingPromise=supabase.from('script_pages').update({content,updated_at:new Date().toISOString()})
    .eq('id',page.id).eq('user_id',user.id).select('id');
  const result=await savingPromise;savingPromise=null;
  if(result.error||!result.data?.length){status('Save failed');error(result.error?.message||'The page was not saved. Please try again.');return false;}
  page.content=content;savedVersion=v;
  if(version===savedVersion)status('✓ All changes saved');
  else {status('Unsaved changes…');timer=setTimeout(savePage,350);}
  error();return true;
}
async function flush(){while(savingPromise)await savingPromise;return savePage();}
async function loadSynced(){
  const {data, error:e}=await supabase.from('synced_blocks').select('id,title,content').eq('user_id',user.id).order('title');
  if(e){error(`Synced blocks unavailable: ${e.message}. Run the SQL update first.`);return false;}
  synced=data||[];return true;
}
function makeAction(label,callback,title){const btn=node('button','',label);btn.type='button';btn.title=title||label;btn.addEventListener('click',callback);return btn;}
function renderBlocks(){
  const list=$('block-list');list.replaceChildren();
  if(!blocks.length){list.append(node('div','empty-blocks','Start with “＋ Text” or add a synced block from your library.'));return;}
  blocks.forEach((block,index)=>{
    const item=node('div',`editor-block block-${block.type}`),top=node('div','block-topline'),actions=node('div','block-actions');
    top.append(node('span','block-type',block.type==='synced'?'◇ SYNCED BLOCK':block.type));
    actions.append(makeAction('↑',()=>move(index,-1),'Move up'),makeAction('↓',()=>move(index,1),'Move down'),makeAction('×',()=>remove(index),'Remove block'));
    top.append(actions);item.append(top);
    if(block.type==='synced'){
      const source=synced.find(s=>s.id===block.syncId);
      item.append(node('strong','',source?.title||'Missing synced block'));
      item.append(node('p','sync-caption','Changes to this source appear in every script that references it.'));
      item.append(node('p','sync-body',source?.content||'This synced block is empty or has been removed.'));
      const link=node('a','text-button','Edit in Synced Blocks Library ↗');link.href='synced-blocks.html';item.append(link);
    }else if(block.type==='divider'){
      item.append(document.createElement('hr'));
    }else{
      if(block.type==='checklist'){
        const checked=node('input');checked.type='checkbox';checked.checked=block.checked;checked.setAttribute('aria-label','Checklist completed');
        checked.addEventListener('change',()=>{block.checked=checked.checked;changed();});item.append(checked);
      }
      const field=node('textarea','block-input');field.value=block.text;
      field.placeholder=({paragraph:'Write something beautiful…',heading:'A lovely heading…',quote:'A favorite quote or affirmation…',checklist:'Something to remember…'})[block.type]||'Write here…';
      field.rows=block.type==='heading'?2:3;
      field.addEventListener('input',()=>{block.text=field.value;changed();});item.append(field);
    }
    list.append(item);
  });
}
function add(type,syncId=null){blocks.push({id:id(),type,text:'',checked:false,syncId});changed();renderBlocks();}
function move(i,delta){const target=i+delta;if(target<0||target>=blocks.length)return;[blocks[i],blocks[target]]=[blocks[target],blocks[i]];changed();renderBlocks();}
function remove(i){blocks.splice(i,1);changed();renderBlocks();}
async function selectPage(title){
  if(changing)return;changing=true;
  try{
    if(current&&!(await flush()))return;
    const next=pages.find(page=>page.title===title),template=templates.find(t=>t.title===title);
    if(!next||!template)return;
    current=next;blocks=normalize(next.content);version=savedVersion=0;clearTimeout(timer);
    $('page-category').textContent=template.category;$('page-icon').textContent=template.icon;
    $('page-heading').textContent=title;$('page-hint').textContent=template.hint;
    document.title=`${title} | ${dr.title} — Shifting Studio`;
    await loadSynced();renderBlocks();status('✓ All changes saved');
    document.querySelectorAll('.page-link').forEach(b=>b.classList.toggle('active',b.dataset.page===title));
    document.querySelector('.script-sidebar').classList.remove('open');
  }finally{changing=false;}
}
function navigation(){
  const nav=$('page-navigation');nav.replaceChildren();
  for(const group of groups){
    const wrap=node('div','script-group'),toggle=makeAction(`${group.icon}   ${group.name}  ⌄`,()=>{body.hidden=!body.hidden;toggle.setAttribute('aria-expanded',String(!body.hidden));});
    toggle.className='group-toggle';toggle.setAttribute('aria-expanded','true');
    const body=node('div','group-pages');
    for(const [title,symbol] of group.pages){const b=makeAction(`${symbol}   ${title}`,()=>selectPage(title));b.className='page-link';b.dataset.page=title;body.append(b);}
    wrap.append(toggle,body);nav.append(wrap);
  }
}
async function ensurePages(){
  const existing=new Set(pages.map(p=>`${p.category}\u0000${p.title}`));
  const missing=templates.filter(t=>!existing.has(`${t.category}\u0000${t.title}`));
  if(!missing.length)return;
  const rows=missing.map(t=>({dr_id:dr.id,user_id:user.id,category:t.category,title:t.title,icon:t.icon,position:t.position,content:[]}));
  const result=await supabase.from('script_pages').insert(rows);
  if(result.error)throw result.error;
  const loaded=await supabase.from('script_pages').select('id,category,title,content').eq('dr_id',dr.id).eq('user_id',user.id);
  if(loaded.error)throw loaded.error;pages=loaded.data||[];
}
async function init(){
  if(!drId){location.replace('dashboard.html');return;}
  const auth=await supabase.auth.getUser();if(auth.error||!auth.data?.user){location.replace('login.html');return;}user=auth.data.user;
  const r=await supabase.from('desired_realities').select('id,title,description').eq('id',drId).eq('user_id',user.id).single();
  if(r.error||!r.data)throw new Error('Could not open this reality. Check your account.');dr=r.data;
  $('dr-heading').textContent=dr.title;$('sidebar-dr').textContent=dr.title;$('breadcrumb-world').textContent=dr.title;
  $('dr-description').textContent=dr.description||'All the details of your imagined world, beautifully organized.';
  const response=await supabase.from('script_pages').select('id,category,title,content').eq('dr_id',dr.id).eq('user_id',user.id);
  if(response.error)throw response.error;pages=response.data||[];await ensurePages();navigation();await selectPage('About Me');
}
for(const [button,type] of [['add-text','paragraph'],['add-heading','heading'],['add-quote','quote'],['add-checklist','checklist'],['add-divider','divider']])$(button).onclick=()=>add(type);
$('add-synced').onclick=async()=>{
  if(!(await loadSynced()))return;
  if(!synced.length){$('sync-error').textContent='Create a synced block in the library first.';}
  else $('sync-error').textContent='';
  const select=$('sync-options');select.replaceChildren();
  for(const b of synced){const option=node('option','',b.title);option.value=b.id;select.append(option);}
  $('confirm-sync').disabled=!synced.length;$('sync-picker').showModal();
};
$('cancel-sync').onclick=()=>$('sync-picker').close();
$('confirm-sync').onclick=()=>{const value=$('sync-options').value;if(!value)return;add('synced',value);$('sync-picker').close();};
$('pages-toggle').onclick=()=>document.querySelector('.script-sidebar').classList.toggle('open');
window.addEventListener('beforeunload',event=>{if(version!==savedVersion){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&version!==savedVersion)savePage();});
window.addEventListener('focus',async()=>{if(user&&current){await loadSynced();renderBlocks();}});
init().catch(e=>{error(e.message||'Unable to load your script.');status('Unable to load');});
