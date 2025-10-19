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

function applyRippleShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uRippleStrength = { value: 0 };

    material.userData.uniforms = shader.uniforms;

    shader.vertexShader = `
uniform float uTime;
uniform float uRippleStrength;
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
      `,
    );
  };

  material.customProgramCacheKey = () => `ripple-${material.uuid}`;
  material.needsUpdate = true;
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
    const baseColor = new Color(0x7dd3fc);
    if (color != null) baseColor.set(color);
    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: baseColor.convertSRGBToLinear() },
        uIntensity: { value: 0.85 },
        uOpacity: { value: 0.9 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: `
        varying vec3 vNormalVS;
        varying vec3 vViewDir;
        void main(){
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormalVS = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uOpacity;
        varying vec3 vNormalVS;
        varying vec3 vViewDir;
        void main(){
          float rim = pow(1.0 - max(0.0, dot(normalize(vNormalVS), normalize(vViewDir))), 2.2);
          float face = smoothstep(0.0, 1.0, max(0.0, dot(normalize(vNormalVS), vec3(0.0,0.0,1.0))));
          float glow = mix(face * 0.6, rim, 0.6);
          float alpha = glow * uOpacity;
          vec3 color = uColor * (glow * uIntensity + 0.05);
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
      color: 0x38bdf8,
      emissive: 0x1e40af,
      emissiveIntensity: 1.2,
      roughness: 0.15,
      metalness: 0.0,
      wireframe: false,
      transparent: true,
      opacity: 0.95,
      ...materialOptions,
    });

    if (color != null) {
      material.color.set(color);
    }

    applyRippleShader(material);
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
