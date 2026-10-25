// Keep authored formatting, but never trust stored HTML from any source.
const allowedTags=new Set(['B','STRONG','I','EM','U','S','STRIKE','A','SPAN','BR','FONT','DIV','P']);
const allowedFonts=new Set(['Georgia','Arial','Verdana','Times New Roman','Trebuchet MS','Courier New','Playfair Display','DM Sans']);
const safeColor=value=>/^#[\da-f]{3,8}$/i.test(value)||/^(?:rgb|rgba)\([\d\s.,%]+\)$/i.test(value);
export function sanitizeRichHtml(html){
  const input=document.createElement('template');input.innerHTML=String(html||'');
  const clean=document.createElement('div');
  function copy(from,to){
    for(const child of from.childNodes){
      if(child.nodeType===Node.TEXT_NODE){to.append(document.createTextNode(child.textContent));continue;}
      if(child.nodeType!==Node.ELEMENT_NODE)continue;
      if(!allowedTags.has(child.tagName)){copy(child,to);continue;}
      const tag=child.tagName==='FONT'?'span':child.tagName.toLowerCase();
      const next=document.createElement(tag);
      if(child.tagName==='A'){
        try{
          const url=new URL(child.getAttribute('href')||'',location.href);
          if(['http:','https:'].includes(url.protocol)){
            next.href=url.href;next.target='_blank';next.rel='noopener noreferrer';
          }
        }catch{}
      }
      if(['SPAN','FONT'].includes(child.tagName)){
        const styles=child.style;
        const color=styles.color||child.getAttribute('color')||'';
        const highlight=styles.backgroundColor;
        const face=(styles.fontFamily||child.getAttribute('face')||'').replaceAll(/["']/g,'').trim();
        if(safeColor(color))next.style.color=color;
        if(safeColor(highlight))next.style.backgroundColor=highlight;
        if(allowedFonts.has(face))next.style.fontFamily=`"${face}"`;
        if(['normal','400','500','bold','600','700','800','900'].includes(styles.fontWeight))next.style.fontWeight=styles.fontWeight;
        if(['normal','italic','oblique'].includes(styles.fontStyle))next.style.fontStyle=styles.fontStyle;
        if(['underline','line-through'].includes(styles.textDecorationLine||styles.textDecoration))next.style.textDecoration=styles.textDecorationLine||styles.textDecoration;
        const size=child.getAttribute('size');
        if(size&&/^[1-7]$/.test(size))next.style.fontSize=({1:'10px',2:'12px',3:'14px',4:'17px',5:'21px',6:'26px',7:'32px'})[size];
        if(styles.fontSize&&/^\d{1,2}px$/.test(styles.fontSize))next.style.fontSize=styles.fontSize;
      }
      if(child.tagName!=='BR')copy(child,next);
      to.append(next);
    }
  }
  copy(input.content,clean);
  return clean.innerHTML;
}
