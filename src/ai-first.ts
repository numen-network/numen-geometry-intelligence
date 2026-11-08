import {createHash} from 'node:crypto';
import {parseUploadedModel} from './formats.ts';
import {extractFeaturesV2,compareV2} from './geometry-v2.ts';
import type {Mesh} from './geometry.ts';

type Descriptor=ReturnType<typeof extractFeaturesV2>;
export function decodeModel(input:unknown):{mesh:Mesh;digest:string;format:string}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected model object');
 const {format,data}=input as Record<string,unknown>;
 if(typeof format!=='string'||!['obj','stl','glb'].includes(format))throw Error('format must be obj, stl or glb');
 if(typeof data!=='string'||!data.length||data.length>1_400_000||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))throw Error('Invalid base64 model data');
 const bytes=Buffer.from(data,'base64');if(bytes.length>1_000_000)throw Error('Model exceeds 1 MB limit');
 return {mesh:parseUploadedModel(format,bytes),digest:createHash('sha256').update(bytes).digest('hex'),format};
}
export function inspectMesh(mesh:Mesh){
 const f=extractFeaturesV2(mesh);const counts=new Map<string,number>();let degenerate=0;
 const v=mesh.vertices,faces=mesh.faces;
 for(let i=0;i<faces.length;i+=3){const a=faces[i],b=faces[i+1],c=faces[i+2];
  const u=[v[3*b]-v[3*a],v[3*b+1]-v[3*a+1],v[3*b+2]-v[3*a+2]];
  const w=[v[3*c]-v[3*a],v[3*c+1]-v[3*a+1],v[3*c+2]-v[3*a+2]];
  const cross=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
  if(a===b||b===c||a===c||Math.hypot(...cross)<1e-12)degenerate++;
  for(const [x,y] of [[a,b],[b,c],[c,a]]){const k=`${Math.min(x,y)}:${Math.max(x,y)}`;counts.set(k,(counts.get(k)??0)+1);}
 }
 const boundaryEdges=[...counts.values()].filter(n=>n===1).length;
 const nonManifoldEdges=[...counts.values()].filter(n=>n>2).length;
 return {algorithm:'mesh-quality-v1',vertexCount:f.vertexCount,faceCount:f.faceCount,surfaceArea:f.surfaceArea,volume:f.volume,watertight:f.watertight,boundaryEdges,nonManifoldEdges,degenerateFaces:degenerate,axisRatios:f.axisRatios,sphericity:f.sphericity,bounds:f.bounds,quality:degenerate===0&&boundaryEdges===0&&nonManifoldEdges===0?'closed_edge_manifold_candidate':'needs_review',caveat:'Edge-manifold checks do not prove absence of self-intersections or consistent winding.'};
}
export function searchDescriptors(query:Descriptor,candidates:Descriptor[],limit:number){
 return candidates.map(c=>({id:c.id,...compareV2(query,c)})).sort((a,b)=>a.distance-b.distance).slice(0,limit);
}
export function identifyModel(mesh:Mesh,candidates:Descriptor[],indexed:number,limit=10){
 const query=extractFeaturesV2(mesh),matches=searchDescriptors(query,candidates,limit);
 return {status:matches.length?'similar_match':'no_match',identityVerified:false,algorithm:'geometry-v2',coverage:candidates.length>=indexed?'complete_for_local_catalog':'partial_v2_index',compared:candidates.length,indexed,matches,note:'Similarity is NOT an identity proof. Exact geometry identity and blockchain provenance verification require canonical hashing and an authenticated registry source.'};
}
