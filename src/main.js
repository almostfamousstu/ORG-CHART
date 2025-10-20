import {
  AmbientLight,
  DirectionalLight,
  GridHelper,
  Group,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import { createCamera } from './core/createCamera.js';
import { createControls } from './core/createControls.js';
import { createRenderer } from './core/createRenderer.js';
import { createScene } from './core/createScene.js';
import { setupResizeObserver } from './core/setupResizeObserver.js';
import { processOrgData } from './data/processOrgData.js';
import { sampleOrgData } from './data/sampleOrgData.js';
import { createLinks } from './visuals/createLinks.js';
import { createNodes } from './visuals/createNodes.js';
import { createCarousel } from './visuals/createCarousel.js';

const canvas = document.getElementById('org-chart-canvas');

if (!canvas) {
  throw new Error('Expected a canvas element with id "org-chart-canvas".');
}

const scene = createScene();
const camera = createCamera({ aspect: window.innerWidth / window.innerHeight });
const renderer = createRenderer({ canvas });
const controls = createControls(camera, renderer.domElement);
scene.add(camera);
const raycaster = new Raycaster();
const pointer = new Vector2();
const worldPosition = new Vector3();
let pointerDownPosition = null;
let focusAnimation = null;
const rotatingMeshes = new Set();
let activeRotatingMesh = null;
let selectedMesh = null;
let pointerDownObject = null;
let activeTransitionToken = null;

const carouselDragState = {
  active: false,
  pointerId: null,
  lastX: 0,
};

const CLICK_DRAG_THRESHOLD = 5;
const CAROUSEL_REVEAL_DELAY = 200;
const CAMERA_FOCUS_DURATION = 2600; // calmer focus glide
const INITIAL_CAMERA_DISTANCE = 50;
const INITIAL_CAMERA_TRAVEL_DURATION = 3600; // longer, slower initial arrival
const INITIAL_CAMERA_TRAVEL_MULTIPLIER = 1.6; // start farther for an ethereal glide
const INITIAL_CAMERA_TARGET_OFFSET_FACTOR = 0.3;
const INITIAL_CAMERA_OFFSET_DIRECTION = new Vector3(0.6, 0.35, 1).normalize();
const NODE_FOCUS_DISTANCE = 12;
const NODE_ROTATION_SPEED = 0.002; // calmer, slower rotation
const NODE_RIPPLE_STRENGTH = 4;
const HEAD_CHILD_VERTICAL_MULTIPLIER = 9; // spread vertical distance further
const HEAD_CHILD_LINK_COLOR = 0x2563eb;
const HEAD_CHILD_LINK_OPACITY = 0.0;

// Subtle, dream-like camera path shaping
const DREAM_CAM_CURVE_AMP = 0.5; // lateral curve amplitude (world units)
const DREAM_CAM_PUSH_AMP = 10;  // gentle push in/out along path

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

camera.position.set(0, 0, INITIAL_CAMERA_DISTANCE);
controls.target.set(0, 0, 0);
controls.update();

const grid = new GridHelper(200, 20, 0x1d4ed8, 0x334155);
grid.material.opacity = 0.25;
grid.material.transparent = true;
scene.add(grid);

const ambientLight = new AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const keyLight = new DirectionalLight(0xffffff, 0.65);
keyLight.position.set(150, 250, 400);
scene.add(keyLight);

const fillLight = new DirectionalLight(0xffffff, 0.35);
fillLight.position.set(-200, -150, -300);
scene.add(fillLight);

const layout = processOrgData(sampleOrgData, {
  nodeSize: [360, 260],
  separation(a, b) {
    // Spread nodes very far apart for an open, airy layout
    return a.parent === b.parent ? 4.2 : 4.8;
  },
});

const nodesById = new Map();
const childrenByParentId = new Map();
const meshByNodeId = new Map();

layout.nodes.forEach((node) => {
  const clone = { ...node };
  nodesById.set(clone.id, clone);

  if (clone.parentId != null) {
    const siblings = childrenByParentId.get(clone.parentId) ?? [];
    siblings.push(clone);
    childrenByParentId.set(clone.parentId, siblings);
  }
});

const headNode = [...nodesById.values()].find((node) => node.depth === 0) ?? null;

if (headNode) {
  const headChildren = childrenByParentId.get(headNode.id) ?? [];

  headChildren.forEach((child) => {
    const originalOffset = child.y - headNode.y;
    const extraOffset = originalOffset * (HEAD_CHILD_VERTICAL_MULTIPLIER - 1);

    if (Math.abs(extraOffset) < Number.EPSILON) {
      return;
    }

    const queue = [child];

    while (queue.length > 0) {
      const current = queue.shift();
      current.y += extraOffset;

      const descendants = childrenByParentId.get(current.id) ?? [];
      queue.push(...descendants);
    }
  });
}

const adjustedNodes = layout.nodes.map((node) => nodesById.get(node.id));

const adjustedBounds = adjustedNodes.reduce(
  (bounds, node) => ({
    minX: Math.min(bounds.minX, node.x),
    maxX: Math.max(bounds.maxX, node.x),
    minY: Math.min(bounds.minY, node.y),
    maxY: Math.max(bounds.maxY, node.y),
  }),
  {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  },
);

const adjustedLinks = layout.links.map((link) => ({
  ...link,
  source: {
    x: nodesById.get(link.sourceId).x,
    y: nodesById.get(link.sourceId).y,
  },
  target: {
    x: nodesById.get(link.targetId).x,
    y: nodesById.get(link.targetId).y,
  },
}));

const centerX = -((adjustedBounds.minX + adjustedBounds.maxX) / 2);
const centerY = -((adjustedBounds.minY + adjustedBounds.maxY) / 2);

const positionedNodes = adjustedNodes.map((node) => ({
  ...node,
  x: node.x + centerX,
  y: -(node.y + centerY),
}));

const positionedLinks = adjustedLinks.map((link) => ({
  ...link,
  source: {
    x: link.source.x + centerX,
    y: -(link.source.y + centerY),
  },
  target: {
    x: link.target.x + centerX,
    y: -(link.target.y + centerY),
  },
}));

const headChildConnectorLinks = headNode
  ? (() => {
      const headChildren = [...(childrenByParentId.get(headNode.id) ?? [])];

      if (headChildren.length < 2) {
        return [];
      }

      const sortedChildren = headChildren.sort((a, b) => a.x - b.x);
      const segments = [];

      for (let index = 0; index < sortedChildren.length - 1; index += 1) {
        const current = sortedChildren[index];
        const next = sortedChildren[index + 1];

        segments.push({
          source: { x: current.x + centerX, y: -(current.y + centerY) },
          target: { x: next.x + centerX, y: -(next.y + centerY) },
        });
      }

      return segments;
    })()
  : [];

const {
  group: nodeGroup,
  update: updateNodes,
  dispose: disposeNodes,
} = createNodes(positionedNodes, {
  radius: 100,
  materialOptions: {
    emissiveIntensity: 0.5,
  },
  getColor: (node) => {
    if (node.depth === 0) return 0x60a5fa;
    if (node.depth === 1) return 0x38bdf8;
    if (node.depth === 2) return 0x0ea5e9;
    return 0x22d3ee;
  },
});

nodeGroup.children.forEach((mesh) => {
  mesh.userData = { ...mesh.userData, isRotating: false };
  const node = mesh.userData?.node;
  if (node?.id) {
    meshByNodeId.set(node.id, mesh);
  }
});

let activeRippleMesh = null;

function setActiveRippleMesh(mesh) {
  if (activeRippleMesh && activeRippleMesh !== mesh) {
    const ripple = activeRippleMesh.userData?.ripple;
    if (ripple) {
      ripple.target = 0;
    }
  }

  activeRippleMesh = mesh || null;

  if (!activeRippleMesh) {
    return;
  }

  const ripple = activeRippleMesh.userData?.ripple;
  if (ripple) {
    ripple.target = NODE_RIPPLE_STRENGTH;
  }
}

function clearActiveRippleMesh(mesh) {
  const targetMesh = mesh ?? activeRippleMesh;

  if (!targetMesh) {
    activeRippleMesh = null;
    return;
  }

  const ripple = targetMesh.userData?.ripple;
  if (ripple) {
    ripple.target = 0;
  }

  if (!mesh || mesh === activeRippleMesh) {
    activeRippleMesh = null;
  }
}

const { group: linkGroup, dispose: disposeLinks } = createLinks(positionedLinks, {
  color: 0x38bdf8,
  opacity: 0.0, // make connecting lines invisible
});

let headChildLinkGroup = null;
let disposeHeadChildLinks = null;

if (headChildConnectorLinks.length > 0) {
  const headChildLinks = createLinks(headChildConnectorLinks, {
    color: HEAD_CHILD_LINK_COLOR,
    opacity: HEAD_CHILD_LINK_OPACITY,
  });

  headChildLinkGroup = headChildLinks.group;
  disposeHeadChildLinks = headChildLinks.dispose;
}

const orgGroup = new Group();
orgGroup.add(linkGroup);
if (headChildLinkGroup) {
  orgGroup.add(headChildLinkGroup);
}
orgGroup.add(nodeGroup);
orgGroup.scale.setScalar(0.05);

scene.add(orgGroup);

const carousel = createCarousel({ panelCount: 4 });
camera.add(carousel.group);

orgGroup.updateMatrixWorld(true);

const headNodeMesh = nodeGroup.children.find(
  (child) => child.userData?.node?.depth === 0,
);

if (headNodeMesh) {
  const headPosition = headNodeMesh.getWorldPosition(new Vector3());
  startInitialCameraArrival(headPosition);
}

function startInitialCameraArrival(targetPosition) {
  const finalCameraPosition = new Vector3(
    targetPosition.x,
    targetPosition.y,
    targetPosition.z + INITIAL_CAMERA_DISTANCE,
  );

  const travelDirection = INITIAL_CAMERA_OFFSET_DIRECTION.clone();
  const initialCameraPosition = finalCameraPosition
    .clone()
    .add(
      travelDirection.multiplyScalar(
        INITIAL_CAMERA_DISTANCE * INITIAL_CAMERA_TRAVEL_MULTIPLIER,
      ),
    );

  const initialTarget = targetPosition
    .clone()
    .add(
      INITIAL_CAMERA_OFFSET_DIRECTION.clone().multiplyScalar(
        INITIAL_CAMERA_DISTANCE * INITIAL_CAMERA_TRAVEL_MULTIPLIER *
          INITIAL_CAMERA_TARGET_OFFSET_FACTOR,
      ),
    );

  camera.position.copy(initialCameraPosition);
  controls.target.copy(initialTarget);
  controls.update();

  if (focusAnimation?.resolve) {
    focusAnimation.resolve();
  }

  focusAnimation = {
    start: performance.now(),
    duration: INITIAL_CAMERA_TRAVEL_DURATION,
    fromCameraPosition: initialCameraPosition.clone(),
    toCameraPosition: finalCameraPosition.clone(),
    fromTarget: initialTarget.clone(),
    toTarget: targetPosition.clone(),
    curved: true,
    curveAmp: DREAM_CAM_CURVE_AMP,
    pushAmp: DREAM_CAM_PUSH_AMP,
    resolve: null,
  };
}

function updatePointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
}

