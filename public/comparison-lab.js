import * as THREE from 'https://esm.sh/three@0.170.0';
import {OrbitControls} from 'https://esm.sh/three@0.170.0/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'https://esm.sh/three@0.170.0/addons/loaders/GLTFLoader.js';
import {OBJLoader} from 'https://esm.sh/three@0.170.0/addons/loaders/OBJLoader.js';
import {STLLoader} from 'https://esm.sh/three@0.170.0/addons/loaders/STLLoader.js';
const el=id=>document.getElementById(id);const active=[];let currentFile=null;const displayed={};
const setStatus=message=>{el('previewStatus').textContent=message};
setStatus('3D viewer ready. Select a local file or enter a Numen object ID.');
function stop(){removeHeatmap();for(const f of active.splice(0))f();for(const key of Object.keys(displayed))delete displayed[key]}
function render(stage,object){stage.replaceChildren();displayed[stage.id]=object;const scene=new THREE.Scene();scene.background=new THREE.Color('#080f1c');const camera=new THREE.PerspectiveCamera(48,1,.01,1000);camera.position.set(0,0,3.4);const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));stage.append(renderer.domElement);scene.add(new THREE.HemisphereLight(0xe3efff,0x26364e,2.2));const light=new THREE.DirectionalLight(0xffffff,2.8);light.position.set(3,5,7);scene.add(light);const root=new THREE.Group();scene.add(root);root.add(object);object.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshStandardMaterial({color:0xb7c3d2,roughness:.92,metalness:0,side:THREE.DoubleSide});if(!o.geometry.attributes.normal)o.geometry.computeVertexNormals()}});const box=new THREE.Box3().setFromObject(object);if(box.isEmpty())throw Error('No mesh geometry found');const size=box.getSize(new THREE.Vector3());const longest=Math.max(size.x,size.y,size.z);if(!Number.isFinite(longest)||longest<=0)throw Error('Invalid geometry bounds');const center=box.getCenter(new THREE.Vector3());object.position.sub(center);root.scale.setScalar(2/longest);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;let alive=true,frame=0;const resize=()=>{if(!alive)return;const w=Math.max(200,stage.clientWidth),h=Math.max(200,stage.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};const observer=new ResizeObserver(resize);observer.observe(stage);resize();const animate=()=>{if(!alive)return;frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)};animate();active.push(()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.dispose();renderer.domElement.remove();object.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose()}})})}
async function parseFile(file){const ext=file.name.split('.').pop().toLowerCase();if(!['obj','stl','glb'].includes(ext))throw Error('Supported formats: OBJ, STL, GLB');if(file.size>1_000_000||!file.size)throw Error('Select a nonempty file up to 1 MB');const buf=await file.arrayBuffer();if(ext==='obj')return new OBJLoader().parse(new TextDecoder().decode(buf));if(ext==='stl'){const mesh=new THREE.Mesh(new STLLoader().parse(buf));return mesh}return (await new GLTFLoader().parseAsync(buf,'')).scene}
async function indexed(id){const r=await fetch('/objects/'+encodeURIComponent(id)+'/model?format=glb');if(!r.ok)throw Error('Indexed model: HTTP '+r.status);return (await new GLTFLoader().parseAsync(await r.arrayBuffer(),'')).scene}
let previewBusy=false;
function fileLabel(inputId,labelId){const input=el(inputId),label=el(labelId);input.addEventListener('change',()=>{label.textContent=input.files?.[0]?.name||'No file selected'})}
fileLabel('file','fileName');fileLabel('previewFile','previewFileName');
async function showModels(){
  if(previewBusy)return;
  const file=el('previewFile').files?.[0],id=el('previewId').value.trim(),firstId=el('previewFirstId').value.trim();
  if(!file&&!id&&!firstId){el('previewStatus').textContent='Choose a 3D file, enter an indexed Numen object ID, or both.';return}
  previewBusy=true;el('previewRun').disabled=true;stop();el('previewMetrics').replaceChildren();el('surfaceOverlayControls').replaceChildren();
  el('uploadedStage').replaceChildren();el('indexedStage').replaceChildren();
  const outcomes=[];
  try{
    if(file){
      try{el('previewStatus').textContent='Loading uploaded model…';render(el('uploadedStage'),await parseFile(file));currentFile=file;outcomes.push('Uploaded model ready')}
      catch(e){outcomes.push('Uploaded model failed: '+e.message)}
    }else if(firstId){try{render(el('uploadedStage'),await indexed(firstId));outcomes.push('First indexed model ready')}catch(e){el('uploadedStage').textContent='Could not load first model: '+e.message;outcomes.push('First model failed: '+e.message)}}else{el('uploadedStage').textContent='Choose a local file or enter the first object ID';outcomes.push('First model not selected')}
    if(id){
      try{el('previewStatus').textContent=outcomes.join(' · ')+' · Loading indexed Numen model…';render(el('indexedStage'),await indexed(id));outcomes.push('Indexed Numen model ready')}
      catch(e){el('indexedStage').textContent='Could not load Numen model: '+e.message;outcomes.push('Indexed model failed: '+e.message)}
    }else{el('indexedStage').textContent='Enter an indexed Numen object ID';outcomes.push('No indexed ID entered')}
    el('previewStatus').textContent=outcomes.join(' · ')+'. Drag to rotate and scroll to zoom.';
  }finally{previewBusy=false;el('previewRun').disabled=false}
}
el('previewRun').onclick=showModels;
el('previewFile').addEventListener('change',()=>{if(el('previewFile').files?.length)showModels()});
if(el('previewMatch'))el('previewMatch').onclick=()=>{const file=el('previewFile').files?.[0];if(!file){el('previewStatus').textContent='Choose a model file first.';return}const dt=new DataTransfer();dt.items.add(file);el('file').files=dt.files;el('fileName').textContent=file.name;el('uploadRun').click();el('previewStatus').textContent='Similarity search started. Results appear in section 1.'};
const compareButton=el('previewCompare');
const encodeBytes=bytes=>{let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out)};
async function modelPayload(file,id){
 let bytes,format;
 if(file){bytes=new Uint8Array(await file.arrayBuffer());format=file.name.split('.').pop().toLowerCase();}
 else {const r=await fetch('/objects/'+encodeURIComponent(id)+'/model?format=glb');if(!r.ok)throw Error('Cannot retrieve object '+id+' (HTTP '+r.status+')');bytes=new Uint8Array(await r.arrayBuffer());format='glb';}
 if(!['obj','stl','glb'].includes(format))throw Error('Unsupported model format');
 if(!bytes.length||bytes.length>1_000_000)throw Error('Model '+(id||file?.name)+' is empty or exceeds the 1 MB API limit');
 return {format,data:encodeBytes(bytes)};
}
function metric(value){return typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:5}):value===null||value===undefined?'Unavailable':String(value)}
function addMetric(parent,label,a,b){const tr=document.createElement('tr');for(const t of [label,metric(a),metric(b)]){const td=document.createElement('td');td.textContent=t;tr.append(td)}parent.append(tr)}
// Paint the actual mesh surface rather than placing sparse points inside the model.
// Each rendered vertex receives the distance of its nearest sampled surface point.
const overlays=new Map();
function removeHeatmap(){
 let removed=0;
 for(const [stageId,items] of overlays){
  for(const item of items){
   if(item.mesh.geometry===item.coloredGeometry)item.mesh.geometry=item.originalGeometry;
   if(item.mesh.material===item.coloredMaterial)item.mesh.material=item.originalMaterial;
   item.coloredGeometry.dispose();item.coloredMaterial.dispose();removed++;
  }
 }
 overlays.clear();return removed;
}
function colorize(stageId,heat,high){
 const object=displayed[stageId];
 if(!object)throw Error('Load both 3D models before showing surface differences.');
 if(!heat||!Array.isArray(heat.positions)||!Array.isArray(heat.distances)||heat.positions.length!==heat.distances.length||!heat.positions.length)throw Error('Surface difference samples are unavailable. Run the comparison again.');
 const rms=Number(heat.rms),center=heat.center;
 if(!Number.isFinite(rms)||rms<=0||!Array.isArray(center)||center.length!==3)throw Error('Invalid surface overlay coordinates.');
 const samples=heat.positions.map((p,i)=>{
  if(!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))||!Number.isFinite(heat.distances[i]))throw Error('Invalid surface sample.');
  return {point:new THREE.Vector3(p[0]*rms+center[0],p[1]*rms+center[1],p[2]*rms+center[2]),distance:heat.distances[i]};
 });
 const maxDistance=Number.isFinite(high)&&high>0?high:Math.max(1e-8,...heat.distances);
 // Account for GLB node transforms, which are not always baked into vertex positions.
 object.updateWorldMatrix(true,true);
 const inverseObject=object.matrixWorld.clone().invert();
 const items=[];let vertices=0;
 try{
  object.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry?.attributes?.position)return;
   const originalGeometry=mesh.geometry,originalMaterial=mesh.material;
   const geometry=originalGeometry.clone();
   const position=geometry.attributes.position,colors=new Float32Array(position.count*3);
   const transform=inverseObject.clone().multiply(mesh.matrixWorld);
   const vertex=new THREE.Vector3();
   for(let i=0;i<position.count;i++){
    vertex.fromBufferAttribute(position,i).applyMatrix4(transform);
    let best=Infinity,distance=0;
    for(const sample of samples){const sq=vertex.distanceToSquared(sample.point);if(sq<best){best=sq;distance=sample.distance}}
    const t=Math.max(0,Math.min(1,distance/maxDistance));
    // Continuous blue -> cyan -> yellow -> red palette, visible on the actual triangles.
    const color=new THREE.Color().setHSL((1-t)*0.64,0.94,0.47);
    colors[3*i]=color.r;colors[3*i+1]=color.g;colors[3*i+2]=color.b;
   }
   geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
   const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.85,metalness:0,side:THREE.DoubleSide});
   items.push({mesh,originalGeometry,originalMaterial,coloredGeometry:geometry,coloredMaterial:material});
   mesh.geometry=geometry;mesh.material=material;vertices+=position.count;
  });
  if(!vertices)throw Error('No renderable mesh vertices found.');
  overlays.set(stageId,items);return vertices;
 }catch(error){for(const item of items){item.mesh.geometry=item.originalGeometry;item.mesh.material=item.originalMaterial;item.coloredGeometry.dispose();item.coloredMaterial.dispose()}throw error}
}
function resultPanel(data,first,second){
 const host=el('previewMetrics');host.replaceChildren();el('surfaceOverlayControls').replaceChildren();
 const h=document.createElement('h3');h.textContent='Geometry comparison';host.append(h);
 const note=document.createElement('p');note.className='comparison-info';note.textContent='Direct comparison of the two selected meshes. All dimensions are in original model units; size ratios are not physical measurements without unit metadata.';host.append(note);
 const table=document.createElement('table');table.className='geometry-compare-table';const thead=document.createElement('thead');const head=document.createElement('tr');for(const name of ['Geometric property','Model A','Model B']){const th=document.createElement('th');th.textContent=name;head.append(th)}thead.append(head);table.append(thead);const tbody=document.createElement('tbody');
 const A=first.geometry,B=second.geometry;
 for(const [name,x,y] of [['Vertices',A.vertexCount,B.vertexCount],['Triangles',A.triangleCount,B.triangleCount],['Surface area',A.surfaceArea,B.surfaceArea],['Enclosed volume',A.enclosedVolume,B.enclosedVolume],['Sphericity',A.sphericity,B.sphericity],['Dimensions',A.bounds?.dimensions?.map(metric).join(' × '),B.bounds?.dimensions?.map(metric).join(' × ')],['Connected components',first.topology?.connectedComponents,second.topology?.connectedComponents],['Boundary edges',first.topology?.boundaryEdges,second.topology?.boundaryEdges],['Non-manifold edges',first.topology?.nonManifoldEdges,second.topology?.nonManifoldEdges],['Mean normal variation',first.surface?.meanNormalVariation,second.surface?.meanNormalVariation]])addMetric(tbody,name,x,y);
 table.append(tbody);host.append(table);
 const surface=data.surfaceRegistration;
 if(surface){const section=document.createElement('section');section.className='surface-comparison';const heading=document.createElement('h3');heading.textContent='Aligned surface differences';section.append(heading);
 const measures=document.createElement('div');measures.className='compare-summary';for(const [name,value] of [['Symmetric Chamfer (sampled)',surface.distances.symmetricChamfer],['Approx. Hausdorff (sampled)',surface.distances.approximateHausdorff],['95th percentile distance',surface.distances.p95],['Model A coverage within 0.05',surface.coverage.aWithin005],['Model B coverage within 0.05',surface.coverage.bWithin005]]){const item=document.createElement('div');item.className='compare-summary-card';const small=document.createElement('small');small.textContent=name;const strong=document.createElement('strong');strong.textContent=metric(value);item.append(small,strong);measures.append(item)}section.append(measures);
 const legend=document.createElement('p');legend.className='comparison-info';legend.textContent='Surface difference overlay: blue = smaller sampled distance, red = larger sampled distance. Sample distances are interpolated onto the rendered mesh; this is an approximation, not an exact surface-to-surface distance field. Values use RMS-normalized units.';section.append(legend);
 const feedback=document.createElement('p');feedback.className='comparison-info';feedback.setAttribute('role','status');
 const show=document.createElement('button');show.type='button';show.textContent='Show surface difference overlay';
 const hide=document.createElement('button');hide.type='button';hide.textContent='Hide overlay';
 show.addEventListener('click',()=>{try{
  removeHeatmap();
  const a=colorize('uploadedStage',surface.heatmap?.modelA,surface.heatmap?.legend?.high);
  const b=colorize('indexedStage',surface.heatmap?.modelB,surface.heatmap?.legend?.high);
  feedback.textContent=`Surface differences painted on the meshes (${a} vertices on Model A; ${b} on Model B). Blue = closer; red = farther.`;
  show.disabled=true;hide.disabled=false;
 }catch(error){removeHeatmap();feedback.textContent='Could not show overlay: '+error.message;console.error(error)}});
 hide.addEventListener('click',()=>{removeHeatmap();feedback.textContent='Surface difference overlay hidden.';hide.disabled=true;show.disabled=false});
 hide.disabled=true;
 const controls=el('surfaceOverlayControls');controls.append(show,document.createTextNode(' '),hide,feedback);host.append(section)}
 const summary=document.createElement('div');summary.className='compare-summary';
 const similarity=data.global?.similarityScore;const distance=data.global?.distance;
 const candidates=[['Shape similarity (heuristic)',typeof similarity==='number'?(similarity*100).toFixed(2)+'%':'Unavailable'],['Descriptor distance',metric(distance)],['Approximate registration score',metric(data.registration?.candidateScore)],['Surface area difference',metric(data.geometryDelta?.surfaceArea)],['Volume difference',metric(data.geometryDelta?.volume)]];
 for(const [name,value] of candidates){const item=document.createElement('div');item.className='compare-summary-card';const small=document.createElement('small');small.textContent=name;const strong=document.createElement('strong');strong.textContent=value;item.append(small,strong);summary.append(item)}host.append(summary);
 const warning=document.createElement('p');warning.className='comparison-info';warning.textContent='Similarity and registration are approximate and uncalibrated. This is not an exact mesh identity test, certified partial match, or blockchain provenance verification. The two preview windows can be rotated independently.';host.append(warning);
 const details=document.createElement('details');const caption=document.createElement('summary');caption.textContent='View technical comparison JSON';const pre=document.createElement('pre');pre.className='compare-json';pre.textContent=JSON.stringify({comparison:data,modelA:first,modelB:second},null,2);details.append(caption,pre);host.append(details);
}
compareButton.onclick=async()=>{
 const file=el('previewFile').files?.[0],a=el('previewFirstId').value.trim(),b=el('previewId').value.trim(),target=el('previewMetrics');
 removeHeatmap();target.replaceChildren();el('surfaceOverlayControls').replaceChildren();compareButton.disabled=true;target.textContent='Comparing the two selected geometries…';
 try{
  if(!b)throw Error('Enter the Model B Numen object ID.');
  if(!file&&!a)throw Error('Choose a Model A file or enter its Numen object ID.');
  const first=await modelPayload(file,a),second=await modelPayload(null,b);
  const headers={'content-type':'application/json','x-numen-test-client':'ai-lab'};
  const request=async(path,body)=>{const r=await fetch(path,{method:'POST',headers,body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||d.message||path+' HTTP '+r.status);return d};
  const [comparison,modelA,modelB]=await Promise.all([
   request('/api/v1/geometry/advanced-compare',{a:first,b:second}),
   request('/api/v1/geometry/advanced-analyze',first),
   request('/api/v1/geometry/advanced-analyze',second)
  ]);
  resultPanel(comparison,modelA,modelB);
 }catch(e){target.textContent='Comparison could not be completed: '+e.message}finally{compareButton.disabled=false}
};

async function loadApis(){const list=el('allApiLinks');list.textContent='Loading OpenAPI specification…';try{const r=await fetch('/openapi.json');if(!r.ok)throw Error('HTTP '+r.status);const doc=await r.json();list.replaceChildren();let count=0;for(const [path,methods] of Object.entries(doc.paths||{})){for(const [method,definition] of Object.entries(methods)){if(!['get','post','put','patch','delete'].includes(method))continue;count++;const button=document.createElement('button');button.type='button';button.className='api-item';const title=document.createElement('strong');title.textContent=definition.summary||definition.operationId||'API endpoint';const code=document.createElement('code');code.textContent=method.toUpperCase()+' '+path;const hint=document.createElement('small');hint.textContent='Click to test GET or view endpoint details';button.append(title,code,hint);button.onclick=async()=>{if(method!=='get'){el('status').textContent='This endpoint requires '+method.toUpperCase()+' and a request body. See /openapi.json for its schema.';el('output').textContent=JSON.stringify(definition,null,2);return}let target=path;for(const name of [...target.matchAll(/\{([^}]+)\}/g)].map(m=>m[1])){const value=prompt('Enter '+name+' for '+path);if(!value)return;target=target.replace('{'+name+'}',encodeURIComponent(value))}const required=(definition.parameters||[]).filter(x=>x.in==='query'&&x.required);const params=new URLSearchParams();for(const q of required){const value=prompt('Required query parameter: '+q.name);if(value===null)return;params.set(q.name,value)}if(params.size)target+='?'+params.toString();el('status').textContent='Requesting '+target;try{const response=await fetch(target,{headers:{'x-numen-test-client':'ai-lab'}});const raw=await response.text();let body;try{body=JSON.parse(raw)}catch{body=raw.slice(0,20000)}el('output').textContent=JSON.stringify(body,null,2);el('status').textContent='HTTP '+response.status+' · '+target}catch(e){el('status').textContent='Request failed: '+e.message}};list.append(button)}}if(!count)list.textContent='The OpenAPI specification contains no declared paths.'}catch(e){list.textContent='Could not load OpenAPI endpoints: '+e.message}}el('reloadApis').onclick=loadApis;loadApis();
