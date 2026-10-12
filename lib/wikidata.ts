export type Company = {id:string;wikidataId:string|null;source:'wikidata'|'community';name:string;description:string;aliases:string[];website:string|null;sourceUrl:string|null};
export type CompanySearch={companies:Company[];remoteSearched:boolean;warning?:string};
export class CompanyError extends Error {constructor(public status:number,message:string){super(message);}}
const DAY=86400000;
const USER_AGENT='Mianshu/1.1 (https://mianshu-interview-community.peppysun1.chatgpt.site; company autocomplete)';
const roots=new Set(['Q783794','Q4830453']);
const labels=(value:any):string=>{for(const lang of ['zh-hans','zh-cn','zh','en']){const v=value?.[lang]?.value;if(typeof v==='string'&&v.trim())return v.trim();}return '';};
export function nameKey(value:string){return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
export function safeWebsite(value:unknown){if(typeof value!=='string')return null;try{const u=new URL(value);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)return u.href;}catch{}return null;}
const qid=(id:unknown):id is string=>typeof id==='string'&&/^Q[1-9]\d{0,11}$/.test(id);
async function upstream(url:string,timeout=12000){try{const res=await fetch(url,{headers:{'User-Agent':USER_AGENT,'Accept':'application/json'},signal:AbortSignal.timeout(timeout)});if(!res.ok)throw new CompanyError(503,res.status===429?'企业数据源访问较多，请稍后再试':'Wikidata 暂时不可用，请稍后重试');const data:any=await res.json();if(data.error)throw new CompanyError(503,'Wikidata 暂时不可用，请稍后重试');return data;}catch(e){if(e instanceof CompanyError)throw e;throw new CompanyError(503,'Wikidata 暂时连接失败，可稍后重试或创建社区公司');}}
async function entities(ids:string[]){if(!ids.length)return {};const params=new URLSearchParams({action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|aliases|claims',languages:'zh-hans|zh-cn|zh|en',languagefallback:'1',redirects:'yes',format:'json'});const data=await upstream('https://www.wikidata.org/w/api.php?'+params);return data.entities||{};}
async function businessIds(ids:string[]){if(!ids.length)return new Set<string>();const query=`SELECT DISTINCT ?item WHERE { VALUES ?item { ${ids.map(id=>'wd:'+id).join(' ')} } VALUES ?root { ${[...roots].map(id=>'wd:'+id).join(' ')} } ?item wdt:P31/wdt:P279* ?root . }`;const params=new URLSearchParams({query,format:'json'});const data=await upstream('https://query.wikidata.org/sparql?'+params);return new Set<string>((data.results?.bindings||[]).map((b:any)=>String(b.item?.value||'').split('/').pop()).filter(qid));}
function convert(entity:any):Company|null{if(!qid(entity?.id)||entity.missing!==undefined)return null;const name=labels(entity.labels);if(!name)return null;const aliases=[...new Set<string>(Object.values(entity.aliases||{}).flatMap((items:any)=>items.map((v:any)=>v.value)).filter((v:any)=>typeof v==='string'&&v.length<=200))].slice(0,50);const website=(entity.claims?.P856||[]).filter((c:any)=>c.rank!=='deprecated').map((c:any)=>safeWebsite(c.mainsnak?.datavalue?.value)).find(Boolean)||null;return {id:'wikidata:'+entity.id,wikidataId:entity.id,source:'wikidata',name:name.slice(0,200),description:labels(entity.descriptions).slice(0,600),aliases,website,sourceUrl:'https://www.wikidata.org/wiki/'+entity.id};}
function fromRow(row:any):Company{return {id:row.id,wikidataId:row.wikidata_id,source:row.source,name:row.name,description:row.description,aliases:JSON.parse(row.aliases),website:row.website,sourceUrl:row.wikidata_id?'https://www.wikidata.org/wiki/'+row.wikidata_id:null};}
async function persist(db:D1Database,list:Company[]){if(!list.length)return;await db.batch(list.map(c=>db.prepare('INSERT INTO companies (id,wikidata_id,source,name,description,aliases,website,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(wikidata_id) DO UPDATE SET name=excluded.name,description=excluded.description,aliases=excluded.aliases,website=excluded.website,updated_at=excluded.updated_at').bind(c.id,c.wikidataId,'wikidata',c.name,c.description,JSON.stringify(c.aliases),c.website,Date.now())));}
export async function communityCompany(db:D1Database,input:string,userId:string):Promise<Company>{
 const name=input.normalize('NFKC').trim().replace(/\s+/g,' ');if(name.length<1||name.length>200)throw new CompanyError(400,'社区公司名称需要 1–200 个字符');const key=nameKey(name);
 await db.prepare('INSERT INTO companies (id,wikidata_id,source,community_name_key,created_by,name,description,aliases,website,updated_at) VALUES (?,NULL,?,?,?,?,?,?,NULL,?) ON CONFLICT(community_name_key) DO NOTHING').bind('community:'+crypto.randomUUID(),'community',key,userId,name,'用户录入的公司，尚未关联 Wikidata',JSON.stringify([name]),Date.now()).run();
 const row=await db.prepare('SELECT * FROM companies WHERE community_name_key=?').bind(key).first<any>();if(!row)throw new CompanyError(503,'社区公司暂时无法保存，请重试');return fromRow(row);
}
export async function linkLegacyCompanies(db:D1Database,query?:string){
 const legacyQuery="SELECT company,user_id FROM posts WHERE company_id IS NULL AND company_status='unlinked'"+(query?" AND company LIKE ? ESCAPE '\\'":"")+" ORDER BY created_at,id LIMIT 25";
 const prepared=db.prepare(legacyQuery);const legacy=await (query?prepared.bind('%'+query.replace(/[\\%_]/g,'\\$&')+'%'):prepared).all<any>();
 for(const p of legacy.results){const c=await communityCompany(db,p.company,p.user_id);await db.prepare("UPDATE posts SET company_id=?,company_status='community' WHERE company_id IS NULL AND company_status='unlinked' AND company=?").bind(c.id,p.company).run();}
}
function dedupe(lists:Company[][]){const map=new Map<string,Company>();for(const c of lists.flat())if(!map.has(c.id))map.set(c.id,c);return [...map.values()].slice(0,16);}
export async function searchCompanies(db:D1Database,input:string,includeRemote=false):Promise<CompanySearch>{
 const query=input.normalize('NFKC').trim();if(query.length<2||query.length>80)throw new CompanyError(400,'请输入 2–80 个字符的公司名称');const cacheKey=nameKey(query);await linkLegacyCompanies(db,query);
 const term='%'+query.replace(/[\\%_]/g,'\\$&')+'%',keyTerm='%'+cacheKey.replace(/[\\%_]/g,'\\$&')+'%';
 const found=await db.prepare("SELECT * FROM companies WHERE name LIKE ? ESCAPE '\\' OR aliases LIKE ? ESCAPE '\\' OR community_name_key LIKE ? ESCAPE '\\' ORDER BY CASE WHEN source='community' THEN 0 ELSE 1 END,name LIMIT 12").bind(term,term,keyTerm).all<any>();const local=found.results.map(fromRow);
 if(local.length&&!includeRemote)return {companies:local,remoteSearched:false};
 const cached=await db.prepare('SELECT result_ids FROM company_searches WHERE query=? AND expires_at>?').bind(cacheKey,Date.now()).first<any>();
 if(cached){const ids:string[]=JSON.parse(cached.result_ids);if(!ids.length)return {companies:local,remoteSearched:true};const rows=await db.prepare('SELECT * FROM companies WHERE id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all<any>();const map=new Map(rows.results.map(r=>[r.id,fromRow(r)]));return {companies:dedupe([local,ids.map(id=>map.get(id)).filter((r):r is Company=>!!r)]),remoteSearched:true};}
 try{
 const params=new URLSearchParams({action:'wbsearchentities',search:query,language:/^[\x00-\x7F]+$/.test(query)?'en':'zh',uselang:'zh-hans',type:'item',limit:'12',format:'json'});const data=await upstream('https://www.wikidata.org/w/api.php?'+params);
 const ids:string[]=[...new Set<string>((data.search||[]).map((x:any)=>x.id).filter(qid))];
 const [details,business]=await Promise.all([entities(ids),businessIds(ids)]);const seen=new Set<string>();const list:Company[]=[];
 for(const id of ids){const e=(details as any)[id]||Object.values(details).find((x:any)=>x.id===id);const c=convert(e);if(c&&(business.has(id)||business.has(c.wikidataId!))&&!seen.has(c.id)){seen.add(c.id);list.push(c);}}
 await persist(db,list);await db.prepare('INSERT INTO company_searches (query,result_ids,expires_at) VALUES (?,?,?) ON CONFLICT(query) DO UPDATE SET result_ids=excluded.result_ids,expires_at=excluded.expires_at').bind(cacheKey,JSON.stringify(list.map(c=>c.id)),Date.now()+(list.length?DAY:3600000)).run();return {companies:dedupe([local,list]),remoteSearched:true};
 }catch(e){if(local.length)return {companies:local,remoteSearched:true,warning:e instanceof Error?e.message:'Wikidata 暂时不可用'};throw e;}
}
export async function resolveCompany(db:D1Database,id:string):Promise<Company>{
 if(id.startsWith('community:')){const row=await db.prepare("SELECT * FROM companies WHERE id=? AND source='community'").bind(id).first<any>();if(!row)throw new CompanyError(400,'所选社区公司不存在，请重新搜索');return fromRow(row);}
 const external=id.replace(/^wikidata:/,'');if(!qid(external)||id!=='wikidata:'+external)throw new CompanyError(400,'请选择候选列表中的公司，或创建社区公司');
 const row=await db.prepare("SELECT * FROM companies WHERE id=? AND source='wikidata' AND updated_at>?").bind(id,Date.now()-7*DAY).first<any>();if(row)return fromRow(row);
 const details=await entities([external]);const entity=Object.values(details)[0];const c=convert(entity);if(!c)throw new CompanyError(400,'这家公司尚未收录，请重新搜索');const valid=await businessIds([c.wikidataId!]);if(!valid.has(c.wikidataId!))throw new CompanyError(400,'所选条目不是公司或企业，请选择正确的企业条目');await persist(db,[c]);return c;
}
