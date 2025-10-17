import {
  AmbientLight,
  AxesHelper,
  Color,
  DirectionalLight,
  Group,
  Scene,
} from 'three';

export function createScene({ background = '#0f172a', showHelpers = true } = {}) {
  const scene = new Scene();
  scene.background = new Color(background);

  const lighting = new Group();

  const ambient = new AmbientLight(0xffffff, 0.5);
  lighting.add(ambient);

  const directional = new DirectionalLight(0xffffff, 1.25);
  directional.position.set(10, 18, 12);
  directional.castShadow = true;
  lighting.add(directional);

  scene.add(lighting);

  if (showHelpers) {
    const axes = new AxesHelper(10);
    axes.material.depthTest = false;
    axes.renderOrder = 1;
    scene.add(axes);
  }

  return scene;
}
