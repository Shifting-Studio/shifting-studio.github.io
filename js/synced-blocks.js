import { supabase } from './supabase.js';
import { renderSyncedContent, syncContent, reachesBlock } from './sync-utils.js';
const theme=document.createElement('link');theme.rel='stylesheet';theme.href='css/polish.css';document.head.append(theme);
const refresh=document.createElement('link');refresh.rel='stylesheet';refresh.href='css/studio-refresh.css';document.head.append(refresh);
const $=id=>document.getElementById(id);
const el=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
const uid=()=>crypto.randomUUID();
let user,records=[],editing=null,parts=[];
const blank=(type,syncId=null)=>({id:uid(),type,text:'',checked:false,syncId,label:'',left:'',right:''});

function renderLibrary(){
  const area=$('synced-list');area.replaceChildren();
  if(!records.length){area.append(el('div','empty-blocks','Create your first reusable group or turn selected script blocks into one.'));return;}
  for(const block of records){
    const card=el('article','synced-card');
    card.append(el('span','library-kind','◇ REUSABLE GROUP'),el('h3','',block.title));
    const preview=el('div','sync-preview');renderSyncedContent(preview,syncContent(block),records,supabase,new Set([block.id]));card.append(preview);
    const actions=el('div','card-actions'),edit=el('button','','Edit group'),remove=el('button','danger','Delete');
    edit.type=remove.type='button';edit.onclick=()=>openForm(block);remove.onclick=()=>deleteBlock(block);
    actions.append(edit,remove);card.append(actions);area.append(card);
  }
}
async function load(){
  const {data,error}=await supabase.from('synced_blocks').select('id,title,content,blocks,created_at').eq('user_id',user.id).order('created_at',{ascending:false});
  if(error){$('error').textContent=`Unable to load synced groups: ${error.message}. Run the SQL update first.`;return false;}
  records=data||[];$('error').textContent='';renderLibrary();$('status').textContent='✓ Synced with your account';return true;
}
function appendEditor(){
  if($('group-builder'))return;
  const form=$('block-form');$('block-text').closest('label').hidden=true;
  const builder=el('div','group-builder');builder.id='group-builder';
  const controls=el('div','builder-controls');
  for(const [type,label] of [['paragraph','＋ Text'],['heading','＋ Heading'],['quote','＋ Quote'],['checklist','＋ Checklist'],['divider','＋ Divider']]){
    const button=el('button','',label);button.type='button';button.onclick=()=>{parts.push(blank(type));renderParts();};controls.append(button);
  }
  const nestedRow=el('div','nested-picker-row'),select=el('select');select.id='nested-group-select';
  const addNested=el('button','','◇ Insert synced block');addNested.type='button';
  addNested.onclick=()=>{
    const target=select.value;if(!target)return;
    if(editing&&(target===editing||reachesBlock(target,editing,records))){$('dialog-error').textContent='That would create a circular reference.';return;}
    parts.push(blank('synced',target));$('dialog-error').textContent='';renderParts();
  };nestedRow.append(select,addNested);
  const list=el('div','group-part-list');list.id='group-part-list';
  builder.append(el('div','builder-caption','CONTENT BLOCKS'),controls,nestedRow,list);
  form.insertBefore(builder,form.querySelector('.modal-actions'));
}
function renderParts(){
  const list=$('group-part-list');list.replaceChildren();
  if(!parts.length){list.append(el('p','empty-builder','Add blocks to create your reusable group.'));return;}
  parts.forEach((part,i)=>{
    const row=el('div','group-part'),header=el('div','group-part-header');
    header.append(el('strong','',part.type==='synced'?'◇ Nested synced block':part.type));
    const actions=el('div','block-actions');
    for(const [label,callback] of [['↑',()=>move(i,-1)],['↓',()=>move(i,1)],['×',()=>{parts.splice(i,1);renderParts();}]]){
      const button=el('button','',label);button.type='button';button.onclick=callback;actions.append(button);
    }header.append(actions);row.append(header);
    if(part.type==='synced'){
      const target=records.find(x=>x.id===part.syncId);row.append(el('p','',target?.title||'Missing synced block'));
      const preview=el('div','sync-preview');if(target)renderSyncedContent(preview,syncContent(target),records,supabase,new Set([editing||'',target.id]));row.append(preview);
    }else if(part.type==='divider')row.append(el('hr'));
    else if(['paragraph','heading','quote','checklist','field','columns','profile','subpage'].includes(part.type)){
      if(part.type==='field'){
        const label=el('input','group-input');label.placeholder='Field label';label.value=part.label||'';label.oninput=()=>part.label=label.value;row.append(label);
      }
      const text=el('textarea','group-text');text.rows=3;
      text.value=part.type==='columns'?`${part.left||''}\n---\n${part.right||''}`:part.type==='profile'?part.profileBio||'':part.type==='subpage'?part.subContent||'':part.text||'';
      text.placeholder='Write here…';
      text.oninput=()=>{
        if(part.type==='columns'){const [left,...rest]=text.value.split('\n---\n');part.left=left;part.right=rest.join('\n---\n');}
        else if(part.type==='profile')part.profileBio=text.value;
        else if(part.type==='subpage')part.subContent=text.value;
        else part.text=text.value;
      };row.append(text);
      if(part.type==='checklist'){
        const check=el('input');check.type='checkbox';check.checked=!!part.checked;check.onchange=()=>part.checked=check.checked;row.append(check);
      }
    }else{
      row.append(el('p','','This complex block is preserved. Edit its original fields before converting if needed.'));
      const preview=el('div','sync-preview');renderSyncedContent(preview,[part],records,supabase);row.append(preview);
    }list.append(row);
  });
}
function move(i,d){const j=i+d;if(j<0||j>=parts.length)return;[parts[i],parts[j]]=[parts[j],parts[i]];renderParts();}
function openForm(record=null){
  appendEditor();editing=record?.id||null;parts=structuredClone(record?syncContent(record):[]);
  $('dialog-title').textContent=record?'Edit synced group':'New synced group';$('block-title').value=record?.title||'';
  $('block-text').value=record?.content||'';$('dialog-error').textContent='';
  const select=$('nested-group-select');select.replaceChildren();
  for(const b of records){
    if(b.id===editing||editing&&reachesBlock(b.id,editing,records))continue;
    const option=el('option','',b.title);option.value=b.id;select.append(option);
  }
  $('block-dialog').showModal();renderParts();$('block-title').focus();
}
async function save(event){
  event.preventDefault();const title=$('block-title').value.trim();
  if(!title){$('dialog-error').textContent='Please enter a title.';return;}
  if(parts.some(p=>p.type==='synced'&&p.syncId&&(p.syncId===editing||editing&&reachesBlock(p.syncId,editing,records)))){
    $('dialog-error').textContent='Circular references are not allowed.';return;
  }
  $('save-block').disabled=true;
  const values={title,blocks:parts,updated_at:new Date().toISOString()};
  const result=editing
    ? await supabase.from('synced_blocks').update(values).eq('id',editing).eq('user_id',user.id).select('id')
    : await supabase.from('synced_blocks').insert({...values,user_id:user.id,content:''}).select('id');
  $('save-block').disabled=false;
  if(result.error||!result.data?.length){$('dialog-error').textContent=result.error?.message||'Could not save the group.';return;}
  $('block-dialog').close();editing=null;await load();
}
async function deleteBlock(block){
  if(!confirm(`Delete “${block.title}”? Other groups and script pages referencing it will show a missing block. This cannot be undone.`))return;
  const {error}=await supabase.from('synced_blocks').delete().eq('id',block.id).eq('user_id',user.id);
  if(error){$('error').textContent=error.message;return;}await load();
}
async function init(){
  const {data,error}=await supabase.auth.getUser();if(error||!data?.user){location.replace('login.html');return;}
  user=data.user;appendEditor();await load();
}
$('create-block').onclick=()=>openForm();$('cancel-block').onclick=()=>$('block-dialog').close();
$('block-form').addEventListener('submit',save);
init().catch(error=>$('error').textContent=error.message);
