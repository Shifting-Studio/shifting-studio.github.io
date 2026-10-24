import { supabase } from './supabase.js';
const $ = id => document.getElementById(id);
let user, blocks = [], editing = null;
const el = (tag,cls,text) => { const node=document.createElement(tag);node.className=cls||'';if(text!==undefined)node.textContent=text;return node; };
function openForm(block=null){editing=block?.id||null;$('dialog-title').textContent=editing?'Edit synced block':'New synced block';$('block-title').value=block?.title||'';$('block-text').value=block?.content||'';$('dialog-error').textContent='';$('block-dialog').showModal();$('block-title').focus();}
function render(){
  const area=$('synced-list');area.replaceChildren();
  if(!blocks.length){area.append(el('div','empty-blocks','No synced blocks yet. Create your first reusable block!'));return;}
  for(const block of blocks){
    const card=el('article','synced-card');card.append(el('h3','',block.title),el('p','',block.content||'This block is empty.'));
    card.append(el('span','usage','◇ Use this block in any script page'));
    const actions=el('div','card-actions'),edit=el('button','','Edit block'),remove=el('button','danger','Delete');
    edit.type=remove.type='button';edit.onclick=()=>openForm(block);
    remove.onclick=()=>deleteBlock(block);
    actions.append(edit,remove);card.append(actions);area.append(card);
  }
}
async function load(){
  const {data,error}=await supabase.from('synced_blocks').select('id,title,content,created_at').eq('user_id',user.id).order('created_at',{ascending:false});
  if(error){$('error').textContent=`Unable to load blocks: ${error.message}. Did you run the SQL file?`;return;}
  $('error').textContent='';blocks=data||[];render();$('status').textContent='✓ Synced with your account';
}
async function save(event){
  event.preventDefault();const title=$('block-title').value.trim(),content=$('block-text').value;
  if(!title){$('dialog-error').textContent='Please enter a title.';return;}
  $('save-block').disabled=true;
  const result=editing
    ? await supabase.from('synced_blocks').update({title,content,updated_at:new Date().toISOString()}).eq('id',editing).eq('user_id',user.id).select('id')
    : await supabase.from('synced_blocks').insert({user_id:user.id,title,content}).select('id');
  $('save-block').disabled=false;
  if(result.error||!result.data?.length){$('dialog-error').textContent=result.error?.message||'Could not save the block.';return;}
  $('block-dialog').close();editing=null;await load();
}
async function deleteBlock(block){
  if(!confirm(`Delete “${block.title}”? Any script pages referencing this block will show it as missing. This cannot be undone.`))return;
  const {error}=await supabase.from('synced_blocks').delete().eq('id',block.id).eq('user_id',user.id);
  if(error){$('error').textContent=error.message;return;}await load();
}
async function init(){
  const {data,error}=await supabase.auth.getUser();
  if(error||!data?.user){location.replace('login.html');return;}
  user=data.user;await load();
}
$('create-block').onclick=()=>openForm();
$('cancel-block').onclick=()=>$('block-dialog').close();
$('block-form').addEventListener('submit',save);
init().catch(error=>$('error').textContent=error.message);