function getIntersections(event, targets = nodeGroup.children) {
  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);

  return raycaster.intersectObjects(targets, false);
}

function getCarouselIntersections(event) {
  // If carousel panels are visible, all carousel targets are interactive
  if (carousel.isVisible()) {
    return getIntersections(event, carousel.interactiveObjects);
  }

  // If only buttons are visible (e.g., on head node), allow button hits
  if (typeof carousel.areButtonsVisible === 'function' && carousel.areButtonsVisible()) {
    return getIntersections(event, [carousel.backButton, carousel.nextButton]);
  }

  return [];
}

function focusCameraOnObject(object) {
  if (!object) {
    return Promise.resolve();
  }

  object.getWorldPosition(worldPosition);

  const cameraOffset = camera.position.clone().sub(controls.target);

  if (cameraOffset.lengthSq() === 0) {
    cameraOffset.set(0, 0, 1);
  } else {
    cameraOffset.normalize();
  }

  const desiredOffset = cameraOffset.multiplyScalar(NODE_FOCUS_DISTANCE);
  if (focusAnimation?.resolve) {
    focusAnimation.resolve();
  }

  let resolveFocus = null;
  const focusPromise = new Promise((resolve) => {
    resolveFocus = resolve;
  });

  focusAnimation = {
    start: performance.now(),
    duration: CAMERA_FOCUS_DURATION,
    fromCameraPosition: camera.position.clone(),
    toCameraPosition: worldPosition.clone().add(desiredOffset),
    fromTarget: controls.target.clone(),
    toTarget: worldPosition.clone(),
    curved: true,
    curveAmp: DREAM_CAM_CURVE_AMP,
    pushAmp: DREAM_CAM_PUSH_AMP,
    resolve: () => {
      if (resolveFocus) {
        const complete = resolveFocus;
        resolveFocus = null;
        complete();
      }
    },
  };

  return focusPromise;
}

