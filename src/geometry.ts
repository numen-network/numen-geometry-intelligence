import { gunzipSync } from 'node:zlib';

export interface MinedObject { id: string; protocol: string; vertexCount?: number | null; vertices: string }
export interface MeshTopology { id: string; faceCount?: number | null; faces: string }
export interface Mesh { id: string; protocol: string; vertexCount: number; faceCount: number; vertices: Float64Array; faces: Uint16Array }
export type ModelFormat = 'obj' | 'stl' | 'glb';
export const FORMATS: ModelFormat[] = ['obj', 'stl', 'glb'];
export const safeId = (id: string) => /^[A-Za-z0-9_-]{1,100}$/.test(id);

function decompress(hex: string): Buffer {
  if (typeof hex !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(hex)) throw new Error('Expected 0x-prefixed hex bytes');
  if (hex.length > 10_000_002) throw new Error('Compressed geometry too large');
  const input = Buffer.from(hex.slice(2), 'hex');
  if (input[0] !== 0x1f || input[1] !== 0x8b || input[2] !== 0x08) throw new Error('Not gzip data');
  return gunzipSync(input, { maxOutputLength: 30_000_000 });
}

export function reconstruct(obj: MinedObject, topo: MeshTopology): Mesh {
  if (!safeId(obj.id) || !safeId(obj.protocol) || obj.protocol !== topo.id) throw new Error('Object/topology mismatch');
  // Explorer reads the gzip payloads directly; count fields may be absent from GraphQL.
  // Derive the authoritative sizes from the decoded binary arrays.
  const vr = decompress(obj.vertices), fr = decompress(topo.faces);
  if (vr.length % 24 !== 0 || fr.length % 6 !== 0) throw new Error(`Invalid geometry byte lengths: vertices=${vr.length}, faces=${fr.length}`);
  const vertexCount = vr.length / 24, faceCount = fr.length / 6;
  if (vertexCount < 3 || vertexCount > 65536 || faceCount < 1 || faceCount > 1_000_000) throw new Error(`Invalid geometry counts: vertices=${vertexCount}, faces=${faceCount}`);
  if (obj.vertexCount != null && Number(obj.vertexCount) !== vertexCount) throw new Error(`Vertex count mismatch: GraphQL=${obj.vertexCount}, decoded=${vertexCount}`);
  if (topo.faceCount != null && Number(topo.faceCount) !== faceCount) throw new Error(`Face count mismatch: GraphQL=${topo.faceCount}, decoded=${faceCount}`);
  const vertices = new Float64Array(vertexCount * 3);
  const faces = new Uint16Array(faceCount * 3);
  for (let i = 0; i < vertices.length; i++) {
    vertices[i] = vr.readDoubleLE(i * 8);
    if (!Number.isFinite(vertices[i])) throw new Error('Non-finite vertex');
  }
  for (let i = 0; i < faces.length; i++) {
    faces[i] = fr.readUInt16LE(i * 2);
    if (faces[i] >= vertexCount) throw new Error('Face index out of range');
  }
  return { id: obj.id, protocol: obj.protocol, vertexCount, faceCount, vertices, faces };
}

