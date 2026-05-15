import * as THREE from "three";

const DAY_TEX_URL =
  "https://unpkg.com/three-globe@2.31.0/example/img/earth-day.jpg";
const NIGHT_TEX_URL =
  "https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg";

// World-space normal so the lighting term stays anchored to the planet,
// not to the camera. Using normalMatrix here was the bug that made the
// terminator track the viewpoint.
const vertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform vec3 sunDir;
  uniform float nightBoost;
  uniform float dayReady;
  uniform float nightReady;
  void main() {
    float lighting = dot(normalize(vWorldNormal), normalize(sunDir));
    float blend = smoothstep(-0.15, 0.15, lighting);
    // Baseline tint so the sphere is visible while textures are still loading.
    vec3 dayFallback = vec3(0.18, 0.32, 0.55);
    vec3 nightFallback = vec3(0.02, 0.03, 0.06);
    vec3 day = mix(dayFallback, texture2D(dayTex, vUv).rgb, dayReady);
    vec3 night = mix(nightFallback, texture2D(nightTex, vUv).rgb * nightBoost, nightReady);
    float rim = (1.0 - abs(lighting)) * 0.12;
    vec3 mixed = mix(night, day, blend);
    gl_FragColor = vec4(mixed + vec3(0.05, 0.08, 0.12) * rim, 1.0);
  }
`;

export function createDayNightMaterial(): THREE.ShaderMaterial {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");

  const placeholder = new THREE.Texture();
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      dayTex: { value: placeholder },
      nightTex: { value: placeholder },
      sunDir: { value: subsolarVector(new Date()) },
      nightBoost: { value: 1.6 },
      dayReady: { value: 0 },
      nightReady: { value: 0 },
    },
  });

  loader.load(
    DAY_TEX_URL,
    (tex) => {
      (tex as unknown as { colorSpace?: string }).colorSpace = THREE.SRGBColorSpace;
      material.uniforms.dayTex.value = tex;
      material.uniforms.dayReady.value = 1;
      material.uniformsNeedUpdate = true;
    },
    undefined,
    (err) => console.error("day texture failed", err),
  );

  loader.load(
    NIGHT_TEX_URL,
    (tex) => {
      (tex as unknown as { colorSpace?: string }).colorSpace = THREE.SRGBColorSpace;
      material.uniforms.nightTex.value = tex;
      material.uniforms.nightReady.value = 1;
      material.uniformsNeedUpdate = true;
    },
    undefined,
    (err) => console.error("night texture failed", err),
  );

  return material;
}

/**
 * Compute the subsolar point — the (lat, lon) where the sun is directly
 * overhead at the given UTC instant. Uses NOAA's mean-sun approximation
 * (good to ~0.05° for the next century). Returns radians.
 */
function subsolarLatLon(date: Date): { lat: number; lon: number } {
  // Days since J2000.0 (2000-01-01 12:00 UTC).
  const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
  const d = (date.getTime() - J2000) / 86_400_000;

  const deg = Math.PI / 180;
  const L = (280.460 + 0.9856474 * d) % 360;             // mean longitude (deg)
  const g = ((357.528 + 0.9856003 * d) % 360) * deg;     // mean anomaly (rad)
  const lambda =
    (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * deg; // ecliptic lon
  const epsilon = (23.439 - 0.0000004 * d) * deg;        // obliquity (rad)

  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const rightAscension = Math.atan2(
    Math.cos(epsilon) * Math.sin(lambda),
    Math.cos(lambda),
  );

  // Greenwich Mean Sidereal Time in hours.
  const gmst_hours = (18.697374558 + 24.06570982441908 * d) % 24;
  const gmst_rad = ((gmst_hours + 24) % 24) * 15 * deg;

  // Subsolar longitude: where the hour angle of the sun is zero.
  let lon = rightAscension - gmst_rad;
  // Wrap into [-π, π].
  lon = Math.atan2(Math.sin(lon), Math.cos(lon));

  return { lat: declination, lon };
}

/**
 * Convert geographic (lat, lon in radians) to a unit vector in
 * three-globe's world coordinate frame. Derived from three-globe's
 * polar2Cartesian:
 *   phi   = lat
 *   theta = lon - π   (so prime meridian sits on +X)
 *   x = -cos(phi) cos(theta) =  cos(lat) cos(lon)
 *   y =  sin(phi)            =  sin(lat)
 *   z =  cos(phi) sin(theta) = -cos(lat) sin(lon)
 * So east (+lon) is the -Z direction, north pole is +Y.
 */
export function geoToVector(lat: number, lon: number): THREE.Vector3 {
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    cosLat * Math.cos(lon),
    Math.sin(lat),
    -cosLat * Math.sin(lon),
  ).normalize();
}

export function subsolarVector(date: Date): THREE.Vector3 {
  const { lat, lon } = subsolarLatLon(date);
  return geoToVector(lat, lon);
}

export function updateSunUniform(
  material: THREE.ShaderMaterial,
  date: Date = new Date(),
): void {
  const v = subsolarVector(date);
  (material.uniforms.sunDir.value as THREE.Vector3).copy(v);
  material.uniformsNeedUpdate = true;
}
