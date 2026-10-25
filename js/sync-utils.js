// Reusable, read-only renderer. Never evaluates user-authored HTML.
import { sanitizeRichHtml } from './rich-text.js';
const make=(tag,className='',value)=>{const e=document.createElement(tag);e.className=className;if(value!==undefined)e.textContent=String(value);return e;};
const rich=(tag,block,cls='')=>{const e=make(tag,cls);if(block.html)e.innerHTML=sanitizeRichHtml(block.html);else e.textContent=block.text||'';return e;};
export function syncContent(block){
  return Array.isArray(block?.blocks)&&block.blocks.length ? block.blocks :
    (block?.content ? [{type:'paragraph',text:block.content}] : []);
}
export function reachesBlock(start,target,all,seen=new Set()){
  if(start===target)return true;
  if(seen.has(start))return false;seen.add(start);
  const record=all.find(x=>x.id===start);if(!record)return false;
  return syncContent(record).some(b=>b.type==='synced'&&b.syncId&&reachesBlock(b.syncId,target,all,seen));
}
async function signedImage(img,path,supabase){
  if(!path||!supabase)return;
  const {data}=await supabase.storage.from('script-images').createSignedUrl(path,3600);
  if(img.isConnected&&data?.signedUrl)img.src=data.signedUrl;
}
export function renderSyncedContent(container,content,records,supabase,seen=new Set(),depth=0){
  container.replaceChildren();
  if(depth>8){container.append(make('div','nested-warning','Maximum nesting depth reached.'));return;}
  for(const block of content){
    if(!block||typeof block!=='object')continue;
    const item=make('div',`sync-render-block sync-render-${block.type||'paragraph'}`);
    if(block.type==='synced'){
      const nested=records.find(b=>b.id===block.syncId);
      if(!nested){item.append(make('div','nested-warning','Missing synced block'));}
      else if(seen.has(nested.id))item.append(make('div','nested-warning','Circular reference blocked'));
      else{
        item.append(make('div','sync-nested-title',`◇ ${nested.title}`));
        const nestedBody=make('div','sync-nested-body');item.append(nestedBody);
        renderSyncedContent(nestedBody,syncContent(nested),records,supabase,new Set([...seen,nested.id]),depth+1);
      }
    }else if(block.type==='divider')item.append(make('hr'));
    else if(block.type==='heading')item.append(rich('h3',block));
    else if(block.type==='quote')item.append(rich('blockquote',block));
    else if(block.type==='checklist'){item.append(make('span','',block.checked?'☑ ':'☐ '),rich('span',block));}
    else if(block.type==='field'){
      item.append(make('strong','',block.label||'Field'));
      item.append(rich('p',block));
    }else if(block.type==='columns'){
      const columns=make('div','two-column-block');columns.append(make('p','',block.left||''),make('p','',block.right||''));item.append(columns);
    }else if(block.type==='profile'){
      item.append(make('h3','',block.profileName||'Character'));
      item.append(make('p','',block.profileRole||''));
      item.append(make('p','',block.profileBio||''));
      if(block.imagePath){const img=make('img','sync-photo');img.alt='Character portrait';item.append(img);signedImage(img,block.imagePath,supabase);}
    }else if(block.type==='image'||block.type==='gallery'){
      const images=block.type==='image'?[block.imagePath]:block.galleryPaths||[];
      const gallery=make('div','sync-image-gallery');
      for(const path of images.filter(Boolean)){
        const img=make('img','sync-photo');img.alt=block.caption||'Script image';gallery.append(img);signedImage(img,path,supabase);
      }
      item.append(gallery);
      if(block.caption)item.append(make('p','',block.caption));
    }else if(block.type==='subpage'){
      item.append(make('strong','',`▤ ${block.text||'Subpage'}`));item.append(make('p','',block.subContent||''));
    }else item.append(rich('p',block));
    container.append(item);
  }
}
