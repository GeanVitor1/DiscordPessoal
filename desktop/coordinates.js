// Input bounds are physical pixels from Electron's Windows DIP conversion.
// Interpolation happens after conversion, preserving the last pixel at 125/150%.
export function normalizedToPhysical(bounds,x,y) {
  if(!bounds || ![bounds.x,bounds.y,bounds.width,bounds.height,x,y].every(Number.isFinite) || bounds.width<1 || bounds.height<1 || x<0 || x>1 || y<0 || y>1)throw new Error('Invalid coordinates');
  return {x:Math.round(bounds.x+x*(bounds.width-1)),y:Math.round(bounds.y+y*(bounds.height-1))};
}
