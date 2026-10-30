// Medidas físicas: 14 × 28 mm = soporte, NO dos etiquetas rectangulares.
export function mmPixels(mm,dpi){return Math.max(1,Math.round(mm/25.4*dpi));}
export function validCircleDiameter(w,h,d){
  return [w,h,d].every(Number.isFinite)&&d>=5&&d<=Math.min(w,h,Math.max(w,h)/2);
}
export function roundPairLayout(pixelWidth,pixelHeight,widthMm,heightMm,diameterMm){
  if(!validCircleDiameter(widthMm,heightMm,diameterMm))throw new RangeError('Diámetro inválido para dos círculos');
  const landscape=widthMm>=heightMm;
  const pixelsPerMm=Math.min(pixelWidth/widthMm,pixelHeight/heightMm);
  const r=diameterMm*pixelsPerMm/2;
  if(landscape)return [{x:pixelWidth*.25,y:pixelHeight*.5,r},{x:pixelWidth*.75,y:pixelHeight*.5,r}];
  return [{x:pixelWidth*.5,y:pixelHeight*.25,r},{x:pixelWidth*.5,y:pixelHeight*.75,r}];
}
