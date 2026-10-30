import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import handler,{chooseImageSize,buildPrompt} from '../api/generate.js';

process.env.OPENAI_API_KEY='sk-test-token-that-is-not-real';
process.env.APP_PASSWORD='test-private-app-password';
const oldFetch=global.fetch;
after(()=>{global.fetch=oldFetch;});
const req=(method,body,password='test-private-app-password')=>({method,headers:{'x-app-password':password},body});
function fakeRes(){
  return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(data){this.body=JSON.parse(data);return this;}};
}

test('las proporciones de imagen respetan los tamaños físicos habituales',()=>{
  assert.equal(chooseImageSize(30,12),'1536x608');
  assert.equal(chooseImageSize(12,30),'608x1536');
  assert.equal(chooseImageSize(25,25),'1024x1024');
  assert.equal(chooseImageSize(40,8),'1536x512');
});
test('el prompt de texto editable reserva una zona y no dibuja palabras',()=>{
  const p=buildPrompt({widthMm:30,heightMm:12,bwMode:'solid',textMode:'editable',labelName:'POL',style:'comic',description:'Gato con un AirTag'});
  assert.match(p,/DO NOT render ANY text/);
  assert.match(p,/RIGHTMOST 44%/);
  assert.match(p,/30 mm wide × 12 mm high/);
  assert.match(p,/Gato con un AirTag/);
});
test('el texto artístico pide letras exactas',()=>{
  const p=buildPrompt({widthMm:30,heightMm:12,textMode:'artistic',labelName:'MILO',style:'manga',description:'Gato'});
  assert.match(p,/MILO/);
  assert.match(p,/prominent highly readable/);
});
test('requiere contraseña y nunca expone la API key',async()=>{
  const r=fakeRes();await handler(req('GET',null,'bad'),r);
  assert.equal(r.statusCode,401);
  assert.ok(!JSON.stringify(r.body).includes('sk-test'));
});
test('GET con contraseña correcta comprueba el servidor',async()=>{
  const r=fakeRes();await handler(req('GET',null),r);
  assert.equal(r.statusCode,200);assert.equal(r.body.status,'ok');
});
test('rechaza medidas incorrectas antes de consumir API',async()=>{
  const r=fakeRes();await handler(req('POST',{widthMm:1000,heightMm:12}),r);
  assert.equal(r.statusCode,400);
});
test('genera con modelo de OpenAI y devuelve WebP sin revelar la clave',async()=>{
  let captured;
  global.fetch=async(url,options)=>{
    captured={url,options};
    return {ok:true,json:async()=>({data:[{b64_json:'YWJj'}]})};
  };
  const body={widthMm:30,heightMm:12,labelName:'POL',description:'Gato y AirTag',style:'comic',bwMode:'solid',textMode:'editable',model:'gpt-image-2.5-flare',quality:'medium',references:[]};
  const r=fakeRes();await handler(req('POST',body),r);
  assert.equal(r.statusCode,200);
  assert.equal(r.body.image,'data:image/webp;base64,YWJj');
  assert.equal(captured.url,'https://api.openai.com/v1/images/generations');
  assert.equal(JSON.parse(captured.options.body).size,'1536x608');
  assert.equal(JSON.parse(captured.options.body).output_format,'webp');
  assert.ok(!JSON.stringify(r.body).includes('sk-test'));
});
test('fotografías de referencia usan endpoint de edición multipart',async()=>{
  let captured;
  global.fetch=async(url,options)=>{captured={url,options};return {ok:true,json:async()=>({data:[{b64_json:'YWJj'}]})};};
  const jpeg='data:image/jpeg;base64,'+Buffer.from('not really a jpeg').toString('base64');
  const body={widthMm:30,heightMm:12,labelName:'POL',description:'Gato y AirTag',style:'comic',bwMode:'solid',textMode:'artistic',model:'gpt-image-2.5-sunburst',quality:'high',references:[jpeg]};
  const r=fakeRes();await handler(req('POST',body),r);
  assert.equal(r.statusCode,200);
  assert.equal(captured.url,'https://api.openai.com/v1/images/edits');
  assert.equal(captured.options.body.get('model'),'gpt-image-2.5-sunburst');
  assert.equal(captured.options.body.getAll('image[]').length,1);
});
