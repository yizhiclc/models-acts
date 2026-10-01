// Test the *presented canvas*, not merely navigator.gpu or a compiled scene.
// Sparse GPU readback happens once, before the application declares itself ready.
export async function validateFirstFrame(scene, sim) {
  const renderer = scene.renderer, device = renderer.backend.device;
  const width = renderer.domElement.width, height = renderer.domElement.height;
  const count = 48, stride = 256;
  let buffer, thrown, pixels, validation, memory;
  device.pushErrorScope('out-of-memory');
  device.pushErrorScope('validation');
  try {
    scene.render(sim);
    const frame = renderer.backend.getContext().getCurrentTexture();
    if (!['bgra8unorm', 'rgba8unorm'].includes(frame.format)) throw new Error(`不支持的首帧检测格式：${frame.format}`);
    buffer = device.createBuffer({label: 'ASTRA first-frame evidence', size: stride * count, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
    const encoder = device.createCommandEncoder({label: 'ASTRA first-frame verification'});
    for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) {
      encoder.copyTextureToBuffer(
        {texture: frame, origin: {x: Math.min(width - 1, Math.floor((i + .5) * width / 8)), y: Math.min(height - 1, Math.floor((j + .5) * height / 6))}},
        {buffer, offset: (j * 8 + i) * stride, bytesPerRow: stride},
        {width: 1, height: 1, depthOrArrayLayers: 1}
      );
    }
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(buffer.getMappedRange());
    pixels = Array.from({length: count}, (_, i) => (bytes[i * stride] + bytes[i * stride + 1] + bytes[i * stride + 2]) / 3);
  } catch (error) {
    thrown = error;
  } finally {
    if (buffer?.mapState === 'mapped') buffer.unmap();
    buffer?.destroy();
    validation = await device.popErrorScope();
    memory = await device.popErrorScope();
  }
  if (validation || memory || thrown) throw new Error((validation || memory || thrown).message);
  const mean = pixels.reduce((sum, p) => sum + p, 0) / count;
  const variance = pixels.reduce((sum, p) => sum + (p - mean) ** 2, 0) / count;
  const range = Math.max(...pixels) - Math.min(...pixels);
  if (range < 12 || variance < 2) throw new Error('WebGPU 已建立，但首帧没有绘出场景。请导出诊断信息以检查浏览器的图形编译结果。');
  return {validated: true, method: 'GPU canvas pixel readback', samples: count, width, height, luminanceRange: range, luminanceVariance: variance};
}