function setRotatingMesh(mesh) {
  if (mesh === activeRotatingMesh) {
    return;
  }

  if (!mesh) {
    if (activeRotatingMesh) {
      activeRotatingMesh.userData = {
        ...activeRotatingMesh.userData,
        isRotating: false,
      };
      rotatingMeshes.delete(activeRotatingMesh);
    }

    activeRotatingMesh = null;
    return;
  }

  if (activeRotatingMesh) {
    activeRotatingMesh.userData = {
      ...activeRotatingMesh.userData,
      isRotating: false,
    };
    rotatingMeshes.delete(activeRotatingMesh);
  }

  activeRotatingMesh = mesh;
  activeRotatingMesh.userData = {
    ...activeRotatingMesh.userData,
    isRotating: true,
  };
  activeRotatingMesh.rotation.x = 0;
  activeRotatingMesh.rotation.z = 0;
  rotatingMeshes.clear();
  rotatingMeshes.add(activeRotatingMesh);
}

function buildCarouselHelpers(node) {
  const children = [...(childrenByParentId.get(node.id) ?? [])];
  const parent = node.parentId != null ? nodesById.get(node.parentId) ?? null : null;
  const siblings =
    node.parentId != null ? [...(childrenByParentId.get(node.parentId) ?? [])] : [];
  const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);

  let siblingSummary = 'No siblings';

  if (node.depth === 0) {
    siblingSummary = 'Root node';
  } else if (siblings.length === 1) {
    siblingSummary = 'Only node in branch';
  } else if (siblings.length > 1 && siblingIndex >= 0) {
    siblingSummary = `Sibling ${siblingIndex + 1} of ${siblings.length}`;
  }

  return {
    childCount: children.length,
    parentName: parent?.name ?? '—',
    siblingSummary,
    offsetSummary: `${node.x.toFixed(1)}, ${node.y.toFixed(1)}`,
    firstChild: children[0]?.name ?? '—',
    lastChild: children.length > 0 ? children[children.length - 1]?.name ?? '—' : '—',
    siblingCount: siblings.length,
  };
}

