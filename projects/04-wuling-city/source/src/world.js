import * as THREE from "../vendor/three.module.js";
import { VoxelBatch } from "./voxel.js";
import { randomGenerator, snap } from "./grid.js";

export const CORE_LOCATION = Object.freeze({ x: -88, z: 5 });
export const VIEWS = [
  {
    title: "山水入城",
    text: "远山如屏，碧水环城。飞檐与工业骨架，在薄雾中彼此相接。",
    type: "全景 · 鸟瞰",
    position: [155, 120, 170],
    target: [-15, 20, -2],
  },
  {
    title: "界石坪",
    text: "主城西侧，界石坪上的高塔与方兴街遥遥相对。层叠梁架之间，碧色能量缓缓升起。",
    type: "主城西侧 · 界石坪",
    position: [-22, 39, 56],
    target: [-88, 30, 5],
  },
  {
    title: "方兴街巷",
    text: "青瓦、白墙与一盏温暖的灯。穿过临水街巷，听见新城的日常。",
    type: "主城 · 方兴街",
    position: [25, 8.4, 6],
    target: [-24, 4.8, 6],
  },
  {
    title: "水脉工坊",
    text: "渠道穿过层层城台，水流驱动工坊。古老的营造，在这里生长出新的秩序。",
    type: "主城 · 息流行道",
    position: [-4, 24, 63],
    target: [-36, 9, 24],
  },
  {
    title: "陵水听风",
    text: "沿陵水道回望主城。近岸竹影摇曳，青灰飞檐与天师桩共同勾勒城市的边界。",
    type: "主城南缘 · 陵水道",
    position: [65, 17, 102],
    target: [-8, 13, 28],
  },
];
export const LANDMARKS = [
  { name: "界石坪 · 核心塔", p: [-88, 68, 5], view: 1 },
  { name: "方兴街", p: [0, 20, 5], view: 2 },
  { name: "息流行道", p: [-33, 13, 37], view: 3 },
  { name: "天师桩阵列", p: [48, 34, -23], view: 4 },
  { name: "选剑局", p: [-56, 6, -32], view: 1, mapOnly: true },
  { name: "居民区", p: [-5, 6, -30], view: 2, mapOnly: true },
  { name: "方兴街", p: [-2, 6, 5], view: 2, mapOnly: true },
  { name: "天师府学院", p: [-55, 6, 33], view: 3, mapOnly: true },
  { name: "市民广场", p: [-4, 6, 35], view: 3, mapOnly: true },
  { name: "天师桩阵列", p: [49, 6, -18], view: 4, mapOnly: true },
  { name: "陵水道", p: [-17, 4, 72], view: 4, mapOnly: true },
  { name: "界石坪", p: [-88, 6, 5], view: 1, mapOnly: true },
];

