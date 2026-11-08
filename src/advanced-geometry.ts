import {registerSurfaces} from './registration.ts';
import type {Mesh} from './geometry.ts';
import {topology,classify} from './intelligence.ts';
import {extractFeaturesV2,compareV2} from './geometry-v2.ts';

type V=[number,number,number];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:V)=>Math.hypot(...a);
const point=(m:Mesh,i:number):V=>[m.vertices[3*i],m.vertices[3*i+1],m.vertices[3*i+2]];
const round=(n:number)=>Number.isFinite(n)?Number(n.toPrecision(9)):null;
export function analyzeAdvanced(mesh:Mesh){
 const n=mesh.vertexCount, adjacency=Array.from({length:n},()=>new Set<number>()), edgeFaces=new Map<string,number>(), faceAdj=new Map<string,number[]>();
 const incident=Array.from({length:n},()=>0), angleSum=Array.from({length:n},()=>0), areaWeight=Array.from({length:n},()=>0);
 const vertexNormals=Array.from({length:n},():V=>[0,0,0]);let area=0, signedVolume=0,degenerate=0;const edgeOrientation=new Map<string,number>();
 const boundsMin:V=[Infinity,Infinity,Infinity],boundsMax:V=[-Infinity,-Infinity,-Infinity],center:V=[0,0,0];
 for(let i=0;i<n;i++){const p=point(mesh,i);for(let j=0;j<3;j++){boundsMin[j]=Math.min(boundsMin[j],p[j]);boundsMax[j]=Math.max(boundsMax[j],p[j]);center[j]+=p[j]/n;}}
 for(let t=0;t<mesh.faceCount;t++){
  const ids=[mesh.faces[3*t],mesh.faces[3*t+1],mesh.faces[3*t+2]];
  if(ids.some(i=>i>=n))throw new Error('Face index out of range');
  const [a,b,c]=ids.map(i=>point(mesh,i));const ab=sub(b,a),ac=sub(c,a),normal=cross(ab,ac),doubleArea=norm(normal);
  if(doubleArea<=1e-14){degenerate++;continue;}area+=doubleArea/2;signedVolume+=dot(a,cross(b,c))/6;
  for(let k=0;k<3;k++){
   const i=ids[k],j=ids[(k+1)%3],h=ids[(k+2)%3];adjacency[i].add(j);adjacency[j].add(i);
   const key=[i,j].sort((x,y)=>x-y).join(':');edgeFaces.set(key,(edgeFaces.get(key)??0)+1);edgeOrientation.set(key,(edgeOrientation.get(key)??0)+(i<j?1:-1));
   const faces=faceAdj.get(key)??[];faces.push(t);faceAdj.set(key,faces);
   const u=sub(point(mesh,j),point(mesh,i)),v=sub(point(mesh,h),point(mesh,i));angleSum[i]+=Math.acos(Math.max(-1,Math.min(1,dot(u,v)/(norm(u)*norm(v)))));
   incident[i]++;areaWeight[i]+=doubleArea/6;for(let q=0;q<3;q++)vertexNormals[i][q]+=normal[q];
  }
 }
 let boundaryEdges=0,nonManifoldEdges=0;for(const c of edgeFaces.values()){if(c===1)boundaryEdges++;else if(c!==2)nonManifoldEdges++;}
 const seen=new Set<number>();let connectedComponents=0;for(let i=0;i<n;i++){if(seen.has(i))continue;connectedComponents++;const stack=[i];seen.add(i);while(stack.length){for(const j of adjacency[stack.pop()!])if(!seen.has(j)){seen.add(j);stack.push(j);}}}
 const inconsistentWinding=[...edgeOrientation.values()].filter(x=>x!==0).length;
 const watertight=boundaryEdges===0&&nonManifoldEdges===0&&degenerate===0&&inconsistentWinding===0;
 const euler=n-edgeFaces.size+mesh.faceCount;
 const genus=watertight&&connectedComponents===1&&(2-euler)>=0&&(2-euler)%2===0?(2-euler)/2:null;
 const dimensions=boundsMax.map((x,i)=>x-boundsMin[i]);const sorted=[...dimensions].sort((a,b)=>b-a);
 const sphericity=watertight&&area>0&&Math.abs(signedVolume)>1e-12?Math.cbrt(36*Math.PI*Math.abs(signedVolume)**2)/area:null;
 const curvature:number[]=[];const normals=vertexNormals.map(v=>{const l=norm(v);return l?v.map(x=>x/l) as V:[0,0,0] as V;});
 for(let i=0;i<n;i++){
  // Unsigned discrete normal variation; robust visual indicator, not principal curvature.
  const neighbors=[...adjacency[i]];const c=neighbors.length?neighbors.reduce((s,j)=>s+Math.acos(Math.max(-1,Math.min(1,dot(normals[i],normals[j])))),0)/neighbors.length:0;
  curvature.push(c);
 }
 const ordered=[...curvature].sort((a,b)=>a-b);const quantile=(p:number)=>ordered[Math.min(ordered.length-1,Math.floor(p*(ordered.length-1)))]??0;
 const scale=norm(dimensions as V)||1;
 // Axis-aligned reflected nearest-point error, normalized by bbox diagonal. Approximate only.
 const sampleStep=Math.max(1,Math.floor(n/256));const sampled:V=[];for(let i=0;i<n;i+=sampleStep)sampled.push(point(mesh,i));
 const reflectError=(axis:number)=>{let sum=0;for(const p of sampled){const reflected=[...p] as V;reflected[axis]=2*center[axis]-p[axis];let best=Infinity;for(const q of sampled){const d=dot(sub(reflected,q),sub(reflected,q));if(d<best)best=d;}sum+=Math.sqrt(best);}return sum/sampled.length/scale;};
 const symmetry=[0,1,2].map(reflectError);
 const boundaryVertices=new Set<number>();for(const [key,count] of edgeFaces){if(count===1)for(const part of key.split(':'))boundaryVertices.add(Number(part));}
 const heatmap={method:'neighbor-normal-angle-v1',units:'radians',values:curvature.map(round),positions:Array.from({length:n},(_,i)=>point(mesh,i)),min:round(ordered[0]??0),median:round(quantile(.5)),p95:round(quantile(.95)),max:round(ordered.at(-1)??0),note:'Per-vertex surface-detail proxy. Values are indexed in original mesh vertex order; not an absolute curvature or a trained defect detector.'};
 return {algorithm:'numen-advanced-geometry-v2',units:'native_model_units',geometry:{vertexCount:n,triangleCount:mesh.faceCount,surfaceArea:round(area),signedVolume:round(signedVolume),enclosedVolume:watertight?round(Math.abs(signedVolume)):null,volumeReliable:watertight,degenerateTriangles:degenerate,sphericity:round(sphericity??NaN),bounds:{min:boundsMin,max:boundsMax,dimensions,axisRatios:sorted[2]>0?sorted.map(v=>round(v/sorted[2])):null}},topology:{...topology(mesh),connectedComponents,boundaryEdges,nonManifoldEdges,inconsistentWindingEdges:inconsistentWinding,genus,manifoldClosed:watertight},surface:{detailMap:heatmap,curvatureMethod:'angle-deficit-Gaussian-curvature-v1',gaussianCurvature:angleSum.map((x,i)=>round((boundaryVertices.has(i)?Math.PI:2*Math.PI)-x)/Math.max(1e-12,areaWeight[i])),meanNormalVariation:round(curvature.reduce((a,b)=>a+b,0)/n),angleDeficit:angleSum.map((x,i)=>round((2*Math.PI-x)/Math.max(1e-12,areaWeight[i])))},symmetry:{method:'sampled-axis-reflection-nearest-neighbor-v1',axisErrors:symmetry.map(round),sampleCount:sampled.length,lowerIsMoreSymmetric:true,warning:'Approximate, coordinate-axis dependent; not rotation-invariant symmetry proof.'},classification:{...classify(mesh),...semanticGeometry(mesh,dimensions as V,watertight),semanticCategoryVerified:false,warning:'Geometry-only rules cannot reliably distinguish asteroid, organic object or manufactured part; a trained classifier is required.'},limitations:['Model coordinates have no guaranteed physical unit.','Signed volume depends on consistent face winding; enclosed volume requires a closed manifold.','Surface detail and symmetry are approximate geometric descriptors.']};
}
function semanticGeometry(mesh:Mesh, dimensions:V, watertight:boolean){
 const v=mesh.vertexCount;const aspect=Math.max(...dimensions)/Math.max(1e-9,Math.min(...dimensions));
 const categories=[{label:'elongated geometry',score:Math.max(0,Math.min(1,(aspect-1)/3))},{label:'approximately equidimensional geometry',score:Math.max(0,Math.min(1,2-aspect))},{label:'open surface',score:watertight?0:1}];
 return {semanticCategory:'unknown',geometricDescriptors:categories,objectType:'unclassified',objectTypeReason:'Asteroid / mechanical / organic categories cannot be inferred reliably from basic mesh geometry alone.',vertexCount:v};
}
// Sampled, normalized point clouds; candidate registration is approximate, never identity proof.
function cloud(mesh:Mesh,max=320):V[]{const pts:V[]=[];for(let i=0;i<mesh.vertexCount;i+=Math.max(1,Math.ceil(mesh.vertexCount/max)))pts.push(point(mesh,i));const center:V=[0,0,0];for(const p of pts)for(let j=0;j<3;j++)center[j]+=p[j]/pts.length;const centered=pts.map(p=>sub(p,center));const rms=Math.sqrt(centered.reduce((s,p)=>s+dot(p,p),0)/pts.length)||1;return centered.map(p=>p.map(x=>x/rms) as V);}
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
function oriented(p:V,perm:number[],sign:number):V{return [p[perm[0]]*(sign&1?-1:1),p[perm[1]]*(sign&2?-1:1),p[perm[2]]*(sign&4?-1:1)];}
function nearestDistances(a:V[],b:V[]){return a.map(p=>{let best=Infinity;for(const q of b){const d=dot(sub(p,q),sub(p,q));if(d<best)best=d;}return Math.sqrt(best);});}
function quantile(values:number[],p:number){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))]??0;}
export function partialCandidates(a:Mesh,b:Mesh){
 const A=cloud(a),B=cloud(b);let best:any=null;
 for(const perm of permutations)for(let sign=0;sign<8;sign++){
  const rotated=B.map(p=>oriented(p,perm,sign));const ab=nearestDistances(A,rotated),ba=nearestDistances(rotated,A);
  const median=Math.min(quantile(ab,.5),quantile(ba,.5));const coverageA=ab.filter(x=>x<.15).length/ab.length,coverageB=ba.filter(x=>x<.15).length/ba.length;
  const objective=median+.2*(1-Math.max(coverageA,coverageB));
  if(!best||objective<best.objective)best={objective,medianDistance:median,coverageA,coverageB,rotation:{permutation:perm,signMask:sign},p95Distance:Math.min(quantile(ab,.95),quantile(ba,.95))};
 }
 return {algorithm:'normalized-point-cloud-orientation-search-v2',candidateScore:round(1/(1+best.objective)),coverageA:round(best.coverageA),coverageB:round(best.coverageB),medianDistance:round(best.medianDistance),p95Distance:round(best.p95Distance),bestOrientation:best.rotation,verifiedPartialMatch:false,correspondences:[],limitations:['Samples vertices rather than continuous surfaces.','Searches 48 axis-aligned orientations, not arbitrary 3D rotations.','Cannot prove local part-to-whole correspondence; candidate score is not a probability.'],warning:'Approximate candidate ranking only. Partial matching requires validated rigid registration and local surface correspondences.'};
}
export function compareAdvanced(a:Mesh,b:Mesh){const x=extractFeaturesV2(a),y=extractFeaturesV2(b),global=compareV2(x,y),A=analyzeAdvanced(a),B=analyzeAdvanced(b),registration=partialCandidates(a,b),surfaceRegistration=registerSurfaces(a,b);return {surfaceRegistration,algorithm:'numen-advanced-comparison-v3',global,registration,geometryDelta:{surfaceArea:(A.geometry.surfaceArea??0)-(B.geometry.surfaceArea??0),volume:A.geometry.enclosedVolume!==null&&B.geometry.enclosedVolume!==null?A.geometry.enclosedVolume-B.geometry.enclosedVolume:null},identityVerified:false,partialCorrespondenceVerified:false,warning:'Registration is approximate and not an exact identity or certified partial match.'};}
