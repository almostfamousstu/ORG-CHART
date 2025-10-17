import { hierarchy, tree } from '../vendor/d3Hierarchy.js';

const DEFAULT_NODE_SIZE = [260, 160];

function buildTreeLayout(nodeSize, separation) {
  const layout = tree().nodeSize(nodeSize);

  if (typeof separation === 'function') {
    layout.separation(separation);
  }

  return layout;
}

function createIdFactory() {
  const usedIds = new Set();

  return function getId(candidate, fallback) {
    const base = candidate ?? fallback;
    let id = base;
    let suffix = 1;

    while (usedIds.has(id)) {
      id = `${base}-${suffix++}`;
    }

    usedIds.add(id);
    return id;
  };
}

export function processOrgData(data, options = {}) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('processOrgData expects a hierarchical object as input.');
  }

  const { nodeSize = DEFAULT_NODE_SIZE, separation } = options;
  const root = hierarchy(data);
  const layout = buildTreeLayout(nodeSize, separation);
  const treeRoot = layout(root);

  const assignId = createIdFactory();
  const idByNode = new Map();
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  const nodes = treeRoot.descendants().map((node, index) => {
    const fallbackId = `node-${index}`;
    const nodeId = assignId(node.data.id ?? node.data.name, fallbackId);
    idByNode.set(node, nodeId);

    bounds.minX = Math.min(bounds.minX, node.x);
    bounds.maxX = Math.max(bounds.maxX, node.x);
    bounds.minY = Math.min(bounds.minY, node.y);
    bounds.maxY = Math.max(bounds.maxY, node.y);

    return {
      id: nodeId,
      name: node.data.name ?? '',
      data: node.data,
      depth: node.depth,
      height: node.height,
      parentId: node.parent ? idByNode.get(node.parent) ?? null : null,
      x: node.x,
      y: node.y,
    };
  });

  const links = treeRoot.links().map((link) => ({
    sourceId: idByNode.get(link.source),
    targetId: idByNode.get(link.target),
    source: { x: link.source.x, y: link.source.y },
    target: { x: link.target.x, y: link.target.y },
  }));

  return {
    root: treeRoot,
    nodes,
    links,
    bounds,
    nodeSize,
  };
}

