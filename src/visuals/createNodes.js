import { AdditiveBlending, Color, Group, Mesh, MeshStandardMaterial, ShaderMaterial, SphereGeometry } from 'three';

const DEFAULT_RADIUS = 100;
const DEFAULT_SEGMENTS = {
  width: 48,
  height: 32,
};

const NOISE_CHUNK = `
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float cnoise(vec3 P) {
  vec3 Pi0 = floor(P);
  vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod289(Pi0);
  Pi1 = mod289(Pi1);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.y, Pi0.y, Pi1.y, Pi1.y);
  vec4 iz0 = vec4(Pi0.z);
  vec4 iz1 = vec4(Pi1.z);

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 * (1.0 / 7.0);
  vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 * (1.0 / 7.0);
  vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

  vec4 norm0 = taylorInvSqrt(
    vec4(
      dot(g000, g000),
      dot(g010, g010),
      dot(g100, g100),
      dot(g110, g110)
    )
  );
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;

  vec4 norm1 = taylorInvSqrt(
    vec4(
      dot(g001, g001),
      dot(g011, g011),
      dot(g101, g101),
      dot(g111, g111)
    )
  );
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.y, Pf0.z));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.x, Pf1.y, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.x, Pf0.y, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.y, Pf1.z));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = Pf0 * Pf0 * Pf0 * (Pf0 * (Pf0 * 6.0 - 15.0) + 10.0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
  return 2.2 * n_xyz;
}
`;

function applyRippleShader(material, { radius = 100 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uRippleStrength = { value: 0 };
    shader.uniforms.uRadius = { value: radius };

    material.userData.uniforms = shader.uniforms;

    shader.vertexShader = `
uniform float uTime;
uniform float uRippleStrength;
uniform float uRadius;
varying vec3 vModelPosition;
${NOISE_CHUNK}
` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
        vec3 displacedPosition = position;
        float rippleStrength = max(uRippleStrength, 0.0);
        if (rippleStrength > 0.0001) {
          float noiseSample = cnoise(position * 0.03 + uTime * 0.6);
          float wave = sin(uTime * 4.0 + noiseSample * 6.28318);
          float displacement = (noiseSample * 0.6 + wave * 0.4) * rippleStrength;
          displacedPosition += normal * displacement;
        }
        vec3 transformed = displacedPosition;
        vModelPosition = transformed;
      `,
    );

    // Fragment: add purple energy-core emissive
    shader.fragmentShader = `
uniform float uTime;
uniform float uRadius;
uniform vec3 uGlowColor;
uniform float uGlowIntensity;
uniform float uNoiseScale;
uniform float uNoiseIntensity;
uniform float uRimPower;
varying vec3 vModelPosition;
${NOISE_CHUNK}
` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
        #include <emissivemap_fragment>
        vec3 viewDir_ec = normalize(vViewPosition);
        float rim_ec = pow(1.0 - max(0.0, dot(normalize(normal), -viewDir_ec)), uRimPower);
        float n_ec = cnoise(normalize(vModelPosition) * uNoiseScale + vec3(uTime * 0.6));
        float bands_ec = smoothstep(0.2, 0.95, abs(sin(n_ec * 12.566 + uTime * 2.2)));
        float r_ec = clamp(length(vModelPosition) / max(uRadius, 1e-4), 0.0, 1.0);
        float core_ec = pow(smoothstep(1.0, 0.0, r_ec), 1.6);
        float energy_ec = rim_ec * 0.65 + bands_ec * uNoiseIntensity + core_ec * 0.85;
        totalEmissiveRadiance += uGlowColor * (uGlowIntensity * energy_ec);
      `,
    );
  };

  material.customProgramCacheKey = () => `ripple-${material.uuid}`;
  material.needsUpdate = true;
}

function applyEnergyCoreUniforms(material, {
  glowColor = 0xC084FC, // soft purple
  glowIntensity = 1.4,
  noiseScale = 3.2,
  noiseIntensity = 0.8,
  rimPower = 2.4,
} = {}) {
  const u = (material.userData.uniforms ||= {});
  u.uGlowColor = u.uGlowColor || { value: new Color(glowColor).convertSRGBToLinear() };
  u.uGlowIntensity = u.uGlowIntensity || { value: glowIntensity };
  u.uNoiseScale = u.uNoiseScale || { value: noiseScale };
  u.uNoiseIntensity = u.uNoiseIntensity || { value: noiseIntensity };
  u.uRimPower = u.uRimPower || { value: rimPower };
}

