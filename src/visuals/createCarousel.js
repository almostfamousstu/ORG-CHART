import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  Data3DTexture,
  Group,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
} from 'three';

const PANEL_SPACING = 1.4;
const PANEL_WIDTH = 1.6;
const PANEL_HEIGHT = 0.96;
const BUTTON_WIDTH = 0.92;
const BUTTON_HEIGHT = 0.34;
const DEFAULT_PANEL_COUNT = 4;

function createRippleMaterial({ color, opacity, volumeTexture, labelTexture }) {
  const uniforms = {
    uTime: { value: 0 },
    uRippleStrength: { value: 0 },
    uRippleCenter: { value: new Vector2(0.5, 0.5) },
    uVolumeTexture: { value: volumeTexture },
    uLabelTexture: { value: labelTexture ?? null },
    uHasLabel: { value: labelTexture ? 1 : 0 },
    uOpacity: { value: opacity },
    uVisibility: { value: 0 },
    uBaseColor: { value: new Color(color).convertSRGBToLinear() },
    uGlowColor: { value: new Color(0x8b5cf6).convertSRGBToLinear() },
    uGlowIntensity: { value: 0.75 },
  };

  return new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform float uTime;
      uniform float uRippleStrength;
      uniform vec2 uRippleCenter;
      varying vec2 vUv;
      varying vec3 vPosition;

      void main() {
        vUv = uv;
        vPosition = position;
        vec3 transformed = position;
        float dist = distance(uv, uRippleCenter);
        float wave = sin(dist * 28.0 - uTime * 6.0);
        float decay = exp(-dist * 6.0);
        float ripple = wave * decay * uRippleStrength * 0.12;
        transformed.z += ripple;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler3D uVolumeTexture;
      uniform sampler2D uLabelTexture;
      uniform float uHasLabel;
      uniform float uOpacity;
      uniform float uVisibility;
      uniform vec3 uBaseColor;
      uniform vec3 uGlowColor;
      uniform float uGlowIntensity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vPosition;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      vec3 applyPalette(float t) {
        vec3 c1 = vec3(0.274, 0.651, 0.933);
        vec3 c2 = vec3(0.415, 0.549, 0.972);
        vec3 c3 = vec3(0.239, 0.819, 0.752);
        return mix(mix(c1, c2, smoothstep(0.0, 0.65, t)), c3, smoothstep(0.45, 1.0, t));
      }

      void main() {
        float depthCoord = fract(uTime * 0.045 + vUv.y * 0.18 + vUv.x * 0.12);
        vec4 volumeSample = texture(uVolumeTexture, vec3(vUv, depthCoord));
        float shimmer = noise(vUv * 6.0 + uTime * 0.1) * 0.08;
        float starfield = noise(vUv * 18.0 + vec2(uTime * 0.05, uTime * 0.04));
        float glowMask = pow(1.0 - distance(vUv, vec2(0.5, 0.5)), 3.5);
        vec3 glow = uGlowColor * glowMask * uGlowIntensity;
        float atmosphere = smoothstep(0.92, 0.2, length(vPosition.xy) / 1.2);
        vec3 paletteColor = applyPalette(volumeSample.r);
        vec3 base = mix(uBaseColor, paletteColor + volumeSample.gba * 0.35, 0.55);

        vec4 label = texture(uLabelTexture, vUv);
        float labelPresence = uHasLabel * label.a;
        base = mix(base, label.rgb, labelPresence);

        float alpha = clamp((0.35 + volumeSample.a * 0.65 + starfield * 0.08), 0.0, 1.0);
        alpha = max(alpha, labelPresence);
        alpha *= uOpacity * uVisibility;

        vec3 color = base + shimmer + glow + atmosphere * 0.05;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function mulberry32(seed) {
  let t = seed + 0x6d2b79f5;
  return function next() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function createVolumeTexture({ size = 48, generator }) {
  const width = size;
  const height = size;
  const depth = size;
  const data = new Uint8Array(width * height * depth * 4);

  let index = 0;
  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const u = x / (width - 1);
        const v = y / (height - 1);
        const w = z / (depth - 1);
        const sample = generator(u, v, w) ?? [0, 0, 0, 1];
        data[index + 0] = Math.max(0, Math.min(255, Math.round(sample[0] * 255)));
        data[index + 1] = Math.max(0, Math.min(255, Math.round(sample[1] * 255)));
        data[index + 2] = Math.max(0, Math.min(255, Math.round(sample[2] * 255)));
        data[index + 3] = Math.max(0, Math.min(255, Math.round(sample[3] * 255)));
        index += 4;
      }
    }
  }

  const texture = new Data3DTexture(data, width, height, depth);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createPanelVolumeTexture(seed = 1) {
  const random = mulberry32(seed * 997 + 73);
  const phaseA = random();
  const phaseB = random();
  const phaseC = random();

  return createVolumeTexture({
    size: 48,
    generator: (u, v, w) => {
      const center = Math.sqrt((u - 0.5) * (u - 0.5) + (v - 0.5) * (v - 0.5));
      const swirl = Math.sin((u + w) * 6.283 + phaseA * 6.283) * 0.5 + 0.5;
      const band = Math.sin((v * 1.4 + w * 1.9 + phaseB) * 6.283) * 0.5 + 0.5;
      const drift = Math.cos((u * 1.6 + v * 1.3 + phaseC) * 6.283) * 0.5 + 0.5;
      const glow = Math.pow(Math.max(0, 1 - center * 1.35), 2.2);
      const depthPulse = Math.pow(1 - Math.abs(w - 0.5) * 1.6, 2.6);

      const r = 0.35 * swirl + 0.4 * glow + 0.25 * depthPulse;
      const g = 0.32 * band + 0.38 * glow + 0.3 * drift;
      const b = 0.28 * drift + 0.36 * glow + 0.36 * swirl;
      const a = Math.min(1, 0.2 + glow * 0.55 + depthPulse * 0.35);
      return [r, g, b, a];
    },
  });
}

function createButtonVolumeTexture(seed = 11) {
  const random = mulberry32(seed * 577 + 191);
  const phaseA = random();
  const phaseB = random();

  return createVolumeTexture({
    size: 32,
    generator: (u, v, w) => {
      const center = Math.sqrt((u - 0.5) * (u - 0.5) + (v - 0.5) * (v - 0.5));
      const ring = Math.sin((center * 1.8 + w * 0.9 + phaseA) * 6.283) * 0.5 + 0.5;
      const streak = Math.cos(((u + v) * 0.9 + w * 1.7 + phaseB) * 6.283) * 0.5 + 0.5;
      const glow = Math.pow(Math.max(0, 1 - center * 2.2), 2.4);
      const depth = Math.pow(1 - Math.abs(w - 0.5) * 1.8, 2.8);

      const r = 0.3 * ring + 0.4 * glow + 0.3 * depth;
      const g = 0.28 * streak + 0.4 * glow + 0.32 * depth;
      const b = 0.34 * ring + 0.34 * streak + 0.32 * glow;
      const a = Math.min(1, 0.25 + glow * 0.5 + depth * 0.35);
      return [r, g, b, a];
    },
  });
}

function createPanelLabelTexture({ heading, subtitle, lines }) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.08)');
  gradient.addColorStop(0.45, 'rgba(129, 140, 248, 0.12)');
  gradient.addColorStop(1, 'rgba(45, 212, 191, 0.1)');
  ctx.fillStyle = gradient;
  ctx.fillRect(24, 24, canvas.width - 48, canvas.height - 48);

  const highlightGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
  highlightGradient.addColorStop(0.5, 'rgba(190, 242, 255, 0.28)');
  highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = highlightGradient;
  ctx.fillRect(32, 36, canvas.width - 64, 38);

  ctx.strokeStyle = 'rgba(190, 242, 255, 0.42)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(125, 211, 252, 0.28)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(24, 24, canvas.width - 48, canvas.height - 48, 28);
  } else {
    ctx.moveTo(52, 24);
    ctx.lineTo(canvas.width - 52, 24);
    ctx.quadraticCurveTo(canvas.width - 24, 24, canvas.width - 24, 52);
    ctx.lineTo(canvas.width - 24, canvas.height - 52);
    ctx.quadraticCurveTo(canvas.width - 24, canvas.height - 24, canvas.width - 52, canvas.height - 24);
    ctx.lineTo(52, canvas.height - 24);
    ctx.quadraticCurveTo(24, canvas.height - 24, 24, canvas.height - 52);
    ctx.lineTo(24, 52);
    ctx.quadraticCurveTo(24, 24, 52, 24);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(226, 232, 240, 0.96)';
  ctx.font = '300 48px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillText(heading, 36, 96);

  if (subtitle) {
    ctx.fillStyle = 'rgba(148, 197, 253, 0.9)';
    ctx.font = '300 28px "Inter", "Helvetica Neue", sans-serif';
    ctx.fillText(subtitle, 36, 138);
  }

  ctx.fillStyle = 'rgba(241, 245, 249, 0.88)';
  ctx.font = '300 26px "Inter", "Helvetica Neue", sans-serif';

  lines.forEach((line, index) => {
    ctx.fillText(line, 36, 192 + index * 42);
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createButtonLabelTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 180;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, 'rgba(96, 165, 250, 0.08)');
  gradient.addColorStop(0.5, 'rgba(165, 180, 252, 0.18)');
  gradient.addColorStop(1, 'rgba(45, 212, 191, 0.12)');
  ctx.fillStyle = gradient;
  ctx.fillRect(36, 28, canvas.width - 72, canvas.height - 56);

  ctx.strokeStyle = 'rgba(191, 219, 254, 0.48)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(99, 102, 241, 0.32)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(28, 24, canvas.width - 56, canvas.height - 48, 32);
  } else {
    ctx.moveTo(60, 24);
    ctx.lineTo(canvas.width - 60, 24);
    ctx.quadraticCurveTo(canvas.width - 28, 24, canvas.width - 28, 56);
    ctx.lineTo(canvas.width - 28, canvas.height - 56);
    ctx.quadraticCurveTo(canvas.width - 28, canvas.height - 24, canvas.width - 60, canvas.height - 24);
    ctx.lineTo(60, canvas.height - 24);
    ctx.quadraticCurveTo(28, canvas.height - 24, 28, canvas.height - 56);
    ctx.lineTo(28, 56);
    ctx.quadraticCurveTo(28, 24, 60, 24);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(241, 245, 249, 0.94)';
  ctx.font = '300 64px "Inter", "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function disposeTexture(texture) {
  if (texture && typeof texture.dispose === 'function') {
    texture.dispose();
  }
}

function createRippleState(speed = 8) {
  return {
    strength: 0,
    target: 0,
    speed,
  };
}

function mod(value, length) {
  return ((value % length) + length) % length;
}

export function createCarousel({ panelCount = DEFAULT_PANEL_COUNT } = {}) {
  const group = new Group();
  group.visible = false;
  const baseScale = 0.85;
  const basePositionZ = -1.8;
  group.position.set(0, -0.2, basePositionZ);
  group.scale.setScalar(baseScale * 0.9);

  const panelGeometry = new PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT, 32, 32);
  const buttonGeometry = new PlaneGeometry(BUTTON_WIDTH, BUTTON_HEIGHT, 16, 16);

  const panels = [];
  const panelLabelTextures = new Array(panelCount).fill(null);
  const panelVolumeTextures = new Array(panelCount).fill(null);
  const visibilityState = { value: 0, target: 0, speed: 3.2 };

  for (let index = 0; index < panelCount; index += 1) {
    const volumeTexture = createPanelVolumeTexture(index + 1);
    panelVolumeTextures[index] = volumeTexture;

    const labelTexture = createPanelLabelTexture({
      heading: 'Panel',
      subtitle: `Segment ${index + 1}`,
      lines: ['Awaiting selection'],
    });
    panelLabelTextures[index] = labelTexture;

    const material = createRippleMaterial({
      color: 0x67e8f9,
      opacity: 0.85,
      volumeTexture,
      labelTexture,
    });
    material.uniforms.uGlowColor.value.set(0x22d3ee).convertSRGBToLinear();
    material.uniforms.uGlowIntensity.value = 0.95;

    const mesh = new Mesh(panelGeometry, material);
    mesh.position.y = 0.1;
    mesh.userData = {
      ...mesh.userData,
      type: 'panel',
      ripple: createRippleState(7),
      panelIndex: index,
    };

    group.add(mesh);
    panels.push(mesh);
  }

  const backTextures = {
    volume: createButtonVolumeTexture(3),
    label: createButtonLabelTexture('Back'),
  };
  const backMaterial = createRippleMaterial({
    color: 0x38bdf8,
    opacity: 0.9,
    volumeTexture: backTextures.volume,
    labelTexture: backTextures.label,
  });
  backMaterial.uniforms.uGlowColor.value.set(0x60a5fa).convertSRGBToLinear();
  backMaterial.uniforms.uGlowIntensity.value = 0.85;
  const nextTextures = {
    volume: createButtonVolumeTexture(5),
    label: createButtonLabelTexture('Next'),
  };
  const nextMaterial = createRippleMaterial({
    color: 0x2563eb,
    opacity: 0.9,
    volumeTexture: nextTextures.volume,
    labelTexture: nextTextures.label,
  });
  nextMaterial.uniforms.uGlowColor.value.set(0x818cf8).convertSRGBToLinear();
  nextMaterial.uniforms.uGlowIntensity.value = 0.85;

  const backButton = new Mesh(buttonGeometry, backMaterial);
  backButton.position.set(-0.7, -0.65, 0);
  backButton.userData = {
    ...backButton.userData,
    type: 'button',
    action: 'back',
    ripple: createRippleState(10),
  };
  group.add(backButton);

  const nextButton = new Mesh(buttonGeometry, nextMaterial);
  nextButton.position.set(0.7, -0.65, 0);
  nextButton.userData = {
    ...nextButton.userData,
    type: 'button',
    action: 'next',
    ripple: createRippleState(10),
  };
  group.add(nextButton);

  const interactiveObjects = [...panels, backButton, nextButton];

  let scrollPosition = 0;
  let visible = false;
  let visibilityTransition = null;
  let pendingVisibilityTimeout = null;

  function setVisible(nextVisible, { delayMs = 0 } = {}) {
    if (pendingVisibilityTimeout) {
      clearTimeout(pendingVisibilityTimeout);
      pendingVisibilityTimeout = null;
    }

    if (visibilityTransition?.resolve) {
      visibilityTransition.resolve();
    }

    let resolvePromise = null;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    const resolveOnce = () => {
      if (resolvePromise) {
        const complete = resolvePromise;
        resolvePromise = null;
        complete();
      }
    };

    const targetValue = nextVisible ? 1 : 0;

    const startTransition = () => {
      visible = Boolean(nextVisible);
      visibilityState.target = targetValue;
      if (visible) {
        group.visible = true;
      }

      visibilityTransition = {
        resolve: resolveOnce,
        target: targetValue,
        pending: false,
      };

      if (Math.abs(visibilityState.value - targetValue) <= 0.001) {
        if (!visible && visibilityState.value <= 0.001) {
          group.visible = false;
        }
        visibilityTransition.resolve();
        visibilityTransition = null;
      }
    };

    if (delayMs > 0) {
      visibilityTransition = {
        resolve: resolveOnce,
        target: targetValue,
        pending: true,
      };
      pendingVisibilityTimeout = setTimeout(() => {
        pendingVisibilityTimeout = null;
        startTransition();
      }, delayMs);
    } else {
      startTransition();
    }

    return promise;
  }

  function isVisible() {
    return visible;
  }

  function setPanelTexturesFromData(panelsData) {
    for (let index = 0; index < panelLabelTextures.length; index += 1) {
      disposeTexture(panelLabelTextures[index]);

      const panelDescriptor = panelsData[index] ?? panelsData[panelsData.length - 1];
      const labelTexture = createPanelLabelTexture(panelDescriptor);
      panelLabelTextures[index] = labelTexture;
    }

    panels.forEach((panel, meshIndex) => {
      const material = panel.material;
      if (!material?.uniforms) return;
      const dataIndex = panel.userData?.panelIndex ?? meshIndex;
      const labelTexture = panelLabelTextures[dataIndex];
      const volumeTexture = panelVolumeTextures[dataIndex];
      if (labelTexture) {
        material.uniforms.uLabelTexture.value = labelTexture;
        material.uniforms.uHasLabel.value = 1;
      } else {
        material.uniforms.uLabelTexture.value = null;
        material.uniforms.uHasLabel.value = 0;
      }
      if (volumeTexture) {
        material.uniforms.uVolumeTexture.value = volumeTexture;
      }
    });
  }

  function setNode(node, helpers = {}) {
    if (!node) {
      return;
    }

    const childCount = helpers.childCount ?? 0;
    const parentName = helpers.parentName ?? '—';
    const siblingSummary = helpers.siblingSummary ?? 'No siblings';

    const panelData = [
      {
        heading: node.name || 'Untitled',
        subtitle: node.data?.title ?? 'Role',
        lines: [
          `Depth: ${node.depth}`,
          `Height: ${node.height}`,
          `Node ID: ${node.id}`,
        ],
      },
      {
        heading: 'Connections',
        subtitle: 'Network overview',
        lines: [
          `Children: ${childCount}`,
          `Parent: ${parentName}`,
          siblingSummary,
        ],
      },
      {
        heading: 'Coordinates',
        subtitle: 'Layout space',
        lines: [
          `X: ${node.x.toFixed(1)}`,
          `Y: ${node.y.toFixed(1)}`,
          `Center offset: ${helpers.offsetSummary ?? '0,0'}`,
        ],
      },
      {
        heading: 'Insights',
        subtitle: 'Traversal hints',
        lines: [
          `First child: ${helpers.firstChild ?? '—'}`,
          `Last child: ${helpers.lastChild ?? '—'}`,
          `Total siblings: ${helpers.siblingCount ?? 0}`,
        ],
      },
    ];

    setPanelTexturesFromData(panelData);
  }

  function scrollBy(delta) {
    if (panelLabelTextures.length === 0) return;

    scrollPosition += delta;
    const length = panelLabelTextures.length;
    if (length > 0) {
      scrollPosition = mod(scrollPosition, length);
    }
  }

  function setScroll(position) {
    const length = panelLabelTextures.length;
    if (length === 0) return;
    scrollPosition = mod(position, length);
  }

  function updatePanelLayout() {
    const length = panels.length;
    if (length === 0) {
      return;
    }

    const baseIndex = Math.floor(scrollPosition);
    const offset = scrollPosition - baseIndex;

    for (let i = 0; i < length; i += 1) {
      const panelMesh = panels[i];
      const dataIndex = mod(baseIndex + i, length);
      panelMesh.position.x = (i - offset - (length - 1) / 2) * PANEL_SPACING;
      panelMesh.userData.panelIndex = dataIndex;
      const labelTexture = panelLabelTextures[dataIndex];
      const volumeTexture = panelVolumeTextures[dataIndex];
      if (labelTexture) {
        panelMesh.material.uniforms.uLabelTexture.value = labelTexture;
        panelMesh.material.uniforms.uHasLabel.value = 1;
      } else {
        panelMesh.material.uniforms.uLabelTexture.value = null;
        panelMesh.material.uniforms.uHasLabel.value = 0;
      }
      if (volumeTexture) {
        panelMesh.material.uniforms.uVolumeTexture.value = volumeTexture;
      }
    }
  }

  function update(deltaTime, elapsedTime) {
    const { target, speed } = visibilityState;
    const diff = target - visibilityState.value;
    const maxStep = (speed ?? 4) * deltaTime;
    if (Math.abs(diff) > maxStep) {
      visibilityState.value += Math.sign(diff) * maxStep;
    } else {
      visibilityState.value = target;
    }

    const eased = easeOutQuart(visibilityState.value);
    const scale = baseScale * (0.88 + eased * 0.22);
    group.scale.setScalar(scale);
    group.position.z = basePositionZ + (1 - eased) * 0.35;
    if (!visible && visibilityState.value <= 0.01) {
      group.visible = false;
    }

    if (visibilityTransition && !visibilityTransition.pending) {
      const diffToTarget = Math.abs(visibilityState.value - visibilityTransition.target);
      if (diffToTarget <= 0.001) {
        const { resolve } = visibilityTransition;
        visibilityTransition = null;
        resolve?.();
      }
    }

    [...panels, backButton, nextButton].forEach((mesh) => {
      const { ripple } = mesh.userData;
      const uniforms = mesh.material?.uniforms;

      if (uniforms?.uTime) {
        uniforms.uTime.value = elapsedTime;
      }
      if (uniforms?.uVisibility) {
        uniforms.uVisibility.value = eased;
      }

      if (!ripple || !uniforms) {
        return;
      }

      const { target, speed } = ripple;
      let { strength } = ripple;
      const maxStep = (speed ?? 6) * deltaTime;
      const diff = target - strength;

      if (Math.abs(diff) > maxStep) {
        strength += Math.sign(diff) * maxStep;
      } else {
        strength = target;
      }

      ripple.strength = strength;
      uniforms.uRippleStrength.value = strength;
    });

    updatePanelLayout();
  }

  function handlePointerDown(object, uv) {
    if (!object) return;
    const target = object.userData?.interactiveTarget ?? object;
    const ripple = target.userData?.ripple;
    if (uv && target.material?.uniforms?.uRippleCenter) {
      target.material.uniforms.uRippleCenter.value.copy(uv);
    }
    if (ripple) {
      ripple.target = 1;
    }
  }

  function handlePointerUp(object) {
    if (!object) return;
    const target = object.userData?.interactiveTarget ?? object;
    const ripple = target.userData?.ripple;
    if (ripple) {
      ripple.target = 0;
    }
  }

  function dispose() {
    panelGeometry.dispose();
    buttonGeometry.dispose();
    panels.forEach((panel) => {
      panel.material?.dispose();
    });
    panelLabelTextures.forEach(disposeTexture);
    panelVolumeTextures.forEach(disposeTexture);
    disposeTexture(backTextures.label);
    disposeTexture(backTextures.volume);
    disposeTexture(nextTextures.label);
    disposeTexture(nextTextures.volume);
    [backButton, nextButton].forEach((button) => {
      button.material?.dispose();
    });
  }

  return {
    group,
    panels,
    backButton,
    nextButton,
    interactiveObjects,
    setVisible,
    isVisible,
    setNode,
    scrollBy,
    setScroll,
    update,
    handlePointerDown,
    handlePointerUp,
    dispose,
  };
}

function easeOutQuart(value) {
  return 1 - Math.pow(1 - value, 4);
}
