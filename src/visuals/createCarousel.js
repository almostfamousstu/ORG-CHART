import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  Data3DTexture,
  Group,
  LinearFilter,
  Mesh,
  Sprite,
  SpriteMaterial,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createRoundedBoxGlassMaterial, loadHdrEquirect } from '../three/roundedBoxMaterial.js';

const PANEL_SPACING = 1.4; // retained for potential linear fallback
const PANEL_WIDTH = 1.6;
const PANEL_HEIGHT = 0.96;
const CAROUSEL_RADIUS = 1.25; // ring radius for Y-axis rotation
const BUTTON_MARGIN_WORLD = 0.18; // margin from screen edge at button depth
const BUTTON_WIDTH = 0.92;
const BUTTON_HEIGHT = 0.34;
const DEFAULT_PANEL_COUNT = 4;

// Fixed panel labels (transparent background, centered text)
const PANEL_TEXTS = ['Micro-Automations', 'Administration', 'R&D', 'Culture'];

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
      uniform float uVisibility;
      uniform vec2 uRippleCenter;
      varying vec2 vUv;
      varying vec3 vPosition;

      void main() {
        vUv = uv;
        vPosition = position;
        vec3 transformed = position;
        // Softer float-in/out based on visibility
        float appear = clamp(uVisibility, 0.0, 1.0);
        float k = 1.0 - appear;
        transformed.z += k * 0.4;
        transformed.y += k * 0.05;
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
        // Sample label texture
        vec4 label = texture(uLabelTexture, vUv);
        float labelPresence = uHasLabel * label.a;

        // Soft text glow constrained by label alpha
        float glowMask = pow(1.0 - distance(vUv, vec2(0.5, 0.5)), 3.5);
        float shimmer = noise(vUv * 6.0 + uTime * 0.1) * 0.06;
        vec3 glow = uGlowColor * (glowMask + shimmer) * uGlowIntensity * labelPresence;

        // Keep label fully visible (no fade); background stays transparent
        float alpha = labelPresence * uOpacity;
        vec3 color = label.rgb + glow;
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

  // Transparent background; centered, sleek text with subtle glow
  const mainText = String(heading ?? '').trim();
  const display = mainText.length > 0 ? mainText : '';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Outer glow
  ctx.shadowColor = 'rgba(56, 189, 248, 0.7)';
  ctx.shadowBlur = 24;

  // Gradient fill for modern look
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, '#93c5fd');
  grad.addColorStop(0.5, '#a78bfa');
  grad.addColorStop(1, '#5eead4');
  ctx.fillStyle = grad;

  // Font stack with futuristic options
  ctx.font = '600 72px "Orbitron", "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(display, canvas.width / 2, canvas.height / 2);

  // Slight sharp pass (stroke) to help readability
  ctx.shadowBlur = 0;

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
  // Text only, transparent background
  ctx.fillStyle = 'rgba(241, 245, 249, 0.98)';
  ctx.font = '400 96px "Inter", "Helvetica Neue", sans-serif';
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
  // Move the carousel farther from the camera so the full ring is visible
  const basePositionZ = -3.5;
  group.position.set(0, -0.2, basePositionZ);
  group.scale.setScalar(baseScale * 0.9);

  // UI group, attached to camera for screen-edge buttons
  const uiGroup = new Group();
  uiGroup.name = 'carousel-ui';

  const panelGeometry = new PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT, 32, 32);
  const buttonGeometry = new PlaneGeometry(BUTTON_WIDTH, BUTTON_HEIGHT, 16, 16);

  // RoundedBox glass backplates (Codrops-style)
  const PANEL_RADIUS = 0.12;
  const BUTTON_RADIUS = 0.10;
  const BOX_DEPTH = 0.08;

  const panelBackGeometry = new RoundedBoxGeometry(PANEL_WIDTH, PANEL_HEIGHT, BOX_DEPTH, 16, PANEL_RADIUS);
  const buttonBackGeometry = new RoundedBoxGeometry(BUTTON_WIDTH, BUTTON_HEIGHT, BOX_DEPTH, 12, BUTTON_RADIUS);

  const glassMaterial = createRoundedBoxGlassMaterial({
    transmission: 1,
    thickness: 1.5,
    roughness: 0.07,
    envMap: null,
    envMapIntensity: 1.5,
  });

  // Load an HDR env map (Codrops-style reflections)
  // The file is placed in `public/assets/empty_warehouse_01_2k.hdr`.
  const HDR_URL = '/assets/empty_warehouse_01_2k.hdr';
  loadHdrEquirect(HDR_URL)
    .then((tex) => {
      glassMaterial.envMap = tex;
      glassMaterial.envMapIntensity = 1.5;
      glassMaterial.needsUpdate = true;
    })
    .catch(() => {
      /* ignore missing HDR; glass still works */
    });

  const panels = [];
  const panelLabelTextures = new Array(panelCount).fill(null);
  const panelVolumeTextures = new Array(panelCount).fill(null);
  const visibilityState = { value: 0, target: 0, speed: 1.1 }; // slower, softer visibility ramp

  const glassBackMeshes = [];

  for (let index = 0; index < panelCount; index += 1) {
    const volumeTexture = createPanelVolumeTexture(index + 1);
    panelVolumeTextures[index] = volumeTexture;

    const labelTexture = createPanelLabelTexture({
      heading: PANEL_TEXTS[index % PANEL_TEXTS.length],
      subtitle: '',
      lines: [],
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

    // Add glass backplate behind the panel plane as a child so it follows rotation/position
    const back = new Mesh(panelBackGeometry, glassMaterial);
    back.position.set(0, 0, -BOX_DEPTH * 0.6);
    back.userData = { type: 'panelBack' };
    back.raycast = () => {};
    mesh.add(back);

    group.add(mesh);
    glassBackMeshes.push(back);
    panels.push(mesh);
  }

  // Text-only Sprites for navigation
  const leftLabelTexture = createButtonLabelTexture('<');
  const rightLabelTexture = createButtonLabelTexture('>');
  const leftMat = new SpriteMaterial({ map: leftLabelTexture, transparent: true, depthWrite: false });
  const rightMat = new SpriteMaterial({ map: rightLabelTexture, transparent: true, depthWrite: false });
  const nextButton = new Sprite(leftMat); // left arrow
  nextButton.userData = { ...nextButton.userData, type: 'button', action: 'back' }; // '<' goes LEFT
  nextButton.scale.set(BUTTON_WIDTH, BUTTON_HEIGHT, 1);
  nextButton.visible = false;
  const backButton = new Sprite(rightMat); // right arrow
  backButton.userData = { ...backButton.userData, type: 'button', action: 'next' }; // '>' goes RIGHT
  backButton.scale.set(BUTTON_WIDTH, BUTTON_HEIGHT, 1);
  backButton.visible = false;

  const interactiveObjects = [...panels, backButton, nextButton];

  function showButtons() {
    // Make navigation buttons visible regardless of carousel visibility
    backButton.visible = true;
    nextButton.visible = true;
    buttonsEverShown = true;
  }

  function hideButtons() {
    backButton.visible = false;
    nextButton.visible = false;
  }

  function areButtonsVisible() {
    return backButton.visible || nextButton.visible;
  }

  // Smooth scroll state
  let scrollPosition = 0; // continuous index position
  let scrollVelocity = 0; // units per second
  const SCROLL_ACCEL = 1.6; // gentler scroll acceleration
  const SCROLL_DAMPING = 2.2; // lighter damping for longer glide
  let visible = false;
  let visibilityTransition = null;
  let pendingVisibilityTimeout = null;
  let buttonsEverShown = false;

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
        // First time the carousel becomes visible, show buttons and keep them visible afterward
        if (!buttonsEverShown) {
          buttonsEverShown = true;
          backButton.visible = true;
          nextButton.visible = true;
        }
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

      // Ignore incoming data; use fixed labels
      const heading = PANEL_TEXTS[index % PANEL_TEXTS.length];
      const panelDescriptor = { heading, subtitle: '', lines: [] };
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
    // Apply inertial velocity for gentle scrolling
    scrollVelocity += delta * SCROLL_ACCEL;
  }

  function setScroll(position) {
    const length = panelLabelTextures.length;
    if (length === 0) return;
    scrollPosition = mod(position, length);
    scrollVelocity = 0;
  }

  function updatePanelLayout() {
    const length = panels.length;
    if (length === 0) return;

    const step = (Math.PI * 2) / length;
    const baseIndex = Math.floor(scrollPosition);
    const offset = scrollPosition - baseIndex;

    for (let i = 0; i < length; i += 1) {
      const panelMesh = panels[i];
      const dataIndex = mod(baseIndex + i, length);

      // Angle around Y-axis; scroll rotates the ring
      const angle = (i - offset) * step;
      const x = Math.sin(angle) * CAROUSEL_RADIUS;
      const z = Math.cos(angle) * CAROUSEL_RADIUS;

      panelMesh.position.x = x;
      panelMesh.position.z = z;
      panelMesh.rotation.y = angle; // face outward like CSS 3D carousel
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
    // Ensure UI group is attached to camera once available
    if (!uiGroup.parent && group.parent) {
      group.parent.add(uiGroup);
      uiGroup.add(backButton);
      uiGroup.add(nextButton);
    }

    // Position edge buttons at screen sides relative to camera
    if (uiGroup.parent) {
      const cam = uiGroup.parent;
      const z = basePositionZ; // align with carousel depth
      if (cam.isPerspectiveCamera) {
        const fovRad = (cam.fov * Math.PI) / 180;
        const halfH = Math.tan(fovRad / 2) * Math.abs(z);
        const halfW = halfH * cam.aspect;
        const xLeft = -halfW + BUTTON_MARGIN_WORLD;
        const xRight = halfW - BUTTON_MARGIN_WORLD;
        nextButton.position.set(xLeft, 0, z);
        backButton.position.set(xRight, 0, z);
      } else {
        nextButton.position.set(-1.2, 0, z);
        backButton.position.set(1.2, 0, z);
      }
    }

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

    // Smoothly damp velocity and advance scroll position
    if (panelLabelTextures.length > 0) {
      const damping = Math.max(0, 1 - SCROLL_DAMPING * deltaTime);
      scrollVelocity *= damping;
      if (Math.abs(scrollVelocity) < 0.00005) scrollVelocity = 0;
      scrollPosition += scrollVelocity * deltaTime;
      const len = panelLabelTextures.length;
      if (len > 0) scrollPosition = mod(scrollPosition, len);
    }

    [...panels, backButton, nextButton].forEach((mesh) => {
      const { ripple } = mesh.userData;
      const uniforms = mesh.material?.uniforms;

      if (uniforms?.uTime) {
        uniforms.uTime.value = elapsedTime;
      }
      if (uniforms?.uVisibility) {
        if (mesh.userData?.type === 'button' && buttonsEverShown) {
          uniforms.uVisibility.value = 1;
        } else {
          uniforms.uVisibility.value = eased;
        }
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
    panelBackGeometry.dispose();
    buttonBackGeometry.dispose();
    glassBackMeshes.forEach((m) => m.material?.dispose());
    panels.forEach((panel) => {
      panel.material?.dispose();
    });
    panelLabelTextures.forEach(disposeTexture);
    panelVolumeTextures.forEach(disposeTexture);
    disposeTexture(leftLabelTexture);
    disposeTexture(rightLabelTexture);
    ;
    if (uiGroup.parent) {
      uiGroup.parent.remove(uiGroup);
    }
  }

  return {
    group,
    panels,
    backButton,
    nextButton,
    interactiveObjects,
    showButtons,
    hideButtons,
    areButtonsVisible,
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
