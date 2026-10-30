import { roundPairLayout, validCircleDiameter, mmPixels } from './geometry.js';
import { pngWithDpi } from './png-dpi.js';
const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  printer: 'NIIMBOT D11-H', widthMm: 30, heightMm: 12, dpi: 300, shape: 'rect', circleDiameterMm: 13,
  pairTextMode: 'duplicate', secondLabelName: '',
  labelName: 'POL', description: 'Un personaje en pose desenfadada junto a un gato y un pequeño AirTag. Estilo ilustración adorable y expresiva, con líneas contundentes.',
  style: 'comic', model: 'gpt-image-2.5-flare', quality: 'medium', textMode: 'editable',
  bwMode: 'solid', fontFamily: 'heavy', fontSize: 43,
  designTitle: 'POL · gato y AirTag', textX: .76, textY: .53,
  designCategory:'Sin categoría',designTags:'',variantCount:1,layers:[],
  artScale:1,artRotation:0,artOffsetX:0,artOffsetY:0,refineHistory:[],
};
let state = {...DEFAULTS, references: [], layers: [], refineHistory: [], variants: [], imageData: null, imageElement: null, loadedId: null};
let dbPromise;
let generationInProgress = false;
let toastTimer;
let selectedLayerId=null;
const layerImageCache=new Map();
const FONT_MAP = {
  heavy: '900 1px Arial, Helvetica, sans-serif',
  rounded: '900 1px "Trebuchet MS", Arial, sans-serif',
  serif: '900 1px Georgia, "Times New Roman", serif',
  mono: '900 1px "Courier New", monospace',
};
const INPUTS = ['printer','widthMm','heightMm','dpi','shape','circleDiameterMm','pairTextMode','secondLabelName','labelName','description','style','model','quality','bwMode','fontFamily','fontSize','designTitle','designCategory','designTags','variantCount'];
const MIME = ['image/png','image/jpeg','image/webp'];
const PRINTER_DPI = Object.freeze({'NIIMBOT D11-H':300,'NIIMBOT D11':203,'NIIMBOT D110':203});

