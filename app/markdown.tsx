import React from 'react';
import { marked, type Token } from 'marked';
function href(url:string){return /^(https?:\/\/|mailto:)/i.test(url)?url:undefined;}
function render(tokens:any[],key='m'):React.ReactNode[]{return tokens.map((t:any,i:number)=>{const k=key+i;const children=()=>t.tokens?render(t.tokens,k):t.text;
switch(t.type){
 case 'space':return null;
 case 'heading':return React.createElement('h'+Math.min(t.depth,6),{key:k},children());
 case 'paragraph':return <p key={k}>{children()}</p>;
 case 'text':return <React.Fragment key={k}>{children()}</React.Fragment>;
 case 'strong':return <strong key={k}>{children()}</strong>;
 case 'em':return <em key={k}>{children()}</em>;
 case 'del':return <del key={k}>{children()}</del>;
 case 'codespan':return <code key={k}>{t.text}</code>;
 case 'code':return <pre key={k}><code>{t.text}</code></pre>;
 case 'blockquote':return <blockquote key={k}>{render(t.tokens,k)}</blockquote>;
 case 'list':{const Tag=t.ordered?'ol':'ul';return <Tag key={k} start={t.ordered?t.start:undefined}>{t.items.map((item:any,j:number)=><li key={j}>{item.task&&<input type="checkbox" disabled checked={item.checked}/>} {render(item.tokens,k+j)}</li>)}</Tag>;}
 case 'link':return href(t.href)?<a key={k} href={href(t.href)} target="_blank" rel="noopener noreferrer">{children()}</a>:<span key={k}>{children()}</span>;
 case 'image':return <span key={k} className="md-image-alt">[图片：{t.text||'附件'}]</span>;
 case 'hr':return <hr key={k}/>;
 case 'br':return <br key={k}/>;
 case 'table':return <div className="table-scroll" key={k}><table><thead><tr>{t.header.map((cell:any,j:number)=><th key={j}>{render(cell.tokens,k+j)}</th>)}</tr></thead><tbody>{t.rows.map((row:any,j:number)=><tr key={j}>{row.map((cell:any,n:number)=><td key={n}>{render(cell.tokens,k+j+n)}</td>)}</tr>)}</tbody></table></div>;
 case 'html':return <React.Fragment key={k}>{t.raw}</React.Fragment>;
 default:return <React.Fragment key={k}>{t.text||''}</React.Fragment>;
}});}
export default function Markdown({text}:{text:string}){return <div className="markdown">{render(marked.lexer(text,{gfm:true,breaks:true}) as Token[])}</div>;}
