import type {Mesh} from './geometry.ts';
import {parseOBJ} from './ai-search.ts';
import {meshFromGLB} from './analysis.ts';
const MAX_VERTICES=65535,MAX_TRIANGLES=100000;
function mesh(id:string,vertices:number[],faces:number[],protocol:string):Mesh{
 if(vertices.length<9||vertices.length%3||faces.length<3||faces.length%3||vertices.length/3>MAX_VERTICES||faces.length/3>MAX_TRIANGLES)throw Error('Invalid or oversized geometry');
 if(vertices.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9)||faces.some(i=>!Number.isSafeInteger(i)||i<0||i>=vertices.length/3))throw Error('Invalid geometry coordinates or indices');
 return {id,protocol,vertexCount:vertices.length/3,faceCount:faces.length/3,vertices:Float64Array.from(vertices),faces:Uint16Array.from(faces)};
}
export function parseSTL(data:Buffer):Mesh{
 // Binary STL is identified by its exact declared record count, not its 80-byte header.
 if(data.length>=84){const count=data.readUInt32LE(80);if(count>0&&count<=MAX_TRIANGLES&&84+count*50===data.length){const v:number[]=[],f:number[]=[];for(let i=0;i<count;i++){const off=84+i*50;for(let j=0;j<3;j++){for(let k=0;k<3;k++)v.push(data.readFloatLE(off+12+j*12+k*4));f.push(i*3+j);}}return mesh('uploaded',v,f,'uploaded-stl');}}
 const text=data.toString('utf8');if(!/^\s*solid(?:\s|$)/i.test(text))throw Error('Invalid STL');
 const v:number[]=[],f:number[]=[];const lines=text.split(/\r?\n/);for(const line of lines){const m=/^\s*vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s*$/i.exec(line);if(m){v.push(Number(m[1]),Number(m[2]),Number(m[3]));f.push(v.length/3-1);if(f.length>MAX_TRIANGLES*3)throw Error('STL too large');}}
 return mesh('uploaded',v,f,'uploaded-stl');
}
export function parseGLB(data:Buffer):Mesh{
 if(data.length<28||data.readUInt32LE(0)!==0x46546c67||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length)throw Error('Invalid GLB header');
 const jsonLength=data.readUInt32LE(12);if(jsonLength>data.length-28||data.toString('ascii',16,20)!=='JSON')throw Error('Invalid GLB JSON chunk');
 let doc:any;try{doc=JSON.parse(data.toString('utf8',20,20+jsonLength))}catch{throw Error('Invalid GLB JSON')}
 const binHeader=20+jsonLength;if(binHeader+8>data.length||data.toString('ascii',binHeader+4,binHeader+8)!=='BIN\0')throw Error('Missing GLB binary chunk');
 const binLength=data.readUInt32LE(binHeader),binStart=binHeader+8;if(binStart+binLength>data.length)throw Error('Invalid GLB binary length');
 const primitive=doc.meshes?.[0]?.primitives?.[0];if(!primitive||primitive.mode!==undefined&&primitive.mode!==4||primitive.attributes?.POSITION===undefined||primitive.indices===undefined)throw Error('Only indexed triangular GLB meshes are supported');
 const pos=doc.accessors?.[primitive.attributes.POSITION],idx=doc.accessors?.[primitive.indices];if(!pos||!idx||pos.type!=='VEC3'||pos.componentType!==5126||idx.type!=='SCALAR'||![5123,5125].includes(idx.componentType)||pos.count>MAX_VERTICES||idx.count>MAX_TRIANGLES*3)throw Error('Unsupported GLB accessors');
 const read=(a:any,unit:number)=>{const view=doc.bufferViews?.[a.bufferView];if(!view||view.buffer!==0||view.byteStride&&view.byteStride!==unit)throw Error('Unsupported GLB buffer view');const start=binStart+(view.byteOffset||0)+(a.byteOffset||0),end=start+a.count*unit;if(start<binStart||end>binStart+binLength||end>binStart+(view.byteOffset||0)+view.byteLength)throw Error('GLB accessor out of bounds');return start;};
 const po=read(pos,12),stride=idx.componentType===5123?2:4,io=read(idx,stride),v:number[]=[],f:number[]=[];for(let i=0;i<pos.count*3;i++)v.push(data.readFloatLE(po+i*4));for(let i=0;i<idx.count;i++)f.push(stride===2?data.readUInt16LE(io+i*2):data.readUInt32LE(io+i*4));return mesh('uploaded',v,f,'uploaded-glb');
}
export function parseUploadedModel(format:string,buffer:Buffer):Mesh{
 if(format==='obj')return parseOBJ(buffer.toString('utf8'));
 if(format==='stl')return parseSTL(buffer);
 if(format==='glb')return parseGLB(buffer);
 throw Error('Supported formats: obj, stl, glb');
}
