import {normalizeObjectQuery, exactBlockMatches} from './object-lookup.ts';
import {Registry,validateRegistration} from './registry.ts';
import {topology,classify,partialCompare,semanticRank} from './intelligence.ts';
import {analyzeAdvanced,compareAdvanced,partialCandidates} from './advanced-geometry.ts';
import {canonicalGeometry,provenanceResult} from './identity.ts';
import {decodeModel,inspectMesh,identifyModel} from './ai-first.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleMcp } from './mcp.ts';
import {parseOBJ,matchFeature,rankSimilar,type Filter} from './ai-search.ts';
import {parseUploadedModel} from './formats.ts';
import {extractFeaturesV2,compareV2} from './geometry-v2.ts';
import {Metrics} from './observability.ts';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { FeatureStore, compareFeatures, meshFromGLB, type Features } from './analysis.ts';
import { Catalog } from './catalog.ts';
import { openApiSpec, llmsText } from './api-docs.ts';
import { GraphQLClient, Indexer, RateLimitError } from './indexer.ts';
import { exportMesh, FORMATS, meshInfo, reconstruct, safeId, type MeshTopology, type MinedObject, type ModelFormat } from './geometry.ts';

const GRAPHQL_URL = process.env.NUMEN_GRAPHQL_URL ?? 'https://graphql.numen-network.org/graphql';
const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const CACHE = resolve(process.env.NUMEN_GEOMETRY_CACHE ?? './cache');
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? '8000');
const OBJ_QUERY = 'query($id: String!) { minedObjectById(id: $id) { id protocol vertexCount vertices } }';
const PROVENANCE_QUERY = 'query($id: String!) { minedObjectById(id: $id) { id protocol vertexCount vertices block { height hash author { id identityDisplay } } } }';
const TOPO_QUERY = 'query($id: String!) { meshTopologies(where: {id_in: [$id]}) { id faces } }';
const registry=new Registry(resolve(process.env.NUMEN_REGISTRY_DB??'./data/numen-registry.sqlite'));
const catalog=new Catalog(resolve(process.env.NUMEN_CATALOG_DB??'./data/numen-catalog.sqlite'));
const gqlClient=new GraphQLClient(GRAPHQL_URL,Number(process.env.NUMEN_REQUEST_INTERVAL_MS??'2500'));
const indexer=new Indexer(catalog,gqlClient,Number(process.env.NUMEN_INDEX_PAGE_SIZE??'24'));
const MIME: Record<ModelFormat,string> = {obj:'text/plain; charset=utf-8',stl:'application/octet-stream',glb:'model/gltf-binary'};
const pending = new Map<string, Promise<{ data: Buffer; info: ReturnType<typeof meshInfo> }>>();
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status=status; } }

