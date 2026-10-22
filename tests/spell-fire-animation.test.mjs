import test from "node:test";
import assert from "node:assert/strict";
import { createFireShaderClass, fireColor, FireWallAnimations, registerFireWallAnimations } from "../scripts/spell-templates/fire-animation.js";

function fixture() {
  const hooks = new Map(), calls = { renders: 0, switches: 0, destroyed: 0, timers: 0 };
  class PrimaryShader {
    static defaultUniforms = { sampler: null, tintAlpha: [1, 1, 1, 1], occlusionTexture: null, screenDimensions: [1, 1] };
    constructor() { this.uniforms = structuredClone(this.constructor.defaultUniforms); }
    _preRender(mesh, renderer) { calls.renders++; this.uniforms.sampler = mesh.texture; this.renderer = renderer; }
    destroy() { calls.destroyed++; }
  }
  const motion = { matches: false, addEventListener: (_name, callback) => { motion.change = callback; } };
  const environment = { foundry: { canvas: { rendering: { shaders: { PrimaryBaseSamplerShader: PrimaryShader } } } },
    canvas: { tiles: { placeables: [] }, app: { ticker: { lastTime: 1250,
      add() { calls.timers++; }, remove() { calls.timers--; } } } },
    game: { settings: { get: () => false } }, matchMedia: () => motion,
    Hooks: { on(name, callback) { hooks.set(name, [...(hooks.get(name) ?? []), callback]); } } };
  const tile = (area = { animation: "fire", color: "#f47726", castId: "ChatMessage.wall" }) => {
    const mesh = { destroyed: false, texture: {}, shader: new PrimaryShader(), filters: [{ name: "other-filter" }],
      setShaderClass(Shader) { calls.switches++; this.shader = new Shader(); } };
    const value = { mesh, document: { id: "wall", width: 440, height: 198,
      flags: area ? { "mk-shadowdark": { spellAreaTile: area } } : {} } };
    environment.canvas.tiles.placeables.push(value); return value;
  };
  return { environment, calls, hooks, motion, PrimaryShader, tile };
}

test("fire uses a cached Primary sampler subclass retaining native uniforms and occlusion behavior", () => {
  const f = fixture();
  const Shader = createFireShaderClass(f.PrimaryShader, f.environment);
  assert.equal(Shader, createFireShaderClass(f.PrimaryShader, f.environment));
  assert.ok(Shader.prototype instanceof f.PrimaryShader);
  assert.equal(Shader.classPluginName, null, "animated uniforms need the direct sampler path");
  assert.equal(Shader.defaultUniforms.occlusionTexture, null);
  assert.deepEqual(Shader.defaultUniforms.tintAlpha, [1, 1, 1, 1]);
  assert.match(Shader._fragmentShader, /texture\(sampler, vUvs\)\.a/);
  assert.match(Shader._fragmentShader, /return vec4\(0\.0\)/);
  assert.equal(createFireShaderClass(null, f.environment), null);
});

test("only visible mesh rendering advances fire time, with no ticker or timer registered", () => {
  const f = fixture(); const animations = new FireWallAnimations(f.environment); const tile = f.tile();
  assert.equal(animations.attach(tile), true);
  const shader = tile.mesh.shader;
  shader._preRender(tile.mesh, "renderer");
  assert.equal(shader.uniforms.mkFireTime, 1.25);
  assert.equal(shader.uniforms.sampler, tile.mesh.texture); assert.equal(shader.renderer, "renderer");
  f.environment.canvas.app.ticker.lastTime = 3500;
  shader._preRender(tile.mesh, "renderer"); assert.equal(shader.uniforms.mkFireTime, 3.5);
  f.environment.canvas.app.ticker.lastTime = Infinity;
  shader._preRender(tile.mesh, "renderer"); assert.equal(shader.uniforms.mkFireTime, 0);
  assert.equal(f.calls.renders, 3); assert.equal(f.calls.timers, 0);
});

test("repeated tile refreshes reuse the shader and resizing updates scale without changing masks or other filters", () => {
  const f = fixture(), tile = f.tile(); const animations = new FireWallAnimations(f.environment);
  const filters = tile.mesh.filters, texture = tile.mesh.texture;
  animations.attach(tile); const shader = tile.mesh.shader;
  for (let i = 0; i < 100; i++) animations.attach(tile);
  assert.equal(f.calls.switches, 1); assert.equal(tile.mesh.shader, shader);
  assert.deepEqual(shader.uniforms.mkFireScale, [10, 3]);
  tile.document.width = 880; tile.document.height = 396; animations.attach(tile);
  assert.deepEqual(shader.uniforms.mkFireScale, [20, 6]);
  assert.equal(tile.mesh.filters, filters); assert.equal(tile.mesh.texture, texture);
  tile.document.flags["mk-shadowdark"].spellAreaTile.color = "#3399ff"; animations.attach(tile);
  assert.deepEqual(shader.uniforms.mkFireColor, [0.2, 0.6, 1]);
});

