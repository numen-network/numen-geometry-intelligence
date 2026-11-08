"use strict";
(()=>{
const $=id=>document.getElementById(id);
const tasks={
 exact:['Find an exact match','Upload an OBJ, STL or GLB file to search the locally cached geometry identities. Results may be incomplete.'],
 similar:['Find similar models','Upload a model or enter an indexed object ID to find related shapes.'],
 analyze:['Analyze geometry','Upload a model or enter an indexed object ID to inspect its geometry.'],
 verify:['Verify provenance','Enter an indexed Numen object ID to compare locally reconstructed geometry with the live GraphQL source.'],
 compare:['Compare two models','Compare two indexed IDs, or open the 3D comparison viewer to compare an uploaded model with an indexed object.']
};
const el=(tag,props={})=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='text')n.textContent=v;else if(k==='class')n.className=v;else n.setAttribute(k,v)}return n};
let current='',last=null;
function field(kind,placeholder,id){let n;if(kind==='file'){
 const wrap=el('div',{class:'file-picker'});n=el('input',{type:'file',id,accept:'.obj,.stl,.glb','aria-label':placeholder});
 const label=el('label',{for:id,class:'task-file-label',text:'Choose 3D File'});
 const name=el('span',{class:'task-file-name',text:'No file selected'});
 n.onchange=()=>{name.textContent=n.files?.[0]?.name||'No file selected'};
 wrap.append(n,label,name);$('taskFields').append(wrap);
 }else{n=el('input',{type:'text',id,placeholder,'aria-label':placeholder});$('taskFields').append(n)}return n}
