import { supabase } from './supabase.js';
import { PAGE_TEMPLATES } from './page-templates.js';
import { renderSyncedContent, syncContent } from './sync-utils.js';
import { sanitizeRichHtml } from './rich-text.js';
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
let lastRemoved=null,undoTimer=null;
const backgroundDefaults={mode:'plain',color1:'#f8f9f5',color2:'#eaf1e7',color3:'#fdf7ec',imagePath:'',position:'center',tint:25,blur:0,paper:96,lyrics:'',lyricsPosition:'right',lyricsColor:'#35523d',lyricsLayout:'original',lyricsSeparator:'✦',lyricsFont:'Playfair Display',lyricsSize:'auto',lyricsSizePx:22,lyricsEffect:'classic',lyricsOpacity:45,lyricsRepeat:false};
const headingFonts=['Playfair Display','Cormorant Garamond','Cinzel','Georgia','DM Sans','Arial','Times New Roman','Great Vibes'];
const typographyDefaults={headingFont:'Playfair Display',headingSize:26};
const safeTypography=value=>({headingFont:headingFonts.includes(value?.headingFont)?value.headingFont:typographyDefaults.headingFont,headingSize:Math.max(16,Math.min(44,Number(value?.headingSize)||26))});
const themeDefaults={name:'Classic Ivory',paper:'#fffefa',ink:'#283f33',muted:'#78897b',accent:'#426b50',border:'#e2e8df',soft:'#f8faf6'};
const themePresets=[
  {...themeDefaults},
  {name:'Sage Library',paper:'#f4f7ef',ink:'#304d3a',muted:'#728877',accent:'#4b7858',border:'#d7e5d5',soft:'#eaf1e5'},
  {name:'Rosewater',paper:'#fff8f8',ink:'#59424b',muted:'#987f89',accent:'#9f657d',border:'#eddde1',soft:'#faeef1'},
  {name:'Vintage Parchment',paper:'#f6eddc',ink:'#574936',muted:'#89765e',accent:'#876b47',border:'#dfd0b7',soft:'#eee3ce'},
  {name:'Dark Forest',paper:'#1e3027',ink:'#ecf4e8',muted:'#acc1ae',accent:'#add2a9',border:'#466353',soft:'#2b4234'},
  {name:'Midnight Blue',paper:'#1e293b',ink:'#edf2ff',muted:'#aebcd0',accent:'#b0caff',border:'#42536e',soft:'#2b3b52'},
  {name:'Black Velvet',paper:'#171a1a',ink:'#f6f0e4',muted:'#aca89f',accent:'#d5b78b',border:'#3c4040',soft:'#272c2c'},
  {name:'Plum Moonlight',paper:'#332637',ink:'#f8eaf8',muted:'#c8aecb',accent:'#e4b9df',border:'#604d63',soft:'#44344a'}
];
const safeTheme=value=>Object.fromEntries(Object.entries(themeDefaults).map(([key,fallback])=>[key,key==='name'?String(value?.name||fallback).slice(0,60):safeColor(value?.[key],fallback)]));
const transparentPaper=(hex,alpha)=>{
  const value=safeColor(hex,'#fffefa');
  return `rgba(${parseInt(value.slice(1,3),16)},${parseInt(value.slice(3,5),16)},${parseInt(value.slice(5,7),16)},${alpha})`;
};
const backgroundPresets=[
  {name:'Sage Morning',mode:'gradient',color1:'#edf4e8',color2:'#d4e5d3'},
  {name:'Rose Garden',mode:'gradient',color1:'#f8e9ee',color2:'#eddbda'},
  {name:'Golden Hour',mode:'gradient',color1:'#f8ecd7',color2:'#e4c99f'},
  {name:'Lavender Haze',mode:'gradient',color1:'#ece8fb',color2:'#d9d5ed'},
  {name:'Ocean Mist',mode:'gradient',color1:'#e0eff3',color2:'#c0dce5'},
  {name:'Midnight Ink',mode:'gradient',color1:'#293c4c',color2:'#63758b'},
  {name:'Ivory Paper',mode:'plain',color1:'#f7f6ef',color2:'#f7f6ef'},
  {name:'Forest',mode:'gradient',color1:'#526c58',color2:'#879d79'}
];
let bgLoadToken=0;
const backgroundUrlCache=new Map();
const safeColor=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(value||'')?value:fallback;
const safeBackground=value=>({...backgroundDefaults,...(value&&typeof value==='object'?value:{}),color1:safeColor(value?.color1,backgroundDefaults.color1),color2:safeColor(value?.color2,backgroundDefaults.color2),color3:safeColor(value?.color3,backgroundDefaults.color3),lyricsColor:safeColor(value?.lyricsColor,backgroundDefaults.lyricsColor)});
const status=msg=>$('save-state').textContent=msg;
const error=msg=>$('page-error').textContent=msg||'';
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls||'';if(text!==undefined)el.textContent=text;return el;};
const id=()=>crypto.randomUUID();
function normalize(content){
  if(typeof content==='string')return [{id:id(),type:'paragraph',text:content}];
  if(!Array.isArray(content))return [];
  return content.filter(b=>b&&typeof b==='object').map(b=>({
    id:typeof b.id==='string'?b.id:id(),
    html:typeof b.html==='string'?sanitizeRichHtml(b.html):'',
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
function applyTypography(){
  const settings=safeTypography(pageSettings.typography);
  const card=document.querySelector('.writing-card');
  card.style.setProperty('--dr-heading-font',`"${settings.headingFont}", Georgia, serif`);
  card.style.setProperty('--dr-heading-size',`${settings.headingSize}px`);
  card.style.setProperty('--dr-page-title-size',`${Math.round(settings.headingSize*1.35)}px`);
  const title=$('typography-preview');
  if(title){title.style.fontFamily=`"${settings.headingFont}",Georgia,serif`;title.style.fontSize=`${settings.headingSize}px`;}
}
function applyTheme(){
  const theme=safeTheme(pageSettings.theme),card=document.querySelector('.writing-card');
  for(const [key,value] of Object.entries(theme))if(key!=='name')card.style.setProperty(`--theme-${key}`,value);
  const preview=document.querySelector('.preview-paper');
  if(preview){preview.style.color=theme.ink;preview.style.borderColor=theme.border;}
}
function backgroundDesign(background){
  const first=background.color1,second=background.color2;
  return background.mode==='gradient'?`linear-gradient(125deg, ${first} 0%, ${second} 55%, ${background.color3||second} 100%)`:first;
}
const lyricSeparators={continuous:' ',dot:' · ',star:' ✦ ',heart:' ♡ '};
function formattedLyrics(background){
  const original=String(background.lyrics||'');
  const lines=original.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(background.lyricsLayout==='original')return original;
  const separator=background.lyricsLayout==='custom'?` ${String(background.lyricsSeparator||'✦').slice(0,12)} `:(lyricSeparators[background.lyricsLayout]||' ');
  return lines.join(separator);
}
function expandLyrics(background,forPreview=false){
  const text=formattedLyrics(background);
  if(!text||!background.lyricsRepeat)return text;
  const max=forPreview?1200:(background.lyricsPosition==='full'?24000:4800);
  const between=background.lyricsLayout==='original'?'\n':(background.lyricsLayout==='continuous'?' ':' ✦ ');
  return Array(Math.min(40,Math.max(1,Math.ceil(max/(text.length+between.length))))).fill(text).join(between);
}
function lyricStyle(element,background,preview=false){
  const full=background.lyricsPosition==='full';
  element.dataset.position=background.lyricsPosition;
  element.dataset.layout=background.lyricsLayout;
  element.dataset.effect=background.lyricsEffect;
  element.style.color=background.lyricsColor;
  const font=String(background.lyricsFont||'Playfair Display');
  const allowed=['Playfair Display','DM Sans','Georgia','Arial','Times New Roman','Courier New','Cormorant Garamond','Great Vibes','Cinzel'];
  element.style.fontFamily=allowed.includes(font)?`"${font}", Georgia, serif`:'Georgia, serif';
  const requested=background.lyricsSize==='auto'?null:Math.max(10,Math.min(90,Number(background.lyricsSizePx)||22));
  const size=preview?(requested?Math.max(7,requested*.48):(full?11:12)):(requested||(full?'clamp(12px,1.25vw,23px)':'clamp(17px,2vw,28px)'));
  element.style.fontSize=typeof size==='number'?`${size}px`:size;
  element.style.opacity=String(Math.max(0.08,Math.min(1,(Number(background.lyricsOpacity)||45)/100)));
  element.style.whiteSpace=background.lyricsLayout==='original'?'pre-wrap':'normal';
  element.classList.toggle('lyric-fill',full);
}
async function updateBackground(){
  const background=safeBackground(pageSettings.background);
  const layer=document.querySelector('.studio-background-layer');
  const lyricLayer=document.querySelector('.studio-lyric-layer');
  const preview=$('bg-preview');
  const paper=document.querySelector('.writing-card');
  const token=++bgLoadToken;
  const isImage=background.mode==='image'&&!!background.imagePath;
  layer.style.backgroundImage=background.mode==='gradient'?backgroundDesign(background):'none';
  layer.style.backgroundColor=isImage?background.color1:background.mode==='gradient'?background.color2:background.color1;
  layer.style.backgroundPosition=background.position;
  layer.style.filter=`blur(${Math.max(0,Math.min(20,Number(background.blur)||0))}px)`;
  layer.style.transform=background.blur>0?'scale(1.05)':'none';
  const paperAlpha=Math.max(.55,Math.min(1,Number(background.paper)/100||.96));
  const activeTheme=safeTheme(pageSettings.theme);
  paper.style.backgroundColor=transparentPaper(activeTheme.paper,paperAlpha);
  lyricLayer.textContent=expandLyrics(background);
  lyricStyle(lyricLayer,background);
  preview.style.backgroundImage=background.mode==='gradient'?backgroundDesign(background):'none';
  preview.style.backgroundColor=background.color1;
  preview.style.backgroundPosition=background.position;
  $('bg-preview-lyric').textContent=expandLyrics(background,true);
  lyricStyle($('bg-preview-lyric'),background,true);
  preview.querySelector('.preview-paper').style.backgroundColor=transparentPaper(activeTheme.paper,paperAlpha);
  preview.querySelector('.preview-paper').style.color=activeTheme.ink;
  if(isImage){
    let signedUrl=backgroundUrlCache.get(background.imagePath)?.url;
    if(!signedUrl||backgroundUrlCache.get(background.imagePath).expires<Date.now()){
      const result=await supabase.storage.from('script-images').createSignedUrl(background.imagePath,3600);
      signedUrl=result.data?.signedUrl;
      if(signedUrl)backgroundUrlCache.set(background.imagePath,{url:signedUrl,expires:Date.now()+3300000});
    }
    if(token!==bgLoadToken)return;
    if(signedUrl){
      const url=`url("${signedUrl.replaceAll('"','%22')}")`;
      const overlay=`linear-gradient(rgba(19,30,23,${background.tint/100}),rgba(19,30,23,${background.tint/100}))`;
      layer.style.backgroundImage=`${overlay},${url}`;preview.style.backgroundImage=`${overlay},${url}`;
    }
  }
}
function updateBackgroundForm(){
  const b=safeBackground(pageSettings.background);
  for(const [id,value] of [['bg-mode',b.mode],['bg-color-1',b.color1],['bg-color-2',b.color2],['bg-color-3',b.color3],['bg-position',b.position],['bg-tint',b.tint],['bg-blur',b.blur],['bg-paper',b.paper],['bg-lyrics',b.lyrics],['bg-lyrics-position',b.lyricsPosition],['bg-lyrics-color',b.lyricsColor],['bg-lyrics-layout',b.lyricsLayout],['bg-lyrics-separator',b.lyricsSeparator],['bg-lyrics-font',b.lyricsFont],['bg-lyrics-size',b.lyricsSize],['bg-lyrics-size-px',b.lyricsSizePx],['bg-lyrics-effect',b.lyricsEffect],['bg-lyrics-opacity',b.lyricsOpacity]])$(id).value=value;
  $('bg-lyrics-repeat').checked=!!b.lyricsRepeat;
  $('bg-lyrics-separator').closest('label').hidden=b.lyricsLayout!=='custom';
  $('bg-lyrics-size-px').closest('label').hidden=b.lyricsSize==='auto';
  $('bg-lyrics-size-value').textContent=`${b.lyricsSizePx} px`;
  $('bg-lyrics-opacity-value').textContent=`${b.lyricsOpacity}%`;
  $('bg-tint-value').textContent=`${b.tint}%`;$('bg-blur-value').textContent=`${b.blur} px`;$('bg-paper-value').textContent=`${b.paper}%`;
  $('bg-image-controls').hidden=b.mode!=='image';$('bg-remove-image').hidden=!b.imagePath;
  $('bg-color-2').closest('label').hidden=b.mode!=='gradient';$('bg-color-3').closest('label').hidden=b.mode!=='gradient';
}
function backgroundChanged(){
  if(!current)return;
  pageSettings.background={...safeBackground(pageSettings.background),mode:$('bg-mode').value,color1:$('bg-color-1').value,color2:$('bg-color-2').value,color3:$('bg-color-3').value,
    position:$('bg-position').value,tint:Number($('bg-tint').value),blur:Number($('bg-blur').value),paper:Number($('bg-paper').value),
    lyrics:$('bg-lyrics').value.slice(0,12000),lyricsPosition:$('bg-lyrics-position').value,lyricsColor:$('bg-lyrics-color').value,
    lyricsLayout:$('bg-lyrics-layout').value,lyricsSeparator:$('bg-lyrics-separator').value.slice(0,12),lyricsFont:$('bg-lyrics-font').value,
    lyricsSize:$('bg-lyrics-size').value,lyricsSizePx:Number($('bg-lyrics-size-px').value),lyricsEffect:$('bg-lyrics-effect').value,
    lyricsOpacity:Number($('bg-lyrics-opacity').value),lyricsRepeat:$('bg-lyrics-repeat').checked};
  updateBackgroundForm();updateBackground();changed();$('bg-status').textContent='Saving your background…';
}
async function uploadBackground(file){
  if(!file||!current)return;
  const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
  if(!extensions[file.type]||file.size>5*1024*1024){$('bg-status').textContent='Choose a JPG, PNG, WebP, or GIF up to 5 MB.';return;}
  const pageId=current.id;uploads++;$('bg-status').textContent='Uploading your picture…';
  const path=`${user.id}/${dr.id}/backgrounds/${crypto.randomUUID()}.${extensions[file.type]}`;
  try{
    const {error:uploadError}=await supabase.storage.from('script-images').upload(path,file,{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;
    if(current?.id!==pageId)return;
    pageSettings.background={...safeBackground(pageSettings.background),imagePath:path,mode:'image'};
    updateBackgroundForm();updateBackground();changed();$('bg-status').textContent='Picture uploaded!';
  }catch(e){$('bg-status').textContent=`Upload failed: ${e.message}`;}
  finally{uploads--;}
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
function richEditor(block,placeholder,cls='block-input'){
  const editor=node('div',`rich-editor ${cls}`);editor.contentEditable='true';editor.role='textbox';
  editor.setAttribute('aria-multiline','true');editor.dataset.placeholder=placeholder;
  editor.innerHTML=sanitizeRichHtml(block.html||'');
  if(!block.html)editor.textContent=block.text||'';
  editor.addEventListener('input',()=>{
    block.html=sanitizeRichHtml(editor.innerHTML);block.text=editor.innerText||editor.textContent||'';changed();
  });
  editor.addEventListener('paste',event=>{
    event.preventDefault();const plain=event.clipboardData?.getData('text/plain')||'';
    document.execCommand('insertText',false,plain);
  });
  editor.addEventListener('blur',()=>{
    const safe=sanitizeRichHtml(editor.innerHTML);
    // Never rebuild live DOM on blur: doing so invalidates the selected Range
    // before font and size dropdowns can apply their formatting.
    block.html=safe;
  });
  return editor;
}
function renderBlocks(){
  const list=$('block-list');list.replaceChildren();
  if(!blocks.length){list.append(node('div','empty-blocks','Start with “＋ Text” or add a synced block from your library.'));return;}
  blocks.forEach((block,index)=>{
    const item=node('div',`editor-block block-${block.type}`),top=node('div','block-topline'),actions=node('div','block-actions');
    item.dataset.blockId=block.id;
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
    actions.append(makeAction('⧉',()=>duplicate(index),'Duplicate this block'),makeAction('↑',()=>move(index,-1),'Move up'),makeAction('↓',()=>move(index,1),'Move down'),makeAction('×',()=>remove(index),'Remove block (Undo available)'));
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
      const answer=richEditor(block,'Write your answer here…','template-field-answer');
      answer.setAttribute('aria-label',block.label||'Field answer');
      item.append(answer);
    }else{
      if(block.type==='checklist'){
        const checked=node('input');checked.type='checkbox';checked.checked=block.checked;checked.setAttribute('aria-label','Checklist completed');
        checked.addEventListener('change',()=>{block.checked=checked.checked;changed();});item.append(checked);
      }
      item.append(richEditor(block,({paragraph:'Write something beautiful…',heading:'A lovely heading…',quote:'A favorite quote or affirmation…',checklist:'Something to remember…'})[block.type]||'Write here…'));
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
  document.querySelector('.writing-card').classList.remove('selection-active');
  $('selection-mode').setAttribute('aria-pressed','false');$('selection-mode').textContent='Select multiple';
  $('group-dialog').close();
  await loadSynced();renderBlocks();
  if(!(await savePage()))error('Your group was created, but replacing the selected blocks was not saved. Please retry saving before leaving.');
}
function blank(type,syncId=null){return {id:id(),type,text:'',html:'',checked:false,syncId,imagePath:'',galleryPaths:[],caption:'',left:'',right:'',profileName:'',profileRole:'',profileBio:'',subContent:'',label:''};}
function add(type,syncId=null){blocks.push(blank(type,syncId));changed();renderBlocks();}
function move(i,delta){const target=i+delta;if(target<0||target>=blocks.length)return;[blocks[i],blocks[target]]=[blocks[target],blocks[i]];changed();renderBlocks();}
function duplicate(i){const copy=structuredClone(blocks[i]);copy.id=id();blocks.splice(i+1,0,copy);changed();renderBlocks();}
function clearUndo(){lastRemoved=null;clearTimeout(undoTimer);$('undo-toast').hidden=true;}
function remove(i){
  lastRemoved={block:structuredClone(blocks[i]),index:i,pageId:current?.id};
  blocks.splice(i,1);changed();renderBlocks();
  $('undo-message').textContent='Block removed';$('undo-toast').hidden=false;
  clearTimeout(undoTimer);undoTimer=setTimeout(clearUndo,12000);
}
function undoRemove(){
  if(!lastRemoved||lastRemoved.pageId!==current?.id)return;
  blocks.splice(Math.min(lastRemoved.index,blocks.length),0,lastRemoved.block);
  changed();renderBlocks();clearUndo();
}
function blockSearchText(block){
  return [block.text,block.label,block.left,block.right,block.profileName,block.profileRole,
    block.profileBio,block.caption,block.subContent,block.type==='synced'?synced.find(s=>s.id===block.syncId)?.title:'']
    .filter(Boolean).join(' ');
}
function searchAllPages(){
  const term=$('script-search-input').value.trim().toLocaleLowerCase();
  const list=$('script-search-results');list.replaceChildren();
  if(!term){list.append(node('p','search-placeholder','Start typing to search names, details, rules, and more across your 15 pages.'));return;}
  const matches=[];
  for(const page of pages){
    const content=page.id===current?.id?blocks:normalize(Array.isArray(page.content)?page.content.filter(b=>b?.type!=='pageSettings'):page.content);
    if(page.title.toLocaleLowerCase().includes(term))matches.push({page,block:null,preview:'Page title'});
    for(const block of content){
      const text=blockSearchText(block);
      if(text.toLocaleLowerCase().includes(term))matches.push({page,block,preview:text});
    }
  }
  if(!matches.length){list.append(node('p','search-placeholder','No matches yet. Try another word.'));return;}
  for(const match of matches.slice(0,60)){
    const button=node('button','search-result');button.type='button';
    button.append(node('strong','',match.page.title),node('span','',match.preview.slice(0,180)));
    button.addEventListener('click',async()=>{
      $('search-dialog').close();await selectPage(match.page.title);
      if(match.block){const target=[...document.querySelectorAll('.editor-block')].find(x=>x.dataset.blockId===match.block.id);
        target?.scrollIntoView({behavior:'smooth',block:'center'});target?.classList.add('search-highlight');
        setTimeout(()=>target?.classList.remove('search-highlight'),1800);
      }
    });list.append(button);
  }
  if(matches.length>60)list.append(node('p','search-placeholder',`Showing the first 60 of ${matches.length} matches.`));
}
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
    current=next;selectedIds.clear();clearUndo();
    const meta=Array.isArray(next.content)?next.content.find(b=>b?.type==='pageSettings'):null;
    pageSettings={type:'pageSettings',icon:typeof meta?.icon==='string'?meta.icon:'',imagePath:typeof meta?.imagePath==='string'?meta.imagePath:'',templateApplied:meta?.templateApplied===true,background:safeBackground(meta?.background),typography:safeTypography(meta?.typography),theme:safeTheme(meta?.theme)};
    blocks=normalize(Array.isArray(next.content)?next.content.filter(b=>b?.type!=='pageSettings'):next.content);
    version=savedVersion=0;clearTimeout(timer);
    $('page-category').textContent=template.category;$('page-icon').textContent=template.icon;
    $('page-heading').textContent=title;$('page-hint').textContent=template.hint;
    document.title=`${title} | ${dr.title} — Shifting Studio`;
    await loadSynced();renderCover();applyTypography();applyTheme();updateBackgroundForm();updateBackground();renderBlocks();status('✓ All changes saved');
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
const blockHelp={
  'add-text':'A normal paragraph for writing anything.',
  'add-heading':'A title to separate sections of your script.',
  'add-quote':'A highlighted quote or affirmation.',
  'add-checklist':'A small item you can tick off.',
  'add-divider':'A thin line between sections.',
  'add-image':'One picture with an optional caption.',
  'add-gallery':'A collection of several pictures.',
  'add-columns':'Two pieces of writing next to each other.',
  'add-profile':'A character profile with a picture and details.',
  'add-subpage':'An extra page of writing inside this page.'
};
for(const [button,help] of Object.entries(blockHelp))$(button).title=help;
document.querySelectorAll('[data-template]').forEach(btn=>btn.onclick=()=>addTemplate(btn.dataset.template));
$('apply-page-template').onclick=()=>{
  if(!current)return;
  if(blocks.length&&!confirm('Add the original blank fields below your existing content? Nothing will be deleted.'))return;
  originalTemplate(current.title,true);
};
$('select-all-blocks').onclick=()=>{selectedIds=new Set(blocks.map(b=>b.id));renderBlocks();};
$('clear-block-selection').onclick=()=>{selectedIds.clear();renderBlocks();};
$('selection-mode').onclick=()=>{
  const card=document.querySelector('.writing-card');const active=card.classList.toggle('selection-active');
  if(!active)selectedIds.clear();
  $('selection-mode').setAttribute('aria-pressed',String(active));
  $('selection-mode').textContent=active?'Done selecting':'Select multiple';renderBlocks();
};
$('undo-remove').onclick=undoRemove;
$('dismiss-undo').onclick=clearUndo;
$('search-pages').onclick=()=>{$('script-search-input').value='';$('search-dialog').showModal();searchAllPages();$('script-search-input').focus();};
$('close-search').onclick=()=>$('search-dialog').close();
$('script-search-input').addEventListener('input',searchAllPages);
$('focus-mode').onclick=()=>{
  const active=document.body.classList.toggle('focus-writing');
  $('focus-mode').setAttribute('aria-pressed',String(active));
  $('focus-mode').textContent=active?'◱ Exit focus':'◫ Focus';
};
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault();$('search-pages').click();
  }
  if(event.key==='Escape'&&document.body.classList.contains('focus-writing')&&!document.querySelector('dialog[open]'))$('focus-mode').click();
});
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
const backgroundLayer=node('div','studio-background-layer'),lyricLayer=node('div','studio-lyric-layer');
document.querySelector('.script-main').prepend(backgroundLayer,lyricLayer);
// Advanced overlay controls are built as a separate panel to keep the main editor uncluttered.
function buildLyricsControls(){
  const textarea=$('bg-lyrics');textarea.maxLength=12000;textarea.rows=6;
  textarea.placeholder='Paste your own lyrics or write a quote. Line breaks can be preserved or joined with a symbol.';
  const position=$('bg-lyrics-position');
  const full=node('option','','Fill the whole screen');full.value='full';position.append(full);
  const panel=node('div','lyrics-advanced');
  panel.append(node('span','background-section-label','TEXT WALLPAPER & EFFECTS'));
  const labeledSelect=(labelText,fieldId,options)=>{
    const label=node('label','',labelText),select=node('select');select.id=fieldId;
    for(const [value,title] of options){const option=node('option','',title);option.value=value;select.append(option);}
    label.append(select);panel.append(label);return select;
  };
  labeledSelect('Line breaks & separators','bg-lyrics-layout',[
    ['original','Exactly as written (keep each line)'],['continuous','One continuous paragraph'],['dot','Join lines with · dots'],
    ['star','Join lines with ✦ stars'],['heart','Join lines with ♡ hearts'],['custom','My own separator']
  ]);
  const separator=node('label','','Custom separator'),sepInput=node('input');sepInput.id='bg-lyrics-separator';sepInput.maxLength=12;sepInput.placeholder='e.g. ★ / • / ~';separator.append(sepInput);panel.append(separator);
  labeledSelect('Font','bg-lyrics-font',[
    ['Playfair Display','Elegant serif'],['Cormorant Garamond','Poetic / editorial'],['Great Vibes','Romantic cursive'],
    ['Cinzel','Royal lettering'],['Georgia','Classic'],['DM Sans','Clean modern'],['Arial','Minimal'],
    ['Times New Roman','Book page'],['Courier New','Typewriter']
  ]);
  labeledSelect('Text size','bg-lyrics-size',[['auto','Automatic (recommended)'],['custom','Choose exact size']]);
  const size=node('label',''),sizeTitle=node('span','','Manual size · '),sizeValue=node('span');sizeValue.id='bg-lyrics-size-value';
  const sizeSlider=node('input');sizeSlider.type='range';sizeSlider.min=10;sizeSlider.max=90;sizeSlider.id='bg-lyrics-size-px';
  size.append(sizeTitle,sizeValue,sizeSlider);panel.append(size);
  labeledSelect('Text effect','bg-lyrics-effect',[
    ['classic','Soft classic'],['glass','Liquid glass'],['foggy','Foggy / dreamy'],['glow','Luminous glow'],
    ['outline','Outlined letters'],['embossed','Embossed paper'],['typewriter','Vintage ink']
  ]);
  const opacity=node('label',''),opacityTitle=node('span','','Text visibility · '),opacityValue=node('span');opacityValue.id='bg-lyrics-opacity-value';
  const opacitySlider=node('input');opacitySlider.type='range';opacitySlider.min=8;opacitySlider.max=100;opacitySlider.id='bg-lyrics-opacity';
  opacity.append(opacityTitle,opacityValue,opacitySlider);panel.append(opacity);
  const repeat=node('label','lyrics-repeat'),checkbox=node('input');checkbox.type='checkbox';checkbox.id='bg-lyrics-repeat';
  repeat.append(checkbox,node('span','','Repeat the text to fill empty space'));panel.append(repeat);
  $('bg-lyrics-color').closest('label').after(panel);
}
buildLyricsControls();
for(const preset of backgroundPresets){
  const sample=node('button','background-preset');sample.type='button';sample.title=preset.name;
  const swatch=node('span','preset-swatch');swatch.style.background=backgroundDesign(preset);
  sample.append(swatch,node('span','',preset.name));
  sample.onclick=()=>{pageSettings.background={...safeBackground(pageSettings.background),...preset,imagePath:''};updateBackgroundForm();updateBackground();changed();$('bg-status').textContent=`${preset.name} applied`;};
  $('background-presets').append(sample);
}
$('open-background').onclick=()=>{if(!current)return;updateBackgroundForm();$('bg-status').textContent='';$('background-dialog').showModal();};
$('close-background').onclick=()=>$('background-dialog').close();
$('bg-done').onclick=async()=>{if(uploads){$('bg-status').textContent='Please wait for the picture upload.';return;}await savePage();$('background-dialog').close();};
for(const setting of ['bg-mode','bg-color-1','bg-color-2','bg-color-3','bg-position','bg-tint','bg-blur','bg-paper','bg-lyrics','bg-lyrics-position','bg-lyrics-color','bg-lyrics-layout','bg-lyrics-separator','bg-lyrics-font','bg-lyrics-size','bg-lyrics-size-px','bg-lyrics-effect','bg-lyrics-opacity','bg-lyrics-repeat']){
  $(setting).addEventListener('input',backgroundChanged);
}
$('bg-lyrics-position').addEventListener('change',()=>{
  // Full-screen wallpaper defaults to flowing text; users can still
  // choose original line breaks, dots, or stars afterward.
  if($('bg-lyrics-position').value==='full'&&$('bg-lyrics-layout').value==='original'){
    $('bg-lyrics-layout').value='continuous';backgroundChanged();
  }
});
$('bg-upload').onchange=e=>{const file=e.target.files?.[0];e.target.value='';if(file)uploadBackground(file);};
$('bg-remove-image').onclick=()=>{pageSettings.background={...safeBackground(pageSettings.background),imagePath:'',mode:'plain'};updateBackgroundForm();updateBackground();changed();$('bg-status').textContent='Background picture removed.';};
$('bg-reset').onclick=()=>{if(!confirm('Reset the background styling for this page? Your writing will stay.'))return;pageSettings.background={...backgroundDefaults};updateBackgroundForm();updateBackground();changed();$('bg-status').textContent='Background reset.';};
$('bg-apply-all').onclick=async()=>{
  if(uploads){$('bg-status').textContent='Wait for the photo upload to finish first.';return;}
  if(!confirm('Use this background on all 15 pages in this DR? Existing backgrounds on those pages will be replaced. All writing stays.'))return;
  const button=$('bg-apply-all');button.disabled=true;$('bg-status').textContent='Applying to your pages…';
  try{
    if(!(await flush()))throw new Error('Could not save the current page.');
    const style=structuredClone(safeBackground(pageSettings.background));let count=0;
    for(const page of pages){
      if(page.id===current?.id){count++;continue;}
      const content=Array.isArray(page.content)?structuredClone(page.content):typeof page.content==='string'?[{id:id(),type:'paragraph',text:page.content}]:[];
      const existing=content.find(b=>b?.type==='pageSettings');
      if(existing)existing.background=style;
      else content.unshift({type:'pageSettings',icon:'',imagePath:'',templateApplied:false,background:style});
      const {data,error:saveError}=await supabase.from('script_pages').update({content,updated_at:new Date().toISOString()}).eq('id',page.id).eq('user_id',user.id).select('id');
      if(saveError||!data?.length)throw new Error(`Could not update ${page.title}: ${saveError?.message||'Permission denied'}`);
      page.content=content;count++;
    }
    $('bg-status').textContent=`Done! Your background now appears on ${count} pages.`;
  }catch(e){$('bg-status').textContent=`Some pages may not have updated. ${e.message}`;}
  finally{button.disabled=false;}
};
// Shared heading styles can be propagated to the whole desired reality.
const typographyButton=node('button','typography-open','Aa Heading styles');typographyButton.type='button';
document.querySelector('.page-customize').append(typographyButton);
const typographyDialog=document.createElement('dialog');typographyDialog.className='modal typography-dialog';
const typographyEyebrow=node('div','eyebrow','✦ CONSISTENT TYPOGRAPHY');
const typographyTitle=node('h2','','Heading styles');
const typographyHelp=node('p','typography-help','Choose one font and size for your page title and heading blocks. Apply it to all pages to keep your whole DR consistent.');
const typoFontLabel=node('label','','Heading font'),typoFont=node('select');typoFont.id='typography-font';
for(const font of headingFonts){const option=node('option','',font);option.value=font;option.style.fontFamily=`"${font}",serif`;typoFont.append(option);}
typoFontLabel.append(typoFont);
const typoSizeLabel=node('label','','Heading size'),typoSize=node('input');typoSize.type='range';typoSize.id='typography-size';typoSize.min=16;typoSize.max=44;
const typoSizeValue=node('span','typography-value');typoSizeValue.id='typography-size-value';typoSizeLabel.append(typoSize,typoSizeValue);
const typoPreview=node('div','typography-preview','A beautiful new chapter');typoPreview.id='typography-preview';
const typoMessage=node('p','typography-message');typoMessage.id='typography-message';
const typoActions=node('div','modal-actions'),typoClose=node('button','ghost','Done'),typoAll=node('button','primary','Apply to all 15 pages');
typoClose.type=typoAll.type='button';typoActions.append(typoClose,typoAll);
typographyDialog.append(typographyEyebrow,typographyTitle,typographyHelp,typoFontLabel,typoSizeLabel,typoPreview,typoActions,typoMessage);
document.body.append(typographyDialog);
typographyButton.onclick=()=>{
  const settings=safeTypography(pageSettings.typography);
  typoFont.value=settings.headingFont;typoSize.value=settings.headingSize;typoSizeValue.textContent=`${settings.headingSize} px`;
  typoMessage.textContent='Changes to this page save automatically.';applyTypography();typographyDialog.showModal();
};
const updateTypography=()=>{
  pageSettings.typography=safeTypography({headingFont:typoFont.value,headingSize:typoSize.value});
  typoSizeValue.textContent=`${pageSettings.typography.headingSize} px`;
  applyTypography();changed();
};
typoFont.onchange=updateTypography;typoSize.oninput=updateTypography;
typoClose.onclick=()=>typographyDialog.close();
typoAll.onclick=async()=>{
  if(!confirm('Use this heading font and size on all 15 pages of this DR? This replaces other heading styles, but keeps all your writing.'))return;
  typoAll.disabled=true;typoMessage.textContent='Updating your pages…';
  try{
    if(!(await flush()))throw new Error('Could not save the current page.');
    const style=structuredClone(safeTypography(pageSettings.typography));let count=0;
    for(const page of pages){
      if(page.id===current?.id){count++;continue;}
      const content=Array.isArray(page.content)?structuredClone(page.content):typeof page.content==='string'?[{id:id(),type:'paragraph',text:page.content}]:[];
      let settings=content.find(b=>b?.type==='pageSettings');
      if(!settings){settings={type:'pageSettings',icon:'',imagePath:'',templateApplied:false};content.unshift(settings);}
      settings.typography=style;
      const {data,error:saveError}=await supabase.from('script_pages').update({content,updated_at:new Date().toISOString()}).eq('id',page.id).eq('user_id',user.id).select('id');
      if(saveError||!data?.length)throw new Error(`Could not update ${page.title}: ${saveError?.message||'Permission denied'}`);
      page.content=content;count++;
    }
    typoMessage.textContent=`Done! All ${count} pages use the same heading styles.`;
  }catch(e){typoMessage.textContent=`Some pages may not have updated. ${e.message}`;}
  finally{typoAll.disabled=false;}
};
// Script Theme Studio: presets, dark writing cards, and custom palette colors.
const openThemes=node('button','theme-open','◐ Script themes');openThemes.type='button';
document.querySelector('.page-customize').append(openThemes);
const themeDialog=document.createElement('dialog');themeDialog.className='modal theme-dialog';
themeDialog.append(node('div','eyebrow','✦ SCRIPT THEME STUDIO'),node('h2','','Make this script yours'),
  node('p','theme-help','Choose a complete writing-card theme or design your own colors. Apply it to all 15 pages for a matching look.'));
const themePresetGrid=node('div','theme-preset-grid');themeDialog.append(themePresetGrid);
const themeForm=node('div','theme-form');
const themeNameLabel=node('label','','Theme name'),themeName=node('input');themeName.id='theme-name';themeName.maxLength=60;themeNameLabel.append(themeName);themeForm.append(themeNameLabel);
const themeFields=[['paper','Writing card'],['ink','Main text'],['muted','Subtle text'],['accent','Accent'],['border','Borders'],['soft','Block backgrounds']];
const themeControls=node('div','theme-color-grid');
for(const [key,title] of themeFields){
  const label=node('label','',title),input=node('input');input.type='color';input.id=`theme-${key}`;label.append(input);themeControls.append(label);
}
themeForm.append(themeControls);themeDialog.append(themeForm);
const themePreview=node('div','theme-sample');themePreview.id='theme-sample';
themePreview.append(node('span','theme-sample-caption','✧ YOUR SCRIPT'),node('strong','','A Beautiful Chapter'),
  node('p','','A little world, written in your own style.'));
themeDialog.append(themePreview);
const themeStatus=node('p','theme-message');themeStatus.id='theme-status';themeDialog.append(themeStatus);
const themeActions=node('div','modal-actions'),themeClose=node('button','ghost','Done'),themeAll=node('button','primary','Apply to all 15 pages');
themeClose.type=themeAll.type='button';themeActions.append(themeClose,themeAll);themeDialog.append(themeActions);document.body.append(themeDialog);
function updateThemeControls(){
  const theme=safeTheme(pageSettings.theme);themeName.value=theme.name;
  for(const [key] of themeFields)$(`theme-${key}`).value=theme[key];
  themePreview.style.background=theme.paper;themePreview.style.borderColor=theme.border;themePreview.style.color=theme.ink;
  themePreview.querySelector('p').style.color=theme.muted;
  themePreview.querySelector('strong').style.color=theme.ink;
  themePreview.querySelector('span').style.color=theme.accent;
}
function changeTheme(){
  pageSettings.theme=safeTheme({name:themeName.value||'Custom Theme',...Object.fromEntries(themeFields.map(([key])=>[key,$(`theme-${key}`).value]))});
  applyTheme();updateBackground();updateThemeControls();changed();themeStatus.textContent='Saving your theme…';
}
for(const theme of themePresets){
  const button=node('button','theme-preset'),swatch=node('div','theme-preset-swatch'),name=node('span','',theme.name);
  button.type='button';swatch.style.background=theme.paper;swatch.style.color=theme.ink;
  swatch.style.borderColor=theme.border;swatch.append(node('span','', 'Aa'));
  button.append(swatch,name);button.onclick=()=>{
    pageSettings.theme={...theme};applyTheme();updateBackground();updateThemeControls();changed();
    themeStatus.textContent=`${theme.name} applied to this page.`;
  };themePresetGrid.append(button);
}
openThemes.onclick=()=>{updateThemeControls();themeStatus.textContent='Changes to this page save automatically.';themeDialog.showModal();};
themeName.oninput=changeTheme;for(const [key] of themeFields)$(`theme-${key}`).oninput=changeTheme;
themeClose.onclick=()=>themeDialog.close();
themeAll.onclick=async()=>{
  if(!confirm('Apply this complete script theme to all 15 pages? Other page-specific card themes will be replaced. Your writing and backgrounds stay.'))return;
  themeAll.disabled=true;themeStatus.textContent='Updating your pages…';
  try{
    if(!(await flush()))throw new Error('Could not save the current page.');
    const style=structuredClone(safeTheme(pageSettings.theme));let count=0;
    for(const page of pages){
      if(page.id===current?.id){count++;continue;}
      const content=Array.isArray(page.content)?structuredClone(page.content):typeof page.content==='string'?[{id:id(),type:'paragraph',text:page.content}]:[];
      let settings=content.find(b=>b?.type==='pageSettings');
      if(!settings){settings={type:'pageSettings',icon:'',imagePath:'',templateApplied:false};content.unshift(settings);}
      settings.theme=style;
      const {data,error:saveError}=await supabase.from('script_pages').update({content,updated_at:new Date().toISOString()}).eq('id',page.id).eq('user_id',user.id).select('id');
      if(saveError||!data?.length)throw new Error(`Could not update ${page.title}: ${saveError?.message||'Permission denied'}`);
      page.content=content;count++;
    }
    themeStatus.textContent=`Done! All ${count} pages use your “${style.name}” theme.`;
  }catch(e){themeStatus.textContent=`Some pages may not have updated. ${e.message}`;}
  finally{themeAll.disabled=false;}
};
// Floating text tools only activate for a real selection inside a script editor.
const textToolbar=$('text-format-toolbar');
let formatRange=null,formatEditor=null;
function editorOf(node){
  const element=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;
  return element?.closest?.('.rich-editor')||null;
}
function updateTextToolbar(){
  const selection=window.getSelection();
  if(!selection||selection.isCollapsed||!selection.rangeCount){
    if(!textToolbar.contains(document.activeElement))textToolbar.hidden=true;
    return;
  }
  const range=selection.getRangeAt(0);
  const startEditor=editorOf(range.startContainer),endEditor=editorOf(range.endContainer);
  if(!startEditor||startEditor!==endEditor){textToolbar.hidden=true;return;}
  formatEditor=startEditor;formatRange=range.cloneRange();
  const rect=range.getBoundingClientRect();
  textToolbar.hidden=false;
  const toolbarWidth=textToolbar.offsetWidth||500;
  const left=Math.min(Math.max(8,rect.left+rect.width/2-toolbarWidth/2),Math.max(8,innerWidth-toolbarWidth-8));
  textToolbar.style.left=`${left}px`;
  textToolbar.style.top=`${Math.max(8,rect.top-textToolbar.offsetHeight-12)}px`;
}
function selectedTextHasFormat(range,command){
  const walker=document.createTreeWalker(formatEditor,NodeFilter.SHOW_TEXT);
  let found=false,allStyled=true,textNode;
  while((textNode=walker.nextNode())){
    if(!textNode.textContent?.trim()||!range.intersectsNode(textNode))continue;
    found=true;
    const style=getComputedStyle(textNode.parentElement);
    const active=command==='bold'
      ? (style.fontWeight==='bold'||Number(style.fontWeight)>=600)
      : style.fontStyle==='italic'||style.fontStyle==='oblique';
    if(!active){allStyled=false;break;}
  }
  return found&&allStyled;
}
function applyFormat(command,value=null){
  if(!formatRange||!formatEditor?.isConnected)return;
  formatEditor.focus();
  const sel=window.getSelection(),range=formatRange.cloneRange();
  if(range.collapsed||!formatEditor.contains(range.commonAncestorContainer))return;
  sel.removeAllRanges();sel.addRange(range);
  let wrapper;
  if(command==='removeFormat'){
    const cleanText=range.toString(),replacement=document.createTextNode(cleanText);
    range.deleteContents();range.insertNode(replacement);
    const next=document.createRange();next.selectNodeContents(replacement);sel.removeAllRanges();sel.addRange(next);
  }else{
    wrapper=document.createElement(command==='createLink'?'a':'span');
    if(command==='createLink'){
      wrapper.href=value;wrapper.target='_blank';wrapper.rel='noopener noreferrer';
    }else if(command==='bold')wrapper.style.fontWeight=selectedTextHasFormat(range,'bold')?'normal':'700';
    else if(command==='italic')wrapper.style.fontStyle=selectedTextHasFormat(range,'italic')?'normal':'italic';
    else if(command==='underline')wrapper.style.textDecoration='underline';
    else if(command==='strikeThrough')wrapper.style.textDecoration='line-through';
    else if(command==='foreColor')wrapper.style.color=value;
    else if(command==='hiliteColor')wrapper.style.backgroundColor=value;
    else if(command==='fontName')wrapper.style.fontFamily=`"${value}"`;
    else if(command==='fontSize')wrapper.style.fontSize=({1:'10px',2:'12px',3:'14px',4:'17px',5:'21px',6:'26px',7:'32px'})[value]||'14px';
    else return;
    const content=range.extractContents();wrapper.append(content);range.insertNode(wrapper);
    const next=document.createRange();next.selectNodeContents(wrapper);
    sel.removeAllRanges();sel.addRange(next);
  }
  if(sel.rangeCount)formatRange=sel.getRangeAt(0).cloneRange();
  formatEditor.dispatchEvent(new Event('input',{bubbles:true}));
  requestAnimationFrame(updateTextToolbar);
}
textToolbar.addEventListener('mousedown',event=>{
  if(event.target.closest('button'))event.preventDefault();
});
for(const button of textToolbar.querySelectorAll('[data-format]')){
  button.onclick=()=>applyFormat(button.dataset.format);
}
textToolbar.querySelector('[data-special="link"]').onclick=()=>{
  if(!formatRange)return;
  const raw=prompt('Enter a link (https://...)');if(raw===null)return;
  try{
    const link=new URL(raw.trim());
    if(!['https:','http:'].includes(link.protocol))throw new Error('Only secure web links are allowed.');
    applyFormat('createLink',link.href);
  }catch{alert('Please enter a valid http:// or https:// link.');}
};
$('format-color').oninput=event=>applyFormat('foreColor',event.target.value);
$('format-highlight').oninput=event=>applyFormat('hiliteColor',event.target.value);
$('format-font').onchange=event=>{if(event.target.value)applyFormat('fontName',event.target.value);event.target.value='';};
$('format-size').onchange=event=>{if(event.target.value)applyFormat('fontSize',event.target.value);event.target.value='';};
for(const option of $('format-font').options){if(option.value)option.style.fontFamily=`"${option.value}",sans-serif`;}
for(const option of $('format-size').options){
  if(option.value)option.style.fontSize=({2:'12px',3:'14px',4:'17px',5:'21px',6:'26px'})[option.value];
}
document.addEventListener('selectionchange',()=>requestAnimationFrame(updateTextToolbar));
document.addEventListener('keydown',event=>{if(event.key==='Escape')textToolbar.hidden=true;});
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
