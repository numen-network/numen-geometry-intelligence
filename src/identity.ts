/** Exact geometry identity v1: coordinate-bit exact, invariant to vertex/face ordering and triangle winding. */
import {createHash} from 'node:crypto';
import type {Mesh} from './geometry.ts';
export const IDENTITY_ALGORITHM='numen-mesh-exact-v1';
function hex64(n:number){if(!Number.isFinite(n))throw Error('Non-finite coordinate');const b=Buffer.allocUnsafe(8);b.writeDoubleBE(Object.is(n,-0)?0:n);return b.toString('hex');}
export function canonicalGeometry(mesh:Mesh){
 const v=mesh.vertices,f=mesh.faces;
 if(v.length%3||f.length%3||v.length/3!==mesh.vertexCount||f.length/3!==mesh.faceCount)throw Error('Invalid mesh shape');
 if(mesh.vertexCount>65536||mesh.faceCount>1_000_000)throw Error('Mesh too large');
 const keys:string[]=[];for(let i=0;i<v.length;i+=3)keys.push([hex64(v[i]),hex64(v[i+1]),hex64(v[i+2])].join(''));
 const triangles:string[]=[];
 for(let i=0;i<f.length;i+=3){const a=f[i],b=f[i+1],c=f[i+2];if(a>=keys.length||b>=keys.length||c>=keys.length)throw Error('Face index out of bounds');triangles.push([keys[a],keys[b],keys[c]].sort().join(':'));}
 triangles.sort();
 const digest=createHash('sha256');digest.update(IDENTITY_ALGORITHM+'\n');digest.update(String(mesh.vertexCount)+'/'+String(mesh.faceCount)+'\n');for(const t of triangles)digest.update(t+'\n');
 return {algorithm:IDENTITY_ALGORITHM,hash:digest.digest('hex'),vertexCount:mesh.vertexCount,faceCount:mesh.faceCount,guarantees:'Exact IEEE-754 coordinate values and triangle multisets; invariant to vertex ordering, triangle ordering and winding; NOT invariant to rotations, translations, scale or rounding.'};
}
export function provenanceResult(args:{id:string;hash:string;sourceBlockHash?:string;liveBlockHash?:string;liveGeometryHash?:string;error?:string}){
 const sameGeometry=!!args.liveGeometryHash&&args.liveGeometryHash===args.hash;
 const sameBlock=!!args.sourceBlockHash&&!!args.liveBlockHash&&args.sourceBlockHash===args.liveBlockHash;
 return {objectId:args.id,canonicalHash:args.hash,geometryMatchesLiveSource:sameGeometry,blockHashMatchesIndexedRecord:sameBlock,source:'numen-graphql-indexer',sourceCrossChecked:sameGeometry&&sameBlock,cryptographicallyVerified:false,status:args.error?'unavailable':sameGeometry&&sameBlock?'indexer_cross_checked':'unverified',warning:'GraphQL is an indexer, not an independently authenticated consensus proof. This result does not cryptographically verify Numen finality or PoScan spectral3d.',error:args.error??null};
}
