import * as THREE from 'three';

// Reference: a travelling latitude band on a larger sphere, with a broad
// orbital particle ring. Independent of the textured Earth's axial rotation.
export function createGlobeShell(parent) {
  const group = new THREE.Group();
  group.name = 'Globe scanning shell and orbital light';
  parent.add(group);
  const uniforms = {
    time: { value: 0 },
    front: { value: 0.7 },
    visibleGain: { value: 1 },
  };
  const shellMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 localPoint;
      varying vec3 viewNormal;
      varying vec3 eye;
      void main() {
        localPoint = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        viewNormal = normalize(normalMatrix * normal);
        eye = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float front;
      uniform float visibleGain;
      varying vec3 localPoint;
      varying vec3 viewNormal;
      varying vec3 eye;
      // Distance to the edge of a regular hexagonal Voronoi cell.
      float honeycomb(vec2 p) {
        vec2 tile = vec2(1.7320508, 3.0);
        vec2 a = mod(p, tile) - tile * 0.5;
        vec2 b = mod(p - tile * 0.5, tile) - tile * 0.5;
        vec2 cell = dot(a, a) < dot(b, b) ? a : b;
        cell = abs(cell);
        float edge = max(cell.x, dot(cell, vec2(0.5, 0.8660254)));
        float aa = max(fwidth(edge), 0.035);
        return 1.0 - smoothstep(0.024, 0.024 + aa, abs(edge - 0.8660254));
      }
      void main() {
        float trail = localPoint.y - front;
        if (trail < 0.0 || trail > 0.88) discard;
        float latitude = asin(clamp(localPoint.y, -1.0, 1.0));
        float longitude = atan(localPoint.z, localPoint.x);
        // Close to the video: very fine, evenly shaped cells, only a slow drift.
        vec2 p = vec2(longitude * 79.0 + time * 0.13, latitude * 79.0);
        float grid = honeycomb(p);
        float fade = pow(1.0 - smoothstep(0.015, 0.88, trail), 1.35);
        float edge = exp(-trail * 115.0);
        float facing = clamp(dot(normalize(viewNormal), normalize(eye)), 0.0, 1.0);
        float rim = pow(1.0 - facing, 2.0);
        float pulse = 0.96 + 0.04 * sin(time * 1.4);
        float alpha = (0.047 + grid * 0.17 + rim * 0.027) * fade;
        alpha += edge * 0.12;
        vec3 color = mix(vec3(0.045, 0.28, 0.52), vec3(0.17, 0.65, 0.95), grid * 0.55 + edge * 0.25);
        gl_FragColor = vec4(color, alpha * visibleGain * pulse);
      }
    `,
  });
  shellMaterial.extensions.derivatives = true;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(35.6, 192, 128), shellMaterial);
  shell.name = 'Moving spherical honeycomb scan';
  shell.renderOrder = 5;
  group.add(shell);

  // Diameter is about 2.5 times the Earth diameter, as seen in the wide view.
  const orbit = new THREE.Group();
  orbit.name = 'Wide particle orbit';
  group.add(orbit);
  const orbitMaterial = new THREE.ShaderMaterial({
    uniforms: { time: uniforms.time },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 p;
      void main() { p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float time;
      varying vec3 p;
      void main() {
        float radius = length(p.xy);
        float d = abs(radius - 73.0);
        float core = exp(-d * d * 110.0);
        float glow = exp(-d * d * 1.9);
        float angle = atan(p.y, p.x);
        float moving = pow(max(0.0, cos(angle - time * 0.21)), 36.0);
        float energy = 0.26 + 0.74 * moving;
        vec3 color = mix(vec3(0.075, 0.16, 0.28), vec3(0.34, 0.58, 0.83), moving);
        gl_FragColor = vec4(color, (core * 0.34 + glow * 0.13) * energy);
      }
    `,
  });
  const ribbon = new THREE.Mesh(new THREE.RingGeometry(70.8, 75.2, 640), orbitMaterial);
  ribbon.rotation.x = -Math.PI / 2;
  orbit.add(ribbon);

  // Deterministic particles, with most of the ring remaining quiet and dark.
  const positions = [], phases = [], sizes = [];
  let seed = 71;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 1600; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 73 + (random() - 0.5) * 0.42;
    positions.push(Math.cos(angle) * radius, (random() - 0.5) * 0.24, Math.sin(angle) * radius);
    phases.push(angle);
    sizes.push(0.55 + random() * 1.1);
  }
  const particlesGeometry = new THREE.BufferGeometry();
  particlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  particlesGeometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  particlesGeometry.setAttribute('dotSize', new THREE.Float32BufferAttribute(sizes, 1));
  const particlesMaterial = new THREE.ShaderMaterial({
    uniforms: { time: uniforms.time, pixelRatio: { value: Math.min(devicePixelRatio, 2) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float time;
      uniform float pixelRatio;
      attribute float phase;
      attribute float dotSize;
      varying float energy;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float sweep = pow(max(0.0, cos(phase - time * 0.21)), 28.0);
        energy = 0.07 + sweep * 0.83;
        gl_PointSize = clamp(dotSize * pixelRatio * 145.0 / max(20.0, -mv.z), 0.6, 3.5);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float energy;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(0.30, 0.61, 0.94, pow(1.0 - d, 1.5) * energy);
      }
    `,
  });
  orbit.add(new THREE.Points(particlesGeometry, particlesMaterial));

  let started = performance.now() / 1000;
  return {
    group,
    reset(now) { started = now; },
    update(now) {
      const elapsed = now - started;
      uniforms.time.value = elapsed;
      // Downward travel only; fade out below the south pole, then restart.
      const cycle = ((elapsed + 0.52) % 4.8) / 4.8;
      uniforms.front.value = 1.12 - cycle * 2.48;
      uniforms.visibleGain.value = THREE.MathUtils.smoothstep(cycle, 0, 0.08) * (1 - THREE.MathUtils.smoothstep(cycle, 0.91, 1));
      orbit.rotation.set(0.04 + Math.sin(elapsed * 0.20) * 0.19, 0, Math.sin(elapsed * 0.14) * 0.12);
    },
  };
}
