import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{buildPrompt} from '../api/generate.js';
import {mmPixels, roundPairLayout, validCircleDiameter} from '../public/geometry.js';
const req=(body)=>({method:'POST',headers:{'x-app-password':'private-for-test'},body});
function res(){return {statusCode:200,setHeader(){},end(v){this.body=JSON.parse(v);return this;}};}

test('el rollo de 14×28 mm se exporta a 224×112 px a 203 ppp',()=>{
  assert.equal(mmPixels(28,203),224);
  assert.equal(mmPixels(14,203),112);
});
test('los dos círculos de 13 mm quedan dentro de la base 28×14',()=>{
  const circles=roundPairLayout(224,112,28,14,13);
  assert.equal(circles.length,2);
  assert.equal(circles[0].x,56);
  assert.equal(circles[1].x,168);
  for(const c of circles) {
    assert.ok(c.x-c.r>=0 && c.x+c.r<=224);
    assert.ok(c.y-c.r>=0 && c.y+c.r<=112);
  }
  assert.ok(circles[1].x-circles[0].x>=circles[0].r+circles[1].r);
});
test('si giras el formato, los dos círculos se alinean verticalmente',()=>{
  const circles=roundPairLayout(112,224,14,28,13);
  assert.equal(circles[0].x,circles[1].x);
  assert.equal(circles[0].y,56);
  assert.equal(circles[1].y,168);
});
test('rechaza un troquel que no cabe físicamente',()=>{
  assert.equal(validCircleDiameter(28,14,13),true);
  assert.equal(validCircleDiameter(28,14,15),false);
  assert.equal(validCircleDiameter(14,28,13),true);
  assert.equal(validCircleDiameter(20,14,13),false);
  assert.throws(()=>roundPairLayout(100,100,20,14,13),RangeError);
});
test('la IA diseña UN sticker circular cuadrado y no la tira completa',()=>{
  const prompt=buildPrompt({shape:'round-pair',widthMm:28,heightMm:14,circleDiameterMm:13,bwMode:'solid',textMode:'editable',labelName:'MILO',description:'Gato',style:'chibi'});
  assert.match(prompt,/ART FOR EXACTLY ONE ROUND STICKER/);
  assert.match(prompt,/SQUARE \(1:1\) canvas/);
  assert.match(prompt,/LOWER THIRD/);
  assert.doesNotMatch(prompt,/RIGHTMOST 44%/);
});
test('rechaza diámetro imposible antes de gastar tokens',async()=>{
  process.env.OPENAI_API_KEY='sk-fake';process.env.APP_PASSWORD='private-for-test';
  const body={shape:'round-pair',widthMm:28,heightMm:14,circleDiameterMm:20,labelName:'',description:'gato',style:'chibi',bwMode:'solid',textMode:'editable',model:'gpt-image-2.5-flare',quality:'low',references:[]};
  const response=res();await handler(req(body),response);
  assert.equal(response.statusCode,400);
  assert.match(response.body.error,/diámetro/i);
});
test('para dos círculos se solicita una imagen cuadrada al servicio de IA',async()=>{
  process.env.OPENAI_API_KEY='sk-fake';process.env.APP_PASSWORD='private-for-test';
  const oldFetch=global.fetch;
  let args;
  global.fetch=async(url,options)=>{args={url,options};return {ok:true,json:async()=>({data:[{b64_json:'YWJj'}]})};};
  try{
    const body={shape:'round-pair',widthMm:28,heightMm:14,circleDiameterMm:13,labelName:'MILO',description:'gato',style:'chibi',bwMode:'solid',textMode:'editable',model:'gpt-image-2.5-flare',quality:'low',references:[]};
    const response=res();await handler(req(body),response);
    assert.equal(response.statusCode,200);
    assert.equal(JSON.parse(args.options.body).size,'1024x1024');
  }finally{global.fetch=oldFetch;}
});