export function generateCity() {
  const B = new VoxelBatch(),
    rnd = randomGenerator(230127),
    footprints = [],
    waterfalls = [];
  const p = {
    stone: "#b5c0ad",
    light: "#dce0ca",
    dark: "#344e47",
    wall: "#d1d1b9",
    roof: "#476c61",
    roofLight: "#6e8a72",
    roofDark: "#294a43",
    wood: "#695a3d",
    gold: "#a58d55",
    glass: "#78b5a1",
    paving: "#b4b9a4",
    moss: "#779063",
    leaf: "#528159",
    bamboo: "#769754",
    water: "#63bcaa",
  };
  const box = (...a) => B.box(...a);
  function slab(x, y, z, w, h, d, color = p.stone) {
    box(x, y, z, w, h, d, color);
  }
  function edgeRail(x, z, w, d, y) {
    for (const zz of [-d / 2, d / 2]) {
      slab(x, y + 1, z + zz, w, 0.2, 0.2, p.light);
      for (let xx = -w / 2; xx <= w / 2; xx += 2.4)
        slab(x + xx, y, z + zz, 0.4, 1.4, 0.4, p.stone);
    }
    for (const xx of [-w / 2, w / 2]) {
      slab(x + xx, y + 1, z, 0.2, 0.2, d, p.light);
      for (let zz = -d / 2; zz <= d / 2; zz += 2.4)
        slab(x + xx, y, z + zz, 0.4, 1.4, 0.4, p.stone);
    }
  }
  function stairs(x, z, w, steps, y = 2, direction = 1) {
    for (let i = 0; i < steps; i++)
      slab(x, y + i * 0.2, z + i * 0.4 * direction, w, 0.2, 0.4, p.light);
  }
  function roof(x, y, z, w, d, h = 3.2) {
    // Every course is one voxel high. Eaves rise at the ends in voxel steps.
    const courses = Math.round(h / 0.2),
      ridge = Math.max(0.8, w - d * 0.75);
    for (let k = 0; k < courses; k++) {
      const t = k / courses,
        depth = Math.max(0.4, d * (1 - t)),
        width = ridge + (w - ridge) * (1 - t);
      box(
        x,
        y + k * 0.2,
        z,
        width,
        0.2,
        depth,
        k % 4 === 0 ? p.roofLight : p.roof,
        "roof",
      );
      for (const s of [-1, 1])
        box(
          x,
          y + k * 0.2,
          z + (s * depth) / 2,
          width,
          0.2,
          0.2,
          k % 3 === 0 ? p.gold : p.roofDark,
          "roof",
        );
    }
    box(x, y + h, z, ridge + 1.2, 0.4, 0.4, p.roofDark, "roof");
    // Raised corners and parallel tile seams.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (let k = 0; k < 4; k++)
          box(
            x + sx * (w / 2 - 0.8 + k * 0.2),
            y + k * 0.2,
            z + sz * (d / 2 - 0.6 + k * 0.2),
            1.2 - k * 0.2,
            0.2,
            0.6,
            p.roofDark,
            "roof",
          );
    for (let xx = -w / 2 + 0.6; xx < w / 2; xx += 0.8) {
      const reach =
        1 - Math.max(0, (Math.abs(xx) - ridge / 2) / ((w - ridge) / 2));
      for (let k = 0; k < courses * reach; k += 2) {
        const dep = Math.max(0.4, d * (1 - k / courses));
        for (const s of [-1, 1])
          box(
            x + xx,
            y + k * 0.2 + 0.2,
            z + s * (dep / 2 - 0.3),
            0.2,
            0.2,
            0.6,
            p.roofLight,
            "roof",
          );
      }
    }
  }
  function sign(x, y, z, text, w = 3.2) {
    // Block strokes, never imported imagery.
    slab(x, y, z, w, 1.2, 0.4, p.dark);
    const patterns = {
      茶: ["11111", "00100", "11111", "10101", "01110"],
      方: ["00100", "11111", "00100", "01110", "10010"],
      兴: ["01010", "10101", "00000", "11111", "10001"],
      武: ["11101", "01001", "11111", "01010", "11001"],
      陵: ["01010", "10111", "11010", "10101", "10110"],
    };
    const pat = patterns[text] || patterns.茶;
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 5; i++)
        if (pat[j][i] === "1")
          box(
            x + (i - 2) * 0.2,
            y + 1 - j * 0.2,
            z + 0.3,
            0.2,
            0.2,
            0.2,
            p.light,
            "glow",
          );
  }
  function house(x, z, w, d, floors = 2, base = 3.2, style = 0) {
    footprints.push({ x, z, w, d, kind: "house" });
    slab(x, base - 0.8, z, w + 1.6, 0.8, d + 1.6, p.stone);
    slab(x, base, z, w, floors * 3.6, d, style === 1 ? "#b9c4b1" : p.wall);
    for (let f = 0; f < floors; f++) {
      const y = base + f * 3.6;
      slab(x, y, z, w + 0.4, 0.4, d + 0.4, p.dark);
      for (const zz of [-d / 2, d / 2]) {
        for (let xx = -w / 2 + 0.8; xx < w / 2; xx += 1.8) {
          slab(x + xx, y + 0.8, z + zz, 1.2, 1.8, 0.2, p.dark);
          box(
            x + xx,
            y + 1,
            z + zz + Math.sign(zz) * 0.2,
            0.8,
            1.4,
            0.2,
            style === 2 ? "#dab776" : p.glass,
            "window",
          );
          slab(
            x + xx,
            y + 1,
            z + zz + Math.sign(zz) * 0.4,
            0.2,
            1.4,
            0.2,
            p.wood,
          );
          slab(
            x + xx,
            y + 1.6,
            z + zz + Math.sign(zz) * 0.4,
            1,
            0.2,
            0.2,
            p.wood,
          );
        }
      }
      for (const xx of [-w / 2, w / 2]) {
        slab(x + xx, y, z, 0.4, 3.6, d + 0.4, p.dark);
        for (let zz = -d / 2 + 1; zz < d / 2; zz += 2.4)
          box(
            x + xx + Math.sign(xx) * 0.2,
            y + 1,
            z + zz,
            0.2,
            1.4,
            1.4,
            p.glass,
            "window",
          );
      }
      if (f === floors - 1 || floors > 2)
        roof(x, y + 3.2, z, w + 2.8, d + 2.6, 2.4);
    }
    // Shopfront, structural posts, air-conditioning units and copper conduits.
    if (style === 2) {
      roof(x, base + 2.6, z + d / 2 + 1, w + 1, 3.2, 0.8);
      sign(x, base + 2.4, z + d / 2 + 0.6, "茶");
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        slab(
          x + sx * (w / 2 - 0.4),
          base,
          z + sz * (d / 2 - 0.4),
          0.6,
          floors * 3.6,
          0.6,
          p.wood,
        );
    slab(x + w / 2 + 0.4, base + 1, z, 1.2, 1.2, 2, p.stone);
    for (let k = 0; k < 4; k++)
      slab(x + w / 2 + 1, base + 1.2 + k * 0.2, z, 0.2, 0.2, 1.6, p.dark);
    stairs(x, z + d / 2 + 1, w * 0.48, 4, base - 0.8, -1);
  }
  function tree(x, y, z, scale = 1, pink = false) {
    const trunkH = snap((3 + rnd() * 2) * scale),
      c = pink
        ? ["#bf9d90", "#d8b8a0", "#a98681"]
        : ["#3e684b", "#547e50", "#719558", "#87a664"];
    slab(x, y, z, 0.6 * scale, trunkH, 0.6 * scale, p.wood);
    for (let k = 0; k < 10; k++) {
      const dx = (rnd() - 0.5) * 4 * scale,
        dz = (rnd() - 0.5) * 4 * scale,
        yy = y + trunkH - 0.8 + rnd() * 2.6 * scale;
      box(
        x + dx,
        yy,
        z + dz,
        (1.2 + rnd() * 1.4) * scale,
        (0.6 + rnd() * 0.8) * scale,
        (1.2 + rnd() * 1.4) * scale,
        c[k % 4 || 0] || c[0],
        "leaves",
      );
    }
  }
  function bamboo(x, y, z) {
    for (let j = 0; j < 5; j++) {
      const xx = x + (rnd() - 0.5) * 3,
        zz = z + (rnd() - 0.5) * 3,
        h = 5 + rnd() * 5;
      slab(xx, y, zz, 0.2, h, 0.2, p.bamboo);
      for (let k = 1; k < h; k += 1.4)
        slab(xx, y + k, zz, 0.4, 0.2, 0.4, "#b0b77b");
      for (let k = 0; k < 6; k++) {
        const yy = y + h - 3 + rnd() * 3;
        const dx = (rnd() - 0.5) * 2.4,
          dz = (rnd() - 0.5) * 2.4;
        box(
          xx + dx,
          yy,
          zz + dz,
          0.4 + rnd() * 1.6,
          0.2,
          0.4 + rnd() * 1.8,
          k % 2 ? p.leaf : p.moss,
          "leaves",
        );
      }
    }
  }
  function lantern(x, y, z) {
    slab(x, y, z, 0.2, 3.8, 0.2, p.dark);
    slab(x + 0.5, y + 3.6, z, 1.4, 0.2, 0.2, p.dark);
    slab(x + 1, y + 2.6, z, 0.8, 1, 0.8, p.gold);
    box(x + 1, y + 2.8, z, 1, 0.6, 1, "#f7d297", "glow");
    slab(x + 1, y + 2.4, z, 0.8, 0.2, 0.8, p.dark);
  }
  function planter(x, z, w = 3, d = 3, y = 3.2) {
    slab(x, y, z, w, 0.6, d, p.dark);
    slab(x, y + 0.6, z, w - 0.4, 0.2, d - 0.4, p.moss);
  }
  function pillar(x, z, h = 26, base = 1.6) {
    slab(x, base, z, 4.8, 1.2, 4.8, p.dark);
    slab(x, base + 1.2, z, 3.8, 0.6, 3.8, p.light);
    slab(x, base + 1.8, z, 2.4, h - 3.2, 2.4, p.light);
    for (const s of [-1, 1]) {
      slab(x + s * 1.2, base + 2, z, 0.4, h - 3.4, 2, p.stone);
      slab(x, base + 2, z + s * 1.2, 0.6, h - 3.4, 0.2, p.dark);
      box(x, base + 6, z + s * 1.4, 0.2, h - 11, 0.2, "#8ce9c1", "glow");
    }
    for (const yy of [base + 3, base + h * 0.5, base + h - 2]) {
      slab(x, yy, z, 3.2, 0.6, 3.2, p.dark);
      slab(x, yy + 0.6, z, 2.8, 0.2, 2.8, p.gold);
    }
    slab(x, base + h - 1, z, 5, 0.6, 5, p.dark);
    slab(x, base + h - 0.4, z, 5.8, 0.4, 5.8, p.roofLight);
    slab(x, base + h, z, 4.6, 0.2, 4.6, p.roof);
    slab(x, base + h + 0.2, z, 3.2, 0.4, 3.2, p.dark);
    footprints.push({ x, z, w: 4, d: 4, kind: "pillar" });
  }
  function bridge(x, z, length, width, alongX = false, base = 2.2) {
    for (let j = 0; j < Math.round(length / 0.4); j++) {
      const v = -length / 2 + j * 0.4,
        yy = base + snap(1.6 * (1 - Math.pow(v / (length / 2), 2)));
      slab(
        x + (alongX ? v : 0),
        yy,
        z + (alongX ? 0 : v),
        alongX ? 0.4 : width,
        0.4,
        alongX ? width : 0.4,
        p.light,
      );
      for (const s of [-1, 1]) {
        slab(
          x + (alongX ? v : (s * width) / 2),
          yy + 0.6,
          z + (alongX ? (s * width) / 2 : v),
          alongX ? 0.4 : 0.2,
          0.2,
          alongX ? 0.2 : 0.4,
          p.dark,
        );
        if (j % 4 === 0)
          slab(
            x + (alongX ? v : (s * width) / 2),
            yy,
            z + (alongX ? (s * width) / 2 : v),
            0.4,
            1.2,
            0.4,
            p.stone,
          );
      }
    }
    for (const s of [-1, 1])
      slab(
        x + (alongX ? s * length * 0.3 : 0),
        0.2,
        z + (alongX ? 0 : s * length * 0.3),
        alongX ? 1.2 : width - 0.8,
        2.8,
        alongX ? width - 0.8 : 1.2,
        p.stone,
      );
  }
  // Plan adapted from the published city map: western urban body, north-south
  // canal, Fangxing east-west axis, south civic plaza and eastern pillar field.
  const blocks = [
    [-53, -29, 34, 48],
    [-5, -29, 40, 48],
    [-55, 29, 30, 42],
    [-4, 33, 42, 34],
    [-48, -62, 42, 12],
    [-55, 64, 32, 24],
  ];
  for (const [x, z, w, d] of blocks) {
    slab(x, -2, z, w + 3, 4.8, d + 3, "#647562");
    slab(x, 2.8, z, w + 3, 0.4, d + 3, p.dark);
    slab(x, 3.2, z, w + 2, 0.2, d + 2, p.paving);
    for (let xx = -w / 2; xx < w / 2; xx += 2.4)
      for (let zz = -d / 2; zz < d / 2; zz += 2.4)
        slab(
          x + xx,
          3.4,
          z + zz,
          2.2,
          0.2,
          2.2,
          rnd() > 0.3 ? "#bdc2ad" : "#adb6a0",
        );
  }
  // East-west promenade and north-south ceremonial route.
  slab(-24, 1.8, 5, 100, 1.6, 11, p.stone);
  slab(-24, 3.4, 5, 100, 0.2, 10, p.light);
  slab(-29, 2.4, -10, 8, 1, 122, p.dark);
  slab(-29, 3.4, -10, 7.6, 0.2, 122, "#4c8d82");
  // Open water channel is inset into the promenade, with repeated bridges.
  for (const x of [-33.6, -24.4]) slab(x, 3.2, -9, 0.6, 0.6, 125, p.light);
  for (const z of [-50, -30, -11, 6, 25, 48]) bridge(-29, z, 12, 4, true, 3.2);
  // Western and eastern terrace walls and their vertical buttresses.
  for (const [x, z, d] of [
    [-74, -6, 128],
    [20, -2, 115],
  ]) {
    slab(x, -1, z, 2.4, 5, d, p.stone);
    slab(x, 4, z, 3.6, 0.6, d, p.light);
    for (let zz = -d / 2; zz < d / 2; zz += 5.2) {
      slab(x + 0.4, -1, z + zz, 3.2, 5, 1.2, "#8f9c88");
      slab(x, 4.6, z + zz, 1, 1, 1, p.dark);
    }
    slab(x, 4.8, z, 0.4, 0.4, d, p.dark);
  }
  slab(-26, -1, -75, 98, 5, 2.4, p.stone);
  slab(-26, 4, -75, 100, 0.6, 3.6, p.light);
  for (let x = -72; x < 22; x += 4.8) slab(x, 4.6, -75, 1, 1, 1, p.dark);
  // Northern residential quarter, arranged around a planted courtyard.
  house(-14, -42, 12, 10, 2);
  house(7, -42, 10, 11, 3);
  house(-17, -21, 8, 11, 2, 3.6, 2);
  house(7, -22, 10, 11, 2);
  planter(-3, -30, 7, 7, 3.6);
  tree(-3, 4.4, -30, 1.2);
  edgeRail(-3, -30, 8, 8, 3.6);
  // Xuanjian Bureau: a monumental quadrangle with a square water court.
  house(-56, -47, 22, 7, 3, 3.6, 1);
  house(-67, -32, 6, 16, 2, 3.6, 1);
  house(-46, -32, 4, 16, 2, 3.6, 1);
  house(-56, -17, 18, 6, 2, 3.6, 1);
  slab(-56, 3.6, -32, 15, 0.4, 17, p.dark);
  slab(-56, 4, -32, 13, 0.2, 15, p.water);
  edgeRail(-56, -32, 15, 17, 4);
  for (const x of [-62, -50])
    for (const z of [-40, -24]) {
      slab(x, 4.2, z, 1, 1, 1, p.stone);
      box(x, 5.2, z, 1, 0.4, 1, "#c2e2ad", "glow");
    }
  // Jieshiping is the west end of the Fangxing / Xiliu east-west axis.
  // The user explicitly places the forked energy tower on this platform.
  slab(-88, -1, 5, 26, 4.4, 27, p.stone);
  slab(-88, 3.4, 5, 25.6, 0.2, 26.6, p.light);
  slab(-74, 3.4, 5, 5, 0.2, 9, p.light);
  // Fangxing's paired shop houses, colonnades and lantern-lined axis.
  house(-11, -3, 12, 8, 2, 3.6, 2);
  house(7, -3, 12, 8, 2, 3.6, 2);
  house(-9, 16, 14, 8, 2, 3.6, 2);
  house(9, 16, 10, 8, 2, 3.6, 2);
  for (const z of [1, 11])
    for (let x = -20; x <= 18; x += 4.2) lantern(x, 3.6, z);
  for (const z of [-7, 19])
    for (let x = -18; x < 16; x += 6) slab(x, 3.6, z, 0.4, 3, 0.4, p.wood);
  // South academy and material research institute.
  house(-55, 24, 16, 10, 2, 3.6, 1);
  house(-55, 43, 16, 9, 2, 3.6, 1);
  house(-66, 33, 6, 10, 1, 3.6, 1);
  house(-43, 33, 6, 10, 1, 3.6, 1);
  slab(-55, 3.6, 33, 12, 0.2, 8, "#8b9f7c");
  tree(-55, 3.8, 33, 1.2, true);
  edgeRail(-55, 33, 12, 8, 3.6);
  // Civic square: concentric, stepped square fountain, pergolas and gardens.
  for (let k = 0; k < 4; k++)
    slab(
      -4,
      3.6 + k * 0.2,
      35,
      18 - k * 2,
      0.2,
      16 - k * 2,
      k % 2 ? p.dark : p.light,
    );
  slab(-4, 4.4, 35, 11, 0.2, 9, "#489584");
  slab(-4, 4.6, 35, 3, 0.6, 3, p.dark);
  slab(-4, 5.2, 35, 1.4, 4, 1.4, p.light);
  box(-4, 7, 35, 2, 0.6, 2, "#9de8ca", "glow");
  for (const x of [-18, 11])
    for (const z of [26, 42]) {
      planter(x, z, 4, 4, 3.6);
      tree(x, 4.4, z, 0.9);
    }
  for (let x = -16; x <= 10; x += 4) {
    slab(x, 3.6, 49, 0.4, 3.2, 0.4, p.dark);
    slab(x, 6.8, 49, 5, 0.2, 3, p.wood);
  }
  house(6, 58, 12, 6, 1, 2.4, 2);
  house(-13, 57, 10, 7, 1, 2.4, 1);
  house(-64, 58, 8, 7, 2, 3.6, 1);
  house(-46, 58, 10, 8, 2, 3.6, 1);
  house(-64, 72, 8, 7, 1, 3.6, 2);
  house(-46, 72, 10, 8, 1, 3.6, 1);
  // Tower / technological interpretation of the official forked, open core.
  // All parts share the Jieshiping anchor, including the dynamic beam and lighting.
  const tx = CORE_LOCATION.x,
    tz = CORE_LOCATION.z;
  {
    // A +90 degree Y rotation sends the original +Z facade towards +X (east).
    // Rotate the cuboid centres and swap X/Z extents before voxel quantization.
    // This preserves exact grid alignment and rotates the steps with the tower.
    const box = (x, y, z, w, h, d, color, material) =>
      B.box(tx + (z - tz), y, tz - (x - tx), d, h, w, color, material);
    const slab = (x, y, z, w, h, d, color = p.stone) =>
      box(x, y, z, w, h, d, color);
    const stairs = (x, z, w, steps, y = 2, direction = 1) => {
      for (let i = 0; i < steps; i++)
        slab(x, y + i * 0.2, z + i * 0.4 * direction, w, 0.2, 0.4, p.light);
    };
    slab(tx, 3.6, tz, 24, 1.2, 22, p.dark);
    slab(tx, 4.8, tz, 21, 0.6, 20, p.light);
    stairs(tx, tz + 12, 12, 8, 3.6, -1);
    for (const x of [tx - 8, tx + 8]) {
      slab(x, 5.4, tz, 4, 51, 6, p.stone);
      slab(x - 0.6, 6, tz + 3.4, 1, 49, 0.4, p.light);
      slab(x + 0.6, 6, tz - 3.4, 0.6, 49, 0.4, p.dark);
      for (let y = 9; y < 55; y += 9) {
        slab(x, y, tz, 5, 0.6, 7, p.dark);
        slab(x, y + 0.6, tz, 4.6, 0.4, 6.6, p.gold);
      }
    }
    for (let y = 13; y <= 53; y += 10) {
      slab(tx, y, tz - 2, 15, 1.6, 2, p.dark);
      slab(tx, y + 1.6, tz - 2, 16, 0.4, 2.8, p.light);
    }
    box(tx, 7, tz, 2, 51, 2, "#77e3bc", "core");
    box(tx, 9, tz, 3.2, 48, 3.2, "#5fc0a3", "energy");
    // The stepped copper spiral is grid aligned; it threads through the open tower.
    for (let i = 0; i < 155; i++) {
      const a = i * 0.16,
        y = 9 + i * 0.29;
      box(
        tx + Math.cos(a) * 3.5,
        y,
        tz + Math.sin(a) * 3.5,
        1.4,
        0.6,
        1.4,
        i % 5 === 0 ? p.gold : p.dark,
      );
    }
    for (const [y, w, d] of [
      [48, 27, 10],
      [54, 34, 8],
      [59, 26, 7],
    ]) {
      slab(tx, y, tz, w, 1.6, d, p.dark);
      slab(tx, y + 1.6, tz, w + 1.2, 0.4, d + 1.2, p.light);
      slab(tx, y + 2, tz, w - 1, 0.4, d, p.roof);
    }
    for (const x of [tx - 14, tx + 14]) slab(x, 54, tz, 2.2, 9, 3.4, p.stone);
    slab(tx, 60, tz, 5, 5, 5, p.dark);
    slab(tx, 65, tz, 3.2, 2, 3.2, p.light);
    box(tx, 67, tz, 0.6, 6, 0.6, "#b6efd6", "glow");
  }
  footprints.push({
    x: tx,
    z: tz,
    w: 22,
    d: 23,
    kind: "tower",
    headingDegrees: 90,
  });
  // Outer defensive pillar array: two bands, a clear gateway on the main axis.
  for (const x of [34, 49, 63])
    for (const z of [-60, -41, -22, 23, 43])
      pillar(x, z, 20 + (x === 49 ? 5 : 0) + (z === -41 ? 3 : 0));
  for (const x of [33, 58]) pillar(x, 5, 33);
  slab(43, 1.6, 5, 46, 0.6, 12, p.light);
  for (let x = 22; x < 68; x += 2.4) slab(x, 2.2, 5, 2, 0.2, 10, p.paving);
  // Northern edge of the selected main city; the outlying technical district is omitted.
  house(-56, -62, 14, 6, 1, 3.6, 1);
  house(-36, -62, 14, 6, 1, 3.6, 1);
  for (const x of [-66, -53, -40, -27, -14, 0]) {
    slab(x, 1, -84, 2, 11, 2, p.stone);
    slab(x, 11, -84, 3, 0.6, 3, p.light);
  }
  slab(-33, 11.6, -84, 75, 0.8, 4.8, p.dark);
  slab(-33, 12.4, -84, 75, 0.2, 3.2, p.water);
  for (const z of [-86.2, -81.8]) slab(-33, 12.4, z, 75, 0.6, 0.4, p.light);
  // Industrial coolant reservoirs, pipes, stacks, and a working waterwheel.
  for (const x of [-55, -45]) {
    slab(x, 3.6, 3, 6, 0.8, 7, p.dark);
    slab(x, 4.4, 3, 5, 0.6, 6, p.glass);
    slab(x, 5, 3, 4, 5, 5, p.stone);
    for (const y of [5, 7, 9]) slab(x, y, 3, 4.8, 0.4, 5.8, p.dark);
    box(x, 6.2, 6, 3.2, 0.6, 0.2, "#b4e3b8", "glow");
    slab(x, 10, 3, 2.4, 1.2, 3, p.roofLight);
  }
  for (const z of [0, 7]) {
    slab(-53, 8, z, 27, 0.8, 0.8, p.gold);
    for (let x = -65; x < -40; x += 6) slab(x, 4, z, 0.4, 4, 0.4, p.dark);
  }
  // Two tiered waterfalls on the front retaining wall.
  for (const x of [-29, 3]) {
    slab(x, -1, 55, 5, 4, 3, p.dark);
    for (let j = 0; j < 12; j++)
      box(
        x - 2.2 + j * 0.4,
        0.4,
        56,
        0.4,
        3.6,
        0.4,
        j % 3 === 0 ? "#b5e3d2" : p.water,
        "fall",
      );
    waterfalls.push({ x, z: 56, y: 0.5, h: 3.6, w: 4.8 });
  }
  // Landscape: raised irregular banks around the urban platforms, open turquoise water.
  function inCity(x, z) {
    return (
      (x > -78 && x < 24 && z > -79 && z < 55) ||
      (x > -74 && x < -36 && z > 50 && z < 79) ||
      (x > -103 && x < -74 && z > -10 && z < 20)
    );
  }
  function landHeight(x, z) {
    const east = z < 58 && z > -75 && x > 25 && x < 73;
    const north = z < -80 && z > -110 && x > -91 && x < 71;
    const southern = z > 59 && z < 86 && x > -91 && x < 36;
    if (east) return 1.2 + Math.sin(x * 0.12) * 0.6 + Math.cos(z * 0.13) * 0.6;
    if (north) return 3 + Math.sin(x * 0.12) * 1.4 + Math.cos(z * 0.1) * 2;
    if (southern) {
      if (Math.abs(x + 29) < 6 || Math.abs(x - 3) < 5) return -2;
      return 1 + Math.sin(x * 0.13) * 0.8;
    }
    if (x < -82 && x > -109 && z > -80 && z < 80)
      return 1.6 + Math.sin(z * 0.06) * 1.2;
    return -2;
  }
  for (let x = -110; x < 129; x += 2)
    for (let z = -110; z < 90; z += 2) {
      if (inCity(x, z)) continue;
      const h = snap(landHeight(x, z));
      if (h < 0.2) continue;
      slab(
        x,
        -2,
        z,
        2,
        h + 2,
        2,
        ["#607b62", "#6b8467", "#8da080", "#738d6b"][Math.floor(rnd() * 4)],
      );
      if (rnd() < 0.14)
        box(
          x,
          h,
          z,
          0.4 + rnd() * 0.8,
          0.2,
          0.4 + rnd() * 0.8,
          "#9bad80",
          "leaves",
        );
      if (rnd() < 0.028 && (x > 97 || x < -84 || z < -86))
        tree(x, h, z, 0.7 + rnd() * 0.55);
    }
  // Rock outcrops: many rectangular runs on the same 0.2m grid.
  function mountain(cx, cz, r, h) {
    const step = 2;
    for (let x = -r; x <= r; x += step)
      for (let z = -r; z <= r; z += step) {
        const dx = x / r,
          dz = z / r,
          dist = Math.sqrt(dx * dx + dz * dz),
          ridge =
            0.11 * Math.sin(x * 0.34) +
            0.1 * Math.cos(z * 0.4) +
            0.06 * Math.sin((x + z) * 0.7);
        if (dist > 1 + ridge) continue;
        const height = snap(
          h * Math.pow(Math.max(0, 1 - dist / (1 + ridge)), 0.5),
        );
        if (height < 0.4) continue;
        const col = ["#617c74", "#728b7e", "#819487", "#526e69"][
          Math.floor(rnd() * 4)
        ];
        box(cx + x, -3, cz + z, step, height + 3, step, col, "rock");
        if (height > h * 0.35) {
          box(
            cx + x,
            height,
            cz + z,
            step,
            0.4,
            step,
            rnd() > 0.4 ? "#70936e" : "#658664",
            "leaves",
          );
        }
        if (rnd() < 0.015 && height > h * 0.6)
          tree(cx + x, height + 0.4, cz + z, 0.7);
        if (rnd() < 0.12) {
          const yy = height * 0.3;
          box(
            cx + x + 1,
            yy,
            cz + z,
            0.4,
            1 + rnd() * 3,
            step,
            "#9baa93",
            "rock",
          );
        }
      }
  }
  mountain(-111, -103, 27, 73);
  mountain(-72, -137, 26, 98);
  mountain(-19, -157, 29, 82);
  mountain(33, -143, 31, 114);
  mountain(91, -118, 31, 84);
  mountain(142, -78, 21, 73);
  mountain(-144, -34, 23, 59);
  mountain(155, 30, 19, 62);
  // Substantial bamboo groves with grid-sized stems and nodes.
  for (let k = 0; k < 25; k++) {
    const x = -85 + rnd() * 107,
      z = 66 + rnd() * 12;
    const h = landHeight(x, z);
    if (h > 0.2 && !inCity(x, z)) bamboo(x, snap(h), z);
  }
  for (let k = 0; k < 15; k++) bamboo(32 + rnd() * 30, 2, -79 - rnd() * 13);
  // Trees reinforce the pedestrian paths and courtyards.
  for (const [x, z] of [
    [-69, 10],
    [-39, 15],
    [-40, 45],
    [-20, 50],
    [16, 45],
    [16, 28],
    [-19, -53],
    [15, -57],
    [-67, -58],
    [-73, 53],
    [-10, -65],
    [22, 60],
    [51, 60],
    [59, -71],
  ]) {
    planter(x, z, 3, 3, x < 20 ? 3.6 : 1.6);
    tree(x, x < 20 ? 4.4 : 2.4, z, 0.9 + rnd() * 0.5);
  }
  for (const x of [-21, 17])
    for (const z of [-52, -33, -13, 25, 46]) lantern(x, 3.6, z);
  // Southern Lingshui bank inside the user-selected outline.
  slab(-8, 1.2, 70, 12, 0.6, 12, p.wood);
  edgeRail(-8, 70, 12, 12, 1.8);
  for (const x of [-11, -5])
    for (const z of [67, 73]) slab(x, 1.8, z, 0.6, 5, 0.6, p.wood);
  roof(-8, 6.8, 70, 11, 11, 2.6);
  bridge(32, 63, 22, 4, true, 1.2);
  // Market awnings, crates, benches, vending machines and residents.
  for (const x of [-17, 1, 13]) {
    slab(x, 3.6, 8, 2.8, 1, 1.4, p.wood);
    for (let j = 0; j < 5; j++)
      box(
        x - 1 + j * 0.4,
        4.6,
        8,
        0.4,
        0.4,
        0.4,
        j % 2 ? "#d2b16a" : "#7ba065",
      );
    for (const s of [-1, 1]) slab(x + s * 1.6, 3.6, 8, 0.2, 2.6, 0.2, p.wood);
    box(x, 6.2, 8, 3.6, 0.2, 2.2, "#b4c87b", "leaves");
  }
  for (const [x, z] of [
    [-8, 7],
    [4, 7],
    [-19, 5],
    [12, 36],
    [-36, 13],
    [35, 5],
    [-58, 36],
  ]) {
    slab(x, 3.6, z, 0.4, 0.8, 0.4, p.dark);
    box(x, 4.4, z, 0.8, 0.8, 0.4, rnd() > 0.5 ? "#739a91" : "#b4a88a");
    box(x, 5.2, z, 0.4, 0.4, 0.4, "#d9bc96");
  }
  for (const [x, z] of [
    [-17, 31],
    [12, 39],
    [-65, 15],
    [-14, -35],
  ]) {
    slab(x, 3.8, z, 3.2, 0.4, 1, p.wood);
    for (const s of [-1, 1]) slab(x + s, 3.6, z, 0.4, 0.2, 0.6, p.dark);
    slab(x, 4.2, z - 0.4, 3.2, 0.8, 0.2, p.wood);
  }
  for (let i = 0; i < 10; i++) {
    const x = -63 + rnd() * 15,
      z = -58 + rnd() * 4;
    slab(x, 3.6, z, 1.2, 1.2, 1.2, p.wood);
    slab(x, 4, z, 1.4, 0.2, 1.4, p.gold);
  }
  return {
    batch: B,
    footprints,
    waterfalls,
    stats: {
      solidRuns: B.count,
      voxelSize: 0.2,
      bounds: B.bounds.map((v) => v * 0.2),
    },
  };
}

