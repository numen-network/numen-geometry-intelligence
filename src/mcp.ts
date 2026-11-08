/** Stateless MCP Streamable HTTP (JSON response mode), protocol 2025-03-26. */
import type { IncomingMessage, ServerResponse } from 'node:http';

export const tools = [
 {name:'hash_geometry',description:'Compute deterministic exact geometry hash for uploaded OBJ/STL/GLB; no blockchain proof.',inputSchema:{type:'object',properties:{format:{type:'string',enum:['obj','stl','glb']},data:{type:'string'}},required:['format','data'],additionalProperties:false}},
 {name:'exact_match_geometry',description:'Find exact geometry matches among locally cached GLB files, with coverage reported.',inputSchema:{type:'object',properties:{format:{type:'string',enum:['obj','stl','glb']},data:{type:'string'}},required:['format','data'],additionalProperties:false}},
 {name:'get_provenance',description:'Cross-check indexed geometry against live GraphQL source; NOT a cryptographic chain proof.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}},
 {name:'inspect_geometry',description:'Validate a base64 OBJ/STL/GLB mesh; returns mesh quality metrics without storing uploads.',inputSchema:{type:'object',properties:{format:{type:'string',enum:['obj','stl','glb']},data:{type:'string'}},required:['format','data'],additionalProperties:false}},
 {name:'identify_geometry',description:'Find geometrically similar mined models; results are NOT verified identities. Index coverage may be partial.',inputSchema:{type:'object',properties:{format:{type:'string',enum:['obj','stl','glb']},data:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},required:['format','data'],additionalProperties:false}},
 {name:'query_geometry',description:'Combined mesh inspection and similarity search for AI agents. No blockchain write or wallet required.',inputSchema:{type:'object',properties:{format:{type:'string',enum:['obj','stl','glb']},data:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},required:['format','data'],additionalProperties:false}},
 {name:'batch_compare',description:'Compare up to 20 pairs of indexed object IDs.',inputSchema:{type:'object',properties:{pairs:{type:'array',minItems:1,maxItems:20,items:{type:'array',minItems:2,maxItems:2,items:{type:'string'}}}},required:['pairs'],additionalProperties:false}},
 {name:'search_objects',description:'Search locally indexed PoScan mined 3D objects by ID, block height, miner name or address. Index may be incomplete.',inputSchema:{type:'object',properties:{q:{type:'string',maxLength:150},limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'get_object',description:'Get reconstructed 3D mesh metadata for an indexed mined object.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}},
 {name:'get_features',description:'Compute deterministic geometric feature descriptors for an indexed object.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}},
 {name:'find_similar',description:'Find similar geometry among analyzed local objects. Coverage may be partial.',inputSchema:{type:'object',properties:{id:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},required:['id'],additionalProperties:false}},
 {name:'compare_objects',description:'Compare two indexed 3D objects using geometric descriptors.',inputSchema:{type:'object',properties:{id1:{type:'string'},id2:{type:'string'}},required:['id1','id2'],additionalProperties:false}},
 {name:'get_v2_analysis_status',description:'Get persisted geometry-v2 index coverage and background progress.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_batch',description:'Get up to 25 indexed objects with optional cached features.',inputSchema:{type:'object',properties:{ids:{type:'array',items:{type:'string'},minItems:1,maxItems:25},includeFeatures:{type:'boolean'}},required:['ids'],additionalProperties:false}},
 {name:'get_index_status',description:'Inspect whether the local PoScan catalog is fully indexed.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_analysis_status',description:'Inspect cached geometry analysis coverage.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_model_link',description:'Get an HTTP download URL for a 3D model (GLB, OBJ or STL); does not embed binary data.',inputSchema:{type:'object',properties:{id:{type:'string'},format:{type:'string',enum:['glb','obj','stl']}},required:['id'],additionalProperties:false}}
] as const;
const idPattern=/^[a-zA-Z0-9_-]{1,150}$/;
const integer=(v:unknown,def:number,min:number,max:number)=>{const n=v===undefined?def:v;if(typeof n!=='number'||!Number.isSafeInteger(n)||n<min||n>max)throw Error(`Expected integer ${min}..${max}`);return n;};
const ident=(v:unknown)=>{if(typeof v!=='string'||!idPattern.test(v))throw Error('Invalid object ID');return v;};
function route(name:string,a:Record<string,unknown>){
 const q=(v:string)=>encodeURIComponent(v);
 switch(name){
 case 'search_objects': {if(a.q!==undefined&&(typeof a.q!=='string'||a.q.length>150))throw Error('Invalid search query');const s=new URLSearchParams({limit:String(integer(a.limit,24,1,100)),offset:String(integer(a.offset,0,0,100000000)),q:String(a.q??'')});return `/api/v1/mined?${s}`;}
 case 'get_object':return `/objects/${q(ident(a.id))}`;
 case 'get_features':return `/api/v1/objects/${q(ident(a.id))}/features`;
 case 'find_similar':return `/api/v1/objects/${q(ident(a.id))}/similar?limit=${integer(a.limit,10,1,50)}`;
 case 'compare_objects':return `/api/v1/compare?id1=${q(ident(a.id1))}&id2=${q(ident(a.id2))}`;
 case 'get_provenance':return `/api/v1/objects/${q(ident(a.id))}/provenance`;
 case 'get_v2_analysis_status':return '/api/v1/analysis/v2/status';
 case 'get_index_status':return '/api/v1/indexer/status';
 case 'get_analysis_status':return '/api/v1/analysis/status';
 default:throw Error('Unknown tool');
 }
}
const rpcError=(id:unknown,code:number,message:string)=>({jsonrpc:'2.0',id:id??null,error:{code,message}});
const rpcResult=(id:unknown,result:unknown)=>({jsonrpc:'2.0',id,result});
export async function handleMcp(req:IncomingMessage,res:ServerResponse,baseUrl:string,publicUrl:string){
 const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'content-type,mcp-protocol-version,mcp-session-id','access-control-allow-methods':'POST,OPTIONS'};
 const send=(status:number,data:unknown)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
 if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
 if(req.method!=='POST'){send(405,{error:'Use POST for MCP JSON-RPC requests'});return;}
 let size=0;const chunks:Buffer[]=[];
 try{
  for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>32768){send(413,rpcError(null,-32600,'Request too large'));return;}chunks.push(b);}
  const message:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!message||typeof message!=='object'||Array.isArray(message))throw Error('Expected a JSON-RPC object');
  const m=message as Record<string,unknown>;
  if(m.jsonrpc!=='2.0'||typeof m.method!=='string'){send(400,rpcError(m.id,-32600,'Invalid JSON-RPC request'));return;}
  if(!('id' in m)){res.writeHead(202,headers);res.end();return;}
  if(typeof m.id!=='string'&&typeof m.id!=='number'){send(400,rpcError(null,-32600,'Invalid request ID'));return;}
  if(m.method==='initialize'){send(200,rpcResult(m.id,{protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'numen-geometry',version:'0.32.0'},instructions:'Read-only Numen PoScan geometry. Local index and analyzed feature coverage may be incomplete. No wallet, token or gas needed.'}));return;}
  if(m.method==='ping'){send(200,rpcResult(m.id,{}));return;}
  if(m.method==='tools/list'){send(200,rpcResult(m.id,{tools}));return;}
  if(m.method==='tools/call'){
   const p=m.params;if(!p||typeof p!=='object'||Array.isArray(p)){send(200,rpcError(m.id,-32602,'Invalid params'));return;}
   const {name,arguments:args={}}=p as {name:unknown;arguments?:unknown};
   if(typeof name!=='string'||!tools.some(t=>t.name===name)){send(200,rpcError(m.id,-32602,'Unknown tool'));return;}
   if(!args||typeof args!=='object'||Array.isArray(args)){send(200,rpcError(m.id,-32602,'Arguments must be an object'));return;}
   try{
    const a=args as Record<string,unknown>;
    if(name==='get_model_link'){
     const id=ident(a.id),fmt=a.format??'glb';if(!['glb','obj','stl'].includes(String(fmt)))throw Error('Invalid model format');
     const link=`${publicUrl.replace(/\/$/,'')}/objects/${encodeURIComponent(id)}/model?format=${fmt}`;
     send(200,rpcResult(m.id,{content:[{type:'text',text:JSON.stringify({id,format:fmt,url:link,note:'Model URL; availability not verified until fetched'})}]}));return;
    }
    let path:string;let options:RequestInit={signal:AbortSignal.timeout(30000)};
    if(['inspect_geometry','identify_geometry','query_geometry','hash_geometry','exact_match_geometry'].includes(name)){
     if(typeof a.format!=='string'||!['obj','stl','glb'].includes(a.format)||typeof a.data!=='string'||a.data.length>1400000)throw Error('Invalid model');
     if(a.limit!==undefined)integer(a.limit,10,1,50);
     path=name==='inspect_geometry'?'/api/v1/geometry/validate':name==='identify_geometry'?'/api/v1/geometry/identify':name==='hash_geometry'?'/api/v1/geometry/hash':name==='exact_match_geometry'?'/api/v1/geometry/exact-match':'/api/v1/geometry/query';
     options={...options,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({format:a.format,data:a.data,limit:a.limit})};
    }else if(name==='batch_compare'){
     if(!Array.isArray(a.pairs)||a.pairs.length<1||a.pairs.length>20||!a.pairs.every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>typeof x==='string'&&idPattern.test(x))))throw Error('Invalid pairs');
     path='/api/v1/geometry/batch-compare';options={...options,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pairs:a.pairs})};
    }else if(name==='get_batch'){
     if(!Array.isArray(a.ids)||a.ids.length<1||a.ids.length>25||!a.ids.every(x=>typeof x==='string'&&idPattern.test(x)))throw Error('Invalid batch IDs');
     path='/api/v1/objects/batch';options={...options,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:a.ids,includeFeatures:a.includeFeatures===true})};
    }else path=route(name,a);
    const response=await fetch(new URL(path,baseUrl),options);
    const data=await response.text();
    send(200,rpcResult(m.id,{content:[{type:'text',text:data.slice(0,250000)}],isError:!response.ok}));return;
   }catch(e){send(200,rpcResult(m.id,{content:[{type:'text',text:e instanceof Error?e.message:String(e)}],isError:true}));return;}
  }
  send(200,rpcError(m.id,-32601,'Method not found'));
 }catch{send(400,rpcError(null,-32700,'Invalid JSON'));}
}
