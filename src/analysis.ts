import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Mesh } from './geometry.ts';

export type Features = {id:string;algorithm:string;vertexCount:number;faceCount:number;surfaceArea:number;volume:number|null;watertight:boolean;bounds:{min:number[];max:number[];dimensions:number[]};centroid:number[];axisRatios:number[];sphericity:number|null;radialHistogram:number[];radialMoments:number[];descriptor:number[]};
const VERSION='radial-v1';
const norm=(x:number,y:number,z:number)=>Math.hypot(x,y,z);
export function extractFeatures(mesh:Mesh):Features {
 const v=mesh.vertices,f=mesh.faces,n=mesh.vertexCount,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],center=[0,0,0];
 for(let i=0;i<v.length;i+=3){for(let j=0;j<3;j++){center[j]+=v[i+j];lo[j]=Math.min(lo[j],v[i+j]);hi[j]=Math.max(hi[j],v[i+j]);}}for(let j=0;j<3;j++)center[j]/=n;
 const dims=lo.map((x,j)=>hi[j]-x),sorted=[...dims].sort((a,b)=>b-a),ratios=[sorted[1]/(sorted[0]||1),sorted[2]/(sorted[0]||1)];
 let area=0,signedVolume=0;const edges=new Map<string,number>();
 for(let i=0;i<f.length;i+=3){const a=f[i],b=f[i+1],c=f[i+2];const ax=v[3*a],ay=v[3*a+1],az=v[3*a+2],bx=v[3*b],by=v[3*b+1],bz=v[3*b+2],cx=v[3*c],cy=v[3*c+1],cz=v[3*c+2];const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;area+=norm(nx,ny,nz)/2;signedVolume+=(ax*nx+ay*ny+az*nz)/6;for(const [p,q] of [[a,b],[b,c],[c,a]]){const k=`${Math.min(p,q)}:${Math.max(p,q)}`;edges.set(k,(edges.get(k)||0)+1)}}
 const watertight=[...edges.values()].every(x=>x===2),volume=watertight?Math.abs(signedVolume):null;
 const radii=[];for(let i=0;i<v.length;i+=3)radii.push(norm(v[i]-center[0],v[i+1]-center[1],v[i+2]-center[2]));const mean=radii.reduce((a,b)=>a+b,0)/n||1;
 const normalized=radii.map(r=>r/mean).sort((a,b)=>a-b);const hist=Array.from({length:16},()=>0);for(const r of normalized)hist[Math.min(15,Math.max(0,Math.floor(r/2*16)))]++;
 const histogram=hist.map(x=>x/n),moments=[2,3,4].map(p=>normalized.reduce((s,r)=>s+(r-1)**p,0)/n);
 const quantiles=[.05,.1,.2,.3,.4,.5,.6,.7,.8,.9,.95].map(p=>normalized[Math.min(n-1,Math.floor(p*(n-1)))]);
 const sphericity=volume&&area>0?Math.cbrt(36*Math.PI*volume*volume)/area:null;
 // Scale/translation/rotation invariant descriptor; radial distribution cannot distinguish all shapes.
 const descriptor=[...quantiles,...histogram,...moments];
 return {id:mesh.id,algorithm:VERSION,vertexCount:n,faceCount:mesh.faceCount,surfaceArea:area,volume,watertight,bounds:{min:lo,max:hi,dimensions:dims},centroid:center,axisRatios:ratios,sphericity,radialHistogram:histogram,radialMoments:moments,descriptor};
}
export function compareFeatures(a:Features,b:Features){const sq=a.descriptor.reduce((s,x,i)=>s+(x-b.descriptor[i])**2,0);const distance=Math.sqrt(sq/a.descriptor.length);const similarity=1/(1+distance);return {algorithm:VERSION,objectA:a.id,objectB:b.id,distance,similarityScore:similarity,scoreDescription:'Uncalibrated radial shape similarity score (0..1), not a probability or proof of identity',differences:{axisRatios:a.axisRatios.map((x,i)=>Math.abs(x-b.axisRatios[i])),sphericity:a.sphericity!==null&&b.sphericity!==null?Math.abs(a.sphericity-b.sphericity):null},features:{a,b}};}
export function meshFromGLB(id:string,data:Buffer):Mesh{
 if(data.length<28||data.readUInt32LE(0)!==0x46546c67||data.readUInt32LE(4)!==2)throw Error('Invalid GLB');const jl=data.readUInt32LE(12);if(jl>data.length-28||data.toString('ascii',16,20)!=='JSON')throw Error('Invalid GLB JSON');const doc=JSON.parse(data.toString('utf8',20,20+jl));const binStart=28+jl;const views=doc.bufferViews,accessors=doc.accessors;const p=accessors[0],idx=accessors[1];if(p.componentType!==5126||p.type!=='VEC3'||idx.componentType!==5123)throw Error('Unsupported GLB layout');const po=binStart+(views[p.bufferView].byteOffset||0)+(p.byteOffset||0),io=binStart+(views[idx.bufferView].byteOffset||0)+(idx.byteOffset||0);if(po+p.count*12>data.length||io+idx.count*2>data.length||p.count>65536||idx.count>3000000)throw Error('Invalid GLB buffers');const vertices=new Float64Array(p.count*3),faces=new Uint16Array(idx.count);for(let i=0;i<vertices.length;i++)vertices[i]=data.readFloatLE(po+4*i);for(let i=0;i<faces.length;i++)faces[i]=data.readUInt16LE(io+2*i);return {id,protocol:'poscan',vertexCount:p.count,faceCount:idx.count/3,vertices,faces};
}
export class FeatureStore{
 private jobs=new Map<string,Promise<Features>>();private dir:string;private loadMesh:(id:string)=>Promise<Mesh>;constructor(dir:string,loadMesh:(id:string)=>Promise<Mesh>){this.dir=dir;this.loadMesh=loadMesh;}
 async get(id:string):Promise<Features>{const path=join(this.dir,id+'.features.json');try{const f=JSON.parse(await readFile(path,'utf8')) as Features;if(f.algorithm===VERSION)return f;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 if(!this.jobs.has(id))this.jobs.set(id,(async()=>{const f=extractFeatures(await this.loadMesh(id));await mkdir(this.dir,{recursive:true});await writeFile(path,JSON.stringify(f));return f})().finally(()=>this.jobs.delete(id)));return this.jobs.get(id)!;}
}
