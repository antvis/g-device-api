import {
  DeviceContribution,
  Format,
  TransparentWhite,
  BufferUsage,
  TextureUsage,
  TextureDimension,
} from '../../src';
import {
  createBlitPipelineAndBindings,
  createProgram,
  prelude,
  registerShaderModule,
} from '../utils/compute-toys';

/**
 * @see https://compute.toys/view/16
 */

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  registerShaderModule(device, prelude);

  const screen = device.createTexture({
    format: Format.F16_RGBA,
    width: $canvas.width,
    height: $canvas.height,
    dimension: TextureDimension.TEXTURE_2D,
    usage: TextureUsage.STORAGE,
  });

  const { pipeline: blitPipeline, bindings: blitBindings } =
    createBlitPipelineAndBindings(device, screen);

  const computeProgram = createProgram(device, {
    compute: {
      entryPoint: 'main_image',
      wgsl: /* wgsl */ `
#import prelude::{screen, time}

// Simplex Noise (http://en.wikipedia.org/wiki/Simplex_noise), a type of gradient noise
// that uses N+1 vertices for random gradient interpolation instead of 2^N as in regular
// latice based Gradient Noise.

// Simplex Noise 2D: https://www.shadertoy.com/view/Msf3WH

fn hash(p: vec2f) -> vec2f // replace this by something better
{
    let p2 = vec2f( dot(p,vec2f(127.1,311.7)), dot(p,vec2f(269.5,183.3)) );
    return -1.0 + 2.0*fract(sin(p2)*43758.5453123);
}

fn simplex2d(p: vec2f) -> f32
{
    let K1 = 0.366025404; // (sqrt(3)-1)/2;
    let K2 = 0.211324865; // (3-sqrt(3))/6;
    let i = floor( p + (p.x+p.y)*K1 );
    let a = p - i + (i.x+i.y)*K2;
    let o = step(a.yx,a.xy);
    let b = a - o + K2;
    let c = a - 1.0 + 2.0*K2;
    let h = max( 0.5-vec3f(dot(a,a), dot(b,b), dot(c,c) ), vec3f(0.) );
    let n = h*h*h*h*vec3f( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
    return dot( n, vec3f(70.0) );
}


// Simplex Noise 3D: https://www.shadertoy.com/view/XsX3zB

/* discontinuous pseudorandom uniformly distributed in [-0.5, +0.5]^3 */
fn random3(c: vec3f) -> vec3f
{
    var j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
    var r = vec3f(0.);
    r.z = fract(512.0*j);
    j *= .125;
    r.x = fract(512.0*j);
    j *= .125;
    r.y = fract(512.0*j);
    return r - 0.5;
}

/* skew constants for 3d simplex functions */
const F3 = 0.3333333;
const G3 = 0.1666667;

/* 3d simplex noise */
fn simplex3d(p: vec3f) -> f32
{
    /* 1. find current tetrahedron T and it's four vertices */
    /* s, s+i1, s+i2, s+1.0 - absolute skewed (integer) coordinates of T vertices */
    /* x, x1, x2, x3 - unskewed coordinates of p relative to each of T vertices*/

    /* calculate s and x */
    let s = floor(p + dot(p, vec3(F3)));
    let x = p - s + dot(s, vec3(G3));

    /* calculate i1 and i2 */
    let e = step(vec3(0.0), x - x.yzx);
    let i1 = e*(1.0 - e.zxy);
    let i2 = 1.0 - e.zxy*(1.0 - e);

    /* x1, x2, x3 */
    let x1 = x - i1 + G3;
    let x2 = x - i2 + 2.0*G3;
    let x3 = x - 1.0 + 3.0*G3;

    /* 2. find four surflets and store them in d */
    var w = vec4f(0.);
    var d = vec4f(0.);

    /* calculate surflet weights */
    w.x = dot(x, x);
    w.y = dot(x1, x1);
    w.z = dot(x2, x2);
    w.w = dot(x3, x3);

    /* w fades from 0.6 at the center of the surflet to 0.0 at the margin */
    w = max(0.6 - w, vec4f(0.0));

    /* calculate surflet components */
    d.x = dot(random3(s), x);
    d.y = dot(random3(s + i1), x1);
    d.z = dot(random3(s + i2), x2);
    d.w = dot(random3(s + 1.0), x3);

    /* multiply d by w^4 */
    w *= w;
    w *= w;
    d *= w;

    /* 3. return the sum of the four surflets */
    return dot(d, vec4(52.0));
}

/* const matrices for 3d rotation */
const rot1 = mat3x3<f32>(-0.37, 0.36, 0.85,-0.14,-0.93, 0.34,0.92, 0.01,0.4);
const rot2 = mat3x3<f32>(-0.55,-0.39, 0.74, 0.33,-0.91,-0.24,0.77, 0.12,0.63);
const rot3 = mat3x3<f32>(-0.71, 0.52,-0.47,-0.08,-0.72,-0.68,-0.7,-0.45,0.56);

/* directional artifacts can be reduced by rotating each octave */
fn simplex3d_fractal(m: vec3f) -> f32
{
    return   0.5333333*simplex3d(m*rot1)
            +0.2666667*simplex3d(2.0*m*rot2)
            +0.1333333*simplex3d(4.0*m*rot3)
            +0.0666667*simplex3d(8.0*m);
}
      
@compute @workgroup_size(16, 16)
fn main_image(@builtin(global_invocation_id) id: vec3u) {
    let screen_size = vec2u(textureDimensions(screen));
    if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }
    let fragCoord = vec2f(id.xy) + .5;
    let resolution = vec2f(screen_size);
    let p = fragCoord / resolution.x;
    let p3 = vec3f(p, time.elapsed*0.025);

    var uv = p * vec2f(resolution.x / resolution.y, 1.) + time.elapsed * .25;
    var f = 0.;
    if (p.x < .6) { // left: value noise
        //f = simplex2d( 16.0*uv );
        f = simplex3d(p3*32.0);
    } else { // right: fractal noise (4 octaves)
        //uv *= 5.0;
        //let m = mat2x2<f32>( 1.6,  1.2, -1.2,  1.6 );
        //f  = 0.5000*simplex2d( uv ); uv = m*uv;
        //f += 0.2500*simplex2d( uv ); uv = m*uv;
        //f += 0.1250*simplex2d( uv ); uv = m*uv;
        //f += 0.0625*simplex2d( uv ); uv = m*uv;
        f = simplex3d_fractal(p3*8.0+8.0);
    }
    f = 0.5 + 0.5*f;
    f *= smoothstep( 0.0, 0.005, abs(p.x - 0.6) );

    f = pow(f, 2.2); // perceptual gradient to linear colour space
    textureStore(screen, vec2i(id.xy), vec4f(f, f, f, 1.));
}

      `,
    },
  });

  const uniformBuffer = device.createBuffer({
    viewOrSize: 2 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });
  uniformBuffer.setSubData(0, new Uint8Array(new Float32Array([0]).buffer));

  const computePipeline = device.createComputePipeline({
    inputLayout: null,
    program: computeProgram,
  });

  const bindings = device.createBindings({
    pipeline: computePipeline,
    uniformBufferBindings: [
      {
        binding: 0,
        buffer: uniformBuffer,
      },
    ],
    storageTextureBindings: [
      {
        binding: 0,
        texture: screen,
      },
    ],
  });

  const renderTarget = device.createRenderTarget({
    format: Format.U8_RGBA_RT,
    width: $canvas.width,
    height: $canvas.height,
  });
  device.setResourceName(renderTarget, 'Main Render Target');

  let id;
  let t = 0;
  const frame = (time) => {
    uniformBuffer.setSubData(
      0,
      new Uint8Array(new Float32Array([t, time / 1000]).buffer),
    );

    device.beginFrame();
    const computePass = device.createComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindings(bindings);
    computePass.dispatchWorkgroups(
      Math.floor($canvas.width / 16),
      Math.floor($canvas.height / 16),
    );
    device.submitPass(computePass);
    device.endFrame();

    /**
     * An application should call getCurrentTexture() in the same task that renders to the canvas texture.
     * Otherwise, the texture could get destroyed by these steps before the application is finished rendering to it.
     */
    const onscreenTexture = swapChain.getOnscreenTexture();
    device.beginFrame();
    const renderPass = device.createRenderPass({
      colorAttachment: [renderTarget],
      colorResolveTo: [onscreenTexture],
      colorClearColor: [TransparentWhite],
    });
    renderPass.setPipeline(blitPipeline);
    renderPass.setBindings(blitBindings);
    renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass.draw(3);

    device.submitPass(renderPass);
    device.endFrame();
    ++t;
    id = requestAnimationFrame(frame);
  };

  frame(0);

  return () => {
    if (useRAF && id) {
      cancelAnimationFrame(id);
    }
    blitBindings.destroy();
    computeProgram.destroy();
    screen.destroy();
    uniformBuffer.destroy();
    blitPipeline.destroy();
    computePipeline.destroy();
    renderTarget.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgpu'],
  default: 'webgpu',
};
