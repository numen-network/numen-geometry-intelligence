import { Catalog, type IndexedObject } from './catalog.ts';
export class RateLimitError extends Error { waitMs:number; constructor(waitMs:number,message='GraphQL HTTP 429'){super(message);this.waitMs=waitMs;} }
export class GraphQLClient {
  private nextAt=0; private queue=Promise.resolve();
  private url:string;private minIntervalMs:number;
  constructor(url:string,minIntervalMs=2500) {this.url=url;this.minIntervalMs=minIntervalMs;}
  request<T>(query:string,variables:Record<string,string|number>):Promise<T> {
    const task=this.queue.then(async()=>{
      const wait=Math.max(0,this.nextAt-Date.now());if(wait)await sleep(wait);
      this.nextAt=Date.now()+this.minIntervalMs;
      const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),30000);
      try {
        const r=await fetch(this.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables}),signal:ctrl.signal});
        if(r.status===429){const header=r.headers.get('retry-after');const seconds=header?Number(header):NaN;const until=header&&!Number.isFinite(seconds)?Date.parse(header)-Date.now():seconds*1000;throw new RateLimitError(Number.isFinite(until)?Math.min(300000,Math.max(5000,until)):30000);}
        if(!r.ok){const detail=(await r.text()).slice(0,1800);throw Error(`GraphQL HTTP ${r.status}: ${detail}`);}
        const json=await r.json() as {data?:T;errors?:{message:string}[]};
        if(json.errors?.length)throw Error(`GraphQL: ${json.errors[0].message}`);
        if(!json.data)throw Error('GraphQL returned no data');return json.data;
      }finally{clearTimeout(timer);}
    });
    this.queue=task.then(()=>{},()=>{});return task;
  }
}
const QUERY='query($limit: Int!, $offset: Int!) { minedObjects(orderBy: id_DESC, limit: $limit, offset: $offset) { id protocol vertexCount block { height hash timestamp finalized reward difficulty extrinsicCount eventCount author { id identityDisplay } } } }';
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export class Indexer {
  private running=false;private stopping=false;private timer?:ReturnType<typeof setTimeout>;
  private failures=0;private headTimer?:ReturnType<typeof setTimeout>;private headBusy=false;private headFailures=0;
  private catalog:Catalog;private gql:GraphQLClient;private pageSize:number;private intervalMs:number;
  constructor(catalog:Catalog,gql:GraphQLClient,pageSize=24,intervalMs=5000){this.catalog=catalog;this.gql=gql;this.pageSize=pageSize;this.intervalMs=intervalMs;}
  start(){if(this.running)return;this.running=true;void this.tick();void this.pollHead();}
  stop(){this.stopping=true;if(this.timer)clearTimeout(this.timer);if(this.headTimer)clearTimeout(this.headTimer);}
  // A separate head catch-up loop prevents a long historical backfill from
  // keeping the public Explorer hours behind the current chain tip.
  async pollHead(){
    if(this.stopping||this.headBusy)return;
    this.headBusy=true;
    let delay=Math.max(10000,Number(process.env.NUMEN_HEAD_POLL_MS)||30000);
    try{
      let offset=Math.max(0,Number(this.catalog.get('head_offset'))||0);
      // Process a bounded number of pages per poll. Persist progress across polls.
      for(let page=0;page<8&&!this.stopping;page++){
        const data=await this.gql.request<{minedObjects:IndexedObject[]}>(QUERY,{limit:this.pageSize,offset});
        const items=data.minedObjects;
        if(!Array.isArray(items))throw Error('Invalid head minedObjects response');
        if(!items.length){offset=0;break;}
        const unseen=items.filter(o=>!this.catalog.has(o.id)).length;
        this.catalog.put(items);
        this.catalog.set('head_last_success',new Date().toISOString());
        this.catalog.set('head_latest_height',String(Math.max(Number(this.catalog.get('head_latest_height'))||0,...items.map(o=>Number(o.block?.height)||0))));
        offset+=items.length;
        if(unseen===0 || items.length<this.pageSize){offset=0;break;}
      }
      this.catalog.set('head_offset',String(offset));
      this.catalog.set('head_error','');this.headFailures=0;
    }catch(e){
      this.headFailures++;
      this.catalog.set('head_error',e instanceof Error?e.message:String(e));
      delay=e instanceof RateLimitError?Math.max(e.waitMs,delay):Math.min(120000,delay*2**Math.min(this.headFailures,3));
    }finally{
      this.headBusy=false;
      if(!this.stopping){this.headTimer=setTimeout(()=>void this.pollHead(),delay);this.headTimer.unref();}
    }
  }
  async tick(){if(this.stopping)return;
    let delay=this.intervalMs;
    try {
      // Offset pagination is not a stable snapshot when new blocks arrive.
      // Repeated complete passes repair records skipped by shifting offsets.
      const offset=Math.max(0,Number(this.catalog.get('next_offset'))||0);
      const data=await this.gql.request<{minedObjects:IndexedObject[]}>(QUERY,{limit:this.pageSize,offset});
      const items=data.minedObjects;
      if(!Array.isArray(items))throw Error('Invalid minedObjects response');
      this.catalog.put(items);
      this.catalog.set('last_success',new Date().toISOString());
      this.catalog.set('error','');this.catalog.set('paused_until','');this.failures=0;
      if(items.length===0){
        // An empty page confirms the end of THIS upstream result set.
        // It does not prove that every block has been independently verified.
        this.catalog.set('complete','1');
        this.catalog.set('last_full_scan',new Date().toISOString());
        this.catalog.set('scan_pass',String((Number(this.catalog.get('scan_pass'))||0)+1));
        this.catalog.set('next_offset','0');
        delay=Math.max(60000,Number(process.env.NUMEN_INDEX_RESCAN_INTERVAL_MS)||300000);
      }else{
        // Do not stop on a short page: upstream pages can be temporarily short.
        this.catalog.set('complete','0');
        this.catalog.set('next_offset',String(offset+items.length));
      }
    }catch(e){this.failures++;
      delay=e instanceof RateLimitError?Math.max(e.waitMs,Math.min(300000,30000*2**Math.min(this.failures-1,4))):Math.min(120000,5000*2**Math.min(this.failures-1,5));
      this.catalog.set('error',e instanceof Error?e.message:String(e));this.catalog.set('paused_until',new Date(Date.now()+delay).toISOString());
      console.warn(`[Indexer] ${this.catalog.get('error')}; retry in ${Math.ceil(delay/1000)}s`);
    }
    if(!this.stopping){this.timer=setTimeout(()=>void this.tick(),delay);this.timer.unref();}
  }
}
