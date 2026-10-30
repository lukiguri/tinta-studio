import { createHash, timingSafeEqual } from 'node:crypto';

// Vercel Node.js Function. The OpenAI secret is NEVER sent to the browser.
const MODELS = new Set(['gpt-image-2.5-flare','gpt-image-2.5-sunburst']);
const QUALITIES = new Set(['low','medium','high']);
const STYLES = {
  comic: 'Expressive comic-book line art, bold outlines, clear silhouettes, lively character pose.',
  manga: 'Manga and anime-inspired black ink illustration, large expressive eyes, dynamic pose, simplified screen-tone-free detail.',
  chibi: 'Cute chibi and kawaii mascot illustration, oversized head, charming expression, simple shapes.',
  minimal: 'Minimalist black-and-white vector style, clean geometric shapes, minimal fine detail.',
  retro: 'Retro old-school tattoo flash in pure black ink, distinctive strong outlines, simplified graphic shapes.',
  engraving: 'Simplified woodcut or engraving illustration with sparse thick hatching that remains legible when tiny.',
  typographic: 'Typography-forward graphic design with small accompanying icon or illustration.',
  custom: 'Follow the visual style given by the user in the description.',
};
const LABEL_LIMIT = 100;

function reply(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.end(JSON.stringify(body));
}
function samePassword(a,b){
  const h1=createHash('sha256').update(a).digest();
  const h2=createHash('sha256').update(b).digest();
  return timingSafeEqual(h1,h2);
}
async function requestJson(req){
  if(req.body && typeof req.body==='object' && !Buffer.isBuffer(req.body))return req.body;
  if(typeof req.body==='string')return JSON.parse(req.body);
  let size=0;const chunks=[];
  for await (const chunk of req){
    size+=chunk.length;
    if(size>4_000_000)throw new Error('Solicitud demasiado grande: reduce las fotos');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function chooseImageSize(widthMm,heightMm){
  const ratio=Math.max(1/3,Math.min(3,widthMm/heightMm));
  if(ratio>=1){
    const long=ratio>1.3?1536:1024;
    const short=Math.round(long/ratio/16)*16;
    return `${long}x${Math.max(512,short)}`;
  }
  const vertical=1/ratio;
  const long=vertical>1.3?1536:1024;
  const short=Math.round(long/vertical/16)*16;
  return `${Math.max(512,short)}x${long}`;
}
function decodeImageData(value){
  if(typeof value!=='string')throw new Error('Una referencia no tiene formato válido');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if(!match)throw new Error('Se admiten imágenes PNG, JPG o WebP');
  const data=Buffer.from(match[2],'base64');
  if(data.byteLength>1_800_000)throw new Error('Una referencia es demasiado grande; reduce su resolución');
  const mime=match[1]==='jpeg'?'image/jpeg':`image/${match[1]}`;
  return {blob:new Blob([data],{type:mime}),ext:match[1]==='jpeg'?'jpg':match[1]};
}
function buildPrompt(p){
  const w=Number(p.widthMm),h=Number(p.heightMm);
  const scale=w/h;
  const mono=p.bwMode==='color'
    ? 'Prefer black ink on a clean white background. No tiny details.'
    : 'STRICT pure black #000000 ink on white #FFFFFF paper ONLY. NO colors, NO gray gradients, NO photorealistic shading, NO soft shadows. Chunky clear lines, flat high contrast. Avoid details that vanish at 203 dpi.';
  const name=String(p.labelName||'').trim();
  const doubleRound=p.shape==='round-pair';
  const layout=p.textMode==='artistic'
    ? (name ? `Integrate the following exact word/name ONCE in prominent highly readable, visually designed lettering: ${JSON.stringify(name)}. Do not add ANY other words, logos or watermarks.` : 'No text, no writing, no watermarks.')
    : (name ? (doubleRound ? 'DO NOT render any text, letters, numbers or watermarks. The app will overlay typography at the lower part of each round sticker. Leave clean white negative space in the LOWER THIRD and keep the main illustration centered in the upper 65%.' : 'DO NOT render ANY text, letters, words, numbers or watermark in the artwork. The app will later overlay exact typography separately. Keep the RIGHTMOST 44% of the image predominantly clean and uncluttered, especially around its center, to leave room for the name. Place the illustrated subject mainly in the left 55%.') : 'Do not render any text or lettering.');
  const refText=p.refine?'Use the FIRST attached image as the PREVIOUS LABEL. Refine this existing design rather than inventing a new composition. Preserve major subjects unless the instructions below require changes.':'Use attached reference photographs as visual references for the subject and art style, not as a literal photographic collage. Respect recognizable elements from the references.';
  return [
    'Produce ONE finished flat 2D ARTWORK for a tiny physical thermal label, not a photo of a label stuck to an object, not a mockup, not a sheet of stickers.',
    doubleRound ? `The ROLL BACKING is ${w} × ${h} mm with TWO circular die-cut stickers of approximately ${p.circleDiameterMm} mm each. Generate the ART FOR EXACTLY ONE ROUND STICKER on a SQUARE (1:1) canvas. The app will duplicate it in both circles. No backing rectangle, no two stickers side by side, no die-cut drawing, no guide circle. Keep all essential subjects inside the central 75% of the square; leave outer 12.5% clean white. Avoid motifs relying on square corners. This art will print at ${p.circleDiameterMm} mm diameter.` : `Target paper geometry: ${w} mm wide × ${h} mm high, ${scale.toFixed(3)}:1 aspect ratio, ${w>=h?'horizontal':'vertical'} composition. Design must fit this ratio.`,
    `Visual style: ${STYLES[p.style]||STYLES.custom}`,
    mono,
    'Strong silhouette and uncluttered negative space. Keep vital objects and faces a minimum 5% from every edge; no frames or fine border at the cutting edge. Do not add printer calibration marks.',
    layout,
    refText,
    `USER CREATIVE BRIEF (primary subject and requested details): ${String(p.description||'').slice(0,3500) || 'Create a simple distinctive icon.'}`,
    'Deliver crisp, front-facing print graphics covering the whole image area, no perspective, no margins outside the artwork, no mockup.',
  ].join('\n');
}
export default async function handler(req,res){
  const apiKey=process.env.OPENAI_API_KEY||'';
  const appPassword=process.env.APP_PASSWORD||'';
  if(!apiKey||!appPassword){return reply(res,503,{error:'Falta configurar OPENAI_API_KEY o APP_PASSWORD en el servidor.'});}
  const candidate=String(req.headers['x-app-password']||'');
  if(!candidate||!samePassword(candidate,appPassword))return reply(res,401,{error:'Contraseña de la aplicación incorrecta.'});
  if(req.method==='GET')return reply(res,200,{status:'ok'});
  if(req.method!=='POST')return reply(res,405,{error:'Método no permitido'});
  try{
    const p=await requestJson(req);
    const w=Number(p.widthMm),h=Number(p.heightMm);
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<8||h<8||w>LABEL_LIMIT||h>LABEL_LIMIT)return reply(res,400,{error:'Las medidas deben estar entre 8 y 100 mm.'});
    if(typeof p.description!=='string'||p.description.length>3500||typeof p.labelName!=='string'||p.labelName.length>55)return reply(res,400,{error:'Descripción o nombre inválidos.'});
    if(!Array.isArray(p.references)||p.references.length>3)return reply(res,400,{error:'Se admiten hasta tres fotografías.'});
    if(!MODELS.has(p.model)||!QUALITIES.has(p.quality))return reply(res,400,{error:'Modelo o calidad no disponible.'});
    if(!['editable','artistic'].includes(p.textMode))return reply(res,400,{error:'Modo de texto inválido.'});
    const shape=p.shape||'rect';
    if(!['rect','round-pair'].includes(shape))return reply(res,400,{error:'Forma de etiqueta no válida'});
    if(shape==='round-pair') {
      const d=Number(p.circleDiameterMm);
      if(!Number.isFinite(d)||d<5||d>Math.min(w,h,Math.max(w,h)/2))return reply(res,400,{error:'El diámetro no cabe en los círculos del soporte'});
    }
    const images=p.references.map(decodeImageData);
    if(p.refine){if(!p.currentImage)return reply(res,400,{error:'Falta una imagen previa para refinar.'});images.unshift(decodeImageData(p.currentImage));}
    const prompt=buildPrompt(p);
    const fields={model:p.model,prompt,quality:p.quality,size:shape==='round-pair'?'1024x1024':chooseImageSize(w,h),output_format:'webp',output_compression:85,background:'opaque',n:1};
    let url='https://api.openai.com/v1/images/generations',options;
    if(images.length){
      url='https://api.openai.com/v1/images/edits';
      const form=new FormData();
      for(const [key,value] of Object.entries(fields))form.append(key,String(value));
      images.forEach((img,i)=>form.append('image[]',img.blob,`reference-${i}.${img.ext}`));
      options={method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:form,signal:AbortSignal.timeout(165000)};
    }else{
      options={method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(fields),signal:AbortSignal.timeout(165000)};
    }
    const r=await fetch(url,options);
    const result=await r.json().catch(()=>({}));
    if(!r.ok){
      const reason=String(result?.error?.message||result?.error?.code||`HTTP ${r.status}`).slice(0,320);
      return reply(res,r.status===429?429:502,{error:`OpenAI: ${reason}`});
    }
    const b64=result?.data?.[0]?.b64_json;
    if(!b64)return reply(res,502,{error:'OpenAI no devolvió una imagen utilizable.'});
    return reply(res,200,{image:`data:image/webp;base64,${b64}`,modelLabel:p.model==='gpt-image-2.5-sunburst'?'Sunburst':'Flare'});
  }catch(e){
    if(e.name==='TimeoutError')return reply(res,504,{error:'OpenAI ha tardado demasiado en responder. Intenta una calidad inferior.'});
    if(e instanceof SyntaxError)return reply(res,400,{error:'La solicitud no es JSON válido.'});
    if(/referencia|Solicitud|Se admiten/.test(e.message))return reply(res,400,{error:e.message});
    console.error('Error generando etiqueta:',e?.message||e);
    return reply(res,500,{error:'Error interno de generación. Comprueba el despliegue y la conexión API.'});
  }
}
// Named exports allow pure unit tests without external API requests.
export {chooseImageSize,buildPrompt};
