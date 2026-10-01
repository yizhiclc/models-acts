import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPalace } from '../src/palace.js';

// The geometry builder only needs a canvas for text plaques. Rendering is checked
// separately in a real WebGL browser; this stub keeps the geometry check headless.
globalThis.document = { createElement: () => ({ width: 512, height: 180, getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) };
const scene = new THREE.Scene();
const result = buildPalace(scene);
assert.equal(result.buildingCount, 71);
assert.ok(result.treeCount >= 600, 'The gardens should contain at least 600 trees.');
assert.ok(result.flowerCount >= 5000, 'The gardens should contain at least 5000 flowers.');
assert.ok(result.landscape.outsideTrees >= 1500, 'The surrounding landscape should have substantial woodland.');
const terrain = scene.getObjectByName('continuous-landscape');
assert.ok(terrain.geometry.attributes.position.array.every(Number.isFinite));
assert.ok(terrain.geometry.attributes.normal.array.every(Number.isFinite));
terrain.geometry.computeBoundingBox();
assert.ok(terrain.geometry.boundingBox.max.y > 400, 'The surrounding mountains should have a continuous high ridge.');
for (const root of result.landscape.roots) {
  assert.ok(Math.abs(root.y - result.landscape.heightAt(root.x, root.z)) < 0.001, 'An outside tree is floating above the terrain.');
  assert.ok(result.landscape.waterDistance(root.x, root.z) > 23, 'An outside tree is planted in the river.');
  assert.ok(result.landscape.pathDistance(root.x, root.z) > 11, 'An outside tree blocks a walking path.');
}
const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), size = new THREE.Vector3(), color = new THREE.Color();
let batches = 0;
for (const mesh of scene.children.filter(object => object.isInstancedMesh)) {
  batches++;
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    assert.ok(matrix.elements.every(Number.isFinite), `Invalid transform at instance ${i}`);
    matrix.decompose(position, quaternion, size);
    assert.ok(size.x > 0 && size.y > 0 && size.z > 0);
    mesh.getColorAt(i, color);
    if (mesh.material.roughness === 0.94 && color.getHex() === 0xe1dfc5) {
      assert.ok(size.x <= 220 && size.z <= 790, `A white wall ornament is stretched across the site: ${size.toArray()}`);
    }
  }
}
assert.equal(batches, 6);
console.log(JSON.stringify({ status: 'passed', buildings: result.buildingCount, trees: result.treeCount, outsideTrees: result.landscape.outsideTrees, flowers: result.flowerCount, voxels: result.voxelCount, terrainTriangles: result.landscape.terrainTriangles, batches }));