export function createNodes(nodes, options = {}) {
  if (!Array.isArray(nodes)) {
    throw new TypeError('createNodes expects an array of node descriptors.');
  }

  const {
    radius = DEFAULT_RADIUS,
    widthSegments = DEFAULT_SEGMENTS.width,
    heightSegments = DEFAULT_SEGMENTS.height,
    materialOptions = {},
    getColor,
  } = options;

  const geometry = new SphereGeometry(radius, widthSegments, heightSegments);
  const haloGeometry = new SphereGeometry(radius * 1.15, widthSegments, heightSegments);
  const group = new Group();
  const meshes = [];
  const materials = new Set();

  function createHaloMaterialForNode(color) {
    const baseColor = new Color(0x9b5de5);
    if (color != null) baseColor.set(color);
    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: baseColor.convertSRGBToLinear() },
        uIntensity: { value: 1.05 },
        uOpacity: { value: 0.9 },
        uNoiseScale: { value: 2.6 },
        uNoiseSpeed: { value: 0.5 },
        uBanding: { value: 0.6 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: `
        varying vec3 vNormalVS;
        varying vec3 vViewDir;
        varying vec3 vWorldNormal;
        void main(){
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormalVS = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPosition.xyz);
          vWorldNormal = normalize(normal);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uOpacity;
        uniform float uNoiseScale;
        uniform float uNoiseSpeed;
        uniform float uBanding;
        varying vec3 vNormalVS;
        varying vec3 vViewDir;
        varying vec3 vWorldNormal;
        ${NOISE_CHUNK}
        void main(){
          float rim = pow(1.0 - max(0.0, dot(normalize(vNormalVS), normalize(vViewDir))), 2.1);
          float n = cnoise(vWorldNormal * uNoiseScale + vec3(uNoiseSpeed * uTime));
          float wave = smoothstep(0.2, 0.95, abs(sin(n * 12.566 + uTime * 1.8)));
          float glow = mix(wave * uBanding, rim, 0.7);
          float alpha = glow * uOpacity;
          vec3 color = uColor * (glow * uIntensity + 0.06);
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    materials.add(mat);
    return mat;
  }

  function createMaterialForNode(color) {
    const material = new MeshStandardMaterial({
      color: 0x9b5de5,
      emissive: 0x6d28d9,
      emissiveIntensity: 1.3,
      roughness: 0.2,
      metalness: 0.0,
      wireframe: false,
      transparent: true,
      opacity: 0.96,
      ...materialOptions,
    });

    let glowColor = undefined;
    if (color != null) {
      material.color.set(color);
      glowColor = color;
    }

    applyRippleShader(material, { radius });
    applyEnergyCoreUniforms(material, glowColor != null ? { glowColor } : undefined);
    materials.add(material);

    return material;
  }

  nodes.forEach((node) => {
    const color = typeof getColor === 'function' ? getColor(node) : null;
    const material = createMaterialForNode(color);
    const mesh = new Mesh(geometry, material);
    // Add glow halo as a child mesh
    const haloMaterial = createHaloMaterialForNode(color);
    const halo = new Mesh(haloGeometry, haloMaterial);
    mesh.add(halo);

    mesh.position.set(node.x, node.y, 0);
    mesh.userData = {
      ...mesh.userData,
      node,
      ripple: {
        strength: 0,
        target: 0,
        speed: 6,
      },
    };

    group.add(mesh);
    meshes.push(mesh);
  });

  return {
    group,
    meshes,
    update(deltaTime, elapsedTime) {
      materials.forEach((m) => {
        const uniforms = m.userData?.uniforms ?? m.uniforms;
        if (uniforms && uniforms.uTime) {
          uniforms.uTime.value = elapsedTime;
        }
      });

      meshes.forEach((mesh) => {
        const rippleState = mesh.userData?.ripple;
        const uniforms = mesh.material?.userData?.uniforms;

        if (!rippleState || !uniforms) return;

        const { target, speed } = rippleState;
        let { strength } = rippleState;

        const maxStep = (speed ?? 6) * deltaTime;
        const diff = target - strength;

        if (Math.abs(diff) > maxStep) {
          strength += Math.sign(diff) * maxStep;
        } else {
          strength = target;
        }

        rippleState.strength = strength;
        uniforms.uRippleStrength.value = strength;
      });
    },
    dispose() {
      geometry.dispose();
      haloGeometry.dispose();
      materials.forEach((material) => material.dispose());
      materials.clear();
    },
  };
}
