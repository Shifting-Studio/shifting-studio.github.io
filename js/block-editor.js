import { supabase } from './supabase.js';
import { PAGE_TEMPLATES } from './page-templates.js';
import { renderSyncedContent, syncContent } from './sync-utils.js';
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
let user,dr,pages=[],synced=[],current=null,blocks=[],selectedIds=new Set(),pageSettings={type:'pageSettings',icon:'',imagePath:'',templateApplied:false},version=0,savedVersion=0,savingPromise=null,timer=null,changing=false,uploads=0,activeSubpage=null,dragIndex=null;
const status=msg=>$('save-state').textContent=msg;
const error=msg=>$('page-error').textContent=msg||'';
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls||'';if(text!==undefined)el.textContent=text;return el;};
const id=()=>crypto.randomUUID();
function normalize(content){
  if(typeof content==='string')return [{id:id(),type:'paragraph',text:content}];
  if(!Array.isArray(content))return [];
  return content.filter(b=>b&&typeof b==='object').map(b=>({
    id:typeof b.id==='string'?b.id:id(),
    type:['paragraph','heading','quote','checklist','divider','synced','image','gallery','columns','profile','subpage','field'].includes(b.type)?b.type:'paragraph',
    text:typeof b.text==='string'?b.text:'',
    checked:!!b.checked,
    syncId:typeof b.syncId==='string'?b.syncId:null,
    imagePath:typeof b.imagePath==='string'?b.imagePath:'',
    galleryPaths:Array.isArray(b.galleryPaths)?b.galleryPaths.filter(p=>typeof p==='string'):[],
    caption:typeof b.caption==='string'?b.caption:'',
    left:typeof b.left==='string'?b.left:'',
    right:typeof b.right==='string'?b.right:'',
    profileName:typeof b.profileName==='string'?b.profileName:'',
    profileRole:typeof b.profileRole==='string'?b.profileRole:'',
    profileBio:typeof b.profileBio==='string'?b.profileBio:'',
    subContent:typeof b.subContent==='string'?b.subContent:'',
    label:typeof b.label==='string'?b.label:''
  }));
}
function changed(){version++;status('Unsaved changes…');clearTimeout(timer);timer=setTimeout(savePage,750);}
async function savePage(){
  clearTimeout(timer);
  if(!current||version===savedVersion)return true;
  if(savingPromise){await savingPromise;if(version===savedVersion)return true;}
  const page=current,v=version,content=structuredClone([pageSettings,...blocks]);
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
  const {data, error:e}=await supabase.from('synced_blocks').select('id,title,content,blocks').eq('user_id',user.id).order('title');
  if(e){error(`Synced blocks unavailable: ${e.message}. Run the SQL update first.`);return false;}
  synced=data||[];return true;
}
function makeAction(label,callback,title){const btn=node('button','',label);btn.type='button';btn.title=title||label;btn.addEventListener('click',callback);return btn;}
async function signedImage(path,img){
  if(!path)return;
  const result=await supabase.storage.from('script-images').createSignedUrl(path,3600);
  if(result.error){img.alt='Image unavailable';return;}
  if(img.isConnected)img.src=result.data.signedUrl;
}
function renderCover(){
  $('page-icon').textContent=pageSettings.icon||templates.find(t=>t.title===current?.title)?.icon||'✧';
  const box=$('page-cover');box.replaceChildren();box.hidden=!pageSettings.imagePath;
  if(pageSettings.imagePath)box.append(photo(pageSettings.imagePath,'page-cover-photo'));
  $('remove-cover').hidden=!pageSettings.imagePath;
}
function photo(path,cls='media-preview'){
  const img=node('img',cls);img.alt='Script image';img.loading='lazy';signedImage(path,img);return img;
}
async function uploadImages(files,block,multiple=false){
  const selected=[...files];if(!selected.length)return;
  if(multiple&&block.galleryPaths.length+selected.length>12){error('A gallery can contain up to 12 images.');return;}
  uploads++;status('Uploading images…');error();
  try{
    for(const file of selected){
      const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
      const ext=extensions[file.type];
      if(!ext||file.size>5*1024*1024)throw new Error('Use JPG, PNG, WebP or GIF files, up to 5 MB each.');
      const path=`${user.id}/${dr.id}/${block.id}/${crypto.randomUUID()}.${ext}`;
      const result=await supabase.storage.from('script-images').upload(path,file,{contentType:file.type,upsert:false});
      if(result.error)throw result.error;
      if(multiple)block.galleryPaths.push(path);else block.imagePath=path;
      changed();
    }
    renderBlocks();
    if(block===pageSettings)renderCover();
  }catch(e){error(`Image upload failed: ${e.message}. Make sure you've run the Storage SQL.`);}
  finally{uploads--;if(version!==savedVersion)await savePage();else status('✓ All changes saved');}
}
function uploader(block,multiple=false){
  const label=node('label','upload-label',multiple?'＋ Add gallery images':'＋ Upload image');
  const input=node('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/gif';input.multiple=multiple;
  input.addEventListener('change',()=>uploadImages(input.files,block,multiple));label.append(input);return label;
}
function field(value,placeholder,onChange,cls='media-caption'){
  const input=node('input',cls);input.value=value;input.placeholder=placeholder;
  input.addEventListener('input',()=>{onChange(input.value);changed();});return input;
}
function renderBlocks(){
  const list=$('block-list');list.replaceChildren();
  if(!blocks.length){list.append(node('div','empty-blocks','Start with “＋ Text” or add a synced block from your library.'));return;}
  blocks.forEach((block,index)=>{
    const item=node('div',`editor-block block-${block.type}`),top=node('div','block-topline'),actions=node('div','block-actions');
    if(selectedIds.has(block.id))item.classList.add('is-selected');
    const selector=node('input','block-selector');selector.type='checkbox';selector.checked=selectedIds.has(block.id);
    selector.setAttribute('aria-label',`Select ${block.type} block`);
    selector.addEventListener('change',()=>{if(selector.checked)selectedIds.add(block.id);else selectedIds.delete(block.id);updateSelection();item.classList.toggle('is-selected',selector.checked);});
    top.append(selector);
    const title=node('span','block-type',block.type==='synced'?'◇ SYNCED BLOCK':block.type);
    const handle=node('span','drag-handle','⠿');handle.draggable=true;handle.title='Drag to reorder';
    handle.addEventListener('dragstart',event=>{dragIndex=index;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(index));});
    handle.addEventListener('dragend',()=>{dragIndex=null;document.querySelectorAll('.drag-target').forEach(x=>x.classList.remove('drag-target'));});
    top.append(handle,title);
    item.addEventListener('dragover',event=>{if(dragIndex===null)return;event.preventDefault();item.classList.add('drag-target');});
    item.addEventListener('dragleave',()=>item.classList.remove('drag-target'));
    item.addEventListener('drop',event=>{event.preventDefault();item.classList.remove('drag-target');if(dragIndex===null)return;const from=dragIndex;dragIndex=null;if(from!==index){const [moved]=blocks.splice(from,1);blocks.splice(index,0,moved);changed();renderBlocks();}});
    actions.append(makeAction('↑',()=>move(index,-1),'Move up'),makeAction('↓',()=>move(index,1),'Move down'),makeAction('×',()=>remove(index),'Remove block'));
    top.append(actions);item.append(top);
    if(block.type==='synced'){
      const source=synced.find(s=>s.id===block.syncId);
      item.append(node('strong','',source?.title||'Missing synced block'));
      item.append(node('p','sync-caption','Changes to this source appear in every script that references it.'));
      const preview=node('div','sync-preview');
      if(source)renderSyncedContent(preview,syncContent(source),synced,supabase,new Set([source.id]));
      else preview.append(node('p','nested-warning','The source block is missing.'));
      item.append(preview);
      const link=node('a','text-button','Edit in Synced Blocks Library ↗');link.href='synced-blocks.html';item.append(link);
    }else if(block.type==='divider'){
      item.append(document.createElement('hr'));
    }else if(block.type==='image'){
      if(block.imagePath)item.append(photo(block.imagePath));
      item.append(uploader(block));
      item.append(field(block.caption,'Write an image caption…',v=>block.caption=v));
    }else if(block.type==='gallery'){
      const gallery=node('div','media-gallery');
      block.galleryPaths.forEach((path,photoIndex)=>{
        const wrap=node('div','gallery-photo'),img=photo(path),removePhoto=makeAction('×',()=>{block.galleryPaths.splice(photoIndex,1);changed();renderBlocks();},'Remove from gallery');
        wrap.append(img,removePhoto);gallery.append(wrap);
      });
      item.append(gallery,uploader(block,true));
      item.append(field(block.caption,'Gallery caption…',v=>block.caption=v));
    }else if(block.type==='columns'){
      const columns=node('div','two-column-block');
      for(const side of ['left','right']){
        const textarea=node('textarea','block-input');textarea.value=block[side];textarea.placeholder=side==='left'?'Left column…':'Right column…';
        textarea.addEventListener('input',()=>{block[side]=textarea.value;changed();});columns.append(textarea);
      }item.append(columns);
    }else if(block.type==='profile'){
      const profile=node('div','profile-block'),portrait=node('div','');
      if(block.imagePath)portrait.append(photo(block.imagePath,'profile-portrait'));
      portrait.append(uploader(block));
      const info=node('div','');
      info.append(field(block.profileName,'Character name',v=>block.profileName=v,'profile-field profile-name'));
      info.append(field(block.profileRole,'Relationship / role',v=>block.profileRole=v,'profile-field'));
      const bio=node('textarea','profile-field profile-bio');bio.placeholder='Biography, personality, important details…';bio.value=block.profileBio;
      bio.addEventListener('input',()=>{block.profileBio=bio.value;changed();});info.append(bio);
      profile.append(portrait,info);item.append(profile);
    }else if(block.type==='subpage'){
      item.append(field(block.text,'Subpage title',v=>block.text=v,'profile-field profile-name'));
      item.append(node('p','sync-caption',(block.subContent||'').slice(0,135)||'A nested page waiting for your words…'));
      item.append(makeAction('Open subpage →',()=>openSubpage(block),'Edit nested page'));
    }else if(block.type==='field'){
      item.append(node('label','template-field-label',block.label||'Untitled field'));
      const answer=node('textarea','template-field-answer');answer.value=block.text;answer.rows=2;
      answer.placeholder='Write your answer here…';
      answer.setAttribute('aria-label',block.label||'Field answer');
      answer.addEventListener('input',()=>{block.text=answer.value;changed();});
      item.append(answer);
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
  updateSelection();
}
function updateSelection(){
  selectedIds=new Set([...selectedIds].filter(id=>blocks.some(b=>b.id===id)));
  const count=selectedIds.size;
  $('selected-count').textContent=count?`${count} block${count===1?'':'s'} selected`:'Select blocks to group them';
  $('make-synced').disabled=count===0;
}
async function createSyncedFromSelection(){
  const title=$('group-title').value.trim();
  if(!title){$('group-error').textContent='Give your reusable group a name.';return;}
  if(!selectedIds.size||!current)return;
  if(uploads){$('group-error').textContent='Wait until your images finish uploading.';return;}
  $('confirm-group').disabled=true;$('group-error').textContent='';
  const chosen=blocks.filter(b=>selectedIds.has(b.id)).map(b=>structuredClone(b));
  const result=await supabase.from('synced_blocks')
    .insert({user_id:user.id,title,content:'',blocks:chosen}).select('id').single();
  $('confirm-group').disabled=false;
  if(result.error||!result.data){$('group-error').textContent=result.error?.message||'Could not create the synced group. Did you run the SQL update?';return;}
  const first=blocks.findIndex(b=>selectedIds.has(b.id));
  blocks=blocks.filter(b=>!selectedIds.has(b.id));
  blocks.splice(first,0,blank('synced',result.data.id));
  selectedIds.clear();changed();
  $('group-dialog').close();
  await loadSynced();renderBlocks();
  if(!(await savePage()))error('Your group was created, but replacing the selected blocks was not saved. Please retry saving before leaving.');
}
function blank(type,syncId=null){return {id:id(),type,text:'',checked:false,syncId,imagePath:'',galleryPaths:[],caption:'',left:'',right:'',profileName:'',profileRole:'',profileBio:'',subContent:'',label:''};}
function add(type,syncId=null){blocks.push(blank(type,syncId));changed();renderBlocks();}
function move(i,delta){const target=i+delta;if(target<0||target>=blocks.length)return;[blocks[i],blocks[target]]=[blocks[target],blocks[i]];changed();renderBlocks();}
function remove(i){blocks.splice(i,1);changed();renderBlocks();}
function openSubpage(block){
  activeSubpage=block;
  $('subpage-heading').textContent=block.text||'Untitled subpage';
  $('subpage-title').value=block.text||'';
  $('subpage-content').value=block.subContent||'';
  $('subpage-dialog').showModal();
}
function addTemplate(kind){
  const heading=blank('heading');heading.text=kind==='character'?'Character profile':kind==='home'?'My dream home':'Wardrobe inspiration';
  if(kind==='character'){
    const profile=blank('profile'),quote=blank('quote');quote.text='Favorite memories, relationship details, and little things to remember…';
    blocks.push(heading,profile,quote);
  }else if(kind==='home'){
    const gallery=blank('gallery'),columns=blank('columns');columns.left='Location and exterior';columns.right='Rooms and favorite details';
    blocks.push(heading,gallery,columns);
  }else{
    const gallery=blank('gallery'),columns=blank('columns');columns.left='Everyday outfits';columns.right='Special occasions';
    blocks.push(heading,gallery,columns);
  }
  changed();renderBlocks();
}
function originalTemplate(title,append=false){
  const layout=PAGE_TEMPLATES[title];if(!layout)return;
  if(!append&&blocks.length)return;
  for(const entry of layout){
    if(typeof entry==='string'){
      const item=blank('field');item.label=entry;blocks.push(item);
    }else if(entry?.section){
      const item=blank('heading');item.text=entry.section;blocks.push(item);
    }
  }
  pageSettings.templateApplied=true;
  changed();renderBlocks();
}
async function selectPage(title){
  if(changing)return;changing=true;
  try{
    if(uploads){error('Wait for your images to finish uploading before switching pages.');return;}
    if(current&&!(await flush()))return;
    const next=pages.find(page=>page.title===title),template=templates.find(t=>t.title===title);
    if(!next||!template)return;
    current=next;selectedIds.clear();
    const meta=Array.isArray(next.content)?next.content.find(b=>b?.type==='pageSettings'):null;
    pageSettings={type:'pageSettings',icon:typeof meta?.icon==='string'?meta.icon:'',imagePath:typeof meta?.imagePath==='string'?meta.imagePath:'',templateApplied:meta?.templateApplied===true};
    blocks=normalize(Array.isArray(next.content)?next.content.filter(b=>b?.type!=='pageSettings'):next.content);
    version=savedVersion=0;clearTimeout(timer);
    $('page-category').textContent=template.category;$('page-icon').textContent=template.icon;
    $('page-heading').textContent=title;$('page-hint').textContent=template.hint;
    document.title=`${title} | ${dr.title} — Shifting Studio`;
    await loadSynced();renderCover();renderBlocks();status('✓ All changes saved');
    if(!blocks.length&&!pageSettings.templateApplied)originalTemplate(title);
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
for(const [button,type] of [['add-text','paragraph'],['add-heading','heading'],['add-quote','quote'],['add-checklist','checklist'],['add-divider','divider'],['add-image','image'],['add-gallery','gallery'],['add-columns','columns'],['add-profile','profile'],['add-subpage','subpage']])$(button).onclick=()=>add(type);
document.querySelectorAll('[data-template]').forEach(btn=>btn.onclick=()=>addTemplate(btn.dataset.template));
$('apply-page-template').onclick=()=>{
  if(!current)return;
  if(blocks.length&&!confirm('Add the original blank fields below your existing content? Nothing will be deleted.'))return;
  originalTemplate(current.title,true);
};
$('select-all-blocks').onclick=()=>{selectedIds=new Set(blocks.map(b=>b.id));renderBlocks();};
$('clear-block-selection').onclick=()=>{selectedIds.clear();renderBlocks();};
$('make-synced').onclick=()=>{
  if(!selectedIds.size)return;
  $('group-title').value='';$('group-error').textContent='';
  $('group-dialog').showModal();$('group-title').focus();
};
$('cancel-group').onclick=()=>$('group-dialog').close();
$('confirm-group').onclick=createSyncedFromSelection;
$('change-icon').onclick=()=>{
  if(!current)return;
  const result=prompt('Enter an emoji or short symbol for this page:',pageSettings.icon||'✧');
  if(result===null)return;
  pageSettings.icon=result.slice(0,12);changed();renderCover();
};
$('cover-input').onchange=event=>{if(current&&event.target.files.length)uploadImages(event.target.files,pageSettings);event.target.value='';};
$('remove-cover').onclick=()=>{if(!current)return;pageSettings.imagePath='';changed();renderCover();};
$('subpage-title').oninput=()=>{if(!activeSubpage)return;activeSubpage.text=$('subpage-title').value;changed();$('subpage-heading').textContent=activeSubpage.text||'Untitled subpage';};
$('subpage-content').oninput=()=>{if(!activeSubpage)return;activeSubpage.subContent=$('subpage-content').value;changed();};
$('close-subpage').onclick=()=>{$('subpage-dialog').close();activeSubpage=null;renderBlocks();savePage();};
$('subpage-dialog').addEventListener('close',()=>{activeSubpage=null;renderBlocks();});
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
