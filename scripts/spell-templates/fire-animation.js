const MODULE_ID = "mk-shadowdark";
const states = new WeakMap();
const shaders = new WeakMap();

// PrimaryBaseSamplerShader supplies the vertex transform, depth and occlusion passes.
// Only its documented _main fragment extension is replaced; the texture alpha clips the fire.
export const FIRE_FRAGMENT = `
  uniform float mkFireTime;
  uniform float mkFirePhase;
  uniform vec2 mkFireScale;
  uniform vec3 mkFireColor;

  float mkFireHash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float mkFireNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mkFireHash(i), mkFireHash(i + vec2(1.0, 0.0)), f.x),
      mix(mkFireHash(i + vec2(0.0, 1.0)), mkFireHash(i + vec2(1.0)), f.x), f.y);
  }
  vec4 _main() {
    float mask = texture(sampler, vUvs).a;
    if (mask < 0.001) return vec4(0.0);
    float time = mkFireTime + mkFirePhase;
    vec2 p = vUvs * mkFireScale;
    float drift = mkFireNoise(vec2(p.x * 0.65, p.y * 0.5 + time * 0.6));
    vec2 flow = vec2(p.x + (drift - 0.5) * 1.25, p.y + time * 1.7);
    float noise = mkFireNoise(flow) * 0.6 + mkFireNoise(flow * 2.1 + 3.7) * 0.3
      + mkFireNoise(flow * 4.2 + 7.1) * 0.1;
    float tongue = pow(0.5 + 0.5 * sin(p.x * 6.283 + drift * 5.0 + time * 1.2), 2.0);
    float heat = clamp(noise * 0.95 + tongue * 0.32, 0.0, 1.0);
    vec3 color = mix(vec3(0.28, 0.015, 0.004), mkFireColor, smoothstep(0.12, 0.57, heat));
    color = mix(color, vec3(1.0, 0.86, 0.36), smoothstep(0.58, 0.95, heat));
    return vec4(color * tintAlpha.rgb, tintAlpha.a) * mask * (0.72 + 0.28 * heat);
  }
`;

export function fireColor(value) {
  const hex = /^#[\da-f]{6}$/i.test(value) ? value : "#f47726";
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
}

export function createFireShaderClass(Base, environment = globalThis) {
  if (!Base) return null;
  let cache = shaders.get(environment);
  if (!cache) { cache = new WeakMap(); shaders.set(environment, cache); }
  if (cache.has(Base)) return cache.get(Base);
  class FireWallShader extends Base {
    static classPluginName = null;
    static defaultUniforms = { ...Base.defaultUniforms, mkFireTime: 0, mkFirePhase: 0,
      mkFireScale: [1, 1], mkFireColor: fireColor() };
    static _fragmentShader = FIRE_FRAGMENT;

    _preRender(mesh, renderer) {
      super._preRender(mesh, renderer);
      const elapsed = Number(environment.canvas?.app?.ticker?.lastTime ?? environment.performance?.now?.() ?? 0);
      this.uniforms.mkFireTime = Number.isFinite(elapsed) ? (elapsed / 1000) % 4096 : 0;
    }
  }
  cache.set(Base, FireWallShader);
  return FireWallShader;
}

export class FireWallAnimations {
  constructor(environment = globalThis) {
    this.env = environment;
    this.tiles = new Map();
    this.motion = environment.matchMedia?.("(prefers-reduced-motion: reduce)");
    this.onMotion = () => this.refresh();
    this.motion?.addEventListener?.("change", this.onMotion);
  }

  reducedMotion() {
    if (this.motion?.matches) return true;
    try { return this.env.game?.settings?.get?.("core", "photosensitiveMode") === true; }
    catch { return false; }
  }

  attach(tile) {
    const mesh = tile?.mesh;
    const area = tile?.document?.flags?.[MODULE_ID]?.spellAreaTile;
    const legacyFire = area && area.animation === undefined && ["firewall", "walloffire"]
      .includes(String(area.name ?? "").toLowerCase().replace(/[^a-z]/g, ""));
    const Base = this.env.foundry?.canvas?.rendering?.shaders?.PrimaryBaseSamplerShader;
    const eligible = area && (area.animation === "fire" || legacyFire) && !this.reducedMotion()
      && !tile.destroyed && mesh && !mesh.destroyed && Base && typeof mesh.setShaderClass === "function";
    if (!eligible) { this.detach(tile); return false; }
    let state = this.tiles.get(tile);
    if (state && (state.mesh !== mesh || state.shader !== mesh.shader)) { this.detach(tile); state = null; }
    if (!state) {
      // Respect another module's custom sampler rather than replacing its rendering behavior.
      if (mesh.shader?.constructor !== Base) return false;
      const Shader = createFireShaderClass(Base, this.env);
      try {
        mesh.setShaderClass(Shader);
        state = { mesh, shader: mesh.shader, original: Base };
        this.tiles.set(tile, state);
      } catch (error) {
        this.env.console?.warn(`${MODULE_ID} | Fire animation unavailable; keeping the area tile`, error);
        return false;
      }
    }
    const uniforms = state.shader.uniforms;
    uniforms.mkFireColor = fireColor(area.color);
    uniforms.mkFireScale = [Math.max(1, Math.min(128, Math.abs(Number(tile.document.width) || 1) / 44)),
      Math.max(1, Math.min(128, Math.abs(Number(tile.document.height) || 1) / 66))];
    let phase = 0;
    for (const character of String(area.castId ?? tile.document.id ?? "")) phase = (phase * 31 + character.charCodeAt(0)) >>> 0;
    uniforms.mkFirePhase = (phase % 1000) / 100;
    return true;
  }

  detach(tile) {
    const state = this.tiles.get(tile);
    if (!state) return;
    this.tiles.delete(tile);
    if (!state.mesh.destroyed && state.mesh.shader === state.shader) state.mesh.setShaderClass(state.original);
    state.shader.destroy?.();
  }

  refresh() {
    for (const tile of this.env.canvas?.tiles?.placeables ?? []) this.attach(tile);
  }

  clear() {
    for (const tile of this.tiles.keys()) this.detach(tile);
  }
}

export function registerFireWallAnimations(environment = globalThis) {
  if (states.has(environment)) return states.get(environment);
  const animations = new FireWallAnimations(environment);
  states.set(environment, animations);
  const hooks = environment.Hooks;
  for (const name of ["drawTile", "refreshTile"]) hooks?.on?.(name, tile => animations.attach(tile));
  hooks?.on?.("destroyTile", tile => animations.detach(tile));
  hooks?.on?.("deleteTile", document => {
    for (const tile of animations.tiles.keys()) if (tile.document === document) animations.detach(tile);
  });
  hooks?.on?.("canvasReady", () => animations.refresh());
  hooks?.on?.("canvasTearDown", () => animations.clear());
  hooks?.on?.("updateSetting", setting => {
    if (setting?.key === "core.photosensitiveMode") animations.refresh();
  });
  return animations;
}