function updateCarouselForNode(node) {
  if (!node) {
    return;
  }

  const helpers = buildCarouselHelpers(node);
  carousel.setNode(node, helpers);
  carousel.setScroll(0);
}

function setSelectedMesh(mesh) {
  if (mesh === selectedMesh) {
    return;
  }

  if (!mesh) {
    selectedMesh = null;
    setRotatingMesh(null);
    return;
  }

  selectedMesh = mesh;
  setRotatingMesh(mesh);
}

async function transitionToMesh(mesh, { revealDelayMs = CAROUSEL_REVEAL_DELAY } = {}) {
  const transitionToken = {};
  activeTransitionToken = transitionToken;

  await carousel.setVisible(false);

  if (activeTransitionToken !== transitionToken) {
    return;
  }

  if (!mesh) {
    setSelectedMesh(null);
    activeTransitionToken = null;
    return;
  }

  setSelectedMesh(mesh);

  const node = mesh.userData?.node;
  const showCarouselForNode = Boolean(node && node.depth > 0);
  if (node) {
    updateCarouselForNode(node);
  }

  const focusPromise = focusCameraOnObject(mesh);
  await focusPromise;

  if (activeTransitionToken !== transitionToken) {
    return;
  }

  // Only show the carousel for non-root (child) nodes
  if (showCarouselForNode) {
    await carousel.setVisible(true, { delayMs: revealDelayMs });
  } else {
    // Hide panels but ensure navigation buttons are available on head node
    await carousel.setVisible(false);
    if (typeof carousel.showButtons === 'function') {
      carousel.showButtons();
    }
  }

  if (activeTransitionToken === transitionToken) {
    activeTransitionToken = null;
  }
}