async function gql<T>(query:string,variables:Record<string,string|number>):Promise<T> {
  try {return await gqlClient.request<T>(query,variables);}
  catch(e){if(e instanceof RateLimitError)throw new HttpError(503,`GraphQL rate limited; retry in ${Math.ceil(e.waitMs/1000)}s`);throw new HttpError(502,e instanceof Error?e.message:String(e));}
}
async function atomicWrite(path:string,data:Buffer|string) {
  const tmp=`${path}.${randomUUID()}.tmp`;
  await writeFile(tmp,data); await rename(tmp,path);
}
async function generate(id:string,fmt:ModelFormat) {
  const path=join(CACHE,`${id}.${fmt}`), meta=join(CACHE,`${id}.json`);
  try { const [data,info] = await Promise.all([readFile(path),readFile(meta,'utf8')]); return {data,info:JSON.parse(info) as ReturnType<typeof meshInfo>}; }
  catch(e) { if((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const result=await gql<{minedObjectById:MinedObject|null}>(OBJ_QUERY,{id});
  const obj=result.minedObjectById; if(!obj) throw new HttpError(404,'Mined object not found');
  if(!safeId(obj.protocol)) throw new HttpError(422,'Invalid protocol');
  const top=await gql<{meshTopologies:MeshTopology[]}>(TOPO_QUERY,{id:obj.protocol});
  if(!top.meshTopologies?.[0]) throw new HttpError(404,'Mesh topology not found');
  let data:Buffer,info:ReturnType<typeof meshInfo>;
  try { const mesh=reconstruct(obj,top.meshTopologies[0]); data=exportMesh(mesh,fmt); info=meshInfo(mesh); }
  catch(e) { throw new HttpError(422,`Geometry reconstruction failed: ${String(e)}`); }
  await mkdir(CACHE,{recursive:true});
  await atomicWrite(path,data); await atomicWrite(meta,JSON.stringify(info,null,2));
  return {data,info};
}
async function getModel(id:string,fmt:string) {
  if(!safeId(id)) throw new HttpError(400,'Invalid object ID');
  if(!FORMATS.includes(fmt as ModelFormat)) throw new HttpError(400,'Unsupported format');
  const key=`${id}.${fmt}`;
  if(!pending.has(key)) pending.set(key,generate(id,fmt as ModelFormat).finally(()=>pending.delete(key)));
  return pending.get(key)!;
}
const features=new FeatureStore(join(CACHE,'features'),async id=>meshFromGLB(id,(await getModel(id,'glb')).data));
const featureQueue={active:0,max:Math.max(1,Math.min(4,Number(process.env.NUMEN_ANALYSIS_CONCURRENCY??'2')))};
const ANALYSIS_ALGORITHM='radial-v1';
// Resolve geometry features through the existing disk cache and persist the
// resulting descriptor in SQLite for similarity search and coverage reporting.
async function getFeatures(id:string):Promise<Features>{
  const cached=catalog.getFeatures(id) as Features|null;
  if(cached?.algorithm===ANALYSIS_ALGORITHM)return cached;
  const computed=await features.get(id);
  catalog.putFeatures(computed);
  return computed;
}

// Incremental, resumable v2 indexing; separate SQLite table keeps radial-v1 intact.
const v2InFlight=new Set<string>();
const v2Progress={processed:0,failed:0,lastError:'',running:false};
const v2Enabled=process.env.NUMEN_DISABLE_V2_ANALYSIS!=='1';
const v2Concurrency=Math.max(1,Math.min(8,Number(process.env.NUMEN_V2_CONCURRENCY??'3')||3));
const v2Interval=Math.max(250,Number(process.env.NUMEN_V2_INTERVAL_MS??'1000')||1000);
async function v2Feature(id:string){
 const existing=catalog.getFeaturesV2(id) as ReturnType<typeof extractFeaturesV2>|null;
 if(existing?.algorithm==='geometry-v2')return existing;
 const mesh=meshFromGLB(id,(await getModel(id,'glb')).data);
 const computed=extractFeaturesV2(mesh);
 catalog.putFeaturesV2(computed);
 return computed;
}
async function backgroundV2(){
 if(stopping||!v2Enabled)return;
 const available=Math.max(0,v2Concurrency-v2InFlight.size);
 if(available){
  // SQL excludes persistent failure cooldowns, so one bad object cannot starve the queue.
  const ids=catalog.unanalyzedV2(Math.max(available*4,16)).filter(id=>!v2InFlight.has(id));
  for(const id of ids.slice(0,available)){
   v2InFlight.add(id);v2Progress.running=true;
   void v2Feature(id).then(()=>{v2Progress.processed++;v2Progress.lastError='';})
    .catch(e=>{v2Progress.failed++;v2Progress.lastError=String(e);catalog.recordV2Failure(id,String(e));})
    .finally(()=>{v2InFlight.delete(id);v2Progress.running=v2InFlight.size>0;});
  }
 }
 if(!stopping)setTimeout(backgroundV2,v2Interval);
}
const analysisProgress={processed:0,failed:0,lastError:'',running:false,active:0,pausedUntil:0};
const analysisRetryAfter=new Map<string,number>();
const analysisInFlight=new Set<string>();
let analysisTimer:ReturnType<typeof setTimeout>|undefined;
let stopping=false;
const analysisInterval=Math.max(1000,Number(process.env.NUMEN_ANALYSIS_INTERVAL_MS??'2500'));
const analysisBatchSize=Math.max(10,Math.min(1000,Number(process.env.NUMEN_ANALYSIS_SCAN_BATCH??'250')));
let scanOffset=0;
// The background scheduler never blocks the HTTP server. It reuses already cached
// GLBs/features, limits concurrent jobs, and backs off failed GraphQL requests.
async function backgroundAnalyze(){
 if(stopping)return;
 try{
  const now=Date.now();
  for(const [id,until] of analysisRetryAfter)if(until<=now)analysisRetryAfter.delete(id);
  const available=Date.now()<analysisProgress.pausedUntil?0:Math.max(0,featureQueue.max-featureQueue.active);
  if(available>0){
   let ids=catalog.unanalyzedIds(ANALYSIS_ALGORITHM,analysisBatchSize,scanOffset);
   if(ids.length===0){scanOffset=0;ids=catalog.unanalyzedIds(ANALYSIS_ALGORITHM,analysisBatchSize,0);}
   // Advance a bounded scan window even if the first objects are rate-limited.
   scanOffset+=ids.length;
   const ready=ids.filter(id=>!analysisInFlight.has(id)&&!analysisRetryAfter.has(id));
   for(const id of ready.slice(0,available)){
    analysisInFlight.add(id);
    void limitedFeature(id).then(()=>{analysisProgress.processed++;analysisProgress.lastError='';})
     .catch(e=>{analysisProgress.failed++;analysisProgress.lastError=String(e);
       const msg=String(e);const retry=msg.includes('rate limited')?120_000:300_000;
       analysisRetryAfter.set(id,Date.now()+retry);
       if(msg.includes('rate limited'))analysisProgress.pausedUntil=Math.max(analysisProgress.pausedUntil,Date.now()+retry);
     }).finally(()=>{analysisInFlight.delete(id);analysisProgress.active=analysisInFlight.size;analysisProgress.running=analysisInFlight.size>0;});
   }
  }
  analysisProgress.active=analysisInFlight.size;
  analysisProgress.running=analysisInFlight.size>0;
 }catch(e){analysisProgress.lastError=String(e)}
 if(!stopping)analysisTimer=setTimeout(backgroundAnalyze,analysisInterval);
}

async function limitedFeature(id:string){while(featureQueue.active>=featureQueue.max)await new Promise(r=>setTimeout(r,100));featureQueue.active++;try{return await getFeatures(id)}finally{featureQueue.active--}}
function respond(res:ServerResponse,status:number,body:unknown) {
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':data.length,'access-control-allow-origin':'*'}); res.end(data);
}
async function readJSON(req:IncomingMessage,maxBytes=16_384):Promise<unknown> {
  const chunks:Buffer[]=[]; let size=0;
  for await(const chunk of req) { const b=Buffer.from(chunk); size+=b.length; if(size>maxBytes) throw new HttpError(413,'Body too large'); chunks.push(b); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new HttpError(400,'Invalid JSON body'); }
}
const rateBuckets=new Map<string,{start:number;count:number}>();
const RATE_LIMIT=Math.max(1,Number(process.env.NUMEN_RATE_LIMIT_PER_MINUTE??'90'));
const MAX_ACTIVE_REQUESTS=Math.max(1,Number(process.env.NUMEN_MAX_ACTIVE_REQUESTS??'24'));
let activeRequests=0;
function checkRate(req:IncomingMessage,res:ServerResponse):boolean{
 // Host binds to loopback by default. When proxied, use remoteAddress (not spoofable forwarded headers).
 const ip=req.socket.remoteAddress??'unknown';const now=Date.now();
 if(rateBuckets.size>5000)for(const [key,b] of rateBuckets)if(now-b.start>120000)rateBuckets.delete(key);
 const b=rateBuckets.get(ip);const bucket=!b||now-b.start>=60000?{start:now,count:0}:b;bucket.count++;rateBuckets.set(ip,bucket);
 if(bucket.count>RATE_LIMIT){res.writeHead(429,{'content-type':'application/json','retry-after':String(Math.max(1,Math.ceil((60000-(now-bucket.start))/1000)))});res.end(JSON.stringify({error:'Rate limit exceeded'}));return false;}
 if(activeRequests>=MAX_ACTIVE_REQUESTS){res.writeHead(503,{'content-type':'application/json','retry-after':'5'});res.end(JSON.stringify({error:'Server busy'}));return false;}
 return true;
}
function validatedFilter(raw:Record<string,unknown>):Filter{
 const keys=['minVertices','maxVertices','minFaces','maxFaces','minSphericity','maxSphericity','minAxisRatio','maxAxisRatio'] as const;
 const out:Filter={};for(const key of keys){if(raw[key]!==undefined){const n=raw[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e9)throw new HttpError(400,`Invalid ${key}`);(out as Record<string,unknown>)[key]=n;}}
 if(raw.watertight!==undefined){if(typeof raw.watertight!=='boolean')throw new HttpError(400,'Invalid watertight');out.watertight=raw.watertight;}
 return out;
}
const metrics=new Metrics();
const agentTraffic: {time:string;method:string;path:string;status:number;durationMs:number;category:string}[]=[];
function classifyTraffic(req:IncomingMessage):string {
 const ua=String(req.headers['user-agent']??'').toLowerCase();
 if(req.headers['x-numen-test-client']==='ai-lab')return 'human_lab_test';
 if(req.headers['x-numen-test-client']==='agent-smoke')return 'synthetic_agent_test';
 if(ua.includes('claude')||ua.includes('chatgpt')||ua.includes('openai')||ua.includes('gemini'))return 'claimed_agent_unverified';
 return 'unknown_client';
}
function monitorAllowed(req:IncomingMessage):boolean {
 const remote=req.socket.remoteAddress??'';
 const local=remote==='127.0.0.1'||remote==='::1'||remote==='::ffff:127.0.0.1';
 const token=process.env.NUMEN_MONITOR_TOKEN;
 return local || Boolean(token && req.headers.authorization===`Bearer ${token}`);
}
const server=createServer(async(req,res)=>{
  const started=Date.now();let statusCode=200;const originalWriteHead=res.writeHead.bind(res);
  res.writeHead=((status:number,...args:any[])=>{statusCode=status;return (originalWriteHead as any)(status,...args)}) as typeof res.writeHead;
  res.once('finish',()=>{
    const path=(req.url??'/').split('?')[0];const durationMs=Date.now()-started;
    metrics.record(path,statusCode,durationMs);
    if(path!=='/api/v1/agent-monitor'&&path!=='/agent-monitor'&&path!=='/agent-monitor.js'){
      agentTraffic.push({time:new Date().toISOString(),method:req.method??'GET',path:path.replace(/\/objects\/[^/]+/g,'/objects/:id'),status:statusCode,durationMs,category:classifyTraffic(req)});
      if(agentTraffic.length>500)agentTraffic.shift();
    }
  });
  if(!checkRate(req,res))return;
  activeRequests++;res.once('close',()=>{activeRequests--;});
  try {
    const url=new URL(req.url??'/',`http://${HOST}:${PORT}`);
    if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')) {
      const page=await readFile(join(PUBLIC,'index.html'));
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-length':page.length});res.end(page);return;
    }
    if(req.method==='GET'&&url.pathname==='/agent-monitor'){
      if(!monitorAllowed(req))throw new HttpError(403,'Monitor restricted to localhost or NUMEN_MONITOR_TOKEN');
      const page=await readFile(join(PUBLIC,'agent-monitor.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(page);return;
    }
    if(req.method==='GET'&&url.pathname==='/agent-monitor.js'){
      if(!monitorAllowed(req))throw new HttpError(403,'Monitor restricted');
      const js=await readFile(join(PUBLIC,'agent-monitor.js'));res.writeHead(200,{'content-type':'application/javascript; charset=utf-8'});res.end(js);return;
    }
    if(req.method==='GET'&&url.pathname==='/api/v1/agent-monitor'){
      if(!monitorAllowed(req))throw new HttpError(403,'Monitor restricted');
      return respond(res,200,{warning:'User agents and client labels are not proof of AI identity. In-memory telemetry resets on restart.',metrics:metrics.snapshot(),recent:agentTraffic.slice(-100).reverse()});
    }
    if(req.method==='GET'&&url.pathname==='/comparison-lab.js'){const js=await readFile(join(PUBLIC,'comparison-lab.js'));res.writeHead(200,{'content-type':'application/javascript; charset=utf-8'});res.end(js);return;}
    if(req.method==='GET'&&url.pathname==='/simple-lab.js'){const js=await readFile(join(PUBLIC,'simple-lab.js'));res.writeHead(200,{'content-type':'application/javascript; charset=utf-8'});res.end(js);return;}
    if(req.method==='GET'&&url.pathname==='/ai-lab.js'){const js=await readFile(join(PUBLIC,'ai-lab.js'));res.writeHead(200,{'content-type':'application/javascript; charset=utf-8'});res.end(js);return;}
    if(req.method==='GET'&&url.pathname==='/ai-lab'){const page=await readFile(join(PUBLIC,'ai-lab.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' https://esm.sh; connect-src 'self' https://esm.sh; worker-src 'self'; img-src 'self' data: blob:"});res.end(page);return;}
    if(req.method==='GET'&&url.pathname==='/api/v1/registered'){const limit=Number(url.searchParams.get('limit')??24),offset=Number(url.searchParams.get('offset')??0);if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)throw new HttpError(400,'Invalid pagination');return respond(res,200,registry.list(limit,offset,(url.searchParams.get('q')??'').slice(0,150)));}
    if(req.method==='GET'&&url.pathname==='/api/v1/objects/resolve'){
      const raw=(url.searchParams.get('q')??'').slice(0,150);
      const {kind,query}=normalizeObjectQuery(raw);
      if(kind==='empty')throw new HttpError(400,'Enter an object ID, block height or miner address');
      const listing=catalog.list(50,0,query);
      const matches=kind==='block'?exactBlockMatches(listing.items,Number(query)):kind==='object'?listing.items.filter(x=>x.id===query):listing.items;
      return respond(res,200,{query,kind,items:matches,total:kind==='block'?matches.length:listing.total,pageComplete:listing.total<=50,chainCoverageComplete:catalog.status().backfillComplete,
        note:kind==='address'?'Miner-address search. Select a specific object; an address is not an object ID.':kind==='block'?'Results are limited to locally indexed objects for this block.':'Results are from the local catalog; missing records may still exist upstream.'});
    }
    if(req.method==='GET'&&url.pathname==='/api/v1/catalog/unified'){const limit=Number(url.searchParams.get('limit')??24),offset=Number(url.searchParams.get('offset')??0);if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)throw new HttpError(400,'Invalid pagination');const q=(url.searchParams.get('q')??'').slice(0,150),mined=catalog.list(limit,offset,q),registered=registry.list(limit,offset,q);return respond(res,200,{mined,registered,note:'Separate paginated catalogs; not a globally ordered merged page.'});}
    const regMatch=/^\/api\/v1\/registered\/([^/]+)$/.exec(url.pathname);
    if(req.method==='GET'&&regMatch){const item=registry.get(decodeURIComponent(regMatch[1]));if(!item)throw new HttpError(404,'Registered object not found');return respond(res,200,item);}
    if(req.method==='POST'&&url.pathname==='/api/v1/registered/import'){const token=process.env.NUMEN_REGISTRY_IMPORT_TOKEN;if(!token||req.headers.authorization!==`Bearer ${token}`)throw new HttpError(403,'Registry import disabled or unauthorized');const item=validateRegistration(await readJSON(req,16384));return respond(res,201,registry.put(item));}
    if(req.method==='GET'&&url.pathname==='/api/v1/semantic/search'){const q=(url.searchParams.get('q')??'').slice(0,250),limit=Number(url.searchParams.get('limit')??10);if(!q||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new HttpError(400,'Invalid query or limit');const candidates=catalog.v2Candidates() as ReturnType<typeof extractFeaturesV2>[];const ranked=semanticRank(q,candidates);return respond(res,200,{query:q,...ranked,results:ranked.results.slice(0,limit),coverage:{analyzed:candidates.length,indexed:catalog.status().indexed},note:'Keyword-based feature matching; no embedding model.'});}
    if(req.method==='POST'&&url.pathname==='/api/v1/geometry/advanced-analyze'){const decoded=decodeModel(await readJSON(req,1_500_000));return respond(res,200,{...analyzeAdvanced(decoded.mesh),source:{format:decoded.format,sha256:decoded.digest}});}
    if(req.method==='POST'&&url.pathname==='/api/v1/geometry/advanced-compare'){const body=await readJSON(req,3_100_000) as Record<string,unknown>;const a=decodeModel(body.a),b=decodeModel(body.b);return respond(res,200,compareAdvanced(a.mesh,b.mesh));}
    if(req.method==='POST'&&url.pathname==='/api/v1/geometry/partial-candidates'){const body=await readJSON(req,3_100_000) as Record<string,unknown>;const a=decodeModel(body.a),b=decodeModel(body.b);return respond(res,200,partialCandidates(a.mesh,b.mesh));}
    if(req.method==='POST'&&url.pathname==='/api/v1/geometry/intelligence'){const decoded=decodeModel(await readJSON(req,1_500_000));return respond(res,200,{identity:canonicalGeometry(decoded.mesh),topology:topology(decoded.mesh),classification:classify(decoded.mesh)});}
    if(req.method==='POST'&&url.pathname==='/api/v1/geometry/partial-compare'){const body=await readJSON(req,3_100_000) as Record<string,unknown>;if(!body||typeof body!=='object')throw new HttpError(400,'Expected object');const a=decodeModel(body.a),b=decodeModel(body.b);return respond(res,200,partialCompare(a.mesh,b.mesh));}
    if(req.method==='GET'&&url.pathname==='/api/v1/capabilities'){return respond(res,200,{version:'0.46.0',advancedGeometry:'/api/v1/geometry/advanced-analyze',advancedComparison:'/api/v1/geometry/advanced-compare',partialCandidateRetrieval:'/api/v1/geometry/partial-candidates',identity:'exact-v1',registeredObjects:'admin_import_only_unverified',semanticSearch:'keyword_geometry_heuristic',classification:'heuristic',partialMatch:'approximate_normalized_point_cloud_candidates' ,mcp:'/mcp',openapi:'/openapi.json',lab:'/ai-lab'});}
    if(url.pathname==='/mcp') return handleMcp(req,res,`http://127.0.0.1:${PORT}`,process.env.NUMEN_PUBLIC_URL??`http://${HOST}:${PORT}`);
    if(req.method==='GET'&&url.pathname==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});res.end('User-agent: *\nAllow: /openapi.json\nAllow: /llms.txt\nAllow: /mcp\nAllow: /api/v1/\n');return;}
    if(req.method==='GET'&&url.pathname==='/.well-known/openapi.json') {
      res.writeHead(308,{'location':'/openapi.json','cache-control':'public, max-age=3600'});res.end();return;
    }
    if(req.method==='GET'&&url.pathname==='/openapi.json') {
      return respond(res,200,openApiSpec(process.env.NUMEN_PUBLIC_URL));
    }
    if(req.method==='GET'&&url.pathname==='/llms.txt') {
      const body=llmsText(process.env.NUMEN_PUBLIC_URL);
      res.writeHead(200,{'content-type':'text/plain; charset=utf-8','content-length':Buffer.byteLength(body),'access-control-allow-origin':'*'});
      res.end(body);return;
    }
    if(req.method==='GET'&&(url.pathname==='/api/v1/mined'||url.pathname==='/recent')) {
      const limitRaw=Number(url.searchParams.get('limit')??'24');
      const offsetRaw=Number(url.searchParams.get('offset')??'0');
      if(!Number.isSafeInteger(limitRaw)||limitRaw<1||limitRaw>100||!Number.isSafeInteger(offsetRaw)||offsetRaw<0||offsetRaw>100_000_000) throw new HttpError(400,'Invalid limit or offset');
      return respond(res,200,catalog.list(limitRaw,offsetRaw,url.searchParams.get('q')??''));
    }
    const featureMatch=/^\/api\/v1\/objects\/([^/]+)\/(features|similar)$/.exec(url.pathname);
    if(req.method==='GET'&&featureMatch){const id=decodeURIComponent(featureMatch[1]);if(!safeId(id))throw new HttpError(400,'Invalid object ID');if(!catalog.has(id))throw new HttpError(404,'Object not in local catalog');const base=await limitedFeature(id);
      if(featureMatch[2]==='features')return respond(res,200,base);
      const limit=Number(url.searchParams.get('limit')??'10');if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new HttpError(400,'limit must be 1..50');
      const ids=catalog.ids().filter(x=>x!==id);const matches: {id:string;distance:number;similarityScore:number}[]=[];
      const candidates=catalog.featureCandidates(ANALYSIS_ALGORITHM,id) as Features[];
      for(const f of candidates){const cmp=compareFeatures(base,f);matches.push({id:f.id,distance:cmp.distance,similarityScore:cmp.similarityScore});}
      matches.sort((a,b)=>a.distance-b.distance);
      return respond(res,200,{id,algorithm:base.algorithm,limit,compared:candidates.length,catalogCandidates:ids.length,notAnalyzed:Math.max(0,ids.length-candidates.length),coverage:candidates.length===ids.length?'complete_for_local_catalog':'partial_cached_features_only',results:matches.slice(0,limit),note:'Background geometry analysis progressively expands coverage. Similarity is not identity proof.'});
    }
    if(req.method==='POST'&&url.pathname==='/api/v1/objects/batch'){
      const body=await readJSON(req) as {ids?:unknown;includeFeatures?:unknown};
      if(!body||!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>25||!body.ids.every(x=>typeof x==='string'&&safeId(x)))throw new HttpError(400,'ids must be 1..25 valid IDs');
      const results=[];for(const id of body.ids as string[]){if(!catalog.has(id)){results.push({id,status:'not_found'});continue;}try{const item=catalog.list(1,0,id).items.find(x=>x.id===id);const cached=body.includeFeatures===true?catalog.getFeatures(id):undefined;results.push({id,status:'ok',item,features:cached??null});}catch(e){results.push({id,status:'error',error:String(e)});}}
      return respond(res,200,{results});
    }
    if(req.method==='POST'&&url.pathname==='/api/v1/geometry/hash'){
      const body=await readJSON(req,1_500_000) as Record<string,unknown>;
      const decoded=decodeModel(body?.model??body);
      return respond(res,200,{format:decoded.format,bytesSha256:decoded.digest,identity:canonicalGeometry(decoded.mesh),identityVerified:false});
    }
    if(req.method==='POST'&&url.pathname==='/api/v1/geometry/exact-match'){
      const body=await readJSON(req,1_500_000) as Record<string,unknown>;
      const decoded=decodeModel(body?.model??body);
      const target=canonicalGeometry(decoded.mesh);
      const ids=catalog.ids(1000000);
      const requestedId=typeof body.sourceObjectId==='string'&&safeId(body.sourceObjectId)?body.sourceObjectId:null;
      const blockHeight=Number(body.sourceBlockHeight);
      const blockCandidates=Number.isSafeInteger(blockHeight)&&blockHeight>0
        ?catalog.list(100,0,String(blockHeight)).items.filter(x=>x.block?.height===blockHeight).map(x=>x.id):[];
      const hintedIds=[...new Set([...(requestedId?[requestedId]:[]),...blockCandidates])].filter(id=>catalog.has(id));
      const candidates=[...hintedIds,...ids.filter(id=>!hintedIds.includes(id))];
      const matches:string[]=[];let checked=0,unavailable=0;
      let sourceObjectChecked=false,sourceObjectMatched=false,sourceObjectError:string|null=null;
      // A filename is a *hint*, never proof. Reconstruct that specific model if
      // needed, then compare its actual mesh to the uploaded model. The rest of
      // the catalog is scanned only where a local GLB is available.
      for(const id of candidates){
        const hinted=hintedIds.includes(id);
        try {
          const data=hinted?(await getModel(id,decoded.format)).data:await readFile(join(CACHE,`${id}.glb`));
          const candidate=hinted?canonicalGeometry(decodeModel({format:decoded.format,data:data.toString('base64')}).mesh):canonicalGeometry(meshFromGLB(id,data));checked++;
          if(hinted)sourceObjectChecked=true;
          if(candidate.hash===target.hash){matches.push(id);if(hinted)sourceObjectMatched=true;}
        }catch(e){unavailable++;if(hinted)sourceObjectError=e instanceof Error?e.message:String(e);}
      }
      const complete=unavailable===0&&ids.length===catalog.status().indexed;
      return respond(res,200,{identity:target,matches,exactMatch:matches.length>0,identityVerified:false,
        sourceObject:{id:requestedId??blockCandidates[0]??null,blockHeight:Number.isSafeInteger(blockHeight)&&blockHeight>0?blockHeight:null,foundInCatalog:hintedIds.length>0,checked:sourceObjectChecked,matched:sourceObjectMatched,error:sourceObjectError},
        coverage:{checked,unavailable,indexed:ids.length,complete},
        status:matches.length?'exact_match_found':complete?'no_match':'verification_incomplete',
        note:'Matches compare actual mesh geometry, not filenames. Local mesh equality does not authenticate blockchain provenance.'});
    }
    const provMatch=/^\/api\/v1\/objects\/([^/]+)\/provenance$/.exec(url.pathname);
    if(req.method==='GET'&&provMatch){
      const requested=decodeURIComponent(provMatch[1]);if(!safeId(requested))throw new HttpError(400,'Invalid ID');
      const id=catalog.resolveId(requested);
      if(!id)throw new HttpError(404,'Object ID not found in the local catalog. A 32-byte blockchain ID cannot be inferred from a shortened indexer ID.');
      const local=catalog.list(1,0,id).items.find((x:{id:string})=>x.id===id);
      if(!local)throw new HttpError(404,'Object not indexed');
      const miner={name:local.block?.author?.identityDisplay||local.block?.author?.username||null,address:local.block?.author?.id||null,nameSource:'indexed_block_author'};
      const common={indexerId:id,blockchainObjectId:local.blockchainObjectId??null,miner,blockHeight:local.block?.height??null,blockHash:local.block?.hash??null};
      let localHash:string;
      try{localHash=canonicalGeometry(meshFromGLB(id,(await getModel(id,'glb')).data)).hash;}
      catch(e){return respond(res,503,{...common,status:'unavailable',geometryMatchesLiveSource:null,blockHashMatchesIndexedRecord:null,cryptographicallyVerified:false,error:'Local geometry unavailable: '+String(e)});}
      try {
        // Retry transient gateway failures; never report an upstream outage as successful verification.
        let remote:{minedObjectById:(MinedObject & {block?:{height?:number;hash?:string;author?:{id?:string}}})|null}|undefined;
        for(let attempt=0;attempt<3;attempt++){
          try{remote=await gql<{minedObjectById:(MinedObject & {block?:{height?:number;hash?:string;author?:{id?:string}}})|null}>(PROVENANCE_QUERY,{id});break;}
          catch(e){if(attempt===2||!/HTTP 50[0234]|HTTP 429|fetch failed|timeout/i.test(String(e)))throw e;await new Promise(r=>setTimeout(r,400*(attempt+1)));}
        }
        const live=remote?.minedObjectById;
        if(!live)throw Error('Not found in live GraphQL');
        const topo=await gql<{meshTopologies:MeshTopology[]}>(TOPO_QUERY,{id:live.protocol});
        if(!topo.meshTopologies?.[0])throw Error('Missing live topology');
        const liveHash=canonicalGeometry(reconstruct(live,topo.meshTopologies[0])).hash;
        const cross=provenanceResult({id,hash:localHash,liveGeometryHash:liveHash,sourceBlockHash:local.block?.hash,liveBlockHash:live.block?.hash});
        return respond(res,200,{...cross,...common,liveBlockHeight:live.block?.height??null,liveMinerAddress:live.block?.author?.id??null,geometryMatchesLiveSource:liveHash===localHash,blockHashMatchesIndexedRecord:!!live.block?.hash&&live.block.hash===local.block?.hash});
      }catch(e){return respond(res,503,{...provenanceResult({id,hash:localHash,error:String(e)}),...common,geometryMatchesLiveSource:null,blockHashMatchesIndexedRecord:null});}
    }
    if(req.method==='POST'&&['/api/v1/geometry/validate','/api/v1/geometry/identify','/api/v1/geometry/query'].includes(url.pathname)){
      const body=await readJSON(req,1_500_000) as Record<string,unknown>;
      if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'JSON object required');
      const model=body.model??body;
      let decoded:ReturnType<typeof decodeModel>;
      try{decoded=decodeModel(model);}catch(e){throw new HttpError(422,e instanceof Error?e.message:String(e));}
      const inspection=inspectMesh(decoded.mesh);
      if(url.pathname==='/api/v1/geometry/validate')return respond(res,200,{format:decoded.format,bytesSha256:decoded.digest,inspection,identityVerified:false});
      const limit=body.limit??10;
      if(!Number.isSafeInteger(limit)||Number(limit)<1||Number(limit)>50)throw new HttpError(400,'limit must be 1..50');
      const identity=identifyModel(decoded.mesh,catalog.v2Candidates() as ReturnType<typeof extractFeaturesV2>[],catalog.status().indexed,Number(limit));
      if(url.pathname==='/api/v1/geometry/identify')return respond(res,200,{bytesSha256:decoded.digest,...identity});
      return respond(res,200,{version:'0.37.0',operation:'inspect_and_search',format:decoded.format,bytesSha256:decoded.digest,inspection,identity});
    }
    if(req.method==='POST'&&url.pathname==='/api/v1/geometry/batch-compare'){
      const body=await readJSON(req) as {pairs?:unknown};
      if(!body||!Array.isArray(body.pairs)||body.pairs.length<1||body.pairs.length>20)throw new HttpError(400,'pairs must be an array of 1..20 pairs');
      const results=[];
      for(const pair of body.pairs){
        if(!Array.isArray(pair)||pair.length!==2||!pair.every(x=>typeof x==='string'&&safeId(x)))throw new HttpError(400,'Invalid pair');
        const [id1,id2]=pair as [string,string];
        if(!catalog.has(id1)||!catalog.has(id2)){results.push({id1,id2,status:'not_indexed'});continue;}
        try{const a=await limitedFeature(id1),b=await limitedFeature(id2);results.push({id1,id2,status:'ok',comparison:compareFeatures(a,b)});}
        catch(e){results.push({id1,id2,status:'error',message:String(e)});}
      }
      return respond(res,200,{results});
    }
    if(req.method==='POST'&&url.pathname==='/api/v1/search/by-model/v2'){
      const body=await readJSON(req,1_400_000) as {format?:unknown;data?:unknown;limit?:unknown};
      if(!body||typeof body.format!=='string'||typeof body.data!=='string')throw new HttpError(400,'format and base64 data required');
      const limit=body.limit??10;if(!Number.isSafeInteger(limit)||Number(limit)<1||Number(limit)>50)throw new HttpError(400,'Invalid limit');
      if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data))throw new HttpError(400,'Invalid base64 model data');let mesh;try{mesh=parseUploadedModel(body.format,Buffer.from(body.data,'base64'));}catch(e){throw new HttpError(422,String(e));}
      const input=extractFeaturesV2(mesh);
      const candidates=catalog.v2Candidates() as ReturnType<typeof extractFeaturesV2>[];
      const results=candidates.map(candidate=>({id:candidate.id,...compareV2(input,candidate)}));
      results.sort((a,b)=>a.distance-b.distance);
      const indexed=catalog.status().indexed;
      return respond(res,200,{algorithm:'geometry-v2',inputFeatures:input,compared:results.length,indexed,coverage:results.length>=indexed?'complete_for_local_catalog':'partial_v2_index',results:results.slice(0,Number(limit))});
    }
    if(req.method==='POST'&&url.pathname==='/api/v1/search/by-model'){
      const body=await readJSON(req) as {obj?:unknown;limit?:unknown};
      if(!body||typeof body.obj!=='string'||Buffer.byteLength(body.obj,'utf8')>16384)throw new HttpError(400,'obj must be an OBJ string up to 16 KB');
      const limit=body.limit??10;if(!Number.isSafeInteger(limit)||Number(limit)<1||Number(limit)>50)throw new HttpError(400,'limit must be 1..50');
      let mesh;try{mesh=parseOBJ(body.obj)}catch(e){throw new HttpError(422,String(e))}
      const candidates=catalog.featureCandidates(ANALYSIS_ALGORITHM,'__external_query__') as Features[];
      const ranked=rankSimilar(mesh,candidates,Number(limit));
      return respond(res,200,{algorithm:ANALYSIS_ALGORITHM,coverage:'partial_cached_features_only',...ranked});
    }
    if(req.method==='POST'&&url.pathname==='/api/v1/search/by-features'){
      const body=await readJSON(req) as {filters?:unknown;limit?:unknown;offset?:unknown};
      if(!body||!body.filters||typeof body.filters!=='object'||Array.isArray(body.filters))throw new HttpError(400,'filters object required');
      const limit=body.limit??24,offset=body.offset??0;
      if(!Number.isSafeInteger(limit)||Number(limit)<1||Number(limit)>100||!Number.isSafeInteger(offset)||Number(offset)<0||Number(offset)>1000000)throw new HttpError(400,'Invalid pagination');
      const filter=validatedFilter(body.filters as Record<string,unknown>);
      const candidates=catalog.featureCandidates(ANALYSIS_ALGORITHM,'__external_query__') as Features[];
      const matches=candidates.filter(f=>matchFeature(f,filter));
      return respond(res,200,{algorithm:ANALYSIS_ALGORITHM,coverage:'partial_cached_features_only',analyzedCandidates:candidates.length,total:matches.length,limit,offset,results:matches.slice(Number(offset),Number(offset)+Number(limit)).map(f=>({id:f.id,vertexCount:f.vertexCount,faceCount:f.faceCount,watertight:f.watertight,sphericity:f.sphericity,axisRatios:f.axisRatios}))});
    }
    if(req.method==='POST'&&url.pathname==='/api/v1/analysis/prepare'){
      const body=await readJSON(req) as {ids?:unknown};if(!body||!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>25||!body.ids.every(x=>typeof x==='string'&&safeId(x)))throw new HttpError(400,'ids must contain 1-25 valid IDs');
      const results=[];for(const id of body.ids as string[]){if(!catalog.has(id)){results.push({id,status:'error',message:'Not indexed'});continue}try{await limitedFeature(id);results.push({id,status:'ok'})}catch(e){results.push({id,status:'error',message:String(e)})}}
      return respond(res,200,{results});
    }
    if(req.method==='GET'&&url.pathname==='/api/v1/compare'){
      const id1=url.searchParams.get('id1')??'',id2=url.searchParams.get('id2')??'';if(!safeId(id1)||!safeId(id2))throw new HttpError(400,'Valid id1 and id2 are required');if(!catalog.has(id1)||!catalog.has(id2))throw new HttpError(404,'Object not in local catalog');const a=await limitedFeature(id1),b=await limitedFeature(id2);return respond(res,200,compareFeatures(a,b));
    }
    if(req.method==='GET'&&url.pathname==='/api/v1/metrics'){if(process.env.NUMEN_METRICS_TOKEN&&req.headers.authorization!==`Bearer ${process.env.NUMEN_METRICS_TOKEN}`)throw new HttpError(401,'Unauthorized');if(!process.env.NUMEN_METRICS_TOKEN&&req.socket.remoteAddress!=='127.0.0.1'&&req.socket.remoteAddress!=='::1'&&req.socket.remoteAddress!=='::ffff:127.0.0.1')throw new HttpError(403,'Metrics are localhost-only without NUMEN_METRICS_TOKEN');return respond(res,200,metrics.snapshot());}
    if(req.method==='GET'&&url.pathname==='/api/v1/analysis/v2/status')return respond(res,200,{algorithm:'geometry-v2',analyzed:catalog.v2Count(),indexed:catalog.status().indexed,queued:Math.max(0,catalog.status().indexed-catalog.v2Count()),enabled:v2Enabled,background:{...v2Progress,active:v2InFlight.size},concurrency:v2Concurrency,intervalMs:v2Interval,failures:catalog.v2FailureStatus(),coveragePercent:catalog.status().indexed?Number((100*catalog.v2Count()/catalog.status().indexed).toFixed(2)):100});
    if(req.method==='GET'&&url.pathname==='/api/v1/analysis/status')return respond(res,200,{algorithm:ANALYSIS_ALGORITHM,analyzed:catalog.featureCount(ANALYSIS_ALGORITHM),indexed:catalog.status().indexed,background:analysisProgress,autoAnalysisEnabled:process.env.NUMEN_DISABLE_ANALYSIS!=='1',concurrency:featureQueue.max,intervalMs:analysisInterval,queued:Math.max(0,catalog.status().indexed-catalog.featureCount(ANALYSIS_ALGORITHM)),retrying:analysisRetryAfter.size});
    if(req.method==='GET'&&url.pathname==='/registry/status') return respond(res,200,{available:true,source:'local_admin_import',registered:registry.list(1,0).total,chainIndexerConnected:false,verified:false,message:'Registry records require external ingestion and independent chain verification.'});
    if(req.method==='GET'&&url.pathname==='/health') return respond(res,200,{status:'ok',graphql:GRAPHQL_URL,indexer:catalog.status()});
    if(req.method==='GET'&&url.pathname==='/api/v1/indexer/status') return respond(res,200,catalog.status());
    if(req.method==='GET'&&url.pathname==='/docs') return respond(res,200,{
      title:'Numen Geometry Reconstruction API',version:'0.37.0',endpoints:['GET /health','GET /api/v1/mined?limit=24&offset=0&q=miner','GET /api/v1/indexer/status','GET /openapi.json','GET /llms.txt','GET /registry/status','GET /objects/{id}',
        'GET /api/v1/analysis/v2/status','POST /api/v1/search/by-model/v2','POST /api/v1/objects/batch','GET /api/v1/objects/{id}/features','GET /api/v1/objects/{id}/similar?limit=10','GET /api/v1/compare?id1=...&id2=...','GET /objects/{id}/model?format=glb|obj|stl','POST /batch {"ids":["..."],"format":"glb"}']});
    const match=/^\/objects\/([^/]+)(\/model)?$/.exec(url.pathname);
    if(req.method==='GET'&&match) {
      const id=decodeURIComponent(match[1]); const fmt=match[2]?(url.searchParams.get('format')??'glb'):'glb';
      const {data,info}=await getModel(id,fmt);
      if(!match[2]) return respond(res,200,info);
      res.writeHead(200,{'content-type':MIME[fmt as ModelFormat], 'content-length':data.length,
        'content-disposition':`attachment; filename="${id}.${fmt}"`}); res.end(data); return;
    }
    if(req.method==='POST'&&url.pathname==='/batch') {
      const body=await readJSON(req) as {ids?:unknown;format?:unknown};
      if(!body||!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>25||
        !body.ids.every(id=>typeof id==='string'&&safeId(id))) throw new HttpError(400,'ids must contain 1-25 valid IDs');
      const fmt=body.format??'glb'; if(typeof fmt!=='string'||!FORMATS.includes(fmt as ModelFormat)) throw new HttpError(400,'Unsupported format');
      const results=[];
      for(const id of body.ids as string[]) {
        try {const {info}=await getModel(id,fmt); results.push({id,status:'ok',path:`${id}.${fmt}`,info});}
        catch(e){results.push({id,status:'error',message:e instanceof Error?e.message:String(e)});}
      }
      return respond(res,200,{results});
    }
    respond(res,404,{error:'Not found'});
  } catch(e) {respond(res,e instanceof HttpError?e.status:500,{error:e instanceof Error?e.message:String(e)});}
});
server.listen(PORT,HOST,()=>{console.log(`Numen Geometry Intelligence API listening at http://${HOST}:${PORT}`);if(process.env.NUMEN_DISABLE_INDEXER!=='1')indexer.start();if(process.env.NUMEN_DISABLE_ANALYSIS!=='1')analysisTimer=setTimeout(backgroundAnalyze,10000);if(v2Enabled)setTimeout(backgroundV2,15000);});
process.on('SIGINT',()=>{stopping=true;if(analysisTimer)clearTimeout(analysisTimer);indexer.stop();server.close(()=>{catalog.close();process.exit(0);});});
