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
let user,dr,pages=[],synced=[],current=null,blocks=[],version=0,savedVersion=0,savingPromise=null,timer=null,changing=false,uploads=0;
const status=msg=>$('save-state').textContent=msg;
const error=msg=>$('page-error').textContent=msg||'';
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls||'';if(text!==undefined)el.textContent=text;return el;};
const id=()=>crypto.randomUUID();
function normalize(content){
  if(typeof content==='string')return [{id:id(),type:'paragraph',text:content}];
  if(!Array.isArray(content))return [];
  return content.filter(b=>b&&typeof b==='object').map(b=>({
    id:typeof b.id==='string'?b.id:id(),
    type:['paragraph','heading','quote','checklist','divider','synced','image','gallery','columns','profile'].includes(b.type)?b.type:'paragraph',
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
    profileBio:typeof b.profileBio==='string'?b.profileBio:''
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
async function signedImage(path,img){
  if(!path)return;
  const result=await supabase.storage.from('script-images').createSignedUrl(path,3600);
  if(result.error){img.alt='Image unavailable';return;}
  if(img.isConnected)img.src=result.data.signedUrl;
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
function add(type,syncId=null){blocks.push({id:id(),type,text:'',checked:false,syncId,imagePath:'',galleryPaths:[],caption:'',left:'',right:'',profileName:'',profileRole:'',profileBio:''});changed();renderBlocks();}
function move(i,delta){const target=i+delta;if(target<0||target>=blocks.length)return;[blocks[i],blocks[target]]=[blocks[target],blocks[i]];changed();renderBlocks();}
function remove(i){blocks.splice(i,1);changed();renderBlocks();}
async function selectPage(title){
  if(changing)return;changing=true;
  try{
    if(uploads){error('Wait for your images to finish uploading before switching pages.');return;}
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
for(const [button,type] of [['add-text','paragraph'],['add-heading','heading'],['add-quote','quote'],['add-checklist','checklist'],['add-divider','divider'],['add-image','image'],['add-gallery','gallery'],['add-columns','columns'],['add-profile','profile']])$(button).onclick=()=>add(type);
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