function toast(message, error=false) {
  clearTimeout(toastTimer);
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3500);
}
function generationMessage(message, type='') {
  const el = $('generationMessage');
  el.textContent = message;
  el.className = 'generation-message' + (type ? ` ${type}` : '');
}
let temporaryPassword='';
function getPassword() {
  try{return temporaryPassword || sessionStorage.getItem('tinta-password') || localStorage.getItem('tinta-password') || '';}
  catch{return temporaryPassword;}
}
function savePassword(value) {
  temporaryPassword=value;
  try{
    sessionStorage.setItem('tinta-password',value);
    if($('rememberPassword').checked) localStorage.setItem('tinta-password',value);
    else localStorage.removeItem('tinta-password');
  }catch{ /* Navegadores que bloquean almacenamiento: conservar en memoria durante la sesión. */ }
}
function validateSize(w,h) { return Number.isFinite(w)&&Number.isFinite(h)&&w>=8&&h>=8&&w<=100&&h<=100; }
function humanSize(){return `${state.widthMm}×${state.heightMm} mm`}
function safeFilename(value) {
  return (value||'etiqueta').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60) || 'etiqueta';
}
function updateTab(which) {
  document.querySelectorAll('.tab').forEach(el=> {
    const active = el.dataset.tab===which; el.classList.toggle('active',active);
    if(active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  });
  ['create','library','settings'].forEach(name => {
    const el = $(`${name}Page`), active = name===which;
    el.hidden=!active; el.classList.toggle('active',active);
  });
  window.scrollTo({top:0,behavior:'smooth'});
  if (which==='library') renderLibrary();
  if (which==='settings') checkConnection();
}
function readForm() {
  INPUTS.forEach(key=>{
    const el=$(key);
    if(!el) return;
    state[key] = ['widthMm','heightMm','dpi','fontSize','circleDiameterMm','variantCount'].includes(key) ? Number(el.value) : el.value;
  });
  state.textMode=document.querySelector('input[name="textMode"]:checked').value;
  updateMeasurements();
  renderPreview();
}
function fillForm() {
  INPUTS.forEach(key=>{ if($(key)) $(key).value=state[key]??''; });
  const radio=document.querySelector(`input[name="textMode"][value="${state.textMode}"]`);
  if(radio) radio.checked=true;
  renderReferences();
  updateMeasurements();
  renderPreview();
}
function updateMeasurements(){
  const w=Number(state.widthMm),h=Number(state.heightMm),dpi=Number(state.dpi);
  const valid=validateSize(w,h);
  $('sizePixels').textContent=valid ? `${mmPixels(w,dpi)} × ${mmPixels(h,dpi)} px · ${dpi} ppp` : 'Medidas entre 8 y 100 mm';
  $('displayWidth').textContent=valid ? w : '—';
  $('displayHeight').textContent=valid ? h : '—';
  $('paperOrientation').textContent = w>=h ? 'HORIZONTAL' : 'VERTICAL';
  document.querySelectorAll('.size-chip').forEach(chip=>chip.classList.toggle('selected',Number(chip.dataset.width)===w&&Number(chip.dataset.height)===h&&(chip.dataset.shape||'rect')===state.shape));
  const round=state.shape==='round-pair';
  $('roundSettings').hidden=!round;
  $('roundTextSettings').hidden=!round;
  $('secondTextField').hidden=!round||state.pairTextMode!=='alternate';
  $('secondLabelName').disabled=state.textMode!=='editable';
  $('secondTextHint').hidden=state.textMode==='editable';
  const diameterValid=validCircleDiameter(w,h,Number(state.circleDiameterMm));
  $('roundInfo').textContent=round ? (diameterValid?`Dos círculos de Ø ${state.circleDiameterMm} mm sobre soporte ${w} × ${h} mm · ID de rollo 10047`:'El diámetro debe caber en los dos círculos, sin solaparlos.') : '';
  $('roundInfo').classList.toggle('bad-size',round&&!diameterValid);
  $('exportSingleButton').hidden=!round;
  const nativeDpi=PRINTER_DPI[state.printer];
  $('printerDpiHint').textContent = nativeDpi ? `Resolución declarada para ${state.printer}: ${nativeDpi} ppp.${dpi !== nativeDpi ? ' Tu exportación está configurada a '+dpi+' ppp; eso no aumenta la resolución física.' : ''}` : 'Comprueba la resolución real de tu modelo. Este selector cambia el tamaño del PNG, no la impresora.';
  $('fontSizeReadout').textContent=`${state.fontSize}%`;
  $('textTools').hidden=state.textMode!=='editable';
  return valid;
}
function createContext(canvas, w, h) {
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d', {willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  return ctx;
}
function fontSpec(px){
  const desc = FONT_MAP[state.fontFamily]||FONT_MAP.heavy;
  return desc.replace('1px',`${Math.max(1,px)}px`);
}
function drawRoundPair(ctx, w, h, {preview=false, previewGuides=false}={}) {
  const cells=roundPairLayout(w,h,Number(state.widthMm),Number(state.heightMm),Number(state.circleDiameterMm));
  ctx.fillStyle=preview?'#e8eced':'#fff';ctx.fillRect(0,0,w,h);
  const img=state.imageElement;
  const inchScale=Math.min(w/Number(state.widthMm),h/Number(state.heightMm));
  const safetyPx=Math.max(.6*inchScale,3);
  for(const [idx,c] of cells.entries()){
    ctx.save();ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);ctx.clip();
    ctx.fillStyle='#fff';ctx.fillRect(c.x-c.r,c.y-c.r,2*c.r,2*c.r);
    if(img?.naturalWidth){
      // La IA crea un dibujo cuadrado para UN círculo; el lienzo lo coloca por duplicado.
      const side=c.r*2;
      const scale=Math.max(side/img.naturalWidth,side/img.naturalHeight);
      const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;
      ctx.save();
      ctx.translate(c.x+Number(state.artOffsetX||0)*side*.35,c.y+Number(state.artOffsetY||0)*side*.35);
      ctx.rotate(Number(state.artRotation||0)*Math.PI/180);
      ctx.scale(Number(state.artScale||1),Number(state.artScale||1));
      ctx.drawImage(img,-iw/2,-ih/2,iw,ih);
      ctx.restore();
    }
    const label=idx===1 && state.pairTextMode==='alternate' && state.textMode==='editable' ? String(state.secondLabelName||'').trim() : String(state.labelName||'').trim();
    if(state.textMode==='editable'&&label){
      const rSafe=Math.max(1,c.r-safetyPx);
      const normY=Math.max(.50,Math.min(.80, Number.isFinite(state.textY)?state.textY:.76));
      const y=c.y + (normY-.5)*2*c.r;
      const chord=Math.sqrt(Math.max(1,rSafe*rSafe-(y-c.y)*(y-c.y)))*2;
      let px=Math.min(2*c.r*(state.fontSize/100)*.45,c.r*.44);
      px=Math.max(1,px);
      ctx.font=fontSpec(px);
      const maxTextWidth=Math.max(1,chord*.86);
      const measured=ctx.measureText(label).width;
      if(measured>maxTextWidth){px*=maxTextWidth/measured;ctx.font=fontSpec(px);}
      // Mantener el texto dentro del círculo independientemente del tamaño del contenido.
      const x=c.x+Math.max(-.12,Math.min(.12,Number(state.textX??.5)-.5))*2*c.r;
      ctx.textBaseline='middle';ctx.textAlign='center';ctx.lineJoin='round';
      ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,px*.13);ctx.strokeText(label,x,y);
      ctx.fillStyle='#000';ctx.fillText(label,x,y);
    }
    drawExtraLayers(ctx,c.x-c.r,c.y-c.r,c.r*2,c.r*2,preview);
    ctx.restore();
    if(preview){
      ctx.save();ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);
      ctx.strokeStyle='#87949b';ctx.lineWidth=Math.max(1,Math.min(w,h)*.002);ctx.stroke();
      if(previewGuides){
        ctx.beginPath();ctx.arc(c.x,c.y,Math.max(0,c.r-safetyPx),0,2*Math.PI);
        ctx.setLineDash([Math.max(3,safetyPx*.6),Math.max(3,safetyPx*.4)]);
        ctx.strokeStyle='#ef744c';ctx.lineWidth=Math.max(1,Math.min(w,h)*.004);ctx.stroke();
      }
      ctx.restore();
    }
  }
  return ctx;
}
function drawComposition(canvas,w,h,{preview=false,previewGuides=false}={}) {
  const ctx=createContext(canvas,w,h);
  if(state.shape==='round-pair')return drawRoundPair(ctx,w,h,{preview,previewGuides});
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
  const img=state.imageElement;
  if(img?.naturalWidth){
    // Cover the label while preserving proportions; generated ratios normally match the paper.
    const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight);
    const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;
    ctx.save();
    ctx.translate(w/2+Number(state.artOffsetX||0)*w*.35,h/2+Number(state.artOffsetY||0)*h*.35);
    ctx.rotate(Number(state.artRotation||0)*Math.PI/180);
    ctx.scale(Number(state.artScale||1),Number(state.artScale||1));
    ctx.drawImage(img,-iw/2,-ih/2,iw,ih);
    ctx.restore();
  }
  if(state.textMode==='editable'&&state.labelName.trim()){
    const margin=Math.min(w,h)*.065;
    const namedArea=img?.naturalWidth ? w*.44 : w*.90;
    const maxWidth=Math.max(16, namedArea-margin);
    let px=h*(state.fontSize/100);
    px=Math.min(px,h*.8);
    const text=state.labelName.trim();
    ctx.font=fontSpec(px);
    const measured=ctx.measureText(text).width;
    if(measured>maxWidth) {px *= maxWidth/measured; ctx.font=fontSpec(px);}
    ctx.textBaseline='middle';ctx.textAlign='center';ctx.lineJoin='round';
    const x=img?.naturalWidth ? Math.max(w*.55,Math.min(w-margin-px*.1,w*state.textX)) : w*.5;
    const y=Math.min(h-margin-px*.20,Math.max(margin+px*.20,h*state.textY));
    ctx.strokeStyle='white';ctx.lineWidth=Math.max(2,px*.11);ctx.strokeText(text,x,y);
    ctx.fillStyle='#0a0a0a';ctx.fillText(text,x,y);
  }
  drawExtraLayers(ctx,0,0,w,h,preview);
  if(previewGuides) {
    const inset=Math.max(3,Math.min(w,h)*.07);
    ctx.save();ctx.lineWidth=Math.max(1,Math.min(w,h)*.005);
    ctx.strokeStyle='rgba(242, 109, 60, 0.7)';ctx.setLineDash([Math.max(4,inset*.42),Math.max(4,inset*.38)]);
    ctx.strokeRect(inset,inset,Math.max(0,w-2*inset),Math.max(0,h-2*inset));ctx.restore();
  }
  return ctx;
}
function renderPreview(){
  const w=Number(state.widthMm),h=Number(state.heightMm);
  if(!validateSize(w,h))return;
  if(state.shape==='round-pair'&&!validCircleDiameter(w,h,state.circleDiameterMm)){
    $('roundInfo').classList.add('bad-size');return;
  }
  const ratio=w/h;
  const lw=ratio>=1 ? 1400 : Math.max(128,Math.round(1400*ratio));
  const lh=ratio>=1 ? Math.max(128,Math.round(1400/ratio)) : 1400;
  const frame=$('labelFrame');
  frame.style.maxWidth=`${Math.min(480,ratio*270)}px`;
  frame.style.aspectRatio=`${w}/${h}`;
  drawComposition($('labelCanvas'),lw,lh,{preview:true,previewGuides:$('showGuides').checked});
  $('emptyNote').hidden=!!state.imageElement || !!state.labelName;
  $('previewChip').textContent=state.imageElement?'ARTE GENERADO':'SIN GENERAR';
  $('previewChip').classList.toggle('generated',!!state.imageElement);
  $('refineButton').disabled=!state.imageElement||generationInProgress;
  if($('refinePanel'))$('refinePanel').hidden=!state.imageElement;
}
function setGenerationBusy(value){
  generationInProgress=value;
  $('generateButton').disabled=value;
  $('refineButton').disabled=value || !state.imageElement;
  $('generateText').textContent=value?'Diseñando con IA…':'Generar con IA';
}
async function imageFromData(dataUrl) {
  const img=new Image();img.decoding='async';
  return new Promise((resolve,reject)=>{img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo abrir la imagen'));img.src=dataUrl;});
}
async function setArt(dataUrl) {
  if(!/^data:image\/(webp|jpeg|png);base64,/i.test(dataUrl))throw new Error('El servidor devolvió un formato no admitido');
  const img=await imageFromData(dataUrl);
  state.imageData=dataUrl;state.imageElement=img;
  renderPreview();
}
function fileToDataUrl(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader(); reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('No se pudo leer el archivo'));reader.readAsDataURL(file);
  });
}
async function compressImage(file, maxSide=1024, quality=.82) {
  if(file.size>25*1024*1024)throw new Error('La imagen supera los 25 MB');
  const src=await fileToDataUrl(file);
  const img=await imageFromData(src);
  const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',quality);
}
async function addReferences(files) {
  const remaining=Math.max(0,3-state.references.length);
  if(files.length>remaining)toast(`Solo caben ${remaining} imágenes más`,true);
  for(const file of [...files].slice(0,remaining)){
    try {const data=await compressImage(file,1024,.80);state.references.push({name:file.name,data});}
    catch(e){toast(`No se pudo importar ${file.name}: ${e.message}`,true);}
  }
  $('referenceFiles').value='';renderReferences();
}
function renderReferences(){
  const grid=$('referenceGrid');grid.replaceChildren();
  state.references.forEach((ref,i)=>{
    const div=document.createElement('div');div.className='ref-thumb';
    const img=document.createElement('img');img.src=ref.data;img.alt=ref.name||`Referencia ${i+1}`;
    const btn=document.createElement('button');btn.type='button';btn.className='remove-ref';btn.title='Quitar foto';btn.setAttribute('aria-label',`Eliminar referencia ${i+1}`);btn.textContent='×';
    btn.addEventListener('click',()=>{state.references.splice(i,1);renderReferences();});
    div.append(img,btn);grid.append(div);
  });
  $('referenceCounter').textContent=`${state.references.length}/3`;
}
async function checkConnection(){
  const el=$('apiStatus');el.className='api-status';el.querySelector('span:last-child').textContent='Comprobando conexión…';
  try{
    const response=await fetch('/api/generate',{headers:{'x-app-password':getPassword()},cache:'no-store'});
    const data=await response.json();
    if(response.ok){el.classList.add('ok');el.querySelector('span:last-child').textContent='Conexión lista: generador autorizado';}
    else if(response.status===401){el.classList.add('warn');el.querySelector('span:last-child').textContent='Servidor listo: introduce la contraseña de la app';}
    else {el.classList.add('warn');el.querySelector('span:last-child').textContent=data.error||'Servidor no configurado';}
  }catch{el.classList.add('warn');el.querySelector('span:last-child').textContent='No hay servidor de IA disponible. La edición local sigue funcionando.';}
}
async function generate(refine=false){
  readForm();
  if(!validateSize(state.widthMm,state.heightMm)){toast('Introduce un ancho y alto de 8 a 100 mm',true);return;}
  if(state.shape==='round-pair'&&!validCircleDiameter(state.widthMm,state.heightMm,state.circleDiameterMm)){toast('Revisa el diámetro de los círculos',true);return;}
  if(!state.description.trim()&&!state.labelName.trim()){toast('Escribe una descripción o un nombre',true);return;}
  if(refine&&!state.imageData)return;
  const refineInstruction=refine?$('refineInstructions').value.trim():'';
  if(refine&&!refineInstruction){toast('Escribe qué quieres modificar en el diseño',true);return;}
  const password=getPassword();
  if(!password){toast('Primero configura la contraseña en Ajustes',true);updateTab('settings');return;}
  if(generationInProgress)return;
  setGenerationBusy(true);
  generationMessage(refine?'Aplicando tu nuevo cambio a la ilustración…':`Generando ${state.variantCount===1?'1 propuesta':state.variantCount+' propuestas'}…`);
  try{
    const body={
      printer:state.printer,widthMm:state.widthMm,heightMm:state.heightMm,
      shape:state.shape,circleDiameterMm:state.circleDiameterMm,
      labelName:state.labelName,description:state.description,style:state.style,
      textMode:state.textMode,model:state.model,quality:state.quality,
      bwMode:state.bwMode,references:state.references.map(r=>r.data),
      refine, currentImage:refine?await resizeDataUrl(state.imageData,1152):null,
      refineInstruction,refineHistory:refine?(state.refineHistory||[]):[],
      variantCount:refine?1:Number(state.variantCount)||1,
    };
    const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','x-app-password':password},body:JSON.stringify(body)});
    let result;
    try{result=await response.json();}catch{throw new Error('Respuesta inválida del servidor. Si tarda demasiado, comprueba el tiempo máximo de la función.');}
    if(!response.ok)throw new Error(result.error||`Error HTTP ${response.status}`);
    if(!result.image)throw new Error('OpenAI no devolvió ninguna imagen');
    const images=Array.isArray(result.images)&&result.images.length?result.images:[result.image];
    state.variants=refine?[]:images;
    await setArt(images[0]);
    renderVariantChoices();
    if(refine){
      state.refineHistory=[...(state.refineHistory||[]),refineInstruction].slice(-8);
      $('refineInstructions').value='';
      renderRefineHistory();
    }else{state.refineHistory=[];renderRefineHistory();}
    generationMessage(`¡Diseño listo! Creado con ${result.modelLabel||'OpenAI'}. Puedes mover el texto, guardarlo o exportarlo.`, 'success');
    toast('¡Etiqueta creada!');
  }catch(e){generationMessage(e.message,'error');toast('No se pudo generar la imagen',true);}
  finally{setGenerationBusy(false);renderPreview();}
}
async function resizeDataUrl(data,maxSide){
  const img=await imageFromData(data);
  const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/webp',.84);
}
function bayerConversion(ctx,w,h,mode){
  if(mode==='color')return;
  const pixels=ctx.getImageData(0,0,w,h),d=pixels.data;
  const bayer=[0,8,2,10,12,4,14,6,3,1,9,11,5,13,7,15];
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      const lum=d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;
      const threshold=mode==='dither' ? 128 + (bayer[(y%4)*4+x%4]-7.5)*8 : 154;
      const color=lum>=threshold?255:0;d[i]=d[i+1]=d[i+2]=color;d[i+3]=255;
    }
  }
  ctx.putImageData(pixels,0,0);
}
function composeExport(high=false){
  readForm();
  if(!validateSize(state.widthMm,state.heightMm))throw new Error('Medidas no válidas');
  if(state.shape==='round-pair'&&!validCircleDiameter(state.widthMm,state.heightMm,state.circleDiameterMm))throw new Error('El diámetro no cabe en el soporte');
  const dpi=Number(state.dpi)*(high?2:1);
  const w=mmPixels(state.widthMm,dpi),h=mmPixels(state.heightMm,dpi);
  if(w*h>16_000_000)throw new Error('La imagen supera el tamaño máximo');
  const canvas=document.createElement('canvas');const ctx=drawComposition(canvas,w,h,{});
  bayerConversion(ctx,w,h,state.bwMode);
  return canvas;
}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
async function downloadPNG(high=false) {
  try{
    const canvas=composeExport(high);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error('No se pudo exportar la imagen')),'image/png'));
    const exportDpi=Number(state.dpi)*(high?2:1);
    const fileName=`${safeFilename(state.designTitle||state.labelName)}-${state.widthMm}x${state.heightMm}mm-${exportDpi}ppp${high?'-HQ':''}.png`;
    downloadBlob(await pngWithDpi(blob,exportDpi),fileName);
    toast(`PNG ${canvas.width} × ${canvas.height} · ${exportDpi} ppp exportado`);
  }catch(e){toast(e.message,true);}
}
async function downloadSingleCircle(){
  try{
    readForm();
    if(state.shape!=='round-pair')return;
    const whole=composeExport(false);
    const cells=roundPairLayout(whole.width,whole.height,state.widthMm,state.heightMm,state.circleDiameterMm);
    const c=cells[0];
    const size=Math.max(1,Math.round(c.r*2));
    const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
    ctx.drawImage(whole,c.x-c.r,c.y-c.r,2*c.r,2*c.r,0,0,size,size);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error('No se pudo exportar el círculo')),'image/png'));
    downloadBlob(await pngWithDpi(blob,state.dpi),`${safeFilename(state.designTitle||state.labelName)}-circulo-${state.circleDiameterMm}mm-${state.dpi}ppp.png`);
    toast(`Círculo individual: ${size} × ${size} px`);
  }catch(e){toast(e.message,true);}
}
function database(){
  if(!dbPromise){
    dbPromise=new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(new Error('Este navegador no permite guardar la biblioteca'));return;}
      const req=indexedDB.open('tintaStudioDB',1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('labels'))req.result.createObjectStore('labels',{keyPath:'id'});};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  return dbPromise;
}
async function saveRecord(data){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('labels','readwrite');tx.objectStore('labels').put(data);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Error al guardar'));
  });
}
async function getRecords(){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('labels','readonly');const req=tx.objectStore('labels').getAll();
    req.onsuccess=()=>resolve(req.result.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)));
    req.onerror=()=>reject(req.error);
  });
}
async function deleteRecord(id){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('labels','readwrite');tx.objectStore('labels').delete(id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}
function thumbnail(){
  const c=document.createElement('canvas'),w=600,h=Math.max(60,Math.round(w*state.heightMm/state.widthMm));
  const ctx=drawComposition(c,w,h,{});bayerConversion(ctx,w,h,state.bwMode);
  return c.toDataURL('image/jpeg',.8);
}
async function saveDesign(){
  readForm();
  const saveButton=$('saveButton');if(saveButton.disabled)return;
  saveButton.disabled=true;saveButton.textContent='Guardando…';
  if(!validateSize(state.widthMm,state.heightMm)){toast('Medidas no válidas',true);saveButton.disabled=false;saveButton.textContent='Guardar diseño';return;}
  if(state.shape==='round-pair'&&!validCircleDiameter(state.widthMm,state.heightMm,state.circleDiameterMm)){toast('Diámetro de círculo inválido',true);saveButton.disabled=false;saveButton.textContent='Guardar diseño';return;}
  try {
    const id=state.loadedId||crypto.randomUUID();
    const priorRecord=state.loadedId?(await getRecords()).find(r=>r.id===id):null;
    await saveRecord({id,updatedAt:new Date().toISOString(),
      title:state.designTitle.trim()||state.labelName.trim()||'Etiqueta sin título',
      properties:Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,state[k]])),
      textX:state.textX,textY:state.textY,
      imageData:state.imageData,references:state.references,variants:state.variants||[],
      thumbnail:thumbnail(),favorite:priorRecord?.favorite||false,
      versions:(priorRecord?[
        {title:priorRecord.title,updatedAt:priorRecord.updatedAt,properties:priorRecord.properties,
         textX:priorRecord.textX,textY:priorRecord.textY,imageData:priorRecord.imageData,
         thumbnail:priorRecord.thumbnail,references:priorRecord.references,variants:priorRecord.variants||[]},
        ...(priorRecord.versions||[])].slice(0,6):[])
    });
    state.loadedId=id;toast('Etiqueta guardada en tu biblioteca');refreshLibraryCount();
    if($('libraryPage').classList.contains('active'))await renderLibrary();
  }catch(e){toast(`No se ha guardado: ${e.message}`,true);}
  finally{saveButton.disabled=false;saveButton.textContent='Guardar diseño';}
}
async function refreshLibraryCount(){
  try{$('libraryCount').textContent=(await getRecords()).length;}catch{$('libraryCount').textContent='—';}
}
let libraryRenderVersion=0;
async function renderLibrary(){
  const run=++libraryRenderVersion;
  const grid=$('libraryGrid');
  try{
    const items=await getRecords();
    if(run!==libraryRenderVersion)return;
    grid.replaceChildren();
    $('libraryCount').textContent=items.length;$('libraryEmpty').hidden=items.length>0;
    const query=($('librarySearch')?.value||'').trim().toLocaleLowerCase('es');
    const category=$('libraryCategory')?.value||'';
    const favorites=!!$('libraryFavorites')?.checked;
    const filtered=items.filter(item=>{
      const p=item.properties||{};
      return (!category||(p.designCategory||'Sin categoría')===category) &&
        (!favorites||item.favorite) &&
        (!query||[item.title,p.labelName,p.description,p.designTags,p.designCategory].join(' ').toLocaleLowerCase('es').includes(query));
    });
    $('libraryNoMatches').hidden=!(items.length&&!filtered.length);
    for(const item of filtered){
      const card=document.createElement('article');card.className='library-card';
      const pic=document.createElement('div');pic.className='library-card-image';
      const img=document.createElement('img');img.src=item.thumbnail||'';img.alt=`Vista previa de ${item.title}`;pic.appendChild(img);
      const body=document.createElement('div');body.className='library-card-body';
      const title=document.createElement('h3');title.textContent=item.title;
      const meta=document.createElement('p');meta.className='library-meta';
      meta.textContent=`${item.properties?.widthMm} × ${item.properties?.heightMm} mm${item.properties?.shape==='round-pair'?' · 2 círculos Ø '+item.properties?.circleDiameterMm+' mm':''} · ${new Date(item.updatedAt).toLocaleDateString('es-ES')}`;
      const actions=document.createElement('div');actions.className='library-card-buttons';
      const open=document.createElement('button');open.type='button';open.textContent='Abrir y editar';open.addEventListener('click',()=>openDesign(item));
      const del=document.createElement('button');del.className='delete';del.type='button';del.textContent='×';del.title='Eliminar etiqueta';del.setAttribute('aria-label',`Eliminar ${item.title}`);
      del.addEventListener('click',async()=>{if(!confirm(`¿Eliminar «${item.title}» de la biblioteca?`))return;await deleteRecord(item.id);if(state.loadedId===item.id)state.loadedId=null;renderLibrary();toast('Etiqueta eliminada');});
      const fav=document.createElement('button');fav.type='button';fav.className='favorite '+(item.favorite?'active':'');
      fav.title=item.favorite?'Quitar de favoritos':'Marcar favorito';fav.setAttribute('aria-label',fav.title);
      fav.textContent=item.favorite?'★':'☆';
      fav.addEventListener('click',async()=>{await saveRecord({...item,favorite:!item.favorite});renderLibrary();});
      const history=document.createElement('button');history.type='button';history.className='history-link';
      history.textContent='Historial '+(item.versions?.length||0);history.addEventListener('click',()=>showDesignHistory(item));
      actions.append(open,fav,history,del);body.append(title,meta,actions);card.append(pic,body);grid.appendChild(card);
    }
  }catch(e){grid.textContent=`No se pudo leer la biblioteca: ${e.message}`;}
}
async function openDesign(item){
  state={...DEFAULTS,...item.properties,
    layers:Array.isArray(item.properties?.layers)?item.properties.layers:[],
    refineHistory:Array.isArray(item.properties?.refineHistory)?item.properties.refineHistory:[],
    textX:item.textX??.76,textY:item.textY??.53,
    references:Array.isArray(item.references)?item.references:[],variants:item.variants||[],
    imageData:null,imageElement:null,loadedId:item.id};
  selectedLayerId=null;await loadLayerImages();renderLayerList();renderVariantChoices();renderRefineHistory();
  fillForm();
  if(item.imageData){try{await setArt(item.imageData);}catch{toast('No se pudo cargar la ilustración',true);}}
  generationMessage('Diseño abierto desde tu biblioteca. Al guardar se actualizará esta misma etiqueta.');
  document.dispatchEvent(new Event('tinta-design-opened'));
  updateTab('create');toast('Etiqueta cargada');
}
function newDesign(){
  state={...DEFAULTS,labelName:'',description:'',designTitle:'',references:[],layers:[],variants:[],refineHistory:[],imageData:null,imageElement:null,loadedId:null};
  selectedLayerId=null;renderLayerList();renderVariantChoices();renderRefineHistory();
  fillForm();generationMessage('Nuevo diseño. Describe una etiqueta o añade fotografías y pulsa Generar con IA.');updateTab('create');
}
async function exportBackup(){
  try{
    const labels=await getRecords();
    const backup=JSON.stringify({app:'tinta-studio',version:1,exportedAt:new Date().toISOString(),labels});
    downloadBlob(new Blob([backup],{type:'application/json'}),`tinta-copia-${new Date().toISOString().slice(0,10)}.json`);
    toast(`Copia de ${labels.length} etiquetas preparada`);
  }catch(e){toast(e.message,true);}
}
async function importBackup(file){
  try{
    if(file.size>100*1024*1024)throw new Error('La copia supera 100 MB');
    const data=JSON.parse(await file.text());
    if(data.app!=='tinta-studio'||!Array.isArray(data.labels))throw new Error('No es una copia válida de Tinta Studio');
    const existing=new Set((await getRecords()).map(x=>x.id));
    let added=0;
    for(const record of data.labels.slice(0,1000)){
      if(!record||typeof record!=='object'||!record.properties||!validateSize(Number(record.properties.widthMm),Number(record.properties.heightMm)))continue;
      if(record.imageData&&!/^data:image\/(webp|jpeg|png);base64,/i.test(record.imageData))continue;
      if(record.properties.shape==='round-pair'&&!validCircleDiameter(Number(record.properties.widthMm),Number(record.properties.heightMm),Number(record.properties.circleDiameterMm)))continue;
      const id=existing.has(record.id)?crypto.randomUUID():String(record.id||crypto.randomUUID());existing.add(id);
      const safe={...record,id,title:String(record.title||'Etiqueta recuperada').slice(0,70),updatedAt:new Date().toISOString(),
        references:(Array.isArray(record.references)?record.references:[]).filter(r=>r&&/^data:image\/(webp|jpeg|png);base64,/i.test(r.data||'')).slice(0,3)};
      await saveRecord(safe);added++;
    }
    await renderLibrary();toast(`${added} etiquetas importadas`);
  }catch(e){toast(`No se pudo importar: ${e.message}`,true);}
  finally{$('backupInput').value='';}
}
function setupDragText(){
  const canvas=$('labelCanvas');let dragging=false;
  function setPos(e){
    if($('layersDetails')?.open)return;
    if(state.textMode!=='editable'||!state.labelName.trim())return;
    const rect=canvas.getBoundingClientRect();
    let x=(e.clientX-rect.left)/rect.width;
    let y=(e.clientY-rect.top)/rect.height;
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    if(state.shape==='round-pair'){
      const circles=roundPairLayout(1,1,state.widthMm,state.heightMm,state.circleDiameterMm);
      const c=circles.find(c=>Math.hypot(x-c.x,y-c.y)<=c.r);
      if(!c)return;
      state.textX=Math.max(.40,Math.min(.60,(x-(c.x-c.r))/(2*c.r)));
      state.textY=Math.max(.50,Math.min(.80,(y-(c.y-c.r))/(2*c.r)));
    }else{
      state.textX=Math.max(state.imageElement?.naturalWidth ? .55 : .1,Math.min(.95,x));
      state.textY=Math.max(.15,Math.min(.85,y));
    }
    renderPreview();
  }
  canvas.addEventListener('pointerdown',e=>{
    if($('layersDetails')?.open)return;
    if(state.textMode!=='editable'||!state.labelName.trim())return;
    dragging=true;canvas.setPointerCapture(e.pointerId);setPos(e);
  });
  canvas.addEventListener('pointermove',e=>{if(dragging)setPos(e);});
  ['pointerup','pointercancel'].forEach(evt=>canvas.addEventListener(evt,()=>{dragging=false;}));
}
function wire(){
  document.querySelectorAll('.tab').forEach(el=>el.addEventListener('click',()=>updateTab(el.dataset.tab)));
  for(const key of INPUTS){const el=$(key);if(el && key!=='labelName'){el.addEventListener('input',readForm);el.addEventListener('change',readForm);}}
  $('printer').addEventListener('change',()=>{
    const nativeDpi=PRINTER_DPI[$('printer').value];
    if(nativeDpi){$('dpi').value=String(nativeDpi);readForm();}
  });
  $('labelName').addEventListener('input',()=>{
    const previousName=state.labelName;
    const prev=state.designTitle||'';
    if(!prev || prev===DEFAULTS.designTitle || prev===previousName){
      state.designTitle=$('labelName').value.trim();$('designTitle').value=state.designTitle;
    }
    readForm();
  });
  document.querySelectorAll('input[name="textMode"]').forEach(el=>el.addEventListener('change',readForm));
  document.querySelectorAll('.size-chip').forEach(el=>el.addEventListener('click',()=>{
    $('widthMm').value=el.dataset.width;$('heightMm').value=el.dataset.height;
    $('shape').value=el.dataset.shape||'rect';
    if(el.dataset.diameter)$('circleDiameterMm').value=el.dataset.diameter;
    readForm();
    if(state.shape==='round-pair'){state.textX=.5;state.textY=.76;renderPreview();}
  }));
  $('shape').addEventListener('change',()=>{
    if($('shape').value==='round-pair'&&$('widthMm').value==='30'&&$('heightMm').value==='12'){
      $('widthMm').value=28;$('heightMm').value=14;$('circleDiameterMm').value=13;
    }
    readForm();
    if(state.shape==='round-pair'){state.textX=.5;state.textY=.76;renderPreview();}
  });
  $('rotateButton').addEventListener('click',()=>{const w=$('widthMm').value;$('widthMm').value=$('heightMm').value;$('heightMm').value=w;readForm();});
  $('showGuides').addEventListener('change',renderPreview);
  $('referenceFiles').addEventListener('change',e=>addReferences(e.target.files));
  $('generateButton').addEventListener('click',()=>generate(false));
  $('refineButton').addEventListener('click',()=>generate(true));
  $('saveButton').addEventListener('click',saveDesign);
  $('exportButton').addEventListener('click',()=>downloadPNG(false));
  $('exportHighButton').addEventListener('click',()=>downloadPNG(true));
  $('exportSingleButton').addEventListener('click',downloadSingleCircle);
  $('newDesign').addEventListener('click',newDesign);
  $('emptyCreate').addEventListener('click',newDesign);
  $('backupExport').addEventListener('click',exportBackup);
  $('backupInput').addEventListener('change',e=>{if(e.target.files?.[0])importBackup(e.target.files[0]);});
  $('appPassword').value=getPassword();
  try{$('rememberPassword').checked=!!localStorage.getItem('tinta-password');}catch{$('rememberPassword').checked=false;}
  $('testConnection').addEventListener('click',()=>{savePassword($('appPassword').value);checkConnection();});
  $('rememberPassword').addEventListener('change',()=>savePassword($('appPassword').value));
  setupDragText();
  initStudioV2();
}
wire();renderPreview();refreshLibraryCount();
if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));


