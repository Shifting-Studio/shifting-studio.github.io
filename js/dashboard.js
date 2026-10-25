import { supabase } from './supabase.js';

// Uses the existing js/supabase.js from your GitHub repository.
const $ = id => document.getElementById(id);
let user, realities = [], editingId = null, deletingReality = null;
const notice = (message = '') => $('notice').textContent = message;
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function render() {
  const query = $('search').value.trim().toLowerCase();
  const order = $('sort').value;
  const items = realities.filter(dr => `${dr.title} ${dr.description || ''}`.toLowerCase().includes(query));
  items.sort((a, b) => {
    if (order === 'az') return a.title.localeCompare(b.title);
    if (order === 'za') return b.title.localeCompare(a.title);
    const diff = new Date(a.created_at) - new Date(b.created_at);
    return order === 'oldest' ? diff : -diff;
  });
  $('count').textContent = `${realities.length} ${realities.length === 1 ? 'reality' : 'realities'} in your collection`;
  const grid = $('reality-grid');
  grid.replaceChildren();
  for (const dr of items) {
    const card = element('article', 'card');
    const theme = ['sage', 'rose', 'dusk', 'gold'].includes(dr.theme) ? dr.theme : 'sage';
    const body = element('div', 'card-content');
    body.append(element('h3', '', dr.title), element('p', '', dr.description || 'A world waiting to be written.'));
    const foot = element('div', 'card-footer');
    foot.append(element('span', '', '✦ Private reality'));
    const open = element('a', 'open-script-button', '✎ Open Script →');
    open.href = `script.html?dr=${encodeURIComponent(dr.id)}`;
    foot.append(open);
    const edit = element('button', 'text-button', 'Edit details →');
    edit.type = 'button';
    edit.addEventListener('click', () => openDialog(dr));
    foot.append(edit);
    const remove = element('button', 'delete-script-button', 'Delete script');
    remove.type='button';remove.setAttribute('aria-label',`Delete ${dr.title}`);
    remove.addEventListener('click',()=>openDelete(dr));
    foot.append(remove);body.append(foot);
    card.append(element('div', `card-cover ${theme}`, '✧'), body);
    card.classList.add('card-clickable');
    card.addEventListener('click', event => {
      if (!event.target.closest('a,button')) window.location.href = open.href;
    });
    grid.append(card);
  }
  if (!query) {
    const add = element('button', 'new-card');
    add.type = 'button';
    add.append(element('span', '', '+'), element('strong', '', 'Create a new reality'), element('small', '', 'A fresh world awaits'));
    add.addEventListener('click', () => openDialog());
    grid.append(add);
  } else if (!items.length) grid.append(element('div', 'empty', 'No realities match your search.'));
}
function openDialog(dr = null) {
  editingId = dr?.id || null;
  $('dialog-title').textContent = dr ? 'Edit your reality' : 'Create a reality';
  $('dr-title').value = dr?.title || '';
  $('dr-description').value = dr?.description || '';
  $('dr-theme').value = ['sage','rose','dusk','gold'].includes(dr?.theme) ? dr.theme : 'sage';
  $('form-error').textContent = '';
  $('editor-dialog').showModal();
  $('dr-title').focus();
}
function closeDialog() { $('editor-dialog').close(); editingId = null; }
function openDelete(dr){
  deletingReality=dr;$('delete-title').textContent=dr.title;$('delete-confirm-name').value='';
  $('delete-error').textContent='';$('confirm-delete').disabled=true;$('delete-dialog').showModal();
  $('delete-confirm-name').focus();
}
function closeDelete(){$('delete-dialog').close();deletingReality=null;}
async function deleteReality(){
  if(!deletingReality||$('delete-confirm-name').value.trim()!==deletingReality.title)return;
  const target=deletingReality;$('confirm-delete').disabled=true;$('delete-error').textContent='';
  const {data,error}=await supabase.from('desired_realities').delete()
    .eq('id',target.id).eq('user_id',user.id).select('id');
  if(error||!data?.length){
    $('delete-error').textContent=error?.message||'Could not delete this script. Check your database permissions.';
    $('confirm-delete').disabled=false;return;
  }
  closeDelete();await refresh();
}
async function refresh() {
  const {data,error} = await supabase.from('desired_realities')
    .select('id,title,description,theme,created_at')
    .eq('user_id',user.id).order('created_at',{ascending:false});
  if(error){ notice(`Could not load realities: ${error.message}`);return; }
  realities = data || [];notice();render();
}
async function saveReality(event) {
  event.preventDefault();
  const title = $('dr-title').value.trim(), description = $('dr-description').value.trim(), theme = $('dr-theme').value;
  if(!title){$('form-error').textContent='Please enter a name.';return;}
  const button=$('save-dr');button.disabled=true;$('form-error').textContent='';
  try {
    const result = editingId
      ? await supabase.from('desired_realities').update({title,description,theme,updated_at:new Date().toISOString()}).eq('id',editingId).eq('user_id',user.id).select('id')
      : await supabase.from('desired_realities').insert({user_id:user.id,title,description,theme,visibility:'private'}).select('id');
    if(result.error)throw result.error;
    if(!result.data?.length)throw new Error('No record was saved. Check database permissions.');
    closeDialog();await refresh();
  } catch(error){$('form-error').textContent=error.message||'Please try again.';}
  finally{button.disabled=false;}
}
async function init(){
  const {data,error}=await supabase.auth.getUser();
  if(error||!data?.user){window.location.replace('login.html');return;}
  user=data.user;$('account-email').textContent=user.email||'My Account';await refresh();
}
$('add-dr').addEventListener('click',()=>openDialog());
$('cancel').addEventListener('click',closeDialog);
$('dr-form').addEventListener('submit',saveReality);
$('cancel-delete').addEventListener('click',closeDelete);
$('delete-dialog').addEventListener('close',()=>deletingReality=null);
$('delete-confirm-name').addEventListener('input',()=>{
  $('confirm-delete').disabled=!deletingReality||$('delete-confirm-name').value.trim()!==deletingReality.title;
});
$('confirm-delete').addEventListener('click',deleteReality);
$('search').addEventListener('input',render);
$('sort').addEventListener('change',render);
$('logout').addEventListener('click',async()=>{
  const {error}=await supabase.auth.signOut();
  if(error){notice(`Could not log out: ${error.message}`);return;}
  window.location.replace('login.html');
});
init().catch(error=>notice(`Unable to initialize dashboard: ${error.message}`));
