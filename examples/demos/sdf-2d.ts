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
#import prelude::{screen, time};
// MIT License. © 2023 Inigo Quilez, Munrocket
// https://gist.github.com/munrocket/30e645d584b5300ee69295e54674b3e4

fn sdCircle(p: vec2f, r: f32) -> f32 {
  return length(p) - r;
}

fn sdRoundedBox(p: vec2f, b: vec2f, r: vec4f) -> f32 {
  var x = r.x;
  var y = r.y;
  x = select(r.z, r.x, p.x > 0.);
  y = select(r.w, r.y, p.x > 0.);
  x  = select(y, x, p.y > 0.);
  let q = abs(p) - b + x;
  return min(max(q.x, q.y), 0.) + length(max(q, vec2f(0.))) - x;
}

fn sdBox(p: vec2f, b: vec2f) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2f(0.))) + min(max(d.x, d.y), 0.);
}

fn sdOrientedBox(p: vec2f, a: vec2f, b: vec2f, th: f32) -> f32 {
  let l = length(b - a);
  let d = (b - a) / l;
  var q = p - (a + b) * 0.5;
  q = q * mat2x2<f32>(vec2f(d.x, d.y), vec2f(-d.y, d.x));
  q = abs(q) - vec2f(l, th) * 0.5;
  return length(max(q, vec2f(0.))) + min(max(q.x, q.y), 0.);
}

fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  return length(pa - ba * h);
}

fn sdRhombus(p: vec2f, b: vec2f) -> f32 {
  let q = abs(p);
  let qb = dot(q, vec2f(b.x, -b.y));
  let bb = dot(b, vec2f(b.x, -b.y));
  let h = clamp((-2. * qb + bb) / dot(b, b), -1., 1.);
  let d = length(q - 0.5 * b * vec2f(1. - h, 1. + h));
  return d * sign(q.x * b.y + q.y * b.x - b.x * b.y);
}

fn sdTrapezoid(p: vec2f, r1: f32, r2: f32, he: f32) -> f32 {
  let k1 = vec2f(r2, he);
  let k2 = vec2f(r2 - r1, 2. * he);
  let q = vec2f(abs(p.x), p.y);
  let ca = vec2f(q.x - min(q.x, select(r2, r1, q.y < 0.0)), abs(q.y) - he);
  let cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0., 1.);
  let s = select(1., -1., cb.x < 0.0 && ca.y < 0.0);
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

fn sdParallelogram(p: vec2f, wi: f32, he: f32, sk: f32) -> f32 {
  let e = vec2f(sk, he);
  var q: vec2f = select(p, -p, p.y < 0.);
  // horizontal edge
  var w: vec2f = q - e;
  w.x = w.x - clamp(w.x, -wi, wi);
  var d: vec2f = vec2f(dot(w, w), -w.y);
  // vertical edge
  let s = q.x * e.y - q.y * e.x;
  q = select(q, -q, s < 0.);
  var v: vec2f = q - vec2f(wi, 0.);
  v = v - e * clamp(dot(v, e) / dot(e, e), -1., 1.);
  d = min(d, vec2f(dot(v, v), wi * he - abs(s)));
  return sqrt(d.x) * sign(-d.y);
}

fn sdEquilateralTriangle(p: vec2f) -> f32 {
  let k = sqrt(3.);
  var q: vec2f = vec2f(abs(p.x) - 1.0, p.y + 1. / k);
  if (q.x + k * q.y > 0.) { q = vec2f(q.x - k * q.y, -k * q.x - q.y) / 2.; }
  q.x = q.x - clamp(q.x, -2., 0.);
  return -length(q) * sign(q.y);
}

fn sdTriangleIsosceles(p: vec2f, c: vec2f) -> f32 {
  let q = vec2f(abs(p.x), p.y);
  let a = q - c * clamp(dot(q, c) / dot(c, c), 0., 1.);
  let b = q - c * vec2f(clamp(q.x / c.x, 0., 1.), 1.);
  let s = -sign(c.y);
  let d = min(vec2f(dot(a, a), s * (q.x * c.y - q.y * c.x)), vec2f(dot(b, b), s * (q.y - c.y)));
  return -sqrt(d.x) * sign(d.y);
}

