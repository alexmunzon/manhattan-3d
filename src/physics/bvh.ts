import { BufferGeometry, Mesh, type Object3D } from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// Patch three.js once so every mesh raycast uses a bounding volume hierarchy when one exists.
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

/** Builds BVHs for every mesh under `root` so raycasts against it are fast. */
export function buildBoundsTrees(root: Object3D): void {
  root.traverse((node) => {
    const geometry = meshGeometry(node);
    if (geometry && !geometry.boundsTree) geometry.computeBoundsTree();
  });
}

/** Frees BVHs built by {@link buildBoundsTrees}. */
export function disposeBoundsTrees(root: Object3D): void {
  root.traverse((node) => {
    meshGeometry(node)?.disposeBoundsTree();
  });
}

function meshGeometry(node: Object3D): BufferGeometry | null {
  return node instanceof Mesh ? (node.geometry as BufferGeometry) : null;
}