async function handleNavigation(action) {
  if (!selectedMesh) {
    return;
  }

  const node = selectedMesh.userData?.node;

  if (!node) {
    return;
  }

  let targetNode = null;

  if (node.depth === 0) {
    const children = [...(childrenByParentId.get(node.id) ?? [])];
    if (children.length === 0) {
      return;
    }

    targetNode = action === 'back' ? children[0] : children[children.length - 1];
  } else {
    const siblings = [...(childrenByParentId.get(node.parentId) ?? [])];
    if (siblings.length === 0) {
      return;
    }

    const index = siblings.findIndex((candidate) => candidate.id === node.id);

    if (index < 0) {
      return;
    }

    if (action === 'back') {
      targetNode = siblings[(index - 1 + siblings.length) % siblings.length];
    } else {
      targetNode = siblings[(index + 1) % siblings.length];
    }
  }

  if (!targetNode) {
    return;
  }

  const targetMesh = meshByNodeId.get(targetNode.id);

  if (!targetMesh) {
    return;
  }

  await transitionToMesh(targetMesh);
}

function resetPointerInteraction({ clearNodeRipple = true } = {}) {
  if (pointerDownObject) {
    carousel.handlePointerUp(pointerDownObject);
  }

  pointerDownObject = null;
  pointerDownPosition = null;
  carouselDragState.active = false;
  carouselDragState.pointerId = null;

  if (clearNodeRipple) {
    clearActiveRippleMesh();
  }
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary) return;

  pointerDownPosition = { x: event.clientX, y: event.clientY };
  pointerDownObject = null;
  carouselDragState.active = false;
  carouselDragState.pointerId = null;
  carouselDragState.lastX = event.clientX;

  const uiIntersections = getCarouselIntersections(event);

  if (uiIntersections.length > 0) {
    const [intersection] = uiIntersections;
    pointerDownObject = intersection.object;
    carousel.handlePointerDown(intersection.object, intersection.uv);

    if (pointerDownObject.userData?.type === 'panel') {
      carouselDragState.pointerId = event.pointerId;
      carouselDragState.lastX = event.clientX;
    }

    event.preventDefault();
    return;
  }

  const nodeIntersections = getIntersections(event);

  if (nodeIntersections.length > 0) {
    setActiveRippleMesh(nodeIntersections[0].object);
  } else {
    clearActiveRippleMesh();
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!event.isPrimary) return;

  if (
    pointerDownObject &&
    pointerDownObject.userData?.type === 'panel' &&
    carousel.isVisible() &&
    carouselDragState.pointerId === event.pointerId
  ) {
    const deltaX = event.clientX - carouselDragState.lastX;
    if (!carouselDragState.active && Math.abs(deltaX) > 1) {
      carouselDragState.active = true;
    }

    if (carouselDragState.active) {
      carousel.scrollBy(-deltaX * 0.003);
    }

    carouselDragState.lastX = event.clientX;
  }
});

renderer.domElement.addEventListener('pointerup', async (event) => {
  if (!event.isPrimary) return;

  const hasPointerDown = Boolean(pointerDownPosition);
  const dx = hasPointerDown ? event.clientX - pointerDownPosition.x : 0;
  const dy = hasPointerDown ? event.clientY - pointerDownPosition.y : 0;

  pointerDownPosition = null;

  if (pointerDownObject) {
    const wasDragging = carouselDragState.active;
    carousel.handlePointerUp(pointerDownObject);

    let action = null;
    if (!wasDragging && Math.hypot(dx, dy) <= CLICK_DRAG_THRESHOLD) {
      action = pointerDownObject.userData?.action;
    }

    pointerDownObject = null;
    carouselDragState.active = false;
    carouselDragState.pointerId = null;

    if (action === 'back' || action === 'next') {
      await handleNavigation(action);
    }

    return;
  }

  clearActiveRippleMesh();

  if (!hasPointerDown || Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) {
    return;
  }

  const intersections = getIntersections(event);

  if (intersections.length === 0) {
    await transitionToMesh(null);
    return;
  }

  const [intersection] = intersections;
  await transitionToMesh(intersection.object);
});

renderer.domElement.addEventListener('pointerleave', () => {
  resetPointerInteraction();
});

renderer.domElement.addEventListener('pointercancel', () => {
  resetPointerInteraction();
});

renderer.domElement.addEventListener(
  'wheel',
  (event) => {
    if (!carousel.isVisible()) {
      return;
    }

    const dominantDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

    carousel.scrollBy(-dominantDelta * 0.0025);
    event.preventDefault();
  },
  { passive: false },
);

const disposeResizeObserver = setupResizeObserver({ renderer, camera });

function update(deltaTime, elapsedTime) {
  if (focusAnimation) {
    const elapsed = performance.now() - focusAnimation.start;
    const t = Math.min(elapsed / focusAnimation.duration, 1);
    const easedT = easeOutCubic(t);

    const fromCam = focusAnimation.fromCameraPosition;
    const toCam = focusAnimation.toCameraPosition;
    const fromTgt = focusAnimation.fromTarget;
    const toTgt = focusAnimation.toTarget;

    if (focusAnimation.curved) {
      const worldUp = new Vector3(0, 1, 0);
      const pathDir = toCam.clone().sub(fromCam);
      const dist = pathDir.length() || 1;
      pathDir.normalize();
      let right = new Vector3().crossVectors(pathDir, worldUp);
      if (right.lengthSq() < 1e-6) {
        // Fallback when pathDir nearly parallel to up
        right = new Vector3(1, 0, 0);
      } else {
        right.normalize();
      }

      const amp = focusAnimation.curveAmp ?? DREAM_CAM_CURVE_AMP;
      const push = focusAnimation.pushAmp ?? DREAM_CAM_PUSH_AMP;

      const s1 = Math.sin(Math.PI * easedT);        // single hump (0->1->0)
      const s2 = Math.sin(Math.PI * 2.0 * easedT);  // two humps (0->0)

      const lateral = right.clone().multiplyScalar(amp * s1);
      const vertical = worldUp.clone().multiplyScalar(amp * 0.35 * s2);
      const along = pathDir.clone().multiplyScalar(push * s2);

      const camBase = fromCam.clone().lerp(toCam, easedT);
      const camPos = camBase.add(lateral).add(vertical).add(along);
      camera.position.copy(camPos);

      const tgtBase = fromTgt.clone().lerp(toTgt, easedT);
      const tgtLateral = right.clone().multiplyScalar(amp * 0.35 * s1);
      const tgtVertical = worldUp.clone().multiplyScalar(amp * 0.15 * s2);
      const targetPos = tgtBase.add(tgtLateral).add(tgtVertical);
      controls.target.copy(targetPos);
    } else {
      camera.position.lerpVectors(fromCam, toCam, easedT);
      controls.target.lerpVectors(fromTgt, toTgt, easedT);
    }

    if (t >= 1) {
      camera.position.copy(focusAnimation.toCameraPosition);
      controls.target.copy(focusAnimation.toTarget);
      const { resolve } = focusAnimation;
      focusAnimation = null;
      resolve?.();
    }
  }

  controls.update();

  rotatingMeshes.forEach((mesh) => {
    mesh.rotation.y += NODE_ROTATION_SPEED;
    mesh.rotation.x = 0;
    mesh.rotation.z = 0;
  });

  if (typeof updateNodes === 'function') {
    updateNodes(deltaTime, elapsedTime);
  }

  carousel.update(deltaTime, elapsedTime);
}

function render() {
  renderer.render(scene, camera);
}

let previousTimestamp = 0;

function animate(timestamp = 0) {
  if (!previousTimestamp) {
    previousTimestamp = timestamp;
  }

  const deltaTime = (timestamp - previousTimestamp) / 1000;
  previousTimestamp = timestamp;

  const elapsedTime = timestamp / 1000;

  update(deltaTime, elapsedTime);
  render();
}

renderer.setAnimationLoop(animate);

window.addEventListener('beforeunload', () => {
  disposeResizeObserver();
  renderer.setAnimationLoop(null);
  renderer.dispose();
  controls.dispose();
  disposeLinks();
  if (typeof disposeHeadChildLinks === 'function') {
    disposeHeadChildLinks();
  }
  disposeNodes();
  carousel.dispose();
  rotatingMeshes.clear();
  activeRotatingMesh = null;
});
