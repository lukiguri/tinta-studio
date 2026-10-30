import test from 'node:test';
import assert from 'node:assert/strict';
import {mmPixels,roundPairLayout} from '../public/geometry.js';
import {pngWithDpi} from '../public/png-dpi.js';

// Imagen PNG mínima auténtica (1×1 px), sin metadatos de resolución.
const minimalPNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const u32=(bytes,at)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(at,false);
function findChunks(bytes){
  let at=8;const result=[];
  while(at+12<=bytes.length){
    const len=u32(bytes,at),type=String.fromCharCode(...bytes.subarray(at+4,at+8));
    result.push({type,at,len});at+=12+len;
    if(type==='IEND')break;
  }
  return result;
}
test('300 ppp: tamaños de los dos soportes usados en Tinta Studio',()=>{
  assert.equal(mmPixels(30,300),354);
  assert.equal(mmPixels(12,300),142);
  assert.equal(mmPixels(28,300),331);
  assert.equal(mmPixels(14,300),165);
  assert.equal(mmPixels(13,300),154);
});
test('a 300 ppp los dos troqueles de 13 mm caben sobre 331 × 165 píxeles',()=>{
  const cs=roundPairLayout(331,165,28,14,13);
  assert.equal(cs.length,2);
  assert.ok(cs.every(c=>c.x-c.r>=0&&c.x+c.r<=331&&c.y-c.r>=0&&c.y+c.r<=165));
  assert.ok(cs[0].x+cs[0].r <= cs[1].x-cs[1].r);
});
test('el PNG incluye un solo pHYs con resolución 300 ppp (11811 píxeles/m)',async()=>{
  const src=new Blob([Buffer.from(minimalPNG,'base64')],{type:'image/png'});
  const encoded=new Uint8Array(await (await pngWithDpi(src,300)).arrayBuffer());
  const chunks=findChunks(encoded);
  assert.deepEqual(chunks.map(x=>x.type),['IHDR','pHYs','IDAT','IEND']);
  const phys=chunks[1];
  assert.equal(phys.len,9);
  assert.equal(u32(encoded,phys.at+8),11811);
  assert.equal(u32(encoded,phys.at+12),11811);
  assert.equal(encoded[phys.at+16],1);
});
test('modificar la resolución del PNG sustituye el chunk anterior y no duplica pHYs',async()=>{
  const src=new Blob([Buffer.from(minimalPNG,'base64')],{type:'image/png'});
  const with300=await pngWithDpi(src,300);
  const with203=await pngWithDpi(with300,203);
  const encoded=new Uint8Array(await with203.arrayBuffer());
  const phys=findChunks(encoded).filter(x=>x.type==='pHYs');
  assert.equal(phys.length,1);
  assert.equal(u32(encoded,phys[0].at+8),7992);
});
test('el PNG rechaza densidades o archivos inválidos',async()=>{
  const invalid=new Blob(['no es un PNG'],{type:'image/png'});
  await assert.rejects(pngWithDpi(invalid,300),/PNG válido/);
  await assert.rejects(pngWithDpi(new Blob([Buffer.from(minimalPNG,'base64')]),0),/Densidad/);
});