// Tinta Studio v1.3: composición por capas, variantes, historial y flujo móvil.
function activeLayer(){return (state.layers||[]).find(layer=>layer.id===selectedLayerId);}
function drawExtraLayers(ctx,x,y,w,h,preview=false){
  for(const layer of state.layers||[]){
    const scale=Math.max(.25,Math.min(2.5,Number(layer.scale)||1));
    const radius=Math.min(w,h)*.22*scale;
    ctx.save();
    ctx.translate(x+w*Number(layer.x??.5),y+h*Number(layer.y??.5));
    ctx.rotate((Number(layer.rotation)||0)*Math.PI/180);
    ctx.lineJoin='round';ctx.textBaseline='middle';ctx.textAlign='center';
    if(layer.type==='text'){
      const str=String(layer.text||'TEXTO');
      ctx.font='900 '+Math.max(4,radius*1.45)+'px Arial, Helvetica, sans-serif';
      ctx.lineWidth=Math.max(1,radius*.15);
      ctx.strokeStyle='#fff';ctx.fillStyle='#080808';
      ctx.strokeText(str,0,0,w*.84);
      ctx.fillText(str,0,0,w*.84);
    }else if(layer.type==='image'){
      const img=layerImageCache.get(layer.id);
      if(img?.naturalWidth){
        const ratio=img.naturalWidth/img.naturalHeight;
        const iw=ratio>=1?radius*2:radius*2*ratio;
        const ih=ratio>=1?radius*2/ratio:radius*2;
        ctx.drawImage(img,-iw/2,-ih/2,iw,ih);
      }
    }else if(layer.type==='circle'){
      ctx.fillStyle='#111';ctx.beginPath();ctx.arc(0,0,radius*.64,0,Math.PI*2);ctx.fill();
    }else if(layer.type==='star'){
      ctx.fillStyle='#111';ctx.beginPath();
      for(let i=0;i<10;i++){
        const a=-Math.PI/2+i*Math.PI/5,rad=i%2?radius*.39:radius*.83;
        const px=Math.cos(a)*rad,py=Math.sin(a)*rad;
        if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      ctx.closePath();ctx.fill();
    }
    if(preview && selectedLayerId===layer.id && $('layersDetails')?.open){
      ctx.strokeStyle='#ee764e';ctx.lineWidth=Math.max(1,radius*.05);
      ctx.setLineDash([Math.max(3,radius*.12),Math.max(3,radius*.08)]);
      ctx.strokeRect(-radius,-radius,radius*2,radius*2);
    }
    ctx.restore();
  }
}
async function loadLayerImages(){
  for(const layer of state.layers||[]){
    if(layer.type!=='image'||!layer.src)continue;
    try{layerImageCache.set(layer.id,await imageFromData(layer.src));}
    catch{layerImageCache.delete(layer.id);}
  }
  renderPreview();
}
function renderLayerList(){
  const list=$('layerList');if(!list)return;
  list.replaceChildren();
  for(const layer of state.layers||[]){
    const b=document.createElement('button');
    b.type='button';b.className='layer-entry'+(selectedLayerId===layer.id?' selected':'');
    b.textContent=(layer.type==='text'?'T ':layer.type==='image'?'▧ ':layer.type==='star'?'★ ':'● ')+(layer.type==='text'?(layer.text||'Texto'):layer.type==='image'?'Imagen':layer.type==='star'?'Estrella':'Círculo');
    b.addEventListener('click',()=>{selectedLayerId=layer.id;renderLayerList();renderPreview();});
    list.append(b);
  }
  if(!(state.layers||[]).length){
    const hint=document.createElement('p');hint.className='helper';hint.textContent='Añade texto, formas o imágenes. Después podrás arrastrarlas en el lienzo.';list.append(hint);
  }
  const selected=activeLayer(),ctl=$('layerControls');
  if(ctl)ctl.hidden=!selected;
  if(selected){
    $('layerText').closest('label').hidden=selected.type!=='text';
    $('layerText').value=selected.text||'';
    $('layerScale').value=Math.round((selected.scale||1)*100);
    $('layerRotation').value=Math.round(selected.rotation||0);
    $('layerScaleValue').textContent=$('layerScale').value+'%';
    $('layerRotationValue').textContent=$('layerRotation').value+'°';
  }
}
function addExtraLayer(type,src=''){
  const layer={id:crypto.randomUUID(),type,x:.5,y:.5,scale:1,rotation:0,text:'TEXTO',src};
  if(!Array.isArray(state.layers))state.layers=[];
  state.layers.push(layer);selectedLayerId=layer.id;
  $('layersDetails').open=true;
  if(type==='image'&&src){
    imageFromData(src).then(img=>{layerImageCache.set(layer.id,img);renderPreview();}).catch(()=>toast('No se pudo abrir la imagen de la capa',true));
  }
  renderLayerList();renderPreview();
}
function renderVariantChoices(){
  const gallery=$('variantGallery'),root=$('variantChoices');
  if(!gallery||!root)return;
  const variants=state.variants||[];
  gallery.hidden=variants.length<=1;root.replaceChildren();
  variants.forEach((src,i)=>{
    const btn=document.createElement('button');
    btn.type='button';btn.className='variant-choice'+(src===state.imageData?' selected':'');
    btn.setAttribute('aria-label','Elegir propuesta '+(i+1));
    const img=document.createElement('img');img.src=src;img.alt='Propuesta '+(i+1);
    const title=document.createElement('span');title.textContent='Opción '+(i+1);
    btn.append(img,title);
    btn.addEventListener('click',async()=>{await setArt(src);renderVariantChoices();});
    root.append(btn);
  });
}
function renderRefineHistory(){
  const root=$('refineThread');if(!root)return;root.replaceChildren();
  for(const instruction of (state.refineHistory||[]).slice(-4)){
    const p=document.createElement('p');p.textContent='↳ '+instruction;root.append(p);
  }
}
function showDesignHistory(item){
  const dlg=$('historyDialog'),list=$('historyList');list.replaceChildren();
  $('historyTitle').textContent='Versiones · '+item.title;
  const versions=item.versions||[];
  if(!versions.length){const p=document.createElement('p');p.className='helper';p.textContent='El historial aparecerá cuando guardes una segunda versión de esta etiqueta.';list.append(p);}
  for(const [i,version] of versions.entries()){
    const article=document.createElement('article');article.className='history-version';
    if(version.thumbnail){
      const img=document.createElement('img');img.src=version.thumbnail;img.alt='Versión '+(i+1);article.append(img);
    }
    const block=document.createElement('div');
    const title=document.createElement('strong');title.textContent=version.title||'Versión anterior';
    const time=document.createElement('p');time.textContent=new Date(version.updatedAt).toLocaleString('es-ES');
    const restore=document.createElement('button');restore.type='button';restore.textContent='Recuperar esta versión';
    restore.addEventListener('click',async()=>{
      await openDesign({...item,...version,id:item.id,versions:item.versions||[],favorite:item.favorite||false});
      if(dlg.open)dlg.close();
      toast('Versión recuperada; pulsa Guardar para conservarla');
    });
    block.append(title,time,restore);article.append(block);list.append(article);
  }
  if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
}
async function sharePNGForPrint(){
  try{
    const canvas=composeExport(false);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo preparar el PNG')),'image/png'));
    const withDpi=await pngWithDpi(blob,Number(state.dpi));
    const file=new File([withDpi],(safeFilename(state.designTitle||state.labelName))+'-para-imprimir.png',{type:'image/png'});
    if(navigator.share && (!navigator.canShare||navigator.canShare({files:[file]}))){
      try{await navigator.share({files:[file],title:'Etiqueta Tinta Studio'});return;}
      catch(e){if(e.name==='AbortError')return;}
    }
    downloadBlob(file,file.name);
    toast('PNG preparado. Ábrelo en tu app de impresión NIIMBOT.');
  }catch(e){toast(e.message,true);}
}
function initStudioV2(){
  const layout=document.querySelector('.studio-layout');
  const builder=layout?.querySelector('.builder');
  const panels=builder?[...builder.children].filter(el=>el.classList.contains('panel')):[];
  if(panels.length>=3){
    const [support,idea,finish]=panels;
    builder.insertBefore(idea,support);
    const advanced=document.createElement('div');advanced.id='advancedSections';advanced.className='advanced-sections';advanced.hidden=true;
    advanced.append(support,finish);layout.append(advanced);
    $('quickFormatsMount').append($('sizeChips'));
    $('quickPrimary').append($('generateButton'));
    const preferences=document.querySelector('.generation-preferences');
    $('description').insertAdjacentElement('afterend',preferences);
    preferences.insertAdjacentElement('afterend',$('quickPrimary'));
    $('advancedToggle').addEventListener('click',()=>{
      advanced.hidden=!advanced.hidden;
      $('advancedToggle').setAttribute('aria-expanded',String(!advanced.hidden));
      $('advancedToggle').lastElementChild.textContent=advanced.hidden?'⌄':'⌃';
    });
  }
  const details=$('layersDetails');
  if(details){
    const art=document.createElement('section');art.className='artwork-controls';
    art.innerHTML='<h4>Ajustar ilustración principal</h4>'+
      '<div class="form-grid two"><label class="input-label">Tamaño de dibujo <input id="artScale" class="range" type="range" min="50" max="220" value="100"></label>'+
      '<label class="input-label">Rotación <input id="artRotation" class="range" type="range" min="-180" max="180" value="0"></label>'+
      '<label class="input-label">Mover horizontal <input id="artOffsetX" class="range" type="range" min="-100" max="100" value="0"></label>'+
      '<label class="input-label">Mover vertical <input id="artOffsetY" class="range" type="range" min="-100" max="100" value="0"></label></div>'+
      '<button id="resetArt" type="button" class="subtle-button">Restablecer ilustración</button>';
    details.append(art);
    const syncArt=()=>{
      $('artScale').value=Math.round((state.artScale||1)*100);
      $('artRotation').value=state.artRotation||0;
      $('artOffsetX').value=Math.round((state.artOffsetX||0)*100);
      $('artOffsetY').value=Math.round((state.artOffsetY||0)*100);
    };
    for(const id of ['artScale','artRotation','artOffsetX','artOffsetY']){
      $(id).addEventListener('input',()=>{
        state[id]=id==='artScale'?Number($(id).value)/100:id==='artRotation'?Number($(id).value):Number($(id).value)/100;
        renderPreview();
      });
    }
    $('resetArt').addEventListener('click',()=>{state.artScale=1;state.artRotation=0;state.artOffsetX=0;state.artOffsetY=0;syncArt();renderPreview();});
    details.addEventListener('toggle',()=>{if(details.open)syncArt();});
    document.addEventListener('tinta-design-opened',syncArt);
  }
  $('addLayerText').addEventListener('click',()=>addExtraLayer('text'));
  $('addLayerCircle').addEventListener('click',()=>addExtraLayer('circle'));
  $('addLayerStar').addEventListener('click',()=>addExtraLayer('star'));
  $('layerImageFile').addEventListener('change',async e=>{
    if(e.target.files?.[0]){
      try{const data=await compressImage(e.target.files[0],900,.87);addExtraLayer('image',data);}
      catch(err){toast('No se pudo añadir la imagen: '+err.message,true);}
      e.target.value='';
    }
  });
  $('layerText').addEventListener('input',()=>{const l=activeLayer();if(l){l.text=$('layerText').value;renderPreview();renderLayerList();}});
  $('layerScale').addEventListener('input',()=>{const l=activeLayer();if(l){l.scale=Number($('layerScale').value)/100;$('layerScaleValue').textContent=$('layerScale').value+'%';renderPreview();}});
  $('layerRotation').addEventListener('input',()=>{const l=activeLayer();if(l){l.rotation=Number($('layerRotation').value);$('layerRotationValue').textContent=$('layerRotation').value+'°';renderPreview();}});
  $('deleteLayer').addEventListener('click',()=>{state.layers=(state.layers||[]).filter(l=>l.id!==selectedLayerId);selectedLayerId=null;renderLayerList();renderPreview();});
  $('duplicateLayer').addEventListener('click',()=>{const l=activeLayer();if(!l)return;const copy={...l,id:crypto.randomUUID(),x:Math.min(.9,(l.x||.5)+.08),y:Math.min(.9,(l.y||.5)+.08)};state.layers.push(copy);if(copy.type==='image'){const image=layerImageCache.get(l.id);if(image)layerImageCache.set(copy.id,image);}selectedLayerId=copy.id;renderLayerList();renderPreview();});
  $('layerToFront').addEventListener('click',()=>{const l=activeLayer();if(!l)return;state.layers=state.layers.filter(item=>item!==l).concat(l);renderLayerList();renderPreview();});
  for(const id of ['librarySearch','libraryCategory','libraryFavorites'])$(id).addEventListener('input',renderLibrary);
  for(const b of document.querySelectorAll('[data-suggest]'))b.addEventListener('click',()=>{$('refineInstructions').value=b.dataset.suggest;$('refineInstructions').focus();});
  $('sharePrintButton').addEventListener('click',sharePNGForPrint);
  const canvas=$('labelCanvas');let dragging=null;
  function coords(e){
    const rect=canvas.getBoundingClientRect();
    let px=(e.clientX-rect.left)/rect.width,py=(e.clientY-rect.top)/rect.height;
    if(state.shape==='round-pair'){
      const circles=roundPairLayout(1,1,state.widthMm,state.heightMm,state.circleDiameterMm);
      const c=circles.find(cell=>Math.hypot(px-cell.x,py-cell.y)<=cell.r);
      if(!c)return null;
      px=(px-(c.x-c.r))/(2*c.r);py=(py-(c.y-c.r))/(2*c.r);
    }
    return Number.isFinite(px)&&Number.isFinite(py)?{x:px,y:py}:null;
  }
  canvas.addEventListener('pointerdown',e=>{
    if(!$('layersDetails').open||!(state.layers||[]).length)return;
    const p=coords(e);if(!p)return;
    const layers=[...state.layers].reverse();
    const nearest=layers.find(l=>Math.hypot((l.x-p.x),(l.y-p.y))<.24);
    if(!nearest)return;
    selectedLayerId=nearest.id;dragging=nearest.id;
    canvas.setPointerCapture(e.pointerId);renderLayerList();renderPreview();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const p=coords(e),layer=activeLayer();if(!p||!layer)return;
    layer.x=Math.max(.08,Math.min(.92,p.x));layer.y=Math.max(.08,Math.min(.92,p.y));
    renderPreview();
  });
  for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>{dragging=null;});
  renderLayerList();renderRefineHistory();renderVariantChoices();
}
