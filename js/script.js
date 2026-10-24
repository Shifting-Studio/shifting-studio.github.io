import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const groups = [
  {name:'PERSONAL',symbol:'✧',pages:[['About Me','♡','Your identity, personality, and backstory.'],['Appearance','✧','Describe your appearance and style.'],['Wardrobe','♧','Outfits, clothing, and style inspiration.']]},
  {name:'RELATIONSHIPS',symbol:'♡',pages:[['My Friends','♧','The friends who are part of your story.'],['My Family','⌂','Your family and family traditions.'],['My S/O','♡','Your significant other and your relationship.'],['My Pets','♧','Your beloved animal companions.']]},
  {name:'CAREER',symbol:'✦',pages:[['Career','✦','Work, education, and achievements.'],['Timeline','◷','Important events and dates in order.']]},
  {name:'BELONGINGS',symbol:'⌂',pages:[['My Home','⌂','Your homes, rooms, and surroundings.'],['My Vehicles','◇','Cars and other vehicles.'],['Other Items','▣','Treasured possessions and belongings.']]},
  {name:'IMPORTANT',symbol:'☼',pages:[['Scenarios','✎','Write your imagined scenes and moments.'],['Information & Rules','☼','Your world details, rules, and affirmations.'],['LIFA Diary','☷','Diary entries, memories, and reflections.']]}
];
const templates = groups.flatMap(group => group.pages.map((p, index) => ({category:group.name,title:p[0],icon:p[1],hint:p[2],position:index})));
let user, dr, pages = [], current = null, dirty = false, saving = false, timer = null, changing = false;
const drId = new URLSearchParams(location.search).get('dr');

function showError(message = '') { $('page-error').textContent = message; }
function setStatus(message) { $('save-state').textContent = message; }
function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(block => block && typeof block.text === 'string').map(block => block.text).join('\n\n');
}
function makeContent(text) { return [{type:'paragraph',text}]; }

async function persistPage() {
  clearTimeout(timer);
  if (!current || !dirty || saving) return !dirty;
  saving = true;
  const page = current;
  const content = $('page-editor').value;
  setStatus('Saving…');showError();
  const {error} = await supabase.from('script_pages')
    .update({content:makeContent(content),updated_at:new Date().toISOString()})
    .eq('id',page.id).eq('user_id',user.id);
  saving = false;
  if (error) {
    setStatus('Not saved');
    showError(`Could not save: ${error.message}. Your text is still on this page; please try again.`);
    return false;
  }
  page.content = makeContent(content);
  if (current.id === page.id && $('page-editor').value === content) {
    dirty = false;
    setStatus('✓ All changes saved');
  } else if (current.id === page.id) {
    dirty = true;
    timer = setTimeout(persistPage,850);
  }
  return true;
}

async function selectPage(title) {
  if (changing) return;
  changing = true;
  try {
    if (dirty) {
      while (saving) await new Promise(resolve => setTimeout(resolve,60));
      const success = await persistPage();
      if (!success) return;
    }
    const next = pages.find(page => page.title === title);
    const template = templates.find(page => page.title === title);
    if (!next || !template) return;
    current = next;dirty = false;clearTimeout(timer);
    $('page-category').textContent = template.category;
    $('page-icon').textContent = template.icon;
    $('page-heading').textContent = title;
    $('page-hint').textContent = template.hint;
    $('page-editor').value = extractText(next.content);
    document.title = `${title} | ${dr.title} — Shifting Studio`;
    document.querySelectorAll('.page-link').forEach(button => button.classList.toggle('active',button.dataset.page===title));
    $('page-navigation').closest('.script-sidebar').classList.remove('open');
    showError();setStatus('✓ All changes saved');
  } finally { changing = false; }
}

function buildNavigation() {
  const nav = $('page-navigation');nav.replaceChildren();
  for (const group of groups) {
    const wrap = document.createElement('div');wrap.className = 'script-group';
    const toggle = document.createElement('button');toggle.type = 'button';toggle.className = 'group-toggle';
    toggle.textContent = `${group.symbol}   ${group.name}  ⌄`;
    const list = document.createElement('div');list.className = 'group-pages';
    toggle.addEventListener('click',()=>{list.hidden=!list.hidden;toggle.setAttribute('aria-expanded',String(!list.hidden));});
    toggle.setAttribute('aria-expanded','true');
    for (const [title,symbol] of group.pages) {
      const button=document.createElement('button');button.type='button';button.className='page-link';button.dataset.page=title;
      const icon=document.createElement('span');icon.className='page-symbol';icon.textContent=symbol;
      const text=document.createElement('span');text.textContent=title;
      button.append(icon,text);button.addEventListener('click',()=>selectPage(title));list.append(button);
    }
    wrap.append(toggle,list);nav.append(wrap);
  }
}

async function createMissingPages() {
  const existing = new Set(pages.map(page => `${page.category}\u0000${page.title}`));
  const missing = templates.filter(page => !existing.has(`${page.category}\u0000${page.title}`));
  if (!missing.length) return;
  const newPages = missing.map(page => ({dr_id:dr.id,user_id:user.id,category:page.category,title:page.title,icon:page.icon,position:page.position,content:[]}));
  const {error} = await supabase.from('script_pages').insert(newPages);
  if (error) throw new Error(`Could not create script pages: ${error.message}`);
  const refreshed = await supabase.from('script_pages')
    .select('id,category,title,content,position').eq('dr_id',dr.id).eq('user_id',user.id);
  if (refreshed.error) throw refreshed.error;
  pages = refreshed.data || [];
}

async function init() {
  if (!drId) {location.replace('dashboard.html');return;}
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data?.user) {location.replace('login.html');return;}
  user = auth.data.user;
  const result = await supabase.from('desired_realities').select('id,title,description')
    .eq('id',drId).eq('user_id',user.id).single();
  if (result.error || !result.data) {
    setStatus('Reality not found');showError('This reality could not be opened. Check that you are logged into the correct account.');return;
  }
  dr = result.data;
  $('dr-heading').textContent = dr.title;$('sidebar-dr').textContent = dr.title;$('breadcrumb-world').textContent = dr.title;
  $('dr-description').textContent = dr.description || 'All the details of your imagined world, beautifully organized.';
  const response = await supabase.from('script_pages')
    .select('id,category,title,content,position').eq('dr_id',dr.id).eq('user_id',user.id);
  if (response.error) throw response.error;
  pages = response.data || [];
  await createMissingPages();
  buildNavigation();await selectPage('About Me');
}

$('page-editor').addEventListener('input',()=>{if(!current)return;dirty=true;setStatus('Unsaved changes…');clearTimeout(timer);timer=setTimeout(persistPage,850);});
$('page-editor').addEventListener('blur',()=>{if(dirty)persistPage();});
$('pages-toggle').addEventListener('click',()=>document.querySelector('.script-sidebar').classList.toggle('open'));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty)persistPage();});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
init().catch(error=>{showError(error.message||'Unable to load your script.');setStatus('Something went wrong');});
