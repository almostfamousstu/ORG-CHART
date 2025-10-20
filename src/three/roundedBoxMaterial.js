// ESM helpers to mirror Codrops (#10) RoundedBox glass material
// three@^0.164 compatible

import { MeshPhysicalMaterial, EquirectangularReflectionMapping, BoxGeometry } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export async function loadHdrEquirect(url) {
  return new Promise((resolve, reject) => {
    new RGBELoader().load(
      url,
      (tex) => {
        tex.mapping = EquirectangularReflectionMapping;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

// Create a glass-like MeshPhysicalMaterial, similar to Codrops demo
export function createRoundedBoxGlassMaterial({
  transmission = 1,
  thickness = 1.5,
  roughness = 0.07,
  envMap = null,
  envMapIntensity = 1.5,
  ior = 1.5,
  clearcoat = 1.0,
  clearcoatRoughness = 0.05,
  metalness = 0.0,
  attenuationColor = 0xffffff,
  attenuationDistance = Infinity,
} = {}) {
  const material = new MeshPhysicalMaterial({
    // Core glass look
    transmission,
    thickness,
    roughness,
    ior,
    metalness,
    clearcoat,
    clearcoatRoughness,

    // Lighting/reflections
    envMap,
    envMapIntensity,

    // Subtle tint falloff through thickness
    attenuationColor,
    attenuationDistance,
  });
  // Ensure proper blending when stacked with transparent label planes
  material.transparent = true;
  material.opacity = 1.0;
  return material;
}

// Utility to create a RoundedBox mesh (falls back to BoxGeometry if needed)
export function createRoundedBoxMesh({
  width = 1.12,
  height = 1.12,
  depth = 0.1,
  segments = 16,
  radius = 0.2,
  material,
} = {}) {
  let geometry;
  try {
    geometry = new RoundedBoxGeometry(width, height, depth, segments, radius);
  } catch (_) {
    geometry = new BoxGeometry(width, height, depth, segments, segments, segments);
  }
  return { geometry, material };
}
