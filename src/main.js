import {
  AmbientLight,
  DirectionalLight,
  GridHelper,
  Group,
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

camera.position.set(0, 0, 1200);
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

const { group: nodeGroup, dispose: disposeNodes } = createNodes(positionedNodes, {
  dimensions: {
    width: 200,
    height: 120,
    depth: 36,
  },
  getColor: (node) => {
    if (node.depth === 0) return 0x312e81;
    if (node.depth === 1) return 0x1d4ed8;
    if (node.depth === 2) return 0x2563eb;
    return 0x38bdf8;
  },
});

const { group: linkGroup, dispose: disposeLinks } = createLinks(positionedLinks, {
  color: 0x38bdf8,
  opacity: 0.6,
});

const orgGroup = new Group();
orgGroup.add(linkGroup);
orgGroup.add(nodeGroup);
orgGroup.scale.setScalar(0.2);

scene.add(orgGroup);

const disposeResizeObserver = setupResizeObserver({ renderer, camera });

function update() {
  controls.update();
}

function render() {
  renderer.render(scene, camera);
}

function animate() {
  update();
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
});