export function buildWorld(scene) {
  const city = generateCity();
  const materials = {
    stone: new THREE.MeshLambertMaterial({ vertexColors: true }),
    roof: new THREE.MeshLambertMaterial({ vertexColors: true }),
    rock: new THREE.MeshLambertMaterial({ vertexColors: true }),
    leaves: new THREE.MeshLambertMaterial({ vertexColors: true }),
    window: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0.1,
      emissive: "#ffbf72",
      emissiveIntensity: 0.04,
    }),
    glow: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      emissive: "#ffcb80",
      emissiveIntensity: 0.5,
    }),
    core: new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
    }),
    energy: new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    fall: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.15,
      emissive: "#368d76",
      emissiveIntensity: 0.18,
    }),
  };
  const geometry = city.batch.mesh(materials);
  scene.add(geometry);
  city.batch.chunks.clear();
  const waterUniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uNight: { value: 0 },
    uTint: { value: new THREE.Color("#439d8d") },
    uSun: { value: new THREE.Color("#e6efd4") },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(660, 620),
    new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      transparent: false,
      fog: true,
      vertexShader:
        `varying vec3 vWorld; varying vec3 vView; #include <fog_pars_vertex>\nvoid main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vec4 mvPosition=viewMatrix*world;vView=-mvPosition.xyz;gl_Position=projectionMatrix*mvPosition;#include <fog_vertex>\n}`
          .replaceAll("; #", ";\n#")
          .replaceAll(";#", ";\n#"),
      fragmentShader:
        `uniform float uTime;uniform float uNight;uniform vec3 uTint;uniform vec3 uSun;varying vec3 vWorld;varying vec3 vView;#include <fog_pars_fragment>\nfloat hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}void main(){vec2 p=floor(vWorld.xz*5.)/5.;float wave=sin(p.x*.45+uTime*.45)*sin(p.y*.55-uTime*.32);float fine=sin(p.x*2.1+p.y*.3+uTime)*sin(p.y*2.9-uTime*.8);float h=hash(floor(p*1.5));float glint=pow(max(0.,fine),16.)*step(.87,h);vec3 col=uTint*(.93+wave*.045+fine*.024)+uSun*glint*.22;float stripe=pow(max(0.,sin(p.y*.12+p.x*.025+uTime*.1)),28.);col+=uSun*stripe*.028;gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n}`.replaceAll(
          ";#",
          ";\n#",
        ),
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.4;
  water.name = "Animated voxel-quantized water";
  scene.add(water);
  const canal = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 122),
    water.material,
  );
  canal.rotation.x = -Math.PI / 2;
  canal.position.set(-29, 3.63, -10);
  scene.add(canal);
  const luminaries = [];
  for (const [x, y, z, c] of [
    [CORE_LOCATION.x, 26, CORE_LOCATION.z, "#76f4c2"],
    [-12, 8, 5, "#ffbe6c"],
    [12, 8, 5, "#ffc77e"],
    [-4, 9, 35, "#a8e4b6"],
  ]) {
    const l = new THREE.PointLight(c, 0, 42, 1.5);
    l.position.set(x, y, z);
    luminaries.push(l);
    scene.add(l);
  }
  // Small dynamic solid-voxel water flecks and drifting motes.
  const particleGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2),
    particleMat = new THREE.MeshBasicMaterial({
      color: "#e1efd2",
      transparent: true,
      opacity: 0.65,
    });
  const particles = new THREE.InstancedMesh(particleGeo, particleMat, 90),
    dummy = new THREE.Object3D(),
    random = randomGenerator(1950),
    seeds = [];
  for (let i = 0; i < 90; i++)
    seeds.push({
      x: -65 + random() * 170,
      z: -65 + random() * 130,
      y: 4 + random() * 24,
      speed: 0.15 + random() * 0.4,
    });
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  scene.add(particles);
  // Voxel boat, moving gently along the eastern waterway.
  const boatB = new VoxelBatch();
  for (let k = 0; k < 3; k++)
    boatB.box(0, k * 0.2, 0, 1.2 + k * 0.4, 0.2, 4.2 - k * 0.4, "#695d43");
  boatB.box(0, 0.6, 0, 1.6, 0.2, 3, "#b0a07a");
  boatB.box(0, 0.8, -0.6, 0.2, 2.6, 0.2, "#745d3b");
  boatB.box(0, 2.6, -0.6, 1.6, 0.2, 1.6, "#879971");
  boatB.box(0, 1.5, -0.6, 0.2, 1, 0.2, "#e0d5a2", "glow");
  const boat = boatB.mesh(materials);
  boat.name = "Canal boat";
  scene.add(boat);
  // Waterwheel is a deliberate dynamic voxel sculpture: its rest pose is on-grid.
  const wheelB = new VoxelBatch();
  for (let i = 0; i < 40; i++) {
    const a = (i * Math.PI) / 20;
    wheelB.box(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0, 0.6, 0.6, 1.2, pick(i));
  }
  function pick(i) {
    return i % 5 === 0 ? "#bfaa71" : "#526959";
  }
  wheelB.box(0, -3.6, 0, 0.4, 7.2, 0.8, "#73674b");
  wheelB.box(0, -0.2, 0, 7.2, 0.4, 0.8, "#73674b");
  const wheel = wheelB.mesh(materials);
  wheel.position.set(-35, 4.5, 43);
  wheel.rotation.y = Math.PI / 2;
  scene.add(wheel);
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 48, 0.4),
    new THREE.MeshBasicMaterial({
      color: "#c4f9d8",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  beam.position.set(CORE_LOCATION.x, 87, CORE_LOCATION.z);
  scene.add(beam);
  return {
    ...city,
    geometry,
    materials,
    water,
    waterUniforms,
    luminaries,
    update(t, night) {
      waterUniforms.uTime.value = t;
      waterUniforms.uNight.value = night;
      boat.position.set(
        82 + Math.sin(t * 0.025) * 4,
        0.6 + Math.sin(t * 0.8) * 0.07,
        Math.sin(t * 0.025) * 45,
      );
      boat.rotation.y = Math.cos(t * 0.025) > 0 ? 0 : Math.PI;
      wheel.rotation.z = -t * 0.12;
      beam.material.opacity = 0.06 + night * 0.1 + Math.sin(t) * 0.015;
      for (let i = 0; i < 90; i++) {
        const s = seeds[i];
        dummy.position.set(
          s.x + Math.sin(t * 0.08 + i) * 4,
          s.y + Math.sin(t * s.speed + i) * 2,
          s.z + Math.cos(t * 0.05 + i) * 2,
        );
        dummy.updateMatrix();
        particles.setMatrixAt(i, dummy.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;
    },
  };
}
