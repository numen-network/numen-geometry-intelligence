import type {IndexedObject} from './catalog.ts';

/** Resolve a user-entered identifier without treating an address as an object ID. */
export function classifyObjectQuery(raw:string):'object'|'block'|'address'|'search'|'empty'{
 const q=raw.trim();
 if(!q)return 'empty';
 if(/^\d{10}-[A-Za-z0-9_-]+$/.test(q))return 'object';
 if(/^(?:block[-\s#]*)?\d+$/i.test(q))return 'block';
 if(/^0x[a-fA-F0-9]{40}$/.test(q))return 'address';
 return 'search';
}
export function normalizeObjectQuery(raw:string){
 const kind=classifyObjectQuery(raw);const query=kind==='block'?raw.trim().replace(/^block[-\s#]*/i,''):raw.trim();
 return {kind,query};
}
export function exactBlockMatches(items:IndexedObject[],height:number){return items.filter(x=>Number(x.block?.height)===height);}
