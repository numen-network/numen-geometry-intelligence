import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { handleMcp } from '../src/mcp.ts';
import { openApiSpec } from '../src/api-docs.ts';

test('MCP initialize, tool discovery, validation and health proxy',async()=>{
 const upstream=createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({path:req.url}));});
 await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));
 const port=(upstream.address() as {port:number}).port;
 const server=createServer((req,res)=>handleMcp(req,res,`http://127.0.0.1:${port}`,`https://api.example.org`));
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const endpoint=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const call=async(id:number,method:string,params?:unknown)=>{const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});return r.json() as Promise<any>;};
 try{
  assert.equal((await call(1,'initialize')).result.serverInfo.version,'0.32.0');
  assert.equal((await call(2,'tools/list')).result.tools.length,17);
  const result=await call(3,'tools/call',{name:'search_objects',arguments:{limit:5,q:'test'}});
  assert.match(result.result.content[0].text,/limit=5/);
  const bad=await call(4,'tools/call',{name:'get_object',arguments:{id:'../bad'}});
  assert.equal(bad.result.isError,true);
  const link=await call(5,'tools/call',{name:'get_model_link',arguments:{id:'abc'}});
  assert.match(link.result.content[0].text,/https:\/\/api.example.org/);
 }finally{server.close();upstream.close();}
});
test('OpenAPI version is 3.1',()=>assert.equal(openApiSpec().openapi,'3.1.0'));