export function meshInfo(mesh: Mesh) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertices.length; i += 3) for (let a = 0; a < 3; a++) {
    const v = mesh.vertices[i + a]; lo[a] = Math.min(lo[a], v); hi[a] = Math.max(hi[a], v);
  }
  const edgeCounts = new Map<string, number>();
  for (let i = 0; i < mesh.faces.length; i += 3) {
    const t = [mesh.faces[i], mesh.faces[i+1], mesh.faces[i+2]];
    for (let j = 0; j < 3; j++) {
      const a = Math.min(t[j], t[(j+1)%3]), b = Math.max(t[j], t[(j+1)%3]);
      const key = `${a}:${b}`; edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  return { id: mesh.id, protocol: mesh.protocol, vertexCount: mesh.vertexCount, faceCount: mesh.faceCount,
    watertight: [...edgeCounts.values()].every(n => n === 2), bounds: [lo, hi] };
}

export function toOBJ(mesh: Mesh): Buffer {
  const lines = [`# Numen PoScan ${mesh.id}`];
  for (let i = 0; i < mesh.vertices.length; i += 3) lines.push(`v ${mesh.vertices[i]} ${mesh.vertices[i+1]} ${mesh.vertices[i+2]}`);
  for (let i = 0; i < mesh.faces.length; i += 3) lines.push(`f ${mesh.faces[i]+1} ${mesh.faces[i+1]+1} ${mesh.faces[i+2]+1}`);
  return Buffer.from(lines.join('\n') + '\n', 'utf8');
}

export function toSTL(mesh: Mesh): Buffer {
  const out = Buffer.alloc(84 + mesh.faceCount * 50);
  out.write(`Numen PoScan ${mesh.id}`, 0, 80, 'ascii'); out.writeUInt32LE(mesh.faceCount, 80);
  for (let i = 0; i < mesh.faceCount; i++) {
    const ix = i * 3, p = i * 50 + 84;
    const a = mesh.faces[ix] * 3, b = mesh.faces[ix+1] * 3, c = mesh.faces[ix+2] * 3;
    const v = mesh.vertices;
    const ux = v[b]-v[a], uy = v[b+1]-v[a+1], uz = v[b+2]-v[a+2];
    const wx = v[c]-v[a], wy = v[c+1]-v[a+1], wz = v[c+2]-v[a+2];
    let nx = uy*wz-uz*wy, ny = uz*wx-ux*wz, nz = ux*wy-uy*wx;
    const len = Math.hypot(nx, ny, nz); if (len) { nx/=len; ny/=len; nz/=len; }
    out.writeFloatLE(nx, p); out.writeFloatLE(ny, p+4); out.writeFloatLE(nz, p+8);
    for (let j = 0; j < 3; j++) {
      const idx = mesh.faces[ix+j] * 3, off = p+12+j*12;
      out.writeFloatLE(v[idx], off); out.writeFloatLE(v[idx+1], off+4); out.writeFloatLE(v[idx+2], off+8);
    }
  }
  return out;
}

function pad4(buf: Buffer, pad = 0): Buffer {
  const length = Math.ceil(buf.length / 4) * 4;
  if (length === buf.length) return buf;
  const out = Buffer.alloc(length, pad); buf.copy(out); return out;
}

export function toGLB(mesh: Mesh): Buffer {
  const pos = Buffer.alloc(mesh.vertexCount * 12), indices = Buffer.alloc(mesh.faceCount * 3 * 2);
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (let i=0; i<mesh.vertexCount; i++) for(let j=0;j<3;j++) {
    const v = Math.fround(mesh.vertices[i*3+j]);
    if (!Number.isFinite(v)) throw new Error('Vertex cannot be represented as float32');
    pos.writeFloatLE(v, i*12+j*4); min[j]=Math.min(min[j],v); max[j]=Math.max(max[j],v);
  }
  for(let i=0;i<mesh.faces.length;i++) indices.writeUInt16LE(mesh.faces[i],i*2);
  const positions = pad4(pos), indexData = pad4(indices);
  const bin = Buffer.concat([positions, indexData]);
  const gltf = {
    asset: {version:'2.0', generator:'Numen Geometry Intelligence'},
    scenes:[{nodes:[0]}], scene:0, nodes:[{mesh:0}], meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
    buffers:[{byteLength:bin.length}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:pos.length,target:34962},{buffer:0,byteOffset:positions.length,byteLength:indices.length,target:34963}],
    accessors:[{bufferView:0,componentType:5126,count:mesh.vertexCount,type:'VEC3',min,max},
               {bufferView:1,componentType:5123,count:mesh.faces.length,type:'SCALAR'}]
  };
  const json = pad4(Buffer.from(JSON.stringify(gltf)), 0x20);
  const out = Buffer.alloc(12+8+json.length+8+bin.length);
  out.writeUInt32LE(0x46546c67,0); out.writeUInt32LE(2,4); out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(json.length,12); out.write('JSON',16); json.copy(out,20);
  const at=20+json.length; out.writeUInt32LE(bin.length,at); out.write('BIN\0',at+4,'ascii'); bin.copy(out,at+8);
  return out;
}
export function exportMesh(mesh: Mesh, format: ModelFormat): Buffer {
  if(format==='obj') return toOBJ(mesh);
  if(format==='stl') return toSTL(mesh);
  if(format==='glb') return toGLB(mesh);
  throw new Error('Unsupported format');
}
