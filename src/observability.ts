export class Metrics{
 private started=Date.now();private requests=0;private errors=0;private paths=new Map<string,number>();private latencies:number[]=[];
 record(path:string,status:number,durationMs:number){this.requests++;if(status>=400)this.errors++;const key=path.replace(/\/objects\/[^/]+/g,'/objects/:id');this.paths.set(key,(this.paths.get(key)||0)+1);this.latencies.push(durationMs);if(this.latencies.length>1000)this.latencies.shift();}
 snapshot(){const sorted=[...this.latencies].sort((a,b)=>a-b),p=(x:number)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(x*(sorted.length-1)))]:0;return {uptimeSeconds:Math.floor((Date.now()-this.started)/1000),requests:this.requests,errors:this.errors,errorRate:this.requests?this.errors/this.requests:0,latencyMs:{p50:p(.5),p95:p(.95),p99:p(.99)},routes:Object.fromEntries(this.paths)};}
}
