import { Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';

const DEFAULT_RADIUS = 100;
const DEFAULT_SEGMENTS = {
  width: 48,
  height: 32,
};

export function createNodes(nodes, options = {}) {
  if (!Array.isArray(nodes)) {
    throw new TypeError('createNodes expects an array of node descriptors.');
  }

  const {
    radius = DEFAULT_RADIUS,
    widthSegments = DEFAULT_SEGMENTS.width,
    heightSegments = DEFAULT_SEGMENTS.height,
    materialOptions = {},
    getColor,
  } = options;

  const geometry = new SphereGeometry(radius, widthSegments, heightSegments);

  const baseMaterial = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0a5adf,
    emissiveIntensity: 0.4,
    roughness: 0.35,
    metalness: 0.2,
    wireframe: true,
    transparent: true,
    opacity: 0.9,
    ...materialOptions,
  });

  const group = new Group();
  const meshes = [];
  const extraMaterials = new Set();

  nodes.forEach((node) => {
    const mesh = new Mesh(geometry, baseMaterial);

    if (typeof getColor === 'function') {
      const color = getColor(node);

      if (color != null) {
        const material = baseMaterial.clone();
        material.color.set(color);
        mesh.material = material;
        extraMaterials.add(material);
      }
    }

    mesh.position.set(node.x, node.y, 0);
    mesh.userData = { ...mesh.userData, node };

    group.add(mesh);
    meshes.push(mesh);
  });

  return {
    group,
    meshes,
    dispose() {
      geometry.dispose();
      baseMaterial.dispose();
      extraMaterials.forEach((material) => material.dispose());
      extraMaterials.clear();
    },
  };
}
