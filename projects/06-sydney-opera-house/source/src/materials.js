import * as THREE from 'three';
import { seededRandom } from './geometry.js';

function canvasTexture(size, draw, repeat = [1, 1]) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat); texture.anisotropy = 8;
  return texture;
}
export function createMaterials() {
  const random = seededRandom(22);
  const tiles = canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#bfbdae'; ctx.fillRect(0, 0, size, size);
    const cell = 32;
    for (let row = 0; row < 16; row++) for (let col = -1; col < 17; col++) {
      const shift = (row % 2) * 16;
      const v = Math.floor(231 + random() * 19);
      // Alternating ivory/matte bands recall the chevron-arranged ceramic lids.
      const cream = ((col + Math.floor(row / 4)) % 7 + 7) % 7 < 2;
      ctx.fillStyle = 'rgb(' + v + ',' + (v - (cream ? 5 : 1)) + ',' + (v - (cream ? 18 : 7)) + ')';
      ctx.fillRect(col * cell + shift + .8, row * cell + .8, cell - 1.6, cell - 1.6);
      ctx.fillStyle = '#ffffff19'; ctx.fillRect(col * cell + shift + 1.5, row * cell + 1.5, cell - 3, 1.1);
    }
  });
  const stoneTexture = canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#c0ad90'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 18000; i++) {
      const lum = 135 + random() * 80;
      ctx.fillStyle = 'rgba(' + lum + ',' + (lum - 15) + ',' + (lum - 27) + ',.14)';
      ctx.fillRect(random() * size, random() * size, random() * 3, 1);
    }
    ctx.strokeStyle = '#9d8c7640'; ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(size, i * 64); ctx.stroke(); }
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
      const x = col * 128 + (row % 2) * 64;
      ctx.beginPath(); ctx.moveTo(x, row * 64); ctx.lineTo(x, row * 64 + 64); ctx.stroke();
    }
  }, [6, 6]);
  const paving = canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#c7ba9f'; ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
      const lum = Math.round(187 + random() * 20);
      ctx.fillStyle = 'rgb(' + (lum + 13) + ',' + (lum + 3) + ',' + (lum - 17) + ')';
      ctx.fillRect(col * 32 + .6, row * 32 + .6, 30.8, 30.8);
    }
  });
  const standard = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: .78, ...opts });
  return {
    roof: standard(0xfffbed, { map: tiles, bumpMap: tiles, bumpScale: .055, roughness: .42, vertexColors: true, metalness: .035 }),
    lining: standard(0xaca592, { side: THREE.DoubleSide, roughness: .86 }),
    rim: standard(0xe9ddbf, { roughness: .53 }),
    seam: standard(0xc4bba4, { roughness: .7 }),
    stone: standard(0xe1cdb0, { map: stoneTexture, roughness: .85 }),
    lightStone: standard(0xdcc8a6, { roughness: .82 }),
    darkStone: standard(0x716f5e),
    pavement: standard(0xe7d5b9, { map: paving, roughness: .86 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x4b686c, metalness: .45, roughness: .2, clearcoat: .8, clearcoatRoughness: .16, envMapIntensity: 1.35, side: THREE.DoubleSide, emissive: 0xc18b45, emissiveIntensity: 0 }),
    glassWarm: new THREE.MeshPhysicalMaterial({ color: 0x51584d, metalness: .3, roughness: .25, side: THREE.DoubleSide, emissive: 0xf8be64, emissiveIntensity: 0 }),
    bronze: standard(0x544e3d, { metalness: .72, roughness: .48 }),
    rib: standard(0xb0a990),
    dark: standard(0x314446, { metalness: .4 }),
    interior: standard(0x5f4530, { roughness: .9 }),
    lamp: standard(0xffe9b1, { emissive: 0xffb85e, emissiveIntensity: .3 }),
    white: standard(0xece9d8),
    grass: standard(0x6b7760),
    tree: standard(0x435e4e, { roughness: .95 }),
    treeLight: standard(0x617259, { roughness: .95 }),
    trunk: standard(0x6e6251),
    bridge: standard(0x516267, { metalness: .65, roughness: .68 }),
    bridgeStone: standard(0x9eaa9c),
    ferryYellow: standard(0xdfbf63),
    ferryGreen: standard(0x244f43),
    boatWhite: standard(0xe5e8e0),
  };
}
