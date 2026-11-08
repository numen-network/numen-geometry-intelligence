import type {Mesh} from './geometry.ts';
import {extractFeatures} from './analysis.ts';
// Supplement radial-v1 with area-weighted surface-normal distribution and axis-ratio features.
// Histograms use absolute normal components sorted by magnitude, making them orientation independent.
export function extractFeaturesV2(mesh:Mesh){
 const base=extractFeatures(mesh),bins=Array(12).fill(0),v=mesh.vertices,f=mesh.faces;let area=0;
 for(let i=0;i<f.length;i+=3){const a=f[i]*3,b=f[i+1]*3,c=f[i+2]*3;const x=v[b]-v[a],y=v[b+1]-v[a+1],z=v[b+2]-v[a+2],u=v[c]-v[a],w=v[c+1]-v[a+1],t=v[c+2]-v[a+2];const n=[y*t-z*w,z*u-x*t,x*w-y*u],mag=Math.hypot(...n);if(mag<=1e-15)continue;area+=mag;const sorted=n.map(q=>Math.abs(q)/mag).sort((p,q)=>q-p);for(let j=0;j<3;j++)bins[j*4+Math.min(3,Math.floor(sorted[j]*4))]+=mag;}
 const normals=bins.map(x=>area?x/area:0);return {...base,algorithm:'geometry-v2',normalHistogram:normals,descriptor:[...base.descriptor,...normals,...base.axisRatios]};
}
export function compareV2(a:ReturnType<typeof extractFeaturesV2>,b:ReturnType<typeof extractFeaturesV2>){const distance=Math.sqrt(a.descriptor.reduce((s,x,i)=>s+(x-b.descriptor[i])**2,0)/a.descriptor.length);return {algorithm:'geometry-v2',distance,similarityScore:1/(1+distance),scoreDescription:'Uncalibrated descriptor similarity, not identity proof or probability'};}
