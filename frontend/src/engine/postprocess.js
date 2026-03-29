/**
 * HCMN Post-Processing Pipeline — CRT, Night Vision, Thermal, and LUT shaders.
 *
 * Each effect is a Cesium PostProcessStage with a custom GLSL fragment shader.
 * Effects can be toggled independently and combined.  Configurable uniforms
 * allow real-time adjustment of distortion amount, scanline density, noise
 * intensity, and time-based animation.
 */
import * as Cesium from 'cesium';

// ---------------------------------------------------------------------------
// Default uniform values (can be overridden at runtime)
// ---------------------------------------------------------------------------
const DEFAULTS = {
  distortionAmount: 0.15,
  scanlineDensity: 800.0,
  noiseIntensity: 0.08,
  chromaticAberration: 0.003,
  vignetteStrength: 1.2,
};

let _uniforms = { ...DEFAULTS };

// ---------------------------------------------------------------------------
// GLSL Fragment Shaders (with configurable uniforms)
// ---------------------------------------------------------------------------

const CRT_SHADER = `
  uniform sampler2D colorTexture;
  in vec2 v_textureCoordinates;
  uniform float czm_frameNumber;
  uniform float u_distortionAmount;
  uniform float u_scanlineDensity;
  uniform float u_chromaticAberration;
  uniform float u_vignetteStrength;

  void main() {
    vec2 uv = v_textureCoordinates;
    float time = czm_frameNumber * 0.01;

    // ── Barrel distortion ──────────────────────────────────────
    // Normalize UV to [-1, 1], apply radial distortion, map back
    vec2 uvNorm = uv * 2.0 - 1.0;
    float r = length(uvNorm);
    vec2 distorted = uvNorm * (1.0 + u_distortionAmount * r * r);
    vec2 uvFinal = distorted * 0.5 + 0.5;

    // Bounds check — render black outside the curved screen
    if (uvFinal.x < 0.0 || uvFinal.x > 1.0 || uvFinal.y < 0.0 || uvFinal.y > 1.0) {
      out_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    // ── Scanlines ──────────────────────────────────────────────
    float scanline = sin(uvFinal.y * u_scanlineDensity + time * 5.0) * 0.04;
    float scanMult = 0.5 + 0.5 * sin(uvFinal.y * u_scanlineDensity);

    // ── Chromatic aberration ───────────────────────────────────
    float cr = texture(colorTexture, uvFinal + vec2(u_chromaticAberration, 0.0)).r;
    float cg = texture(colorTexture, uvFinal).g;
    float cb = texture(colorTexture, uvFinal - vec2(u_chromaticAberration, 0.0)).b;

    // ── Vignette ───────────────────────────────────────────────
    vec2 centered = uv - 0.5;
    float vignette = 1.0 - length(centered) * u_vignetteStrength;
    vignette = clamp(vignette, 0.0, 1.0);

    // ── Flicker ────────────────────────────────────────────────
    float flicker = 0.97 + 0.03 * sin(time * 8.0);

    vec3 color = vec3(cr, cg, cb);
    color = color * scanMult * vignette * flicker + scanline;
    // Green phosphor tint
    color *= vec3(0.65, 1.0, 0.65);

    out_FragColor = vec4(color, 1.0);
  }
`;

const NVG_SHADER = `
  uniform sampler2D colorTexture;
  in vec2 v_textureCoordinates;
  uniform float czm_frameNumber;
  uniform float u_noiseIntensity;

  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = v_textureCoordinates;
    vec4 color = texture(colorTexture, uv);

    // Perceived luminance: L = 0.299R + 0.587G + 0.114B
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    // Amplify (simulate analog light amplification)
    lum = pow(lum, 0.6) * 1.6;
    lum = clamp(lum, 0.0, 1.0);

    // Film grain — pseudo-random noise animated by frame number
    float noise = rand(uv + fract(czm_frameNumber * 0.01)) * u_noiseIntensity;

    // Circular vignette (NVG tube mask)
    float dist = length(uv - 0.5) * 2.0;
    float tube = 1.0 - smoothstep(0.85, 1.0, dist);

    // Green amplified output
    vec3 nvg = vec3(lum * 0.1, lum * 0.95 + noise, lum * 0.2);
    nvg *= tube;

    out_FragColor = vec4(nvg, 1.0);
  }
`;

