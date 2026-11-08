import type {Mesh} from './geometry.ts';
import {extractFeatures,compareFeatures,type Features} from './analysis.ts';

// Strict bounded OBJ input; triangulated faces only. No external resources or disk writes.
export function parseOBJ(source:string):Mesh {
 const verts:number[]=[];const faces:number[]=[];
 for(const line of source.split(/\r?\n/)){
  const s=line.trim();if(!s||s.startsWith('#'))continue;
  const parts=s.split(/\s+/);
  if(parts[0]==='v'){
   if(parts.length!==4||verts.length>=65536*3)throw Error('Invalid or oversized OBJ vertices');
   const xyz=parts.slice(1).map(Number);if(xyz.some(n=>!Number.isFinite(n)||Math.abs(n)>1e9))throw Error('Invalid vertex coordinates');verts.push(...xyz);
  }else if(parts[0]==='f'){
   if(parts.length!==4||faces.length>=3000000)throw Error('Only triangulated OBJ faces are supported');
   for(const token of parts.slice(1)){
    if(!/^[1-9]\d*(?:\/[^\s]*)?$/.test(token))throw Error('Invalid face index');
    const idx=Number(token.split('/')[0])-1;
    if(!Number.isSafeInteger(idx)||idx>=65536)throw Error('Invalid face index');faces.push(idx);
   }
  }
 }
 if(verts.length<9||faces.length<3||faces.some(i=>i>=verts.length/3))throw Error('OBJ has missing or invalid geometry');
 return {id:'uploaded',protocol:'uploaded-obj',vertexCount:verts.length/3,faceCount:faces.length/3,vertices:Float64Array.from(verts),faces:Uint16Array.from(faces)};
}
export type Filter={minVertices?:number;maxVertices?:number;minFaces?:number;maxFaces?:number;minSphericity?:number;maxSphericity?:number;watertight?:boolean;minAxisRatio?:number;maxAxisRatio?:number};
export function matchFeature(f:Features,filter:Filter):boolean{
 return (filter.minVertices===undefined||f.vertexCount>=filter.minVertices)&&(filter.maxVertices===undefined||f.vertexCount<=filter.maxVertices)&&
 (filter.minFaces===undefined||f.faceCount>=filter.minFaces)&&(filter.maxFaces===undefined||f.faceCount<=filter.maxFaces)&&
 (filter.watertight===undefined||f.watertight===filter.watertight)&&
 (filter.minSphericity===undefined||(f.sphericity!==null&&f.sphericity>=filter.minSphericity))&&
 (filter.maxSphericity===undefined||(f.sphericity!==null&&f.sphericity<=filter.maxSphericity))&&
 (filter.minAxisRatio===undefined&&filter.maxAxisRatio===undefined||f.axisRatios.some(x=>(filter.minAxisRatio===undefined||x>=filter.minAxisRatio)&&(filter.maxAxisRatio===undefined||x<=filter.maxAxisRatio)));
}
export function rankSimilar(mesh:Mesh,candidates:Features[],limit:number){const input=extractFeatures(mesh);return {inputFeatures:input,compared:candidates.length,results:candidates.map(f=>{const c=compareFeatures(input,f);return {id:f.id,distance:c.distance,similarityScore:c.similarityScore}}).sort((a,b)=>a.distance-b.distance).slice(0,limit)};}
