// Minimal hierarchy/tree utilities inspired by d3-hierarchy.
// Provides `hierarchy` and `tree` helpers with the subset of functionality
// required by this project. Licensed under the same MIT terms as d3-hierarchy.

class HierarchyNode {
  constructor(data, parent = null, index = 0) {
    this.data = data;
    this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
    this.height = 0;
    this.children = null;
    this.x = 0;
    this.y = 0;
    this.index = index;
  }

  eachBefore(callback) {
    const stack = [this];

    while (stack.length) {
      const node = stack.pop();
      callback(node);

      if (node.children) {
        for (let i = node.children.length - 1; i >= 0; i -= 1) {
          stack.push(node.children[i]);
        }
      }
    }

    return this;
  }

  eachAfter(callback) {
    (function visit(node) {
      if (node.children) {
        node.children.forEach((child) => visit(child));
      }

      callback(node);
    })(this);

    return this;
  }

  descendants() {
    const nodes = [];
    this.eachBefore((node) => nodes.push(node));
    return nodes;
  }

  links() {
    const links = [];

    this.eachBefore((node) => {
      if (!node.children) return;

      node.children.forEach((child) => {
        links.push({ source: node, target: child });
      });
    });

    return links;
  }
}

function defaultChildrenAccessor(node) {
  return Array.isArray(node.children) ? node.children : null;
}

function buildHierarchy(node, childrenAccessor) {
  const children = childrenAccessor(node.data);

  if (children && children.length) {
    node.children = children.map((child, index) => {
      const childNode = new HierarchyNode(child, node, index);
      buildHierarchy(childNode, childrenAccessor);
      return childNode;
    });

    node.height = 1 + Math.max(...node.children.map((child) => child.height));
  } else {
    node.children = null;
    node.height = 0;
  }

  return node;
}

export function hierarchy(data, childrenAccessor = defaultChildrenAccessor) {
  if (data == null) {
    throw new TypeError('hierarchy requires a root data object');
  }

  const root = new HierarchyNode(data);
  return buildHierarchy(root, childrenAccessor);
}

export function tree() {
  let nodeSize = [1, 1];
  let separation = (a, b) => (a.parent === b.parent ? 1 : 2);

  function layout(root) {
    if (!(root instanceof HierarchyNode)) {
      throw new TypeError('tree layout expects a HierarchyNode root');
    }

    const lastNodeAtDepth = new Map();
    const allNodes = [];

    root.eachBefore((node) => {
      const depth = node.depth;
      const previous = lastNodeAtDepth.get(depth);

      if (previous) {
        node.x = previous.x + separation(node, previous) * nodeSize[0];
      } else {
        node.x = 0;
      }

      node.y = depth * nodeSize[1];
      lastNodeAtDepth.set(depth, node);
      allNodes.push(node);
    });

    root.eachAfter((node) => {
      if (!node.children || node.children.length === 0) {
        return;
      }

      const first = node.children[0];
      const last = node.children[node.children.length - 1];
      node.x = (first.x + last.x) / 2;
    });

    const xs = allNodes.map((node) => node.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const offset = (minX + maxX) / 2;

    allNodes.forEach((node) => {
      node.x -= offset;
    });

    return root;
  }

  layout.nodeSize = function setNodeSize(size) {
    nodeSize = size;
    return layout;
  };

  layout.separation = function setSeparation(callback) {
    separation = callback;
    return layout;
  };

  return layout;
}