const THERMAL_SHADER = `
  uniform sampler2D colorTexture;
  in vec2 v_textureCoordinates;

  vec3 thermalPalette(float t) {
    // Black → Deep Blue → Purple → Red → Orange → Yellow → White
    if (t < 0.15) return mix(vec3(0.0, 0.0, 0.05), vec3(0.0, 0.0, 0.4), t / 0.15);
    if (t < 0.3)  return mix(vec3(0.0, 0.0, 0.4), vec3(0.4, 0.0, 0.5), (t - 0.15) / 0.15);
    if (t < 0.5)  return mix(vec3(0.4, 0.0, 0.5), vec3(0.85, 0.1, 0.1), (t - 0.3) / 0.2);
    if (t < 0.7)  return mix(vec3(0.85, 0.1, 0.1), vec3(1.0, 0.55, 0.0), (t - 0.5) / 0.2);
    if (t < 0.85) return mix(vec3(1.0, 0.55, 0.0), vec3(1.0, 0.9, 0.0), (t - 0.7) / 0.15);
    return mix(vec3(1.0, 0.9, 0.0), vec3(1.0, 1.0, 1.0), (t - 0.85) / 0.15);
  }

  void main() {
    vec4 color = texture(colorTexture, v_textureCoordinates);
    // Perceived luminance → thermal gradient
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    // Invert for "white hot" effect
    float whiteHot = 1.0 - luminance;
    vec3 thermal = thermalPalette(clamp(whiteHot, 0.0, 1.0));
    out_FragColor = vec4(thermal, 1.0);
  }
`;

const CLASSIFIED_SHADER = `
  uniform sampler2D colorTexture;
  in vec2 v_textureCoordinates;
  uniform float czm_frameNumber;

  void main() {
    vec2 uv = v_textureCoordinates;
    vec4 color = texture(colorTexture, uv);
    float time = czm_frameNumber * 0.005;

    // Desaturate
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    // Amber/gold intelligence tint
    vec3 tinted = vec3(lum * 1.1, lum * 0.9, lum * 0.5);

    // Subtle vignette
    float v = 1.0 - length(uv - 0.5) * 0.6;
    tinted *= v;

    // Slight contrast boost
    tinted = (tinted - 0.5) * 1.15 + 0.5;
    tinted = clamp(tinted, 0.0, 1.0);

    out_FragColor = vec4(tinted, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Stage management
// ---------------------------------------------------------------------------

const _stages = {};

/**
 * Install all post-processing stages on the viewer (initially disabled).
 * @param {Cesium.Viewer} viewer
 */
export function installPostProcessing(viewer) {
  const pp = viewer.scene.postProcessStages;

  _stages.crt = pp.add(new Cesium.PostProcessStage({
    name: 'hcmn_crt',
    fragmentShader: CRT_SHADER,
    uniforms: {
      u_distortionAmount: () => _uniforms.distortionAmount,
      u_scanlineDensity: () => _uniforms.scanlineDensity,
      u_chromaticAberration: () => _uniforms.chromaticAberration,
      u_vignetteStrength: () => _uniforms.vignetteStrength,
    },
  }));
  _stages.crt.enabled = false;

  _stages.nvg = pp.add(new Cesium.PostProcessStage({
    name: 'hcmn_nvg',
    fragmentShader: NVG_SHADER,
    uniforms: {
      u_noiseIntensity: () => _uniforms.noiseIntensity,
    },
  }));
  _stages.nvg.enabled = false;

  _stages.thermal = pp.add(new Cesium.PostProcessStage({
    name: 'hcmn_thermal',
    fragmentShader: THERMAL_SHADER,
  }));
  _stages.thermal.enabled = false;

  _stages.classified = pp.add(new Cesium.PostProcessStage({
    name: 'hcmn_classified',
    fragmentShader: CLASSIFIED_SHADER,
  }));
  _stages.classified.enabled = false;

  return _stages;
}

/**
 * Toggle a named post-processing effect.
 * Only one stylistic filter is active at a time (or none).
 * @param {string} name - 'crt' | 'nvg' | 'thermal' | 'classified' | 'none'
 */
export function setFilter(name) {
  for (const [key, stage] of Object.entries(_stages)) {
    stage.enabled = key === name;
  }
}

/** Get the currently active filter name, or 'none'. */
export function getActiveFilter() {
  for (const [key, stage] of Object.entries(_stages)) {
    if (stage.enabled) return key;
  }
  return 'none';
}

/**
 * Update shader uniform values at runtime.
 * @param {object} overrides - Partial uniform values to merge.
 */
export function setPostProcessUniforms(overrides) {
  Object.assign(_uniforms, overrides);
}

/** Get the current uniform values. */
export function getPostProcessUniforms() {
  return { ..._uniforms };
}

/** Reset uniforms to defaults. */
export function resetPostProcessUniforms() {
  _uniforms = { ...DEFAULTS };
}

/** Available filter names with display labels. */
export const FILTERS = [
  { id: 'none', label: 'Standard', icon: '🔲' },
  { id: 'crt', label: 'CRT Monitor', icon: '📺' },
  { id: 'nvg', label: 'Night Vision', icon: '🌙' },
  { id: 'thermal', label: 'Thermal', icon: '🌡️' },
  { id: 'classified', label: 'Classified', icon: '🔒' },
];
