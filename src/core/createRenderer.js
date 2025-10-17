import { WebGLRenderer } from 'three';

export function createRenderer({ canvas, antialias = true } = {}) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias,
    alpha: true,
    powerPreference: 'high-performance',
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  return renderer;
}