function select(id,options){const s=el('select',{id});for(const [value,label] of options){const o=el('option',{value,text:label});s.append(o)}$('taskFields').append(s);return s}
function button(text,cb){const b=el('button',{type:'button',text});b.onclick=async()=>{b.disabled=true;try{await cb()}catch(e){showError(e)}finally{b.disabled=false}};$('taskFields').append(b);return b}
function info(t,error=false){$('taskFeedback').textContent=t;$('taskFeedback').className='task-feedback'+(error?' error':'')}
function showError(e){info(e?.message||String(e),true)}
function output(data){last=data;$('taskResult').textContent=JSON.stringify(data,null,2)}
async function call(path,opts){info('Loading…');const r=await fetch(path,{...opts,headers:{'x-numen-test-client':'ai-lab',...(opts?.headers||{})}});let data;try{data=await r.json()}catch{throw Error('The server did not return JSON (HTTP '+r.status+').')}output(data);if(!r.ok)throw Error((typeof data.error==='string'&&data.error)||data.message||'Request failed (HTTP '+r.status+').');info('Request completed · HTTP '+r.status);return data}
async function fileData(id){const f=$(id)?.files?.[0];if(!f)throw Error('Choose an OBJ, STL or GLB file first.');const format=f.name.split('.').pop().toLowerCase();if(!['obj','stl','glb'].includes(format)||f.size===0||f.size>1000000)throw Error('Choose a nonempty OBJ, STL or GLB file up to 1 MB.');const bytes=new Uint8Array(await f.arrayBuffer());let str='';for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));return {format,data:btoa(str),sourceObjectId:/^([0-9]{10}-[a-zA-Z0-9]+)\.(?:obj|stl|glb)$/i.exec(f.name)?.[1]||null,sourceBlockHeight:Number(/^block-(\d+)\.(?:obj|stl|glb)$/i.exec(f.name)?.[1]||0)||null}}
const post=(url,body)=>call(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function idValue(name){const value=$(name).value.trim();if(!value)throw Error('Enter a Numen object ID.');return encodeURIComponent(value)}
function compact(data){
 const target=$('taskSummary'), note=$('taskInterpretation');target.replaceChildren();note.hidden=true;note.textContent='';note.className='task-summary-note';
 if(!data||typeof data!=='object')return;
 const coverage=data.coverage;const fields=[];
 const add=(label,value)=>fields.push([label,String(value)]);
 if(current==='exact'){
  add('Exact geometry match',data.exactMatch===true?'Found':data.status==='verification_incomplete'?'Not confirmed':'Not found');
  add('Blockchain provenance',data.identityVerified===true?'Verified':'Not independently verified');
  add('Matching records',Array.isArray(data.matches)?data.matches.length:0);
  if(data.sourceObject?.id)add('Original object',data.sourceObject.matched?'Geometry matched: '+data.sourceObject.id:data.sourceObject.checked?'Geometry differs: '+data.sourceObject.id:'Not checked: '+data.sourceObject.id);
  if(coverage&&typeof coverage==='object'){
   const checked=Number(coverage.checked)||0,indexed=Number(coverage.indexed)||0,unavailable=Number(coverage.unavailable)||0;
   add('Records checked',checked.toLocaleString('en-US'));
   add('Index coverage',indexed?Math.round(checked/indexed*100)+'% checked':'Unknown');
   note.hidden=false;note.classList.add('warning');
   note.textContent=data.exactMatch===true?'Matching geometry found in the checked catalog. This does not independently prove blockchain provenance.':data.sourceObject?.error?'The original object could not be reconstructed: '+data.sourceObject.error:coverage.complete===true?'The available identity index was fully checked. No matching geometry was found.':'This is not a definitive negative result. '+unavailable.toLocaleString('en-US')+' indexed records were unavailable. A match may exist outside the checked records.';
  }
 }else{
  for(const [key,val] of Object.entries(data)){
   if(['matches','results','items','objects'].includes(key)&&Array.isArray(val))add(key==='matches'?'Matches':key==='items'?'Items':key==='objects'?'Objects':'Results',val.length);
   else if(['status','algorithm','classification','identityVerified','verified','compared','indexed','exactMatch'].includes(key)&&val!==null&&typeof val!=='object')add(key.replace(/([A-Z])/g,' $1'),val);
  }
 }
 for(const [label,value] of fields.slice(0,5)){
  const card=el('div',{class:'metric'});card.append(el('small',{text:label}),el('strong',{text:value}));target.append(card)
 }
 target.className='row';
}

function showGeometryAnalysis(data){
 const host=$('taskExtra');host.replaceChildren();
 const features=data?.geometry||data?.features||data?.inputFeatures||data;
 const identity=data?.identity||features?.identity;
 const topo=data?.topology||features?.topology;
 const classification=data?.classification||features?.classification;
 const section=el('section',{class:'geometry-analysis-results'});
 section.append(el('h3',{text:'Geometry analysis results'}));
 const grid=el('div',{class:'geometry-analysis-grid'});section.append(grid);
 const metric=(label,value)=>{if(value===undefined||value===null||value==='')return;const card=el('div',{class:'metric'});card.append(el('small',{text:label}),el('strong',{text:String(value)}));grid.append(card)};
 const num=v=>typeof v==='number'&&Number.isFinite(v)?Number(v.toFixed(5)).toLocaleString('en-US'):v;
 metric('Vertices',identity?.vertexCount??features?.vertexCount??topo?.vertexCount);
 metric('Triangles',identity?.faceCount??features?.faceCount??topo?.faceCount);
 metric('Surface area',num(features?.surfaceArea));
 metric('Enclosed volume',num(features?.enclosedVolume??features?.volume));
 metric('Volume reliable',features?.volumeReliable);
 metric('Watertight',topo?.manifoldClosed??topo?.watertight??features?.watertight);
 metric('Connected components',topo?.connectedComponents);
 metric('Boundary edges',topo?.boundaryEdges);
 metric('Non-manifold edges',topo?.nonManifoldEdges);
 metric('Genus (closed mesh)',topo?.genus);
 metric('Dimensions',features?.bounds?.dimensions?.map(num).join(' × '));
 metric('Axis ratios',features?.bounds?.axisRatios?.map(num).join(' : '));
 metric('Mean normal variation',num(data?.surface?.meanNormalVariation));
 metric('Surface detail P95',num(data?.surface?.detailMap?.p95));
 metric('Reflection errors X/Y/Z',data?.symmetry?.axisErrors?.map(num).join(' / '));
 metric('Euler characteristic',topo?.eulerCharacteristic);
 metric('Edges',topo?.edgeCount);
 metric('Sphericity',num(features?.sphericity));
 metric('Elongation (heuristic)',num(classification?.elongation));
 metric('Roughness proxy',num(classification?.roughnessProxy));
 if(Array.isArray(classification?.labels)&&classification.labels.length){
  const h=el('h4',{text:'Shape classification (heuristic)'});section.append(h);
  const list=el('div',{class:'geometry-classifications'});section.append(list);
  classification.labels.forEach(item=>{const score=Number(item.score);const row=el('div',{class:'geometry-classification'});row.append(el('strong',{text:String(item.label||'unknown').replaceAll('_',' ')}),el('span',{text:Number.isFinite(score)?(score*100).toFixed(1)+' / 100':'Score unavailable'}));list.append(row)});
 }
 if(data?.surface?.detailMap?.values){
  const map=data.surface.detailMap;
  const positions=map.positions;
  if(Array.isArray(positions)&&positions.length===map.values.length){
   const heading=el('h4',{text:'Interactive surface detail map'});section.append(heading);
   section.append(el('p',{class:'task-note',text:'Drag to rotate. Blue = low local normal variation, red = high. Points are original mesh vertices; this is not a reconstructed shaded surface.'}));
   const canvas=el('canvas',{class:'numen-heatmap'});canvas.width=900;canvas.height=430;canvas.style.cssText='width:100%;height:auto;max-height:430px;background:#07101f;border:1px solid #355173;border-radius:10px;touch-action:none';section.append(canvas);
   let yaw=.5,pitch=.25,drag=false,px=0,py=0;
   const min=map.min??0,max=Math.max(map.p95??0,map.max??0,1e-8);
   const ctx=canvas.getContext('2d');
   const center=[0,0,0];for(const v of positions)for(let k=0;k<3;k++)center[k]+=v[k]/positions.length;
   let radius=0;for(const v of positions)radius=Math.max(radius,Math.hypot(v[0]-center[0],v[1]-center[1],v[2]-center[2]));radius||=1;
   function paint(){ctx.clearRect(0,0,canvas.width,canvas.height);const c=Math.cos(yaw),si=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),points=[];
    for(let i=0;i<positions.length;i++){const v=positions[i],x=(v[0]-center[0])/radius,y=(v[1]-center[1])/radius,z=(v[2]-center[2])/radius;const xx=x*c-z*si,zz=x*si+z*c,yy=y*cp-zz*sp,depth=y*sp+zz*cp;points.push({x:canvas.width/2+xx*170,y:canvas.height/2-yy*170,z:depth,value:map.values[i]??0})}
    points.sort((a,b)=>a.z-b.z);for(const p of points){const t=Math.max(0,Math.min(1,(p.value-min)/(max-min||1)));const hue=(1-t)*220;ctx.fillStyle=`hsl(${hue},90%,${35+25*(p.z+1)/2}%)`;ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill()}
   }
   canvas.addEventListener('pointerdown',e=>{drag=true;px=e.clientX;py=e.clientY;canvas.setPointerCapture(e.pointerId)});
   canvas.addEventListener('pointerup',()=>drag=false);canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-px)*.01;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-py)*.01));px=e.clientX;py=e.clientY;paint()});paint();
  }else section.append(el('p',{class:'task-note',text:'Surface detail values available in technical JSON; vertex positions not provided.'}));
 }
 if(data?.surface?.gaussianCurvature){metric('Gaussian curvature samples',data.surface.gaussianCurvature.length)}
 if(data?.classification?.objectTypeReason)section.append(el('p',{class:'task-summary-note',text:data.classification.objectTypeReason}));
 if(identity?.hash)section.append(el('p',{class:'task-note',text:'Canonical mesh hash: '+identity.hash}));
 section.append(el('p',{class:'task-summary-note',text:'These values describe mesh geometry. Classification scores are uncalibrated heuristics, not object recognition probabilities. A successful analysis does not prove blockchain provenance.'}));
 if(!grid.children.length&&!classification?.labels?.length)section.append(el('p',{class:'task-summary-note warning',text:'The API returned a response but no recognized geometry metrics. Expand technical JSON to inspect the returned fields.'}));
 host.append(section);
}
function showSimilarResults(data){
 const host=$('taskExtra');host.replaceChildren();
 const items=Array.isArray(data?.results)?data.results:[];
 const compared=Number(data?.compared)||0,indexed=Number(data?.indexed)||Number(data?.catalogCandidates)||0;
 const intro=el('div',{class:'similar-intro'});
 intro.append(el('h3',{text:items.length?`${items.length} similar models found`:'No comparable models found'}));
 intro.append(el('p',{text:`Compared ${compared.toLocaleString('en-US')}${indexed?' of '+indexed.toLocaleString('en-US')+' indexed models':''}. Similarity scores describe geometric resemblance, not verified identity.`}));
 host.append(intro);
 if(indexed&&compared<indexed)host.append(el('p',{class:'task-summary-note warning',text:`Partial search: ${Math.round(100*compared/indexed)}% of indexed objects have been compared. More similar models may exist outside the analyzed set.`}));
 if(!items.length)return;
 const grid=el('div',{class:'similar-results'});host.append(grid);
 items.forEach((item,i)=>{
  const id=String(item.id||item.objectId||'');if(!id)return;
  const card=el('article',{class:'similar-card'});
  const header=el('div',{class:'similar-card-header'});
  header.append(el('strong',{text:`#${i+1} · ${id}`}));
  const score=Number(item.similarityScore);
  if(Number.isFinite(score))header.append(el('span',{class:'similar-score',text:`Similarity ${(score*100).toFixed(1)}%*`}));
  card.append(header);
  card.append(el('p',{class:'task-note',text:'*Uncalibrated descriptor score; not a probability or exact-match verification.'}));
  const actions=el('div',{class:'similar-actions'});
  for(const format of ['glb','obj','stl']){
   const a=el('a',{href:'/objects/'+encodeURIComponent(id)+'/model?format='+format,text:'Download '+format.toUpperCase(),class:'similar-download'});
   actions.append(a);
  }
  const copy=el('button',{type:'button',text:'Copy ID'});copy.onclick=async()=>{try{await navigator.clipboard.writeText(id);info('Copied '+id)}catch{info('Object ID: '+id)}};actions.append(copy);
  card.append(actions);grid.append(card);
 });
}
function showComparison(data,a,b){
 const host=$('taskExtra');host.replaceChildren();const panel=el('section',{class:'geometry-analysis-results'});panel.append(el('h3',{text:'Geometry comparison results'}));
 const grid=el('div',{class:'geometry-metrics'});panel.append(grid);
 const metric=(name,value)=>{const n=el('div',{class:'metric'});n.append(el('small',{text:name}),el('strong',{text:String(value)}));grid.append(n)};
 const score=Number(data?.similarityScore);metric('Shape similarity',Number.isFinite(score)?(score*100).toFixed(2)+'% (heuristic)':'Unavailable');
 metric('Descriptor distance',Number.isFinite(Number(data?.distance))?Number(data.distance).toFixed(6):'Unavailable');
 metric('Sphericity difference',data?.differences?.sphericity==null?'Unavailable':Number(data.differences.sphericity).toFixed(5));
 metric('Algorithm',data?.algorithm||'Unknown');
 panel.append(el('p',{class:'task-summary-note',text:'Similarity is an uncalibrated shape descriptor, not exact identity or a verified probability. Open the 3D comparison viewer to inspect both geometries.'}));
 const actions=el('div',{class:'similar-actions'});for(const id of [a,b]){const link=el('a',{href:'/objects/'+encodeURIComponent(id)+'/model?format=glb',text:'Download '+id+' (GLB)',class:'similar-download'});actions.append(link)}panel.append(actions);host.append(panel);
}
function showProvenance(data){const host=$('taskExtra');host.replaceChildren();const panel=el('section',{class:'geometry-analysis-results'});panel.append(el('h3',{text:'Blockchain source evidence'}));const grid=el('div',{class:'geometry-metrics'});panel.append(grid);
 const metric=(label,value)=>{const n=el('div',{class:'metric'});n.append(el('small',{text:label}),el('strong',{text:String(value)}));grid.append(n)};
 const name=data?.miner?.name,address=data?.miner?.address;metric('Miner',name||address||'Not available');if(name&&address)metric('Miner wallet address',address);
 metric('Object ID',data?.objectId||'Unknown');metric('Block',data?.blockHeight??'Unknown');
 metric('Geometry matches live indexer',data?.geometryMatchesLiveSource===true?'Yes':data?.error?'Unavailable':'Not confirmed');
 metric('Independent chain verification',data?.cryptographicallyVerified===true?'Verified':'Not independently verified');
 panel.append(el('p',{class:'task-summary-note',text:data?.warning||'Miner identity is sourced from indexed block metadata, not a separate identity attestation.'}));if(data?.error)panel.append(el('p',{class:'task-summary-note warning',text:String(data.error)}));host.append(panel)
}
async function run(url,opts){const data=await call(url,opts);compact(data);return data}
// Keep the 3D viewer mounted when switching tasks; never destroy it with taskExtra.replaceChildren().
function parkComparisonViewer(){
 const viewer=document.querySelector('#previewRun')?.closest('.panel');
 if(!viewer||viewer.parentElement?.id!=='taskExtra')return;
 const parking=document.querySelector('#advancedTools .legacy-content');
 if(!parking)throw Error('Comparison viewer parking container is missing.');
 parking.append(viewer);
 viewer.style.display='none';
 viewer.classList.remove('compare-panel-integrated');
}
function open(task){parkComparisonViewer();current=task;document.querySelectorAll('[data-task]').forEach(b=>b.classList.toggle('active',b.dataset.task===task));$('taskWorkspace').hidden=false;$('taskHeading').textContent=tasks[task][0];$('taskDescription').textContent=tasks[task][1];$('taskFields').replaceChildren();$('taskResult').textContent='';$('taskSummary').replaceChildren();$('taskInterpretation').hidden=true;$('taskExtra').replaceChildren();info('');if(task==='exact'){field('file','3D model file','simpleFile');button('Find exact match',async()=>{const data=await fileData('simpleFile');compact(await post('/api/v1/geometry/exact-match',data))})}
if(task==='similar'){const f=field('file','Optional model file','simpleFile');field('text','Or enter an indexed object ID','simpleId');button('Find similar models',async()=>{const d=f.files?.length?await post('/api/v1/search/by-model/v2',{...await fileData('simpleFile'),limit:10}):await call('/api/v1/objects/'+idValue('simpleId')+'/similar?limit=10');compact(d);showSimilarResults(d)})}
if(task==='analyze'){const f=field('file','Optional model file','simpleFile');field('text','Or enter an indexed object ID','simpleId');button('Analyze geometry',async()=>{const d=f.files?.length?await post('/api/v1/geometry/advanced-analyze',await fileData('simpleFile')):await call('/api/v1/objects/'+idValue('simpleId')+'/features');compact(d);showGeometryAnalysis(d)})}
if(task==='verify'){field('text','Indexed Numen object ID','simpleId');button('Verify provenance',async()=>{const d=await call('/api/v1/objects/'+idValue('simpleId')+'/provenance');compact(d);showProvenance(d)})}
if(task==='compare'){
 const viewer=document.querySelector('#previewRun')?.closest('.panel');
 if(viewer){viewer.classList.add('compare-panel-integrated');viewer.style.display='block';$('taskExtra').append(viewer)}
 const first=$('previewFirstId'),second=$('previewId');
 if(first&&!first.value)first.value='';if(second&&!second.value)second.value='';
}

$('taskWorkspace').scrollIntoView({behavior:'smooth',block:'start'});
}
// Centralized task navigation: works even after the comparison viewer is moved in the DOM.
function closeTask(){
 parkComparisonViewer();
 $('taskWorkspace').hidden=true;
 document.querySelectorAll('[data-task]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false')});
 window.scrollTo({top:0,behavior:'smooth'});
}
document.addEventListener('click',event=>{
 const close=event.target.closest?.('#taskClose');
 const tile=event.target.closest?.('[data-task]');
 if(close){event.preventDefault();event.stopImmediatePropagation();closeTask();return}
 if(tile&&document.getElementById('taskGrid')?.contains(tile)){
  event.preventDefault();event.stopImmediatePropagation();
  const task=tile.dataset.task;
  if(!Object.hasOwn(tasks,task))return;
  try{open(task);document.querySelectorAll('[data-task]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.task===task)))}
  catch(error){console.error('Task navigation failed',error);info('Unable to open task: '+error.message,true)}
 }
},true);
})();
