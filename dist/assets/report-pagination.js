// Embedded in standalone reports so downloaded HTML and iframe previews share
// the same pagination. Measure rendered content rather than guessing row counts.
export function paginateReportPages(document){
  const probe=document.createElement('div');probe.style.cssText='position:absolute;visibility:hidden;height:273mm';document.body.append(probe);const limit=probe.getBoundingClientRect().height;probe.remove();
  for(const original of [...document.querySelectorAll('.page')]){
    let source=original.querySelector('.method-content');
    if(!source){source=document.createElement('div');source.className='report-content';const nodes=[...original.children].filter(e=>!['HEADER','FOOTER'].includes(e.tagName));source.append(...nodes);original.insertBefore(source,original.querySelector('footer'));}
    const heading=source.querySelector('h1'),status=source.querySelector('.status');
    const blocks=[...source.children].flatMap(node=>node.classList.contains('method-visual')&&node.children.length>1?[...node.children].map(child=>{const shell=node.cloneNode(false);shell.append(child);return shell;}):[node]);
    source.replaceChildren();let current=original,body=source,continuations=0;
    const fits=()=>current.getBoundingClientRect().height<=limit+1;
    const next=()=>{
      if(++continuations>250)throw new Error('工法資料超過可列印頁數。');
      const page=original.cloneNode(false),header=original.querySelector('header').cloneNode(true),footer=original.querySelector('footer').cloneNode(true);
      header.querySelector('b').textContent+='（續）';body=source.cloneNode(false);
      if(heading){const h=heading.cloneNode(true);h.textContent+='（續）';body.append(h);}if(status)body.append(status.cloneNode(true));
      page.append(header,body,footer);current.after(page);current=page;
    };
    const splitRows=(node)=>{
      const table=node.matches('table')?node:node.querySelector('table'),list=node.matches('ul,ol')?node:null;
      if(!table&&!list)return false;
      if(table&&!node.classList.contains('tank-method-table'))return false;
      const rows=table?[...table.querySelector('tbody').children]:[...list.children];if(rows.length<2)return false;
      const shell=node.cloneNode(true),target=table?(shell.matches('table')?shell:shell.querySelector('table')).querySelector('tbody'):shell;
      target.replaceChildren();let chunk=shell,count=0;body.append(chunk);
      for(const row of rows){
        const destination=table?(chunk.matches('table')?chunk:chunk.querySelector('table')).querySelector('tbody'):chunk;
        destination.append(row);
        if(!fits()){
          row.remove();if(count===0)chunk.remove();next();chunk=shell.cloneNode(true);
          const fresh=table?(chunk.matches('table')?chunk:chunk.querySelector('table')).querySelector('tbody'):chunk;fresh.replaceChildren();fresh.append(row);body.append(chunk);count=0;
        }
        count++;
      }
      return true;
    };
    for(const block of blocks){
      body.append(block);if(fits())continue;block.remove();
      if(splitRows(block))continue;
      next();body.append(block);
    }
    original.dataset.paginated='true';
  }
}
export function reportPaginationScript(){return `<script>(${paginateReportPages.toString()})(document);</script>`;}