fn sdTriangle(p: vec2f, p0: vec2f, p1: vec2f, p2: vec2f) -> f32 {
  let e0 = p1 - p0; let e1 = p2 - p1; let e2 = p0 - p2;
  let v0 = p - p0; let v1 = p - p1; let v2 = p - p2;
  let pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0., 1.);
  let pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0., 1.);
  let pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0., 1.);
  let s = sign(e0.x * e2.y - e0.y * e2.x);
  let d = min(min(vec2f(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                  vec2f(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                  vec2f(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

fn sdUnevenCapsule(p: vec2f, r1: f32, r2: f32, h: f32) -> f32 {
  let q = vec2f(abs(p.x), p.y);
  let b = (r1 - r2) / h;
  let a = sqrt(1. - b * b);
  let k = dot(q, vec2f(-b, a));
  if (k < 0.) { return length(q) - r1; }
  if (k > a * h) { return length(q - vec2f(0., h)) - r2; }
  return dot(q, vec2f(a, b)) - r1;
}

fn sdPentagon(p: vec2f, r: f32) -> f32 {
  let k = vec3f(0.809016994, 0.587785252, 0.726542528);
  var q: vec2f = vec2f(abs(p.x), p.y);
  q = q - 2. * min(dot(vec2f(-k.x, k.y), q), 0.) * vec2f(-k.x, k.y);
  q = q - 2. * min(dot(vec2f(k.x, k.y), q), 0.) * vec2f(k.x, k.y);
  q = q - vec2f(clamp(q.x, -r * k.z, r * k.z), r);
  return length(q) * sign(q.y);
}

fn sdHexagon(p: vec2f, r: f32) -> f32 {
  let k = vec3f(-0.866025404, 0.5, 0.577350269);
  var q: vec2f = abs(p);
  q = q - 2. * min(dot(k.xy, q), 0.) * k.xy;
  q = q - vec2f(clamp(q.x, -k.z * r, k.z * r), r);
  return length(q) * sign(q.y);
}

fn sdOctogon(p: vec2f, r: f32) -> f32 {
  let k = vec3f(-0.9238795325, 0.3826834323, 0.4142135623);
  var q: vec2f = abs(p);
  q = q - 2. * min(dot(vec2f(k.x, k.y), q), 0.) * vec2f(k.x, k.y);
  q = q - 2. * min(dot(vec2f(-k.x, k.y), q), 0.) * vec2f(-k.x, k.y);
  q = q - vec2f(clamp(q.x, -k.z * r, k.z * r), r);
  return length(q) * sign(q.y);
}

fn sdHexagram(p: vec2f, r: f32) -> f32 {
  let k = vec4f(-0.5, 0.8660254038, 0.5773502692, 1.7320508076);
  var q: vec2f = abs(p);
  q = q - 2. * min(dot(k.xy, q), 0.) * k.xy;
  q = q - 2. * min(dot(k.yx, q), 0.) * k.yx;
  q = q - vec2f(clamp(q.x, r * k.z, r * k.w), r);
  return length(q) * sign(q.y);
}

fn sdStar5(p: vec2f, r: f32, rf: f32) -> f32 {
  let k1 = vec2f(0.809016994375, -0.587785252292);
  let k2 = vec2f(-k1.x, k1.y);
  var q: vec2f = vec2f(abs(p.x), p.y);
  q = q - 2. * max(dot(k1, q), 0.) * k1;
  q = q - 2. * max(dot(k2, q), 0.) * k2;
  q.x = abs(q.x);
  q.y = q.y - r;
  let ba = rf * vec2f(-k1.y, k1.x) - vec2f(0., 1.);
  let h = clamp(dot(q, ba) / dot(ba, ba), 0., r);
  return length(q - ba * h) * sign(q.y * ba.x - q.x * ba.y);
}

fn sdStar(p: vec2f, r: f32, n: u32, m: f32) ->f32 {
  let an = 3.141593 / f32(n);
  let en = 3.141593 / m;
  let acs = vec2f(cos(an), sin(an));
  let ecs = vec2f(cos(en), sin(en));
  let bn = (atan2(abs(p.x), p.y) % (2. * an)) - an;
  var q: vec2f = length(p) * vec2f(cos(bn), abs(sin(bn)));
  q = q - r * acs;
  q = q + ecs * clamp(-dot(q, ecs), 0., r * acs.y / ecs.y);
  return length(q) * sign(q.x);
}

fn sdPie(p: vec2f, sc: vec2f, r: f32) -> f32 {
  let q = vec2f(abs(p.x), p.y);
  let l = length(q) - r;
  let m = length(q - sc * clamp(dot(q, sc), 0., r));
  return max(l, m * sign(sc.y * q.x - sc.x * q.y));
}

fn sdArc(p: vec2f, sc1: vec2f, sc2: vec2f, r1: f32, r2: f32) -> f32 {
  var q: vec2f = p * mat2x2<f32>(vec2f(sc1.x, sc1.y), vec2f(-sc1.y, sc1.x));
  q.x = abs(q.x);
  let k = select(length(q), dot(q, sc2), sc2.y * q.x > sc2.x * q.y);
  return sqrt(dot(q, q) + r1 * r1 - 2. * r1 * k) - r2;
}

fn sdHorseshoe(p: vec2f, sc: vec2f, r: f32, l: f32, w: f32) -> f32 {
  var q: vec2f = vec2f(abs(p.x), p.y);
  let m = length(p);
  q = q * mat2x2<f32>(vec2f(-sc.y, sc.x), vec2f(sc.x, sc.y));
  q = vec2f(select(m * sign(-sc.y), q.x, q.y > 0.0 || q.x > 0.), select(m, q.y, q.x > 0.));
  q = vec2f(q.x, abs(q.y - r)) - vec2f(l, w);
  return length(max(q, vec2f(0.))) + min(0., max(q.x, q.y));
}

fn sdVesica(p: vec2f, r: f32, d: f32) -> f32 {
  let q = abs(p);
  let b = sqrt(r * r - d * d);
  let cond = (q.y -b) * d > q.x * b;
  return select(length(q - vec2f(-d, 0.))-r, length(q - vec2f(0., b)), cond);
}

fn sdMoon(p: vec2f, d: f32, ra: f32, rb: f32) -> f32 {
  let q = vec2f(p.x, abs(p.y));
  let a = (ra * ra - rb * rb + d * d) / (2. * d);
  let b = sqrt(max(ra * ra - a * a, 0.));
  if (d * (q.x * b - q.y * a) > d * d * max(b - q.y, 0.)) { return length(q-vec2f(a, b)); }
  return max((length(q) - ra), -(length(q - vec2f(d, 0.)) - rb));
}

fn sdRoundedCross(p: vec2f, h: f32) -> f32 {
  let k = 0.5 * (h + 1. / h);
  let q = abs(p);
  let v1 = q - vec2f(1., k);
  let v2 = q - vec2f(0., h);
  let v3 = q - vec2f(1., 0.);
  let d1 = k - sqrt(dot(v1, v1));
  let d2 = sqrt(min(dot(v2, v2), dot(v3, v3)));
  return select(d2, d1, q.x < 1. && q.y < q.x * (k - h) + h);
}

fn sdEgg(p: vec2f, ra: f32, rb: f32) -> f32 {
  let k = sqrt(3.);
  let q = vec2f(abs(p.x), p.y);
  let r = ra - rb;
  let d1 = length(q) - r;
  let d2 = length(vec2f(q.x,  q.y - k * r));
  let d3 = length(vec2f(q.x + r, q.y)) - 2. * r;
  return select(select(d3, d2, k * (q.x + r) < q.y), d1, q.y < 0.) - rb;
}

fn sdHeart(p: vec2f) -> f32 {
  let q = vec2f(abs(p.x), p.y);
  let w = q - vec2f(0.25, 0.75);
  if (q.x + q.y > 1.0) { return sqrt(dot(w, w)) - sqrt(2.) / 4.; }
  let u = q - vec2f(0., 1.);
  let v = q - 0.5 * max(q.x + q.y, 0.);
  return sqrt(min(dot(u, u), dot(v, v))) * sign(q.x - q.y);
}

fn sdCross(p: vec2f, b: vec2f) -> f32 {
  var q: vec2f = abs(p);
  q = select(q.xy, q.yx, q.y > q.x);
  let t = q - b;
  let k = max(t.y, t.x);
  let w = select(vec2f(b.y - q.x, -k), t, k > 0.);
  return sign(k) * length(max(w, vec2f(0.)));
}

fn sdRoundedX(p: vec2f, w: f32, r: f32) -> f32 {
  let q = abs(p);
  return length(q - min(q.x + q.y, w) * 0.5) - r;
}

const N: i32 = 5;
fn sdPolygon(p: vec2f, v: ptr<function, array<vec2f, 5>>) -> f32 {
  let c = *v;
  var d = dot(p - c[0], p - c[0]);
  var s: f32 = 1.;
  for (var i: i32 = 0; i < N; i = i + 1) {
    let j = (i + 1) % N;
    let e = c[i] - c[j];
    let w = p - c[j];
    let b = w - e * clamp(dot(w, e) / dot(e, e), 0., 1.);
    d = min(d, dot(b, b));
    let c1 = p.y >= c[j].y;
    let c2 = p.y < c[i].y;
    let c3 = e.x * w.y > e.y * w.x;
    let c = vec3<bool>(c1, c2, c3);
    if (all(c) || all(!c)) { s = -s; };
  }
  return s * sqrt(d);
}

fn sdEllipse(p: vec2f, ab: vec2f) -> f32 {
  var q: vec2f = abs(p);
  var e: vec2f = ab;
  if (q.x > q.y) {
    q = q.yx;
    e = ab.yx;
  }
  let l = e.y * e.y - e.x * e.x;
  let m = e.x * q.x / l;
  let m2 = m * m;
  let n = e.y * q.y / l;
  let n2 = n * n;
  let c = (m2 + n2 - 1.) / 3.;
  let c3 = c * c * c;
  let b = c3 + m2 * n2 * 2.;
  let d = c3 + m2 * n2;
  let g = m + m * n2;
  var co: f32;
  if (d < 0.) {
    let h = acos(b / c3) / 3.0;
    let s = cos(h);
    let t = sin(h) * sqrt(3.);
    let rx = sqrt(-c * (s + t + 2.0) + m2);
    let ry = sqrt(-c * (s - t + 2.0) + m2);
    co = (ry + sign(l) * rx + abs(g) / (rx * ry) - m) / 2.;
  } else {
    let h = 2. * m * n * sqrt(d);
    let s = sign(b + h) * pow(abs(b + h), 1. / 3.);
    let u = sign(b - h) * pow(abs(b - h), 1. / 3.);
    let rx = -s - u - c * 4. + 2. * m2;
    let ry = (s - u) * sqrt(3.);
    let rm = sqrt(rx * rx + ry * ry);
    co = (ry / sqrt(rm - rx) + 2. * g / rm - m) / 2.;
  }
  let r = e * vec2f(co, sqrt(1.0-co*co));
  return length(r - q) * sign(q.y - r.y);
}

fn sdParabola(pos: vec2f, k: f32) -> f32 {
  let p = vec2f(abs(pos.x), pos.y);
  let ik = 1. / k;
  let u = ik * (p.y - 0.5 * ik) / 3.;
  let v = 0.25 * ik * ik * p.x;
  let h = v * v - u * u * u;
  let r = sqrt(abs(h));
  let x = select(2. * cos(atan2(r, v) / 3.) * sqrt(u),
    pow(v + r, 1. / 3.) - pow(abs(v - r), 1. / 3.) * sign(r - v),
    h > 0.0);
  return length(p - vec2f(x, k * x * x)) * sign(p.x - x);
}

fn sdParabolaSegment(pos: vec2f, wi: f32, he: f32) -> f32 {
  let p = vec2f(abs(pos.x), pos.y);
  let ik = wi * wi / he;
  let u = ik * (he - p.y - 0.5 * ik) / 3.;
  let v = p.x * ik * ik * 0.25;
  let h = v * v - u * u * u;
  let r = sqrt(abs(h));
  var x: f32 = select(2. * cos(atan(r / v) / 3.) * sqrt(u),
    pow(v + r, 1. / 3.) - pow(abs(v - r), 1. / 3.) * sign(r - v),
    h > 0.0);
  x = min(x, wi);
  return length(p - vec2f(x, he - x * x / ik)) * sign(ik * (p.y - he) + p.x * p.x);
}

fn sdBezier(p: vec2f, A: vec2f, B: vec2f, C: vec2f) -> vec2f {
  let a = B - A;
  let b = A - 2. * B + C;
  let c = a * 2.;
  let d = A - p;
  let kk = 1. / dot(b, b);
  let kx = kk * dot(a, b);
  let ky = kk * (2. * dot(a, a) + dot(d, b)) / 3.;
  let kz = kk * dot(d, a);

  let p1 = ky - kx * kx;
  let p3 = p1 * p1 * p1;
  let q = kx * (2.0 * kx * kx - 3.0 * ky) + kz;
  var h: f32 = q * q + 4. * p3;

  var res: vec2f;
  if (h >= 0.) {
    h = sqrt(h);
    let x = (vec2f(h, -h) - q) / 2.;
    let uv = sign(x) * pow(abs(x), vec2f(1. / 3.));
    let t = clamp(uv.x + uv.y - kx, 0., 1.);
    let f = d + (c + b * t) * t;
    res = vec2f(dot(f, f), t);
  } else {
    let z = sqrt(-p1);
    let v = acos(q / (p1 * z * 2.)) / 3.;
    let m = cos(v);
    let n = sin(v) * 1.732050808;
    let t = clamp(vec2f(m + m, -n - m) * z - kx, vec2f(0.0), vec2f(1.0));
    let f = d + (c + b * t.x) * t.x;
    var dis: f32 = dot(f, f);
    res = vec2f(dis, t.x);

    let g = d + (c + b * t.y) * t.y;
    dis = dot(g, g);
    res = select(res, vec2f(dis, t.y), dis < res.x);
  }
  res.x = sqrt(res.x);
  return res;
}

fn sdBlobbyCross(pos: vec2f, he: f32) -> f32 {
  var p: vec2f = abs(pos);
  p = vec2f(abs(p.x - p.y), 1. - p.x - p.y) / sqrt(2.);

  let u = (he - p.y - 0.25 / he) / (6. * he);
  let v = p.x / (he * he * 16.);
  let h = v * v - u * u * u;

  var x: f32; var y: f32;
  if (h > 0.) {
    let r = sqrt(h);
    x = pow(v + r, 1. / 3.) - pow(abs(v - r), 1. / 3.) * sign(r - v);
  } else {
    let r = sqrt(u);
    x = 2. * r * cos(acos(v / (u * r)) / 3.);
  }
  x = min(x, sqrt(2.) / 2.);

  let z = vec2f(x, he * (1. - 2. * x * x)) - p;
  return length(z) * sign(z.y);
}

@compute @workgroup_size(16, 16)
fn main_image(@builtin(global_invocation_id) id: uint3) {
  let screen_size = textureDimensions(screen);
  if (id.x >= screen_size.x || id.y >= screen_size.y) { return; }
  let fragCoord = vec2f(f32(id.x) + .5, f32(screen_size.y - id.y) - .5);
  let uv = (2.*fragCoord - vec2f(screen_size)) / f32(min(screen_size.x, screen_size.y));

  var d: f32;
  let p = uv * 1.2;
  let t = i32(time.elapsed % 34);
  if      (t == 0)  { d = sdCircle(p, 1.); }
  else if (t == 1)  { d = sdRoundedBox(p, vec2<f32>(0.5, 1.), vec4<f32>(0., .1, .2, .3)); }
  else if (t == 2)  { d = sdBox(p, vec2<f32>(1.1, .8)); }
  else if (t == 3)  { d = sdOrientedBox(p, vec2<f32>(-.9, -.5), vec2<f32>(.9, .5), 0.5); }
  else if (t == 4)  { d = sdSegment(p, vec2<f32>(-.9,-.5), vec2<f32>(0.9, .5)) - .3; }
  else if (t == 5)  { d = sdRhombus(p, vec2<f32>(1.2, .7)); }
  else if (t == 6)  { d = sdTrapezoid(p, 1., .6, .4); }
  else if (t == 7)  { d = sdParallelogram(p, .8, .5, .3); }
  else if (t == 8)  { d = sdEquilateralTriangle(p+ vec2<f32>(.0,.2)); }
  else if (t == 9)  { d = sdTriangleIsosceles(p+ vec2<f32>(.0,-.6), vec2<f32>(.8, -1.2)); }
  else if (t == 10) { d = sdTriangle(p, vec2<f32>(-.5, -.5), vec2<f32>(.5, -.5), vec2<f32>(0., .5)); }
  else if (t == 11) { d = sdUnevenCapsule(p, .6, .3, .6); }
  else if (t == 12) { d = sdPentagon(p, .8); }
  else if (t == 13) { d = sdHexagon(p, .8); }
  else if (t == 14) { d = sdOctogon(p, .8); }
  else if (t == 15) { d = sdHexagram(p, .5); }
  else if (t == 16) { d = sdStar5(p, .9, .4); }
  else if (t == 17) { d = sdStar(p, .9, 9u, 5.); }
  else if (t == 18) { d = sdPie(p + vec2<f32>(0.,.5), vec2<f32>(sin(.5), cos(.5)), 1.1); }
  else if (t == 19) { d = sdArc(p, vec2<f32>(sin(.2), cos(.2)), vec2<f32>(sin(1.8), cos(1.8)), .9, .2); }
  else if (t == 20) { d = sdHorseshoe(p + vec2<f32>(0.,-.5), vec2<f32>(sin(2.4), cos(2.4)), 1.1, .8, .2); }
  else if (t == 21) { d = sdVesica(p*.6, .5, .2)/.6; }
  else if (t == 22) { d = sdMoon(p, .5, 1., .8); }
  else if (t == 23) { d = sdRoundedCross(p, .5) - .2; }//
  else if (t == 24) { d = sdEgg(p, .6, .2); }
  else if (t == 25) { d = sdHeart(p+vec2<f32>(0.,.5)); }
  else if (t == 26) { d = sdCross(p, vec2<f32>(.8, .2)); }
  else if (t == 27) { d = sdRoundedX(p, .8, .2); }
  else if (t == 28) {
      var A = array<vec2<f32>, 5>(vec2<f32>(-.5, -.8), vec2<f32>(.0, 1.),
      vec2<f32>(.5, -.8), vec2<f32>(-.8, .4), vec2<f32>(.8, .4));
      d = sdPolygon(p, &A);
  }
  else if (t == 29) { d = sdEllipse(p*.8, vec2<f32>(.8, .5))/.8; }
  else if (t == 30) { d = sdParabola(p, .5); }
  else if (t == 31) { d = sdParabolaSegment(p, .5, .2); }
  else if (t == 32) { d = sdBezier(p, vec2<f32>(1.5, 0.3), vec2<f32>(-2., -1.), vec2<f32>(-1., .4)).x; }
  else              { d = sdBlobbyCross(p, .6) - .2; }

  var col = vec3f(1.0) - sign(d)*vec3f(0.1,0.4,0.7);
  col *= 1.0 - exp(-2.0*abs(d));
  col *= 0.8 + 0.2*cos(120.0*d);
  col = mix( col, vec3f(1.0), 1.0-smoothstep(0.0,0.01,abs(d)) );

  textureStore(screen, id.xy, vec4f(col*col, 1.));
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
