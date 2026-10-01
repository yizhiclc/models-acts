import test from "node:test";
import assert from "node:assert/strict";
import { cellBounds, randomGenerator } from "../src/grid.js";
import { VoxelBatch } from "../src/voxel.js";
import { generateCity, VIEWS } from "../src/world.js";
import * as THREE from "../vendor/three.module.js";

test("a 1 metre solid consists of exactly five 0.2 metre cells per dimension", () => {
  const b = cellBounds(0, 0, 0, 1, 1, 1);
  assert.deepEqual(
    b.slice(3).map((n, i) => n - b[i]),
    [5, 5, 5],
  );
});
test("cuboid triangles face outwards, avoiding invisible or inside-out buildings", () => {
  const b = new VoxelBatch();
  b.box(0, 0, 0, 1, 1, 1, "#fff");
  const g = b.mesh({ stone: new THREE.MeshBasicMaterial() }).children[0]
    .geometry;
  const p = g.attributes.position,
    normal = g.attributes.normal;
  for (let i = 0; i < g.index.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, g.index.array[i]);
    const b = new THREE.Vector3().fromBufferAttribute(p, g.index.array[i + 1]);
    const c = new THREE.Vector3().fromBufferAttribute(p, g.index.array[i + 2]);
    const n = new THREE.Vector3().fromBufferAttribute(normal, g.index.array[i]);
    assert.ok(b.sub(a).cross(c.sub(a)).dot(n) > 0);
  }
});
test("procedural city stays on the integer cell lattice and contains the main-city districts", () => {
  const city = generateCity();
  assert.ok(city.stats.solidRuns > 15000);
  assert.equal(city.stats.voxelSize, 0.2);
  for (const chunk of city.batch.chunks.values())
    for (const { b } of chunk.boxes) {
      assert.ok(b.every(Number.isInteger));
      for (let i = 0; i < 3; i++) assert.ok(b[i + 3] > b[i]);
    }
  assert.ok(city.footprints.filter((f) => f.kind === "house").length >= 20);
  assert.equal(city.footprints.filter((f) => f.kind === "tower").length, 1);
  assert.equal(city.footprints.filter((f) => f.kind === "pillar").length, 17);
  const tower = city.footprints.find((f) => f.kind === "tower");
  assert.deepEqual(
    [tower.x, tower.z],
    [-88, 5],
    "The core tower belongs on Jieshiping at the west end of the main axis.",
  );
  // Outlying observation and storage districts were explicitly excluded by the user.
  assert.ok(city.footprints.every((f) => f.x < 75 && f.z > -76));
  assert.equal(VIEWS.length, 5);
});
test("Jieshiping tower is rotated 90 degrees with its open front towards the eastern pillar array", () => {
  const city = generateCity();
  const piers = [...city.batch.chunks.values()]
    .flatMap((c) => c.boxes)
    .filter(({ b }) => b[1] === 27 && b[4] - b[1] === 255);
  assert.equal(piers.length, 2);
  const centers = piers
    .map(({ b }) => [(b[0] + b[3]) / 10, (b[2] + b[5]) / 10])
    .sort((a, b) => a[1] - b[1]);
  assert.deepEqual(centers, [
    [-88, -3],
    [-88, 13],
  ]);
  assert.ok(piers.every(({ b }) => b[3] - b[0] === 30 && b[5] - b[2] === 20));
});
test("procedural randomness is reproducible across reloads", () => {
  const a = randomGenerator(12),
    b = randomGenerator(12);
  assert.deepEqual(
    Array.from({ length: 50 }, a),
    Array.from({ length: 50 }, b),
  );
});
