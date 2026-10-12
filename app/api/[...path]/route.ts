import { env } from 'cloudflare:workers';
import { searchCompanies, resolveCompany, communityCompany, linkLegacyCompanies, CompanyError } from '../../../lib/wikidata';
import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
class HttpError extends Error { constructor(public status: number, message: string) {super(message);} }
function db(){if(!env.DB) throw new Error('Database unavailable');return env.DB;}
function bucket(){if(!env.BUCKET) throw new Error('File storage unavailable');return env.BUCKET;}
function clean(value: unknown, label: string, min: number, max: number){ const t = typeof value === 'string' ? value.trim() : ''; if(t.length < min || t.length > max) throw new HttpError(400, `${label}需要 ${min}–${max} 个字符`); return t; }
async function account(){const u=await getChatGPTUser(); if(!u) throw new HttpError(401,'请先登录，再参与分享'); const name=u.fullName?.slice(0,24) || '面友'+u.userId.slice(-4); await db().prepare('INSERT INTO users (id,email,name,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email').bind(u.userId,u.email,name,Date.now()).run();return u;}
const selectPost = `SELECT p.id,p.user_id AS userId,p.title,COALESCE(co.name,p.company) AS company,p.company_id AS companyId,p.company_status AS companyStatus,co.source AS companySource,co.wikidata_id AS wikidataId,co.description AS companyDescription,co.website AS companyWebsite,p.role,p.category,p.outcome,p.excerpt,p.audio_key AS audioKey,p.audio_name AS audioName,p.created_at AS createdAt,u.name AS author,(SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) AS commentCount FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN companies co ON co.id=p.company_id`;
async function readPost(id:string){const row=await db().prepare(selectPost+' WHERE p.id=?').bind(id).first<any>();if(!row) throw new HttpError(404,'这篇经历不存在或已被删除');return row;}
function publicPost(p:any){return {...p,companySourceUrl:p.wikidataId?'https://www.wikidata.org/wiki/'+p.wikidataId:null,audioKey:undefined,audioUrl:p.audioKey?'/api/posts/'+p.id+'/audio':null};}
function checkOrigin(req:Request){const origin=req.headers.get('origin');if(!origin || origin!==new URL(req.url).origin) throw new HttpError(403,'请求来源校验失败');}
const searchLimits=new Map<string,{n:number;until:number}>();
async function handle(req:Request){
 const path=new URL(req.url).pathname.split('/').filter(Boolean).slice(1);const method=req.method;
 if(method!=='GET') checkOrigin(req);
 if(path[0]==='companies' && path.length===1 && method==='GET'){
   const u=await getChatGPTUser();if(!u)throw new HttpError(401,'请先登录，再搜索和选择公司');
   const now=Date.now();const current=searchLimits.get(u.userId);if(current&&current.until>now&&current.n>=30)throw new HttpError(429,'搜索较频繁，请稍后再试');
   if(searchLimits.size>256){for(const [key,value] of searchLimits)if(value.until<now)searchLimits.delete(key);if(searchLimits.size>256)searchLimits.delete(searchLimits.keys().next().value!);}
   searchLimits.set(u.userId,current&&current.until>now?{...current,n:current.n+1}:{n:1,until:now+60000});
   return json(await searchCompanies(db(),new URL(req.url).searchParams.get('q')||'',new URL(req.url).searchParams.get('remote')==='1'));
 }
 if(path[0]==='me'){
   if(method==='GET'){const u=await getChatGPTUser();if(!u) return json({user:null});await account();return json({user:await db().prepare('SELECT id,name,created_at AS createdAt FROM users WHERE id=?').bind(u.userId).first()});}
   if(method==='PATCH'){const u=await account();const b=await req.json() as any;const name=clean(b.name,'昵称',2,24);await db().prepare('UPDATE users SET name=? WHERE id=?').bind(name,u.userId).run();return json({ok:true});}
 }
 if(path[0]==='posts' && path.length===1){
   if(method==='GET'){
    await linkLegacyCompanies(db());const url=new URL(req.url);const q=(url.searchParams.get('q')||'').slice(0,100);const category=url.searchParams.get('category')||'全部';const sort=url.searchParams.get('sort');const audio=url.searchParams.get('audio')==='1';const mine=url.searchParams.get('mine')==='1';const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
    const clauses:string[]=[];const args:any[]=[];const companyId=url.searchParams.get('companyId');if(companyId){clauses.push('p.company_id=?');args.push(companyId);}
    if(q){clauses.push('(p.title LIKE ? ESCAPE \'\\\' OR p.company LIKE ? ESCAPE \'\\\' OR p.role LIKE ? ESCAPE \'\\\' OR p.excerpt LIKE ? ESCAPE \'\\\' OR co.aliases LIKE ? ESCAPE \'\\\')');const term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(term,term,term,term,term);}
    if(category!=='全部'){clauses.push('p.category=?');args.push(category);}
    if(audio)clauses.push('p.audio_key IS NOT NULL');
    if(mine){const u=await account();clauses.push('p.user_id=?');args.push(u.userId);}
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const order=sort==='discussed'?'commentCount DESC,p.created_at DESC':'p.created_at DESC';
    const result=await db().prepare(selectPost+where+' ORDER BY '+order+' LIMIT 21 OFFSET ?').bind(...args,offset).all<any>();
    const stats=await db().prepare('SELECT (SELECT COUNT(*) FROM posts) AS posts,(SELECT COUNT(DISTINCT user_id) FROM posts) AS authors,(SELECT COUNT(*) FROM posts WHERE audio_key IS NOT NULL) AS audio').first();
    return json({posts:result.results.slice(0,20).map(publicPost),hasMore:result.results.length>20,stats});
   }
   if(method==='POST'){
    const u=await account();const count=await db().prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id=? AND created_at>?').bind(u.userId,Date.now()-3600000).first<any>();if(count.n>=10) throw new HttpError(429,'发布频率较高，请稍后再试');
    const length=Number(req.headers.get('content-length'));if(length>26*1024*1024) throw new HttpError(413,'文件大小不能超过 25MB');
    let f:FormData;try{f=await req.formData();}catch{throw new HttpError(400,'请使用表单格式上传经历');}const title=clean(f.get('title'),'标题',4,100),submittedCompany=clean(f.get('company'),'公司',1,200),role=clean(f.get('role'),'岗位',1,60),category=clean(f.get('category'),'方向',1,24),outcome=clean(f.get('outcome'),'进展',1,24),md=clean(f.get('markdown'),'正文',10,100000).replace(/\r\n?/g,'\n');
    if(!['技术研发','产品设计','运营市场','职能其他'].includes(category)||!['已获 Offer','面试中','未通过','暂不透露'].includes(outcome)) throw new HttpError(400,'请选择有效的方向和面试进展');
    const chosenId=typeof f.get('companyId')==='string'?String(f.get('companyId')):'';const pending=f.get('companyPending')==='1';
    if(chosenId&&pending)throw new HttpError(400,'公司不能同时标记为已关联和待核实');
    const chosen=chosenId?await resolveCompany(db(),chosenId):pending?await communityCompany(db(),submittedCompany,u.userId):null;
    if(!chosen)throw new HttpError(400,'请从候选列表选择公司；未收录的公司请创建社区公司记录');
    const company=chosen?.name||submittedCompany,companyId=chosen?.id||null,companyStatus=chosen?.source==='wikidata'?'matched':'community';
    const audio=f.get('audio');let file:File|null=audio instanceof File && audio.size>0?audio:null;
    const allowed=['audio/mpeg','audio/mp4','audio/x-m4a','audio/m4a','audio/wav','audio/x-wav','audio/wave','audio/ogg','audio/webm','audio/aac','audio/flac','audio/x-flac'];
    if(file && (file.size>25*1024*1024 || !allowed.includes(file.type))) throw new HttpError(400,'请选择不超过 25MB 的 MP3、M4A、WAV、OGG、WebM、AAC 或 FLAC 音频');
    const id=crypto.randomUUID(),mdKey='posts/'+id+'/experience.md',audioKey=file?'posts/'+id+'/audio':null;
    try{
      await bucket().put(mdKey,md,{httpMetadata:{contentType:'text/markdown; charset=utf-8'}});
      if(file) await bucket().put(audioKey!,file.stream(),{httpMetadata:{contentType:file.type}});
      const excerpt=md.replace(/```[\s\S]*?```/g,' [代码片段] ').replace(/[#*>`_\[\]]/g,'').replace(/\s+/g,' ').slice(0,180);
      await db().prepare('INSERT INTO posts (id,user_id,title,company,company_id,company_status,role,category,outcome,excerpt,markdown_key,audio_key,audio_type,audio_name,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,u.userId,title,company,companyId,companyStatus,role,category,outcome,excerpt,mdKey,audioKey,file?.type||null,file?.name.slice(0,150)||null,Date.now()).run();
    }catch(error){await bucket().delete([mdKey,...(audioKey?[audioKey]:[])]);throw error;}
    return json({id},201);
   }
 }
 if(path[0]==='posts' && path[1]){
   const id=path[1]; const p=await readPost(id);
   if(path.length===2 && method==='GET'){
    const meta=await db().prepare('SELECT markdown_key FROM posts WHERE id=?').bind(id).first<any>();const file=await bucket().get(meta.markdown_key);if(!file) throw new HttpError(503,'正文暂时不可用，请稍后再试');
    const comments=await db().prepare('SELECT c.id,c.content,c.user_id AS userId,c.created_at AS createdAt,u.name AS author FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at').bind(id).all();return json({post:publicPost(p),markdown:await file.text(),comments:comments.results});
   }
   if(path[2]==='markdown' && method==='GET'){
    const meta=await db().prepare('SELECT markdown_key FROM posts WHERE id=?').bind(id).first<any>();const f=await bucket().get(meta.markdown_key);if(!f) throw new HttpError(404,'文件不存在');return new Response(f.body,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="experience.md"','X-Content-Type-Options':'nosniff'}});
   }
   if(path[2]==='audio' && method==='GET'){
    if(!p.audioKey) throw new HttpError(404,'此经历未上传音频');const head=await bucket().head(p.audioKey);if(!head) throw new HttpError(404,'音频不存在');
    const range=req.headers.get('range');let start=0,end=head.size-1;
    if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});if(!m[1])start=Math.max(0,head.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}if(start>end||start>=head.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});}
    const f=await bucket().get(p.audioKey,range?{range:{offset:start,length:end-start+1}}:undefined);if(!f)throw new HttpError(404,'音频不存在');
    return new Response(f.body,{status:range?206:200,headers:{'Content-Type':head.httpMetadata?.contentType||'audio/mpeg','Content-Length':String(end-start+1),'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=300',...(range?{'Content-Range':`bytes ${start}-${end}/${head.size}`}:{})}});
   }
   if(path[2]==='comments' && method==='POST'){
    const u=await account();const recent=await db().prepare('SELECT COUNT(*) AS n FROM comments WHERE user_id=? AND created_at>?').bind(u.userId,Date.now()-60000).first<any>();if(recent.n>=5)throw new HttpError(429,'评论频率较高，请稍后再试');
    const b=await req.json() as any;const content=clean(b.content,'评论',1,2000);await db().prepare('INSERT INTO comments (id,post_id,user_id,content,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,u.userId,content,Date.now()).run();return json({ok:true},201);
   }
   if(path.length===2 && method==='DELETE'){
    const u=await account();if(p.userId!==u.userId) throw new HttpError(403,'只能删除自己的经历');const meta=await db().prepare('SELECT markdown_key,audio_key FROM posts WHERE id=?').bind(id).first<any>();await db().prepare('DELETE FROM posts WHERE id=?').bind(id).run();await bucket().delete([meta.markdown_key,...(meta.audio_key?[meta.audio_key]:[])]);return json({ok:true});
   }
 }
 if(path[0]==='comments' && path[1] && method==='DELETE'){
   const u=await account();const c=await db().prepare('SELECT user_id FROM comments WHERE id=?').bind(path[1]).first<any>();if(!c)throw new HttpError(404,'评论不存在');if(c.user_id!==u.userId)throw new HttpError(403,'只能删除自己的评论');await db().prepare('DELETE FROM comments WHERE id=?').bind(path[1]).run();return json({ok:true});
 }
 return json({error:'接口不存在'},404);
}
async function safe(req:Request){try{return await handle(req);}catch(e){if(e instanceof CompanyError)return json({error:e.message},e.status);if(e instanceof HttpError)return json({error:e.message},e.status);console.error('Community API failed',e instanceof Error?e.message:'Unknown error');return json({error:'服务暂时不可用，请稍后再试'},500);}}
export const GET=safe;export const POST=safe;export const PATCH=safe;export const DELETE=safe;
