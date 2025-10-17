import { PerspectiveCamera, Vector3 } from 'three';

export function createCamera({
  fov = 45,
  aspect = 1,
  near = 0.1,
  far = 2000,
  position = new Vector3(35, 30, 35),
  lookAt = new Vector3(0, 0, 0),
} = {}) {
  const camera = new PerspectiveCamera(fov, aspect, near, far);
  camera.position.copy(position);
  camera.lookAt(lookAt);

  return camera;
}
