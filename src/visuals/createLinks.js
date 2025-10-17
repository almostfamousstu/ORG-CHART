import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineSegments,
  LineBasicMaterial,
} from 'three';

const DEFAULT_LINK_COLOR = 0x60a5fa;

export function createLinks(links, options = {}) {
  if (!Array.isArray(links)) {
    throw new TypeError('createLinks expects an array of link descriptors.');
  }

  const {
    color = DEFAULT_LINK_COLOR,
    opacity = 1,
    transparent = opacity < 1,
  } = options;

  const geometry = new BufferGeometry();
  const positions = new Float32Array(links.length * 6);

  links.forEach((link, index) => {
    const offset = index * 6;

    positions[offset + 0] = link.source.x;
    positions[offset + 1] = link.source.y;
    positions[offset + 2] = 0;
    positions[offset + 3] = link.target.x;
    positions[offset + 4] = link.target.y;
    positions[offset + 5] = 0;
  });

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  const material = new LineBasicMaterial({
    color,
    opacity,
    transparent,
  });

  const group = new Group();
  const lineSegments = new LineSegments(geometry, material);
  group.add(lineSegments);

  return {
    group,
    segments: lineSegments,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
