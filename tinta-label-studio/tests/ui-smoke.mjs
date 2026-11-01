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
  assert.equal(await page.locator('#advancedDetails').getAttribute('open'),'');
  const summaryRect=await page.locator('#advancedToggle').boundingBox();
  const advancedRect=await page.locator('#advancedSections').boundingBox();
  assert(advancedRect.y-summaryRect.y<100,'Los ajustes deben abrirse junto al botón, no debajo del lienzo');
  await page.locator('#advancedToggle').click();
  assert.equal(await page.locator('#advancedSections').isVisible(),false);


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
  await page.locator('#layerScale').evaluate(el=>{el.value='140';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#layerScale').inputValue(),'140');
  await page.locator('#saveButton').click();
  await page.waitForTimeout(1000);

  console.log('DIAGNÓSTICO GUARDADO:',await page.locator('#toast').textContent());
  await page.locator('[data-tab="library"]').click();
  await page.waitForTimeout(1200);
  console.log('DIAGNÓSTICO BIBLIOTECA:',await page.locator('#libraryGrid').textContent(),'CONTADOR:',await page.locator('#libraryCount').textContent(),'ERRORES:',errors);
  if(await page.locator('.library-card').count()===0)throw new Error('No se creó la tarjeta de biblioteca. Revisa el diagnóstico anterior');
  assert.equal(await page.locator('.library-card').count(),1);
  await page.locator('.favorite').first().click();
  await page.locator('.favorite.active').first().waitFor();
  await page.locator('#libraryFavorites').check();
  await page.locator('.library-card').first().waitFor();
  assert.equal(await page.locator('.library-card').count(),1);
  await page.locator('#librarySearch').fill('absolutamente-inexistente');
  await page.locator('#libraryNoMatches').waitFor({state:'visible'});
  assert.equal(await page.locator('.library-card').count(),0);
  await page.locator('#librarySearch').fill('');
  await page.locator('.library-card').first().waitFor();
  await page.locator('.library-card-buttons button').first().click();
  await page.locator('#description').fill('El mismo personaje, con menos detalles');
  await page.locator('#saveButton').click();
  await page.waitForTimeout(1000);
  await page.locator('[data-tab="library"]').click();
  await page.locator('.history-link').first().click();
  assert.equal(await page.locator('#historyDialog').isVisible(),true);
  await page.locator('#historyDialog button[type="submit"]').click();

  // Cada una de las 4 variantes y el refinamiento deben persistir localmente.
  await page.locator('#temporaryCount').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#temporaryCount').textContent==='5');
  assert.equal(await page.locator('.temporary-card').count(),5);
  assert.equal(await page.locator('.temporary-permanent').count(),5);

  // Guardar una propuesta permanente la mueve de Temporal a Biblioteca.
  await page.locator('.temporary-permanent').first().click();
  await page.waitForFunction(()=>document.querySelector('#temporaryCount').textContent==='4');
  assert.equal(await page.locator('.temporary-card').count(),4);
  assert.equal(await page.locator('.library-card').count(),2);

  // La actualización y el cierre no borran las propuestas recientes.
  await page.reload({waitUntil:'networkidle'});
  await page.locator('[data-tab="library"]').click();
  await page.waitForFunction(()=>document.querySelector('#temporaryCount').textContent==='4');
  assert.equal(await page.locator('.temporary-card').count(),4);

  // Una propuesta antigua debe desaparecer al abrir la biblioteca.
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('tintaStudioDB',2);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const list=await new Promise((resolve,reject)=>{
      const req=db.transaction('tempGenerations','readonly').objectStore('tempGenerations').getAll();
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const item=list[0];item.expiresAt=Date.now()-1000;
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('tempGenerations','readwrite');
      tx.objectStore('tempGenerations').put(item);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
  });
  await page.locator('[data-tab="create"]').click();
  await page.locator('#openRecentButton').click();
  await page.waitForFunction(()=>document.querySelector('#temporaryCount').textContent==='3');
  assert.equal(await page.locator('.temporary-card').count(),3);

  // Borrar las temporales no debe tocar las etiquetas permanentes.
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#clearTemporary').click();
  await page.waitForFunction(()=>document.querySelector('#temporaryCount').textContent==='0');
  assert.equal(await page.locator('.library-card').count(),2);
  if(errors.length)throw new Error('Errores de la página: '+errors.join(' | '));
  console.log('Prueba móvil completada: ajustes desplegables, generación múltiple, historial temporal y etiquetas permanentes.');
}finally{await browser.close();}
