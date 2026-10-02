import * as THREE from 'three';

export function createSky() {
  const width = 2048, height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  let seed = 739391;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width * Math.PI * 2, v = y / height;
      const band = 0.5 + 0.18 * Math.sin(u + 0.6);
      const density = Math.exp(-(((v - band) / 0.065) ** 2));
      const clouds = 0.45 + 0.16 * Math.sin(u * 13 + v * 37) +
        0.12 * Math.sin(u * 31 - v * 79) + 0.09 * Math.cos(u * 77 + v * 127);
      const dust = 1 - 0.62 * Math.exp(-(((v - band + 0.013 * Math.sin(u * 9)) / 0.013) ** 2));
      const light = Math.max(0, density * clouds * dust);
      const i = (y * width + x) * 4;
      image.data[i] = 4 + light * 24;
      image.data[i + 1] = 6 + light * 27;
      image.data[i + 2] = 8 + light * 35;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  for (let i = 0; i < 17000; i++) {
    const x = random() * width;
    const u = x / width * Math.PI * 2;
    const band = 0.5 + 0.18 * Math.sin(u + 0.6);
    const y = (i < 9000 ? Math.acos(2 * random() - 1) / Math.PI :
      band + (random() + random() + random() - 1.5) * 0.07) * height;
    const bright = random() ** 7;
    const radius = 0.23 + bright * 0.8;
    const warm = random() < 0.24;
    const value = 70 + bright * 180;
    ctx.fillStyle = warm ? `rgb(${value},${value * .86},${value * .67})` :
      `rgb(${value * .80},${value * .90},${value})`;
    ctx.beginPath(); ctx.ellipse(x, y, radius, radius, 0, 0, Math.PI * 2); ctx.fill();
    if (bright > 0.91) {
      ctx.fillStyle = warm ? '#bba48325' : '#b1d1ee25';
      ctx.fillRect(x - 2.3, y - .35, 4.6, .7);
      ctx.fillRect(x - .35, y - 2.3, .7, 4.6);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
