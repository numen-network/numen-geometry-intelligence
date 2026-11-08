import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type IndexedObject = { id:string; blockchainObjectId?:string|null; protocol?:string; vertexCount?:number; block?: {height?:number;timestamp?:string;hash?:string;reward?:string;difficulty?:string;finalized?:boolean;extrinsicCount?:number;eventCount?:number;author?:{id?:string;identityDisplay?:string;username?:string}} };
export class Catalog {
  private db:DatabaseSync;
  constructor(path:string) {
    mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, height INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL, indexed_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS objects_newest ON objects(height DESC,id DESC);
      CREATE INDEX IF NOT EXISTS objects_miner ON objects(json_extract(payload,'$.block.author.id'));
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS geometry_features (id TEXT PRIMARY KEY, algorithm TEXT NOT NULL, payload TEXT NOT NULL, computed_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS geometry_features_algorithm ON geometry_features(algorithm);
      CREATE TABLE IF NOT EXISTS geometry_features_v2 (id TEXT PRIMARY KEY, payload TEXT NOT NULL, computed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS geometry_v2_failures (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, retry_at INTEGER NOT NULL, error TEXT NOT NULL);`);
    // Enrich previously indexed rows with miner metadata without deleting the database.
    if (this.get('schema_version','0') !== '8') {
      this.set('next_offset','0'); this.set('complete','0'); this.set('schema_version','8');
    }
  }
  put(items:IndexedObject[]) {
    const stmt=this.db.prepare('INSERT INTO objects(id,height,payload,indexed_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET height=excluded.height,payload=excluded.payload,indexed_at=excluded.indexed_at');
    this.db.exec('BEGIN');
    try { for(const o of items) if(typeof o.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(o.id)) stmt.run(o.id,Number(o.block?.height)||0,JSON.stringify(o),Date.now()); this.db.exec('COMMIT'); }
    catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  putFeatures(f:{id:string;algorithm:string}) {this.db.prepare('INSERT INTO geometry_features(id,algorithm,payload,computed_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET algorithm=excluded.algorithm,payload=excluded.payload,computed_at=excluded.computed_at').run(f.id,f.algorithm,JSON.stringify(f),Date.now());}
  getFeatures(id:string):unknown|null {const r=this.db.prepare('SELECT payload FROM geometry_features WHERE id=?').get(id) as {payload:string}|undefined;return r?JSON.parse(r.payload):null;}
  featureCount(algorithm:string) {return Number((this.db.prepare('SELECT COUNT(*) n FROM geometry_features WHERE algorithm=? AND id IN (SELECT id FROM objects)').get(algorithm) as {n:number}).n);}
  featureCandidates(algorithm:string,excludeId:string) {return (this.db.prepare('SELECT f.payload FROM geometry_features f INNER JOIN objects o ON o.id=f.id WHERE f.algorithm=? AND f.id<>?').all(algorithm,excludeId) as {payload:string}[]).map(r=>JSON.parse(r.payload));}
  unanalyzedIds(algorithm:string,limit=1,offset=0) {return (this.db.prepare('SELECT o.id FROM objects o LEFT JOIN geometry_features f ON f.id=o.id AND f.algorithm=? WHERE f.id IS NULL ORDER BY o.height DESC,o.id DESC LIMIT ? OFFSET ?').all(algorithm,limit,offset) as {id:string}[]).map(r=>r.id);}
  ids(limit=100000) {return (this.db.prepare('SELECT id FROM objects ORDER BY height DESC,id DESC LIMIT ?').all(limit) as {id:string}[]).map(r=>r.id);}
  putFeaturesV2(f:{id:string;algorithm:string}) {this.db.prepare('INSERT INTO geometry_features_v2(id,payload,computed_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,computed_at=excluded.computed_at').run(f.id,JSON.stringify(f),Date.now());this.db.prepare('DELETE FROM geometry_v2_failures WHERE id=?').run(f.id);}
  getFeaturesV2(id:string):unknown|null {const r=this.db.prepare('SELECT payload FROM geometry_features_v2 WHERE id=?').get(id) as {payload:string}|undefined;return r?JSON.parse(r.payload):null;}
  v2Count() {return Number((this.db.prepare('SELECT COUNT(*) n FROM geometry_features_v2 WHERE id IN (SELECT id FROM objects)').get() as {n:number}).n);}
  v2Candidates() {return (this.db.prepare('SELECT f.payload FROM geometry_features_v2 f JOIN objects o ON o.id=f.id').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
  unanalyzedV2(limit=20) {return (this.db.prepare(`SELECT o.id FROM objects o LEFT JOIN geometry_features_v2 f ON f.id=o.id LEFT JOIN geometry_v2_failures e ON e.id=o.id WHERE f.id IS NULL AND (e.retry_at IS NULL OR e.retry_at<=?) ORDER BY o.height DESC,o.id DESC LIMIT ?`).all(Date.now(),limit) as {id:string}[]).map(r=>r.id);}
  recordV2Failure(id:string,error:string){const prior=this.db.prepare('SELECT attempts FROM geometry_v2_failures WHERE id=?').get(id) as {attempts:number}|undefined;const attempts=(prior?.attempts??0)+1;const delay=Math.min(3600000,30000*2**Math.min(attempts-1,7));this.db.prepare('INSERT INTO geometry_v2_failures(id,attempts,retry_at,error) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,retry_at=excluded.retry_at,error=excluded.error').run(id,attempts,Date.now()+delay,error.slice(0,500));}
  v2FailureStatus(){const r=this.db.prepare('SELECT COUNT(*) total, SUM(CASE WHEN retry_at>? THEN 1 ELSE 0 END) cooling FROM geometry_v2_failures WHERE id IN (SELECT id FROM objects)').get(Date.now()) as {total:number;cooling:number|null};return {failedObjects:r.total,retryCooldown:r.cooling??0};}

  resolveId(value:string):string|null {
    const key=value.trim();
    if(this.has(key))return key;
    if(!/^0x[0-9a-fA-F]{64}$/.test(key))return null;
    const rows=this.db.prepare("SELECT id FROM objects WHERE lower(json_extract(payload,'$.blockchainObjectId'))=lower(?) LIMIT 2").all(key) as {id:string}[];
    return rows.length===1?rows[0].id:null;
  }
  has(id:string) {return !!this.db.prepare('SELECT 1 FROM objects WHERE id=?').get(id);}
  get(key:string, fallback='0') {return (this.db.prepare('SELECT value FROM state WHERE key=?').get(key) as {value:string}|undefined)?.value??fallback;}
  set(key:string,value:string) {this.db.prepare('INSERT INTO state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}
  list(limit:number,offset:number,search='') {
    const q=search.trim().slice(0,150);
    const numeric=/^#?\d+$/.test(q)?Number(q.replace(/^#/,'')):null;
    const like='%'+q.replace(/[\%_]/g,'\\$&')+'%';
    const where=q?`WHERE (id LIKE ? ESCAPE '\\' COLLATE NOCASE OR CAST(height AS TEXT)=? OR json_extract(payload,'$.block.author.id') LIKE ? ESCAPE '\\' COLLATE NOCASE OR json_extract(payload,'$.block.author.identityDisplay') LIKE ? ESCAPE '\\' COLLATE NOCASE OR json_extract(payload,'$.block.author.username') LIKE ? ESCAPE '\\' COLLATE NOCASE OR CAST(height AS TEXT)=? OR lower(json_extract(payload,'$.blockchainObjectId'))=lower(?))`:'';
    const args=q?[like,q,like,like,like,numeric===null?'':String(numeric),q]:[];
    const rows=this.db.prepare(`SELECT payload FROM objects ${where} ORDER BY height DESC,id DESC LIMIT ? OFFSET ?`).all(...args,limit,offset) as {payload:string}[];
    const total=Number((this.db.prepare(`SELECT COUNT(*) AS n FROM objects ${where}`).get(...args) as {n:number}).n);
    return {items:rows.map(r=>JSON.parse(r.payload)),total,limit,offset,search:q,page:Math.floor(offset/limit)+1,totalPages:Math.ceil(total/limit),nextOffset:offset+rows.length<total?offset+rows.length:null,order:'newest_first',source:'local_sqlite',sync:{backfillComplete:this.get('complete')==='1',lastSuccess:this.get('last_success',''),error:this.get('error',''),remoteTotal:Number(this.get('remote_total','0'))}};
  }
  status(){return {indexed:Number((this.db.prepare('SELECT COUNT(*) AS n FROM objects').get() as {n:number}).n),nextOffset:Number(this.get('next_offset')),remoteTotal:Number(this.get('remote_total')),backfillComplete:this.get('complete')==='1',lastSuccess:this.get('last_success',''),error:this.get('error',''),pausedUntil:this.get('paused_until',''),scanPass:Number(this.get('scan_pass')),lastFullScan:this.get('last_full_scan',''),scanMode:'historical_backfill_plus_live_head',headOffset:Number(this.get('head_offset')),headLatestHeight:Number(this.get('head_latest_height')),headLastSuccess:this.get('head_last_success',''),headError:this.get('head_error',''),localLatestHeight:Number((this.db.prepare('SELECT MAX(height) AS h FROM objects').get() as {h:number|null}).h??0)};}
  close(){this.db.close();}
}
