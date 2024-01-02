export function generateColorRamp(colorRamp: any): any {
  let canvas = window.document.createElement('canvas');
  let ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  canvas.width = 256;
  canvas.height = 1;
  let data: Uint8ClampedArray | undefined = undefined;

  // draw linear color
  const gradient = ctx.createLinearGradient(0, 0, 256, 1);

  const min = colorRamp.positions[0];
  const max = colorRamp.positions[colorRamp.positions.length - 1];
  for (let i = 0; i < colorRamp.colors.length; ++i) {
    const value = (colorRamp.positions[i] - min) / (max - min);
    gradient.addColorStop(value, colorRamp.colors[i]);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 1);

  data = new Uint8ClampedArray(ctx.getImageData(0, 0, 256, 1).data);
  // @ts-ignore
  canvas = null;
  // @ts-ignore
  ctx = null;
  return { data, width: 256, height: 1 };
}
