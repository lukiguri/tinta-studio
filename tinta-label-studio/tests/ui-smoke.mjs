import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YAieRwAAAAASUVORK5CYII=';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.route('**/api/generate',async route=>{
    if(route.request().method()==='GET'){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ok'})});return;
    }
    const req=route.request().postDataJSON();
    const images=Array(req.variantCount||1).fill(pixel);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({image:pixel,images,modelLabel:'Flare'})});
  });
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.locator('#quickPrimary #generateButton').waitFor();
  assert.equal((await page.locator('.builder .panel-title h2').first().textContent()).trim(),'Tu idea');
  assert.equal(await page.locator('#variantCount').inputValue(),'1');
  assert.equal(await page.locator('#advancedSections').isVisible(),false);
  await page.locator('#advancedToggle').click();
  assert.equal(await page.locator('#advancedSections').isVisible(),true);

  await page.locator('#variantCount').selectOption('4');
  await page.evaluate(()=>sessionStorage.setItem('tinta-password','test'));
  await page.locator('#generateButton').click();
  await page.locator('.variant-choice').first().waitFor();
  assert.equal(await page.locator('.variant-choice').count(),4);
  assert.equal(await page.locator('#refinePanel').isVisible(),true);
  await page.locator('#refineInstructions').fill('Haz el personaje más grande');
  await page.locator('#refineButton').click();
  await page.locator('#refineThread p').first().waitFor();
  assert.match(await page.locator('#refineThread').textContent(),/más grande/);

  await page.locator('#layersDetails summary').click();
  await page.locator('#addLayerStar').click();
  assert.equal(await page.locator('.layer-entry').count(),1);
  await page.locator('#layerScale').fill('140');
  assert.equal(await page.locator('#layerScale').inputValue(),'140');
  await page.locator('#saveButton').click();

  await page.locator('[data-tab="library"]').click();
  await page.locator('.library-card').first().waitFor();
  assert.equal(await page.locator('.library-card').count(),1);
  await page.locator('.favorite').first().click();
  await page.locator('#libraryFavorites').check();
  assert.equal(await page.locator('.library-card').count(),1);
  await page.locator('#librarySearch').fill('absolutamente-inexistente');
  assert.equal(await page.locator('.library-card').count(),0);
  await page.locator('#librarySearch').fill('');
  await page.locator('.library-card').first().waitFor();
  if(errors.length)throw new Error('Errores de la página: '+errors.join(' | '));
  console.log('Prueba visual y funcional en móvil completada: formulario, variantes, IA simulada, editor y biblioteca.');
}finally{await browser.close();}
