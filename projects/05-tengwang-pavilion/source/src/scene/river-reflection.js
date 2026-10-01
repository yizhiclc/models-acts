import * as THREE from 'three';

/** Planar reflection with an orthographic camera and a world-space clipping plane.
 * Three's stock Reflector uses a perspective-only oblique projection formula;
 * copying an orthographic matrix into that formula clips the entire reflection.
 */
export class RiverReflection extends THREE.Mesh {
  constructor(geometry, shader) {
    const target = new THREE.WebGLRenderTarget(1024, 768, {
      type: THREE.HalfFloatType,
      samples: 0,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    uniforms.tDiffuse.value = target.texture;
    const material = new THREE.ShaderMaterial({
      name: 'Orthographic river reflection',
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
    });
    super(geometry, material);
    const mirrorCamera = new THREE.OrthographicCamera();
    const worldPosition = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    const targetPosition = new THREE.Vector3();
    const rotation = new THREE.Matrix4();
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const bias = new THREE.Matrix4().set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    );
    this.getRenderTarget = () => target;
    // Render before the main pass. A nested onBeforeRender pass would leave
    // Three's internal global clipping cache in the mirror-camera state.
    this.updateReflection = (renderer, scene, camera) => {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      worldPosition.setFromMatrixPosition(this.matrixWorld);
      camera.getWorldPosition(cameraPosition);
      if (cameraPosition.y <= worldPosition.y) return;
      mirrorCamera.copy(camera, false);
      mirrorCamera.position.copy(cameraPosition);
      mirrorCamera.position.y = 2 * worldPosition.y - cameraPosition.y;
      camera.getWorldDirection(direction);
      direction.y *= -1;
      targetPosition.copy(mirrorCamera.position).add(direction);
      rotation.extractRotation(camera.matrixWorld);
      mirrorCamera.up.set(0, 1, 0).applyMatrix4(rotation);
      mirrorCamera.up.y *= -1;
      mirrorCamera.lookAt(targetPosition);
      mirrorCamera.updateMatrixWorld();
      uniforms.textureMatrix.value.copy(bias)
        .multiply(mirrorCamera.projectionMatrix)
        .multiply(mirrorCamera.matrixWorldInverse)
        .multiply(this.matrixWorld);
      clipPlane.constant = -worldPosition.y - 0.018;

      const previousTarget = renderer.getRenderTarget();
      const previousClipping = renderer.clippingPlanes;
      const previousXr = renderer.xr.enabled;
      const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
      const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
      this.visible = false;
      try {
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = false;
        renderer.clippingPlanes = [clipPlane];
        renderer.setRenderTarget(target);
        renderer.clear();
        renderer.render(scene, mirrorCamera);
      } finally {
        renderer.clippingPlanes = previousClipping;
        renderer.xr.enabled = previousXr;
        renderer.shadowMap.autoUpdate = shadowAutoUpdate;
        renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
        renderer.setRenderTarget(previousTarget);
        this.visible = true;
      }
    };
  }
}
