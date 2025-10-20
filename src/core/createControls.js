import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 10;
  controls.maxDistance = 250;
  controls.maxPolarAngle = Math.PI / 2;
  // Disable all user interactions (click/drag tilt, pan, zoom)
  controls.enableZoom = false;
  controls.enableRotate = false;
  controls.enablePan = false;
  controls.enabled = false; // fully disables input handlers

  return controls;
}
