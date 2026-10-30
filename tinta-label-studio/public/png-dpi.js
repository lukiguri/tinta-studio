/**
 * Inserta el chunk estándar PNG pHYs con la densidad física solicitada.
 * No cambia la resolución de la impresora; conserva la escala al reutilizar el PNG.
 * Evita chunks pHYs duplicados que podrían introducir los navegadores.
 */
const PNG_MAGIC=[137,80,78,71,13,10,26,10];
const encoder=new TextEncoder();

function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){
    crc^=byte;
    for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function writeU32(bytes,offset,n){new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setUint32(offset,n,false);}
function readU32(bytes,offset){return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(offset,false);}
function chunkType(bytes,offset){return String.fromCharCode(...bytes.subarray(offset+4,offset+8));}
function makePhysicalChunk(dpi){
  const ppm=Math.round(dpi/0.0254);
  const bytes=new Uint8Array(21);
  writeU32(bytes,0,9);
  bytes.set(encoder.encode('pHYs'),4);
  writeU32(bytes,8,ppm);
  writeU32(bytes,12,ppm);
  bytes[16]=1; // unidad: metros
  writeU32(bytes,17,crc32(bytes.subarray(4,17)));
  return bytes;
}
export async function pngWithDpi(pngBlob,dpi){
  if(!Number.isFinite(Number(dpi))||dpi<72||dpi>2400)throw new RangeError('Densidad de PNG no válida');
  const src=new Uint8Array(await pngBlob.arrayBuffer());
  if(src.length<33||!PNG_MAGIC.every((value,i)=>src[i]===value))throw new Error('Los datos no son un PNG válido');
  const parts=[src.subarray(0,8)];
  let offset=8,seenHeader=false,seenEnd=false;
  while(offset+12<=src.length){
    const length=readU32(src,offset);
    const end=offset+12+length;
    if(end>src.length)throw new Error('PNG incompleto');
    const type=chunkType(src,offset);
    if(!seenHeader && type!=='IHDR')throw new Error('Falta encabezado de PNG');
    if(type==='IHDR'){
      if(seenHeader||length!==13)throw new Error('Encabezado PNG inválido');
      seenHeader=true;
      parts.push(src.subarray(offset,end));
      parts.push(makePhysicalChunk(Number(dpi)));
    }else if(type!=='pHYs'){
      parts.push(src.subarray(offset,end));
    }
    offset=end;
    if(type==='IEND'){seenEnd=true;break;}
  }
  if(!seenHeader||!seenEnd)throw new Error('PNG incompleto');
  return new Blob(parts,{type:'image/png'});
}
