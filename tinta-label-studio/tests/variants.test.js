import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import handler,{buildPrompt} from '../api/generate.js';

process.env.OPENAI_API_KEY='sk-test-not-real';
process.env.APP_PASSWORD='test-password';
const originalFetch=global.fetch;
after(()=>{global.fetch=originalFetch;});
const payload=(overrides={})=>({
  widthMm:28,heightMm:14,shape:'round-pair',circleDiameterMm:13,
  labelName:'MILO',description:'Gato minimalista',style:'minimal',bwMode:'solid',
  textMode:'editable',model:'gpt-image-2.5-flare',quality:'low',references:[],
  ...overrides,
});
const request=(body)=>({method:'POST',headers:{'x-app-password':'test-password'},body});
function response(){return {statusCode:200,setHeader(){},end(value){this.data=JSON.parse(value);return this;}};}

test('una sola imagen es el valor por defecto',async()=>{
 let args;global.fetch=async(_,options)=>{args=JSON.parse(options.body);return {ok:true,json:async()=>({data:[{b64_json:'YWJj'}]})};};
 const res=response();await handler(request(payload()),res);
 assert.equal(res.statusCode,200);assert.equal(args.n,1);
 assert.equal(res.data.images.length,1);
});
test('generación múltiple opcional solicita cuatro imágenes',async()=>{
 let args;
 global.fetch=async(_,options)=>{args=JSON.parse(options.body);return {ok:true,json:async()=>({data:Array.from({length:4},(_,i)=>({b64_json:'YWJj'+i}))})};};
 const res=response();await handler(request(payload({variantCount:4})),res);
 assert.equal(res.statusCode,200);assert.equal(args.n,4);assert.equal(res.data.images.length,4);
 assert.equal(res.data.image,res.data.images[0]);
});
test('rechaza números de variantes no permitidos',async()=>{
 const res=response();await handler(request(payload({variantCount:10})),res);
 assert.equal(res.statusCode,400);assert.match(res.data.error,/1, 2 o 4/);
});
test('editar requiere una instrucción nueva',async()=>{
 const res=response();await handler(request(payload({refine:true,refineInstruction:''})),res);
 assert.equal(res.statusCode,400);
});
test('el prompt de refinamiento prioriza nuevas indicaciones',()=>{
 const text=buildPrompt(payload({refine:true,refineHistory:['Hazlo más simple'],refineInstruction:'Añade una estrella'}));
 assert.match(text,/Añade una estrella/);assert.match(text,/Hazlo más simple/);
});