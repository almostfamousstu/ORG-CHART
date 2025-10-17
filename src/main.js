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

const canvas = document.getElementById('org-chart-canvas');

if (!canvas) {
  throw new Error('Expected a canvas element with id "org-chart-canvas".');
}

const scene = createScene();
const camera = createCamera({ aspect: window.innerWidth / window.innerHeight });
const renderer = createRenderer({ canvas });
const controls = createControls(camera, renderer.domElement);
const raycaster = new Raycaster();
const pointer = new Vector2();
const worldPosition = new Vector3();
let pointerDownPosition = null;
let focusAnimation = null;
const rotatingMeshes = new Set();

const CLICK_DRAG_THRESHOLD = 5;
const CAMERA_FOCUS_DURATION = 600;
const INITIAL_CAMERA_DISTANCE = 50;
const NODE_FOCUS_DISTANCE = 20;
const NODE_ROTATION_SPEED = 0.005;
const NODE_RIPPLE_STRENGTH = 4;

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
  nodeSize: [320, 220],
  separation(a, b) {
    return a.parent === b.parent ? 1.1 : 1.6;
  },
});

const centerX = -((layout.bounds.minX + layout.bounds.maxX) / 2);
const centerY = -((layout.bounds.minY + layout.bounds.maxY) / 2);

const positionedNodes = layout.nodes.map((node) => ({
  ...node,
  x: node.x + centerX,
  y: -(node.y + centerY),
}));

const positionedLinks = layout.links.map((link) => ({
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
  mesh.userData = { ...mesh.userData, isRotating: true };
  rotatingMeshes.add(mesh);
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
  opacity: 0.6,
});

const orgGroup = new Group();
orgGroup.add(linkGroup);
orgGroup.add(nodeGroup);
orgGroup.scale.setScalar(0.05);

scene.add(orgGroup);

orgGroup.updateMatrixWorld(true);

const headNodeMesh = nodeGroup.children.find(
  (child) => child.userData?.node?.depth === 0,
);

if (headNodeMesh) {
  const headPosition = headNodeMesh.getWorldPosition(new Vector3());

  camera.position.set(
    headPosition.x,
    headPosition.y,
    headPosition.z + INITIAL_CAMERA_DISTANCE,
  );
  controls.target.copy(headPosition);
  controls.update();
}

function getIntersections(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

  raycaster.setFromCamera(pointer, camera);

  return raycaster.intersectObjects(nodeGroup.children, false);
}

function focusCameraOnObject(object) {
  object.getWorldPosition(worldPosition);

  const cameraOffset = camera.position.clone().sub(controls.target);

  if (cameraOffset.lengthSq() === 0) {
    cameraOffset.set(0, 0, 1);
  } else {
    cameraOffset.normalize();
  }

  const desiredOffset = cameraOffset.multiplyScalar(NODE_FOCUS_DISTANCE);
  focusAnimation = {
    start: performance.now(),
    duration: CAMERA_FOCUS_DURATION,
    fromCameraPosition: camera.position.clone(),
    toCameraPosition: worldPosition.clone().add(desiredOffset),
    fromTarget: controls.target.clone(),
    toTarget: worldPosition.clone(),
  };
}

function toggleNodeRotation(mesh) {
  if (!mesh) return;

  if (mesh.userData?.isRotating) {
    mesh.userData = { ...mesh.userData, isRotating: false };
    rotatingMeshes.delete(mesh);
    return;
  }

  mesh.userData = { ...mesh.userData, isRotating: true };
  rotatingMeshes.add(mesh);
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary) return;
  pointerDownPosition = { x: event.clientX, y: event.clientY };

  const intersections = getIntersections(event);

  if (intersections.length > 0) {
    setActiveRippleMesh(intersections[0].object);
  } else {
    clearActiveRippleMesh();
  }
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!event.isPrimary || !pointerDownPosition) return;

  const dx = event.clientX - pointerDownPosition.x;
  const dy = event.clientY - pointerDownPosition.y;

  clearActiveRippleMesh();

  pointerDownPosition = null;

  if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) {
    return;
  }

  const intersections = getIntersections(event);

  if (intersections.length === 0) {
    return;
  }

  const [intersection] = intersections;
  focusCameraOnObject(intersection.object);
  toggleNodeRotation(intersection.object);
});

renderer.domElement.addEventListener('pointerleave', () => {
  pointerDownPosition = null;
  clearActiveRippleMesh();
});

renderer.domElement.addEventListener('pointercancel', () => {
  pointerDownPosition = null;
  clearActiveRippleMesh();
});

const disposeResizeObserver = setupResizeObserver({ renderer, camera });

function update(deltaTime, elapsedTime) {
  if (focusAnimation) {
    const elapsed = performance.now() - focusAnimation.start;
    const t = Math.min(elapsed / focusAnimation.duration, 1);
    const easedT = easeOutCubic(t);

    camera.position.lerpVectors(
      focusAnimation.fromCameraPosition,
      focusAnimation.toCameraPosition,
      easedT,
    );

    controls.target.lerpVectors(
      focusAnimation.fromTarget,
      focusAnimation.toTarget,
      easedT,
    );

    if (t >= 1) {
      camera.position.copy(focusAnimation.toCameraPosition);
      controls.target.copy(focusAnimation.toTarget);
      focusAnimation = null;
    }
  }

  controls.update();

  rotatingMeshes.forEach((mesh) => {
    mesh.rotation.y += NODE_ROTATION_SPEED;
    mesh.rotation.x += NODE_ROTATION_SPEED * 0.35;
  });

  if (typeof updateNodes === 'function') {
    updateNodes(deltaTime, elapsedTime);
  }
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
  disposeNodes();
  rotatingMeshes.clear();
});
