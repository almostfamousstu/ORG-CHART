import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
} from 'three';

const PANEL_SPACING = 1.4;
const PANEL_WIDTH = 1.6;
const PANEL_HEIGHT = 0.96;
const BUTTON_WIDTH = 0.92;
const BUTTON_HEIGHT = 0.34;
const DEFAULT_PANEL_COUNT = 4;

function createRippleMaterial({ color, opacity, texture }) {
  const uniforms = {
    uTime: { value: 0 },
    uRippleStrength: { value: 0 },
    uRippleCenter: { value: new Vector2(0.5, 0.5) },
    uTexture: { value: texture },
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
      uniform sampler2D uTexture;
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

      void main() {
        vec4 tex = texture2D(uTexture, vUv);
        float shimmer = noise(vUv * 6.0 + uTime * 0.1) * 0.08;
        float starfield = noise(vUv * 18.0 + vec2(uTime * 0.05, uTime * 0.04));
        float glowMask = pow(1.0 - distance(vUv, vec2(0.5, 0.5)), 3.5);
        vec3 glow = uGlowColor * glowMask * uGlowIntensity;
        float atmosphere = smoothstep(0.92, 0.2, length(vPosition.xy) / 1.2);
        float alpha = clamp(tex.a * 0.8 + 0.2 + starfield * 0.08, 0.0, 1.0) * uOpacity * uVisibility;
        vec3 base = mix(uBaseColor, tex.rgb, 0.6);
        vec3 color = base + shimmer + glow + atmosphere * 0.05;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function createPanelTexture({ heading, subtitle, lines }) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.18)');
  gradient.addColorStop(0.45, 'rgba(129, 140, 248, 0.26)');
  gradient.addColorStop(1, 'rgba(45, 212, 191, 0.2)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const highlightGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
  highlightGradient.addColorStop(0.5, 'rgba(190, 242, 255, 0.35)');
  highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = highlightGradient;
  ctx.fillRect(0, 0, canvas.width, 48);

  ctx.strokeStyle = 'rgba(190, 242, 255, 0.35)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(125, 211, 252, 0.35)';
  ctx.shadowBlur = 18;
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

  ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
  ctx.font = '300 48px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillText(heading, 36, 88);

  if (subtitle) {
    ctx.fillStyle = 'rgba(148, 197, 253, 0.82)';
    ctx.font = '300 28px "Inter", "Helvetica Neue", sans-serif';
    ctx.fillText(subtitle, 36, 128);
  }

  ctx.fillStyle = 'rgba(241, 245, 249, 0.82)';
  ctx.font = '300 26px "Inter", "Helvetica Neue", sans-serif';

  lines.forEach((line, index) => {
    ctx.fillText(line, 36, 180 + index * 42);
  });

  ctx.fillStyle = 'rgba(191, 219, 254, 0.28)';
  for (let i = 0; i < 36; i += 1) {
    const radius = Math.random() * 3 + 1;
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createButtonTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 180;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, 'rgba(96, 165, 250, 0.2)');
  gradient.addColorStop(0.5, 'rgba(165, 180, 252, 0.35)');
  gradient.addColorStop(1, 'rgba(45, 212, 191, 0.25)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(191, 219, 254, 0.45)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(99, 102, 241, 0.45)';
  ctx.shadowBlur = 16;
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

  ctx.fillStyle = 'rgba(241, 245, 249, 0.88)';
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
  const panelTextures = new Array(panelCount).fill(null);
  const visibilityState = { value: 0, target: 0, speed: 3.2 };

  for (let index = 0; index < panelCount; index += 1) {
    const texture = createPanelTexture({
      heading: 'Panel',
      subtitle: `Segment ${index + 1}`,
      lines: ['Awaiting selection'],
    });
    panelTextures[index] = texture;

    const material = createRippleMaterial({
      color: 0x67e8f9,
      opacity: 0.85,
      texture,
    });
    material.uniforms.uGlowColor.value.set(0x22d3ee).convertSRGBToLinear();
    material.uniforms.uGlowIntensity.value = 0.95;

    const mesh = new Mesh(panelGeometry, material);
    mesh.position.y = 0.1;
    mesh.userData = {
      ...mesh.userData,
      type: 'panel',
      ripple: createRippleState(7),
    };

    group.add(mesh);
    panels.push(mesh);
  }

  const backMaterial = createRippleMaterial({
    color: 0x38bdf8,
    opacity: 0.9,
    texture: createButtonTexture('Back'),
  });
  backMaterial.uniforms.uGlowColor.value.set(0x60a5fa).convertSRGBToLinear();
  backMaterial.uniforms.uGlowIntensity.value = 0.85;
  const nextMaterial = createRippleMaterial({
    color: 0x2563eb,
    opacity: 0.9,
    texture: createButtonTexture('Next'),
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

  function setVisible(nextVisible) {
    visible = Boolean(nextVisible);
    visibilityState.target = visible ? 1 : 0;
    if (visible) {
      group.visible = true;
    }
  }

  function isVisible() {
    return visible;
  }

  function setPanelTexturesFromData(panelsData) {
    for (let index = 0; index < panelTextures.length; index += 1) {
      disposeTexture(panelTextures[index]);

      const panelDescriptor = panelsData[index] ?? panelsData[panelsData.length - 1];
      const texture = createPanelTexture(panelDescriptor);
      panelTextures[index] = texture;
      panels[index].material.uniforms.uTexture.value = texture;
    }
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
    if (panelTextures.length === 0) return;

    scrollPosition += delta;
    const length = panelTextures.length;
    if (length > 0) {
      scrollPosition = mod(scrollPosition, length);
    }
  }

  function setScroll(position) {
    const length = panelTextures.length;
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
      panelMesh.material.uniforms.uTexture.value = panelTextures[dataIndex];
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
      const texture = panel.material?.uniforms?.uTexture?.value;
      disposeTexture(texture);
      panel.material.dispose();
    });
    [backButton, nextButton].forEach((button) => {
      const texture = button.material?.uniforms?.uTexture?.value;
      disposeTexture(texture);
      button.material.dispose();
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
