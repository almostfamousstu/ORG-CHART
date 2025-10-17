import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

const DEFAULT_DIMENSIONS = {
  width: 200,
  height: 120,
  depth: 40,
};

export function createNodes(nodes, options = {}) {
  if (!Array.isArray(nodes)) {
    throw new TypeError('createNodes expects an array of node descriptors.');
  }

  const {
    dimensions = DEFAULT_DIMENSIONS,
    materialOptions = {},
    getColor,
  } = options;

  const geometry = new BoxGeometry(
    dimensions.width,
    dimensions.height,
    dimensions.depth,
  );

  const baseMaterial = new MeshStandardMaterial({
    color: 0x2563eb,
    roughness: 0.55,
    metalness: 0.1,
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