test("normal tiles, explicit opt-outs and other modules' shaders remain untouched", () => {
  const f = fixture(); const animations = new FireWallAnimations(f.environment);
  for (const tile of [f.tile(null), f.tile({ animation: null, name: "Fire Wall" }), f.tile({ animation: "other" })]) {
    const original = tile.mesh.shader; assert.equal(animations.attach(tile), false); assert.equal(tile.mesh.shader, original);
  }
  const external = f.tile(); class External extends f.PrimaryShader {}
  external.mesh.shader = new External(); assert.equal(animations.attach(external), false);
  assert.ok(external.mesh.shader instanceof External); assert.equal(f.calls.switches, 0);
});

test("legacy Fire Wall tiles animate after reload, and explicit animation flags take precedence", () => {
  const f = fixture(); const animations = new FireWallAnimations(f.environment);
  assert.equal(animations.attach(f.tile({ name: "Fire Wall" })), true);
  assert.equal(animations.attach(f.tile({ name: "Wall of Fire" })), true);
  assert.equal(animations.attach(f.tile({ name: "Wall of Force" })), false);
  assert.equal(animations.attach(f.tile({ name: "Fire Wall", animation: null })), false);
});

test("reduced motion and Foundry photosensitive mode keep the static tile and restore animation when disabled", () => {
  const f = fixture(); const tile = f.tile(); const animations = registerFireWallAnimations(f.environment);
  animations.attach(tile); assert.equal(animations.tiles.size, 1);
  f.motion.matches = true; f.motion.change();
  assert.equal(tile.mesh.shader.constructor, f.PrimaryShader); assert.equal(animations.tiles.size, 0);
  f.motion.matches = false; f.motion.change(); assert.equal(animations.tiles.size, 1);
  f.environment.game.settings.get = () => true;
  f.hooks.get("updateSetting")[0]({ key: "core.photosensitiveMode" });
  assert.equal(tile.mesh.shader.constructor, f.PrimaryShader); assert.equal(animations.tiles.size, 0);
  f.environment.game.settings.get = () => false;
  f.hooks.get("updateSetting")[0]({ key: "core.photosensitiveMode" }); assert.equal(animations.tiles.size, 1);
});

test("tile deletion and Scene teardown destroy only the owned shader and leave no animation state", () => {
  const f = fixture(); const animations = registerFireWallAnimations(f.environment);
  assert.equal(registerFireWallAnimations(f.environment), animations);
  assert.equal(f.hooks.get("drawTile").length, 1);
  const first = f.tile(), second = f.tile(); animations.refresh();
  const texture = second.mesh.texture;
  f.hooks.get("deleteTile")[0](first.document); assert.equal(animations.tiles.size, 1);
  f.hooks.get("canvasTearDown")[0](); assert.equal(animations.tiles.size, 0);
  assert.equal(f.calls.destroyed, 2); assert.equal(second.mesh.texture, texture); assert.equal(f.calls.timers, 0);
  f.hooks.get("destroyTile")[0](first); assert.equal(f.calls.destroyed, 2);
});

test("mesh replacement and native redraws reattach safely without overwriting another shader", () => {
  const f = fixture(); const tile = f.tile(); const animations = new FireWallAnimations(f.environment);
  animations.attach(tile); const first = tile.mesh;
  tile.mesh = f.tile().mesh; animations.attach(tile);
  assert.equal(first.shader.constructor, f.PrimaryShader); assert.equal(f.calls.destroyed, 1);
  const owned = tile.mesh.shader;
  class External extends f.PrimaryShader {}
  tile.mesh.shader = new External(); animations.attach(tile);
  assert.equal(animations.tiles.size, 0); assert.ok(tile.mesh.shader instanceof External);
  assert.notEqual(tile.mesh.shader, owned); assert.equal(f.calls.destroyed, 2);
});

test("unsupported canvas APIs keep the persistent static area tile available", () => {
  const f = fixture(); const tile = f.tile(); const original = tile.mesh.shader;
  delete f.environment.foundry;
  assert.equal(new FireWallAnimations(f.environment).attach(tile), false);
  assert.equal(tile.mesh.shader, original);
  assert.deepEqual(fireColor("invalid"), fireColor("#f47726"));
});
