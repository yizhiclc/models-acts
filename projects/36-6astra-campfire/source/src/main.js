import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// All geometry, materials and textures are made locally. No network assets.
const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
let seed = 8134;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
const range = (a, b) => lerp(a, b, random());
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const state = { night: false, fire: true, nightMix: 0, fireMix: 1 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new THREE.Scene();
const root = new THREE.Group();
scene.add(root);
let renderer;

function fail(message) {
  $('loading')?.classList.add('done');
  $('error-panel').hidden = false;
  if (message) $('error-message').textContent = message;
}
$('retry-button').addEventListener('click', () => location.reload());

try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
  $('scene').appendChild(renderer.domElement);
  initialize();
} catch (error) {
  console.error('Campsite initialization failed:', error);
  fail('营地需要 WebGL 2 支持。请开启浏览器硬件加速，或使用新版 Edge / Chrome / Firefox 重试。');
}

function initialize() {
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 420);
  scene.background = new THREE.Color('#c8dbd3');
  scene.fog = new THREE.Fog('#c8dbd3', 58, 185);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.39;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.7;
  controls.target.set(0, 0.85, 0);
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

  const materials = new Map();
  function mat(color, extra = {}) {
    const key = color + JSON.stringify(extra);
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true, ...extra }));
    return materials.get(key);
  }
  const bark = mat('#70513b');
  const darkWood = mat('#60422e');
  const cutWood = mat('#c49760');
  const metal = mat('#3d4b46', { roughness: 0.72, metalness: 0.3 });
  const cord = mat('#bdb692');
  function mesh(geometry, material, parent = root) {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(w, h, d, material, x, y, z, parent = root) {
    const object = mesh(new THREE.BoxGeometry(w, h, d), material, parent);
    object.position.set(x, y, z);
    return object;
  }
  function cylinder(rTop, rBottom, length, material, x, y, z, parent = root, segments = 7) {
    const object = mesh(new THREE.CylinderGeometry(rTop, rBottom, length, segments), material, parent);
    object.position.set(x, y, z);
    return object;
  }
  function rod(a, b, radius, material, parent = root, segments = 6) {
    const direction = b.clone().sub(a);
    const object = mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material, parent);
    object.position.copy(a).add(b).multiplyScalar(0.5);
    object.quaternion.setFromUnitVectors(v(0, 1, 0), direction.normalize());
    return object;
  }
  function polygon(points, material, parent = root) {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 1; i < points.length - 1; i++) positions.push(...points[0], ...points[i], ...points[i + 1]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return mesh(geometry, material, parent);
  }

  // A continuous 840 x 840 landscape. Detail is concentrated around the camp;
  // the distant edges lie beyond the fog and the camera's navigable range.
  const lake = { x: -9.7, z: 2.3, rx: 4.6, rz: 3.05, level: -0.12 };
  const mountainRidges = [
    [-75,-95,23,26],[-30,-108,35,23],[35,-102,29,27],[80,-68,24,24],
    [-105,-20,27,29],[100,30,23,30],[-70,88,25,26],[20,112,31,28],
  ];
  function groundHeight(x, z) {
    const rim = clamp((Math.sqrt((x / 7.65) ** 2 + (z / 6.25) ** 2) - 0.24) * 1.5, 0, 1);
    const hills = 0.30 * Math.sin(x * 0.76 + z * 0.33) + 0.20 * Math.cos(z * 0.8 - x * 0.27);
    const rearRise = 0.58 * Math.exp(-((x + 2.8) ** 2 + (z + 3.2) ** 2) / 8);
    const distance = Math.hypot(x,z);
    const openCountry = THREE.MathUtils.smoothstep(distance,8,32);
    let height = 0.12 + rim * (0.2 + hills) + rearRise;
    height += openCountry * (1.25 + 1.3 * Math.sin(x*.095+z*.048) + .9*Math.cos(z*.12-x*.038));
    for(const [mx,mz,h,width] of mountainRidges) {
      height += h*Math.exp(-((x-mx)**2+(z-mz)**2)/(width*width*.65));
    }
    const lakeDistance=Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz);
    height=lerp(height,-.70,1-THREE.MathUtils.smoothstep(.77,1.17,lakeDistance));
    return height;
  }
  const grassColors = ['#849563','#889969','#8c9c6d','#819361','#8a9a67','#8f9f6e'];
  const positions = [], colors = [];
  function triangle(a, b, c, color) {
    const shade = new THREE.Color(color);
    positions.push(...a, ...b, ...c);
    for (let j = 0; j < 3; j++) colors.push(shade.r, shade.g, shade.b);
  }
  const coordinates=[];
  for(let i=-64;i<=64;i++) {
    const n=Math.abs(i);
    const coordinate=n<=24?n*.5:n<=40?12+(n-24)*1.5:n<=52?36+(n-40)*5:96+(n-52)*27;
    coordinates.push(Math.sign(i)*coordinate);
  }
  const terrainRows=[];
  for(let j=0;j<coordinates.length;j++) {
    const row=[];
    for(let i=0;i<coordinates.length;i++) {
      const step=Math.min(coordinates[Math.min(i+1,128)]-coordinates[Math.max(0,i-1)],coordinates[Math.min(j+1,128)]-coordinates[Math.max(0,j-1)]);
      const x=coordinates[i]+range(-.11,.11)*step,z=coordinates[j]+range(-.11,.11)*step;
      row.push([x,groundHeight(x,z),z]);
    }
    terrainRows.push(row);
  }
  for(let j=0;j<128;j++) for(let i=0;i<128;i++) {
    const a=terrainRows[j][i],b=terrainRows[j][i+1],c=terrainRows[j+1][i],d=terrainRows[j+1][i+1];
    const terrainColor=new THREE.Color(grassColors[Math.floor(random()*grassColors.length)]);
    const distance=Math.hypot(a[0],a[2]);
    terrainColor.lerp(new THREE.Color('#638074'),THREE.MathUtils.smoothstep(distance,25,120)*.62);
    if((i+j)%2===0) {triangle(a,c,b,terrainColor);triangle(b,c,d,terrainColor);}
    else {triangle(a,d,b,terrainColor);triangle(a,c,d,terrainColor);}
    }
  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();
  const terrain=mesh(terrainGeo, mat('#ffffff', { vertexColors: true }));
  terrain.castShadow=false;

  function gradientTexture(stops) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }
  // A long approach trail connects the campsite to the surrounding countryside.
  function pathRibbon(points, width) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => v(x, 0, z)));
    const vertices = [];
    const steps=Math.max(35,Math.ceil(curve.getLength()/.35));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, center = curve.getPoint(t), tangent = curve.getTangent(t);
      const w=Array.isArray(width)?lerp(width[0],width[1],t):width;
      const side = v(-tangent.z, 0, tangent.x).normalize().multiplyScalar(w * range(0.47, 0.53));
      const left = center.clone().add(side), right = center.clone().sub(side);
      vertices.push([[left.x, groundHeight(left.x, left.z) + 0.045, left.z], [right.x, groundHeight(right.x, right.z) + 0.045, right.z]]);
    }
    const palette = ['#b6aa7e', '#bcb187', '#b2a67d', '#c2b68b'];
    const pathPositions=[],pathColors=[];
    for (let i = 0; i < vertices.length - 1; i++) {
      const a=vertices[i][0],b=vertices[i+1][0],c=vertices[i+1][1],d=vertices[i][1];
      pathPositions.push(...a,...b,...c,...a,...c,...d);
      const color=new THREE.Color(palette[Math.floor(i/3)%4]);
      for(let k=0;k<6;k++)pathColors.push(color.r,color.g,color.b);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pathPositions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(pathColors,3));geometry.computeVertexNormals();
    mesh(geometry,mat('#ffffff',{vertexColors:true,side:THREE.DoubleSide})).castShadow=false;
  }
  pathRibbon([[38,160],[26,115],[25,70],[14,44],[12,25],[7.2,15],[4.2,9],[2.4,5.7]], [2.5,.83]);
  pathRibbon([[2.4, 5.7], [1.25, 4], [0.1, 3.2], [-0.5, 1.55], [-1.6, 0.55], [-2.4, -0.35]], 0.83);
  pathRibbon([[0, 2.8], [1.8, 2.9], [3.2, 1.7], [3.5, 0.3]], 0.59);

  // Low-sided conifers, clustered to frame the clearing without hiding it.
  const treeCrowns = [];
  function tree(x, z, height, tint = 0) {
    const group = new THREE.Group(); group.position.set(x, groundHeight(x, z), z); root.add(group);
    cylinder(0.09, 0.19, height * 0.64, bark, 0, height * 0.32, 0, group);
    for (let i = 0; i < 3; i++) {
      const branchY = height * (0.23 + i * 0.12);
      rod(v(0, branchY, 0), v((i % 2 ? 1 : -1) * height * 0.16, branchY + 0.32, 0.12), 0.06, bark, group);
    }
    const crown = new THREE.Group(); group.add(crown);
    const palette = tint ? ['#45664b', '#517b54', '#678a5c', '#789866'] : ['#34583f', '#426e48', '#518253', '#68925f'];
    for (let i = 0; i < 4; i++) {
      const radius = height * (0.255 - i * 0.052);
      const cone = mesh(new THREE.ConeGeometry(radius, height * (0.40 - i * 0.037), 7, 1), mat(palette[i]), crown);
      cone.position.set(0, height * (0.37 + i * 0.18), 0);
      cone.rotation.y = i * 0.39 + range(-0.1, 0.1);
      cone.scale.z = range(0.87, 1.04);
    }
    group.rotation.y = range(0, Math.PI);
    treeCrowns.push({ crown, phase: range(0, 6.28), strength: range(0.002, 0.007) });
  }
  [
    [-5.8,-4.5,4.7],[-4.5,-6.5,5.4],[-2.9,-7.3,4.5],[-.9,-7.8,5.1],
    [1.8,-7,4.2],[4.3,-6.5,5.8],[6.6,-4.1,4.8],[8.4,-1.6,4.1],
    [-7,-2,3.6],[-5.8,6.9,3.1],[7.6,1.1,3.5],[8.8,4.2,2.9],
    [-5.5,-5,3.1],[2.1,-5.8,3.0],[5.6,-6,3.2],
  ].forEach(([x,z,h], i) => tree(x, z, h, i % 3 === 0));

  // Instancing keeps the surrounding forest inexpensive even with hundreds of trees.
  const forest=[];
  for(let x=-78;x<=78;x+=3.7)for(let z=-82;z<=82;z+=3.7) {
    const xx=x+range(-1.35,1.35),zz=z+range(-1.35,1.35),distance=Math.hypot(xx,zz);
    if(distance<10.3||distance>100)continue;
    const forward=xx*.552+zz*.834,side=xx*.834-zz*.552;
    if(forward>3&&Math.abs(side)<7.7+forward*.15)continue;
    if(zz>5&&Math.abs(xx-(zz*.25+1.5))<3.5)continue;
    if(Math.hypot((xx-lake.x)/lake.rx,(zz-lake.z)/lake.rz)<1.32)continue;
    const density=.46+.20*Math.sin(xx*.13+zz*.09);
    if(random()>density)continue;
    forest.push({x:xx,z:zz,y:groundHeight(xx,zz),height:range(3.7,7.4),rotation:range(0,6.28),tint:random()>.5});
  }
  const dummy=new THREE.Object3D();
  const forestTrunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.10,.19,1,6),bark,forest.length);
  const crowns=[];
  for(let i=0;i<4;i++)crowns.push(new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,7),mat(['#365b43','#456e4c','#557d54','#678b5e'][i]),forest.length));
  for(let i=0;i<forest.length;i++) {
    const t=forest[i];dummy.rotation.set(0,t.rotation,0);dummy.position.set(t.x,t.y+t.height*.32,t.z);dummy.scale.set(1,t.height*.64,1);dummy.updateMatrix();forestTrunks.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<4;j++) {
      dummy.position.set(t.x,t.y+t.height*(.37+j*.18),t.z);dummy.rotation.y=t.rotation+j*.39;
      dummy.scale.set(t.height*(.255-j*.052),t.height*(.40-j*.037),t.height*(.255-j*.052)*.93);dummy.updateMatrix();crowns[j].setMatrixAt(i,dummy.matrix);
      crowns[j].setColorAt(i,new THREE.Color(t.tint?'#ccd8af':'#ffffff'));
    }
  }
  for(const instanced of [forestTrunks,...crowns]){instanced.castShadow=true;instanced.receiveShadow=true;instanced.computeBoundingSphere();root.add(instanced);}

  function rock(x, z, size, parent = root, localY) {
    const object = mesh(new THREE.DodecahedronGeometry(size, 0), mat(['#8a9380', '#9ba18c', '#747f75', '#a4a992'][Math.floor(random() * 4)]), parent);
    object.position.set(x, localY ?? groundHeight(x,z) + size * 0.25, z);
    object.scale.set(range(0.8,1.3), range(0.48,0.8), range(0.7,1.12));
    object.rotation.set(range(-0.4,0.4),range(0,6),range(-0.2,0.2));
    return object;
  }
  [[-5,-3.3,.65],[-5.7,-2.8,.36],[5.5,-.6,.58],[5.9,-.2,.35],[-2.8,4.7,.42],[-3.2,4.9,.27],[4,4.4,.38],[.9,-4.2,.55],[1.5,-4.4,.3],[-6,2.3,.45]].forEach(a=>rock(...a));
  const outlyingRocks=[];
  for(let i=0;i<110;i++) {
    const x=range(-39,39),z=range(-34,38);
    if(Math.hypot(x,z)<9||Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)<1.2)continue;
    if(z>5&&Math.abs(x-(z*.25+1.5))<2.5)continue;
    outlyingRocks.push({x,z,size:range(.2,.9)});
  }
  const landscapeRocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),mat('#8c9581'),outlyingRocks.length);
  outlyingRocks.forEach((r,i)=>{dummy.position.set(r.x,groundHeight(r.x,r.z)+r.size*.15,r.z);dummy.rotation.set(range(-.3,.3),range(0,6),0);dummy.scale.set(r.size*1.3,r.size*.62,r.size);dummy.updateMatrix();landscapeRocks.setMatrixAt(i,dummy.matrix);});
  landscapeRocks.castShadow=landscapeRocks.receiveShadow=true;landscapeRocks.computeBoundingSphere();root.add(landscapeRocks);

  // A broad pond lies in a depression, with the bank integrated into the terrain.
  const pondX = lake.x, pondZ = lake.z, pondY = lake.level;
  const waterMat = mat('#579b9a', { roughness: 0.33, metalness: 0.18 });
  const water = cylinder(lake.rx*1.045, lake.rx*1.045, 0.018, waterMat, pondX, pondY + 0.018, pondZ, root, 28);
  water.scale.z = lake.rz/lake.rx;
  water.castShadow = false;
  const ripples = [];
  for (let i = 0; i < 3; i++) {
    const ripple = mesh(new THREE.RingGeometry(0.26+i*.23, 0.273+i*.23, 18), new THREE.MeshBasicMaterial({ color: '#cae3c6', transparent: true, opacity: .25, side: THREE.DoubleSide, depthWrite: false }));
    ripple.rotation.x = -Math.PI / 2; ripple.scale.set(3.1,2.2,1); ripple.position.set(pondX-.14, pondY+.035+i*.002, pondZ);
    ripple.castShadow = ripple.receiveShadow = false; ripples.push(ripple);
  }
  for (let i = 0; i < 24; i++) {
    const angle = i / 24 * Math.PI * 2;
    if (i % 3 !== 0) rock(pondX+Math.cos(angle)*lake.rx*1.12,pondZ+Math.sin(angle)*lake.rz*1.12,range(.17,.43));
  }
  for (let i = 0; i < 18; i++) {
    const x = pondX + range(-2.6,2.6), z = pondZ - lake.rz + range(-.14,.14), y = groundHeight(x,z);
    rod(v(x,y,z),v(x+.04,y+range(.5,.8),z),.016,mat('#68734a'));
    cylinder(.043,.043,.17,mat('#725337'),x+.04,y+.64,z,root,5);
  }

  // The ochre A-frame tent: separate cloth panels, stitched edging, open doorway.
  function tent(x, z, scale, rotation, colors) {
    const group = new THREE.Group();
    group.position.set(x, groundHeight(x,z) + .035, z); group.rotation.y = rotation; group.scale.setScalar(scale); root.add(group);
    const cloth = mat(colors[0], { side: THREE.DoubleSide });
    const clothLight = mat(colors[1], { side: THREE.DoubleSide });
    const clothDark = mat(colors[2], { side: THREE.DoubleSide });
    const trim = mat('#efd4a0');
    const floor = box(2.8,.08,3.25,mat('#5f6246'),0,.04,0,group);
    polygon([[-1.48,0,1.7],[0,2.05,1.7],[0,2.05,-1.62],[-1.48,0,-1.62]],cloth,group);
    polygon([[0,2.05,1.7],[1.48,0,1.7],[1.48,0,-1.62],[0,2.05,-1.62]],clothLight,group);
    polygon([[-1.48,0,-1.62],[0,2.05,-1.62],[1.48,0,-1.62]],clothDark,group);
    // Recessed dark interior is visible behind the parted front flaps.
    polygon([[-1.32,.06,.95],[0,1.86,.95],[1.32,.06,.95]],mat('#493f30',{side:THREE.DoubleSide}),group);
    polygon([[-1.48,0,1.71],[0,2.05,1.71],[-.58,.23,1.76],[-1.03,.02,1.78]],clothLight,group);
    polygon([[0,2.05,1.72],[1.48,0,1.72],[.99,.02,1.78],[.57,.23,1.76]],cloth,group);
    rod(v(-1.48,.04,1.72),v(0,2.07,1.72),.025,trim,group);
    rod(v(1.48,.04,1.72),v(0,2.07,1.72),.025,trim,group);
    rod(v(0,2.09,1.8),v(0,2.09,-1.75),.044,darkWood,group);
    rod(v(0,0,1.69),v(0,2.17,1.69),.036,darkWood,group);
    box(.78,.15,1.55,mat('#748975'),-.46,.16,.45,group);
    box(.69,.17,.36,mat('#d5c6a0'),-.46,.23,-.07,group);
    box(.78,.025,.4,mat('#c8ad7f'),-.46,.253,.66,group);
    // Canvas ties and four pegged guy lines.
    for (const side of [-1,1]) for (const end of [-1,1]) {
      const a = v(side*1.3,.25,end*1.36), b = v(side*2.0,.025,end*1.85);
      rod(a,b,.012,cord,group,4); rod(b.clone().add(v(0,-.04,0)),b.clone().add(v(.025,.18,.02)),.024,metal,group,5);
    }
    const welcomeMat = box(1.3,.024,.62,mat('#a77c51'),0,.07,2.02,group);
    for(let i=0;i<6;i++) box(.045,.005,.59,mat('#d0b387'),-.53+i*.21,.085,2.02,group);
    return group;
  }
  const mainTent = tent(-2.2,-1.2,1.04,.11,['#ce8d45','#e5ac56','#b5773a']);
  tent(2.65,-2.5,.7,-.46,['#719189','#8ca99a','#58776e']);

  // Camping chairs face toward the fire, with crossed frames and canvas backs.
  const fireX=.65,fireZ=1.18,fireY=groundHeight(fireX,fireZ);
  function chair(x,z,color) {
    const group = new THREE.Group(); group.position.set(x,groundHeight(x,z),z);
    group.rotation.y = Math.atan2(fireX-x,fireZ-z); root.add(group);
    const frame = mat('#acb29a',{metalness:.35,roughness:.6});
    for(const s of [-1,1]) {
      rod(v(s*.4,.03,-.4),v(s*.4,.69,.36),.034,frame,group);
      rod(v(s*.4,.03,.43),v(s*.4,.74,-.28),.034,frame,group);
      rod(v(s*.4,.6,-.28),v(s*.4,1.3,-.49),.033,frame,group);
      rod(v(s*.45,.82,-.35),v(s*.45,.82,.27),.048,darkWood,group);
      rod(v(s*.44,.58,.22),v(s*.44,.82,.22),.029,frame,group);
    }
    rod(v(-.4,.61,.36),v(.4,.61,.36),.026,frame,group);
    const fabric=mat(color,{side:THREE.DoubleSide});
    polygon([[-.38,.62,.37],[.38,.62,.37],[.38,.65,-.3],[-.38,.65,-.3]],fabric,group);
    polygon([[-.38,.64,-.3],[.38,.64,-.3],[.38,1.29,-.49],[-.38,1.29,-.49]],fabric,group);
    const stripe=mat('#dbbf8a',{side:THREE.DoubleSide});
    polygon([[-.07,.65,-.288],[.07,.65,-.288],[.07,1.285,-.478],[-.07,1.285,-.478]],stripe,group);
  }
  chair(-.85,2.85,'#ad6746');
  chair(2.7,2.4,'#d4a568');

  // Fire ring and crossed logs.
  const fireGroup = new THREE.Group(); fireGroup.position.set(fireX,fireY,fireZ); root.add(fireGroup);
  const ash = cylinder(.84,.86,.038,mat('#605b47'),0,.045,0,fireGroup,14);
  for(let i=0;i<13;i++) {
    const angle=i/13*Math.PI*2;
    rock(Math.cos(angle)*.86,Math.sin(angle)*.86,range(.19,.26),fireGroup,.13);
  }
  for(let i=0;i<4;i++) {
    const angle=i*Math.PI/2+.4;
    const a=v(Math.cos(angle)*-.58,.18+(i%2)*.07,Math.sin(angle)*-.58);
    const b=v(Math.cos(angle)*.58,.18+(i%2)*.07,Math.sin(angle)*.58);
    rod(a,b,.145,mat('#493328'),fireGroup,7);
    const cap=mesh(new THREE.CircleGeometry(.125,7),cutWood,fireGroup);
    cap.position.copy(b).addScaledVector(b.clone().sub(a).normalize(),.005);
    cap.quaternion.setFromUnitVectors(v(0,0,1),b.clone().sub(a).normalize());
  }
  const coalMat=mat('#593126',{emissive:'#ed5918',emissiveIntensity:1});
  for(let i=0;i<14;i++) {
    const coal=mesh(new THREE.DodecahedronGeometry(range(.07,.13),0),coalMat,fireGroup);
    coal.position.set(range(-.45,.45),.22,range(-.4,.4)); coal.scale.y=.4;
  }
  const flameGroup=new THREE.Group(); fireGroup.add(flameGroup);
  const flames=[];
  const flameColors=['#ed6925','#ff9f32','#ffd365','#fff0b0'];
  // Offset, tapered low-poly tongues stay recognizable from every orbit angle.
  for(let i=0;i<11;i++) {
    const inner=i>6;
    const h=inner?range(.42,.75):range(.68,1.22);
    const geometry=new THREE.ConeGeometry(inner?.16:range(.19,.28),h,5,2);
    geometry.translate(0,h/2,0);
    const material=new THREE.MeshBasicMaterial({color:flameColors[inner? (i%2)+2:i%2],toneMapped:false});
    const flame=mesh(geometry,material,flameGroup); flame.castShadow=flame.receiveShadow=false;
    const angle=i*2.4;
    flame.position.set(Math.cos(angle)*(inner?.13:.26),.23,Math.sin(angle)*(inner?.13:.26));
    flame.rotation.set(range(-.14,.14),angle,range(-.17,.17));
    flames.push({mesh:flame,phase:range(0,6),height:h});
  }
  const glowTex=gradientTexture([[0,'rgba(255,188,56,.6)'],[.2,'rgba(255,147,30,.2)'],[1,'rgba(255,94,20,0)']]);
  const glowMaterial=new THREE.SpriteMaterial({map:glowTex,color:'#ffa144',transparent:true,opacity:.33,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  const glow=new THREE.Sprite(glowMaterial); glow.position.set(0,.9,0); glow.scale.set(3,3,1); fireGroup.add(glow);
  const fireLight=new THREE.PointLight('#ff9948',36,9,2); fireLight.position.set(fireX,fireY+1.15,fireZ); scene.add(fireLight);
  // The campfire illuminates nearby geometry; daylight is the only shadow map.
  fireLight.castShadow=false;
  const sparkCount=27;
  const sparkPositions=new Float32Array(sparkCount*3);
  const sparkGeo=new THREE.BufferGeometry(); sparkGeo.setAttribute('position',new THREE.BufferAttribute(sparkPositions,3));
  const sparkMat=new THREE.PointsMaterial({color:'#ffd07d',size:.044,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const sparks=new THREE.Points(sparkGeo,sparkMat); fireGroup.add(sparks);
  const sparkSeeds=Array.from({length:sparkCount},()=>({age:random(),phase:range(0,6),speed:range(.3,.6)}));
  const smoke=[];
  for(let i=0;i<7;i++) {
    const material=new THREE.MeshBasicMaterial({color:'#b5b4a0',transparent:true,opacity:.08,depthWrite:false});
    const puff=mesh(new THREE.IcosahedronGeometry(1,0),material,fireGroup); puff.castShadow=puff.receiveShadow=false;
    smoke.push({mesh:puff,offset:i/7});
  }

  // A low camp table, enamel mugs, stove, cooler and a rolled backpack.
  const tableGroup=new THREE.Group(); tableGroup.position.set(3.3,groundHeight(3.3,.1),.1); tableGroup.rotation.y=-.16; root.add(tableGroup);
  for(let i=0;i<5;i++) box(1.45,.09,.17,mat(i%2?'#b48c59':'#c09a66'),0,.78,(i-2)*.18,tableGroup);
  for(const x of [-.55,.55]) for(const z of [-.28,.28]) rod(v(x*.85,0,z*1.25),v(x,.74,z),.04,metal,tableGroup);
  function mug(x,y,z,parent,color='#e3d8b5') {
    cylinder(.095,.079,.16,mat(color),x,y+.08,z,parent,10);
    cylinder(.072,.072,.005,mat('#564532'),x,y+.162,z,parent,10);
    const handle=mesh(new THREE.TorusGeometry(.066,.019,5,8,Math.PI*1.7),mat(color),parent);
    handle.position.set(x+.107,y+.092,z); handle.rotation.z=-Math.PI*.85;
  }
  mug(-.4,.83,.12,tableGroup);
  mug(.1,.83,.21,tableGroup,'#bf8258');
  box(.38,.09,.3,mat('#55746b'),.24,.85,-.2,tableGroup);
  cylinder(.12,.13,.18,metal,.24,.975,-.2,tableGroup,9);
  cylinder(.13,.13,.025,metal,.24,1.07,-.2,tableGroup,9);
  box(.15,.035,.025,darkWood,.44,1.02,-.2,tableGroup);
  const coolerGroup=new THREE.Group(); coolerGroup.position.set(3.7,groundHeight(3.7,1.3),1.3); coolerGroup.rotation.y=-.3; root.add(coolerGroup);
  box(.85,.55,.6,mat('#6b9390'),0,.28,0,coolerGroup);
  box(.91,.12,.64,mat('#dfd8bc'),0,.61,0,coolerGroup);
  box(.12,.14,.035,metal,0,.48,.325,coolerGroup);
  for(const side of [-1,1]) rod(v(side*.46,.4,-.16),v(side*.46,.4,.16),.04,cord,coolerGroup);
  const bagGroup=new THREE.Group(); bagGroup.position.set(-3.65,groundHeight(-3.65,-.1),-.1); bagGroup.rotation.y=.4; root.add(bagGroup);
  const pack=box(.52,.7,.4,mat('#96704e'),0,.38,0,bagGroup);
  box(.39,.29,.08,mat('#bb8c55'),0,.27,.24,bagGroup);
  for(const x of [-.17,.17]) box(.045,.58,.017,darkWood,x,.44,.213,bagGroup);
  const roll=cylinder(.14,.14,.66,mat('#97a383'),0,.83,0,bagGroup,8); roll.rotation.z=Math.PI/2;
  for(const x of [-.22,.22]) {
    const band=mesh(new THREE.TorusGeometry(.144,.022,4,8),darkWood,bagGroup); band.rotation.y=Math.PI/2; band.position.set(x,.83,0);
  }

  // Stacked split wood and a tree stump beside the seating area.
  const woodGroup=new THREE.Group(); woodGroup.position.set(1.6,groundHeight(1.6,-.8),-.8); woodGroup.rotation.y=-.26; root.add(woodGroup);
  for(let i=0;i<6;i++) {
    const row=i<3?0:i<5?1:2; const index=i-(row===0?0:row===1?3:5); const count=3-row;
    const x=(index-(count-1)/2)*.27,y=.16+row*.24;
    rod(v(x,y,-.47),v(x,y,.47),.14,bark,woodGroup,7);
    const cap=mesh(new THREE.CircleGeometry(.116,7),cutWood,woodGroup); cap.position.set(x,y,.476);
  }
  const stumpX=-1.85,stumpZ=2.05,stumpY=groundHeight(stumpX,stumpZ);
  cylinder(.37,.44,.48,bark,stumpX,stumpY+.24,stumpZ);
  cylinder(.365,.365,.017,cutWood,stumpX,stumpY+.489,stumpZ,root,9);
  for(const r of [.12,.22,.31]) {
    const ring=mesh(new THREE.RingGeometry(r,r+.008,9),mat('#9b774e',{side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2; ring.position.set(stumpX,stumpY+.5,stumpZ);
  }
  mug(stumpX,stumpY+.505,stumpZ,root);

  // Lanterns and a sagging festoon connect both tents across the clearing.
  const lampMats=[];
  const lampLights=[];
  function lantern(x,y,z,parent=root,scale=1) {
    const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);
    cylinder(.14,.15,.06,metal,0,.035,0,g,8);
    const warm=new THREE.MeshStandardMaterial({color:'#f9d382',emissive:'#ffb655',emissiveIntensity:1.5,roughness:.6});lampMats.push(warm);
    cylinder(.095,.095,.24,warm,0,.19,0,g,8);
    cylinder(.16,.1,.11,metal,0,.35,0,g,8);
    for(const a of [0,Math.PI*.5,Math.PI,Math.PI*1.5]) rod(v(Math.cos(a)*.115,.06,Math.sin(a)*.115),v(Math.cos(a)*.115,.31,Math.sin(a)*.115),.014,metal,g,4);
    const handle=mesh(new THREE.TorusGeometry(.11,.012,4,10,Math.PI),metal,g);handle.position.y=.4;
    return g;
  }
  lantern(.55,.85,-.16,tableGroup,.8);
  lantern(.98,.10,1.95,mainTent,.92);
  const tentLamp=new THREE.PointLight('#ffc677',1.7,4.5,2);tentLamp.position.set(-1.02,1,-.1);scene.add(tentLamp);lampLights.push(tentLamp);
  const tableLamp=new THREE.PointLight('#ffc677',1.8,4.7,2);tableLamp.position.set(3.8,1.4,-.1);scene.add(tableLamp);lampLights.push(tableLamp);
  const poles=[v(-3.9,groundHeight(-3.9,-.4),-.4),v(4.1,groundHeight(4.1,-1.4),-1.4)];
  poles.forEach(p=>{
    rod(p,p.clone().add(v(0,3.4,0)),.055,darkWood);
    const peg=p.clone().add(v(p.x>0?.75:-.75,.03,.45));
    rod(p.clone().add(v(0,2.9,0)),peg,.009,cord,root,4);
    rod(peg,peg.clone().add(v(0,.16,0)),.025,metal);
  });
  function festoonPoint(t) {
    const p=poles[0].clone().lerp(poles[1],t);p.y+=3.4-Math.sin(t*Math.PI)*.82;return p;
  }
  for(let i=0;i<24;i++) rod(festoonPoint(i/24),festoonPoint((i+1)/24),.012,darkWood,root,4);
  const bulbs=[];
  for(let i=0;i<11;i++) {
    const point=festoonPoint((i+.5)/11);
    rod(point,point.clone().add(v(0,-.14,0)),.013,darkWood,root,4);
    const material=new THREE.MeshStandardMaterial({color:'#ffe0a0',emissive:'#ffc05e',emissiveIntensity:1,roughness:.5});lampMats.push(material);
    const bulb=mesh(new THREE.SphereGeometry(.065,6,5),material);bulb.position.copy(point).y-=.18;bulb.castShadow=false;bulbs.push(bulb);
  }
  const stringLight=new THREE.PointLight('#ffc878',1,7,2);stringLight.position.set(.3,2.7,-.75);scene.add(stringLight);lampLights.push(stringLight);

  // Meadow tufts continue far beyond the clearing, keeping the foreground grounded.
  const foliagePositions=[];
  for(let i=0;i<270;i++) {
    const x=range(-6.6,6.6),z=range(-5.35,5.35);
    if((x/6.8)**2+(z/5.4)**2>1)continue;
    if(x>-4.2&&x<4.3&&z>-3.6&&z<3.9)continue;
    foliagePositions.push([x,z]);
  }
  for(let i=0;i<2200;i++) {
    const x=range(-39,39),z=range(-33,43);
    if(Math.hypot(x,z)<7||Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)<1.18)continue;
    if(z>5&&Math.abs(x-(z*.25+1.5))<2)continue;
    foliagePositions.push([x,z]);
  }
  const tuftGeo=new THREE.BufferGeometry();const blades=[];
  for(const [x,z] of foliagePositions) {
    const y=groundHeight(x,z)+.025,h=range(.15,.4),angle=range(0,6);
    for(let j=0;j<3;j++) {
      const a=angle+j*2.1,dx=Math.cos(a)*.095,dz=Math.sin(a)*.095;
      blades.push(x-dx,y,z-dz,x+dx,y,z+dz,x+Math.cos(a+.5)*.12,y+h,z+Math.sin(a+.5)*.12);
    }
  }
  tuftGeo.setAttribute('position',new THREE.Float32BufferAttribute(blades,3));tuftGeo.computeVertexNormals();
  const tufts=mesh(tuftGeo,mat('#637b42',{side:THREE.DoubleSide}));tufts.castShadow=false;
  for(let i=0;i<17;i++) {
    const x=range(-5.5,5.6),z=range(3.8,5.1);
    if((x/6.6)**2+(z/5.5)**2>.94||Math.abs(x-1.9)<1)continue;
    const y=groundHeight(x,z),h=range(.13,.25);
    rod(v(x,y,z),v(x,y+h,z),.013,mat('#697c44'),root,4);
    const blossom=mesh(new THREE.IcosahedronGeometry(.058,0),mat(i%3?'#dbbe77':'#e7d9ae'));blossom.position.set(x,y+h,z);blossom.castShadow=false;
  }
  for(const [x,z] of [[-4.7,-.1],[-4.5,-.02],[4.8,2.3],[4.92,2.42],[-5.1,3.3]]) {
    const y=groundHeight(x,z);
    cylinder(.026,.033,.17,mat('#d6c5a0'),x,y+.085,z,root,5);
    const cap=mesh(new THREE.SphereGeometry(.11,7,3,0,Math.PI*2,0,Math.PI/2),mat('#af6644'));cap.position.set(x,y+.17,z);
  }
  // Two stepping slabs at the end of the trail.
  for(let i=0;i<3;i++) {
    const x=1.85+i*.23,z=4.6+i*.37;
    const slab=box(.63,.065,.26,mat('#a2a080'),x,groundHeight(x,z)+.046,z);slab.rotation.y=-.35;
  }

  // Daylight turns into a blue moonlit ambient, retaining a readable silhouette.
  const hemi=new THREE.HemisphereLight('#eff6da','#877d59',2.35);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe4ad',3.05);sun.position.set(-22,36,18);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-32;sun.shadow.camera.right=32;sun.shadow.camera.top=32;sun.shadow.camera.bottom=-32;sun.shadow.camera.near=1;sun.shadow.camera.far=100;sun.shadow.normalBias=.045;sun.shadow.bias=-.0001;sun.shadow.radius=3;
  const rim=new THREE.DirectionalLight('#c2ded6',.7);rim.position.set(5,6,-8);scene.add(rim);
  const starPositions=[];
  for(let i=0;i<230;i++) {
    const a=range(0,Math.PI*2),e=range(.06,1.24),r=range(110,160);
    starPositions.push(Math.cos(a)*Math.cos(e)*r,Math.sin(e)*r,Math.sin(a)*Math.cos(e)*r);
  }
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
  const starMat=new THREE.PointsMaterial({color:'#cddfe1',size:.14,sizeAttenuation:true,transparent:true,opacity:0,depthWrite:false,toneMapped:false,fog:false});
  const stars=new THREE.Points(starGeo,starMat);scene.add(stars);
  const fireflyCount=24,fireflyPositions=new Float32Array(fireflyCount*3);
  const fireflyGeo=new THREE.BufferGeometry();fireflyGeo.setAttribute('position',new THREE.BufferAttribute(fireflyPositions,3));
  const fireflyMat=new THREE.PointsMaterial({color:'#def39c',size:.045,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const fireflies=new THREE.Points(fireflyGeo,fireflyMat);scene.add(fireflies);
  const fireflySeeds=Array.from({length:fireflyCount},()=>({x:range(-5,5),z:range(-3,4),y:range(.5,2.1),phase:range(0,6.28)}));

  // Responsive framing preserves a full overview; reset never changes time/fire.
  const baseDirection=v(13,10,19).normalize();
  let homeDistance=24;
  let lastWidth=innerWidth,lastHeight=innerHeight;
  function framing(reset=false) {
    const width=$('scene').clientWidth,height=$('scene').clientHeight;
    const aspect=width/height;
    const oldHome=homeDistance;
    // A narrow phone fits by width; a short tablet also reserves space for UI.
    const fitWidth=(width<=700?.88:1.15)/aspect;
    const fitHeight=width<=700?.69*height/Math.max(220,height-220):1;
    homeDistance=28*Math.max(1,fitWidth,fitHeight);
    controls.minDistance=homeDistance*.53;controls.maxDistance=homeDistance*1.65;
    camera.aspect=aspect;
    camera.setViewOffset(width,height,width>700?-width*.035:0,width<=700?-height*.03:-height*.01,width,height);
    if(reset) {controls.target.set(-.8,.8,0);camera.position.copy(controls.target).addScaledVector(baseDirection,homeDistance);}
    else {const offset=camera.position.clone().sub(controls.target).multiplyScalar(homeDistance/oldHome);camera.position.copy(controls.target).add(offset);}
    camera.updateProjectionMatrix();renderer.setSize(width,height,false);controls.update();
    lastWidth=width;lastHeight=height;
  }
  framing(true);
  addEventListener('resize',()=>framing(false));
  let toastTimeout;
  function toast(text) {
    $('toast').textContent=text;$('toast').classList.add('show');
    clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),2200);
  }
  function setNight(night) {
    if(state.night===night)return;
    state.night=night;document.documentElement.dataset.time=night?'night':'day';
    $('day-button').setAttribute('aria-pressed',String(!night));$('night-button').setAttribute('aria-pressed',String(night));
    $('mood-text').textContent=night?'让星光慢慢落下':'日光穿过松梢';
    document.querySelector('meta[name="theme-color"]').content=night?'#102231':'#dbe4df';
    toast(night?'夜色已至，灯火正暖':'日光回来了');
  }
  function setFire(on) {
    state.fire=on;$('fire-toggle').setAttribute('aria-checked',String(on));$('fire-status').textContent=on?'正在燃烧':'已经熄灭';
    toast(on?'篝火已点燃':'篝火已熄灭，留一盏营灯');
  }
  function reset() {controls.reset();framing(true);toast('已回到营地全景');}
  $('day-button').addEventListener('click',()=>setNight(false));
  $('night-button').addEventListener('click',()=>setNight(true));
  $('fire-toggle').addEventListener('click',()=>setFire(!state.fire));
  $('reset-view').addEventListener('click',reset);
  $('brand-home').addEventListener('click',event=>{event.preventDefault();reset();});
  $('scene').addEventListener('keydown',event=>{
    const key=event.key;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','r','R','f','F','n','N'].includes(key))return;
    event.preventDefault();
    if(/^[rR]$/.test(key)){reset();return;}
    if(/^[fF]$/.test(key)){setFire(!state.fire);return;}
    if(/^[nN]$/.test(key)){setNight(!state.night);return;}
    const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if(key==='ArrowLeft')spherical.theta-=.12;if(key==='ArrowRight')spherical.theta+=.12;
    if(key==='ArrowUp')spherical.phi-=.08;if(key==='ArrowDown')spherical.phi+=.08;
    if(key==='+'||key==='=')spherical.radius*=.9;if(key==='-')spherical.radius*=1.1;
    spherical.phi=clamp(spherical.phi,controls.minPolarAngle,controls.maxPolarAngle);
    spherical.radius=clamp(spherical.radius,controls.minDistance,controls.maxDistance);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();
  });
  renderer.domElement.addEventListener('pointerdown',()=>$('scene').focus({preventScroll:true}));
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('图形上下文已中断。请点击“重新打开”恢复营地。');});
  renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());

  const dayTop=new THREE.Color('#eff1df'),nightTop=new THREE.Color('#263f4b');
  const dayMid=new THREE.Color('#dbe4df'),nightMid=new THREE.Color('#102231');
  const dayEdge=new THREE.Color('#c4d5ce'),nightEdge=new THREE.Color('#091523');
  const colorA=new THREE.Color(),colorB=new THREE.Color(),colorC=new THREE.Color();
  const daySky=new THREE.Color('#eff6da'),nightSky=new THREE.Color('#719abf');
  const dayGround=new THREE.Color('#877d59'),nightGround=new THREE.Color('#243442');
  const daySun=new THREE.Color('#ffe4ad'),nightSun=new THREE.Color('#a1c8f0');
  const dayHorizon=new THREE.Color('#c8dbd3'),nightHorizon=new THREE.Color('#142c3b');
  let lastMix=-1,time=0,lastNow=performance.now(),frameCount=0,frameSum=0,averageFPS=0,lastCssMix=-1;
  function animate(now) {
    const rawDt=(now-lastNow)/1000;
    const dt=Math.min(rawDt,.05);lastNow=now;
    if(document.hidden)return;
    time+=dt;
    const transition=reduceMotion?1:1-Math.exp(-dt*3.3);
    state.nightMix=lerp(state.nightMix,Number(state.night),transition);
    state.fireMix=lerp(state.fireMix,Number(state.fire),reduceMotion?1:1-Math.exp(-dt*9));
    if(Math.abs(state.fireMix-Number(state.fire))<.005)state.fireMix=Number(state.fire);
    if(Math.abs(state.nightMix-Number(state.night))<.0008)state.nightMix=Number(state.night);
    const n=state.nightMix,f=state.fireMix;
    if(n!==lastMix) {
      hemi.intensity=lerp(2.35,.30,n);hemi.color.copy(daySky).lerp(nightSky,n);hemi.groundColor.copy(dayGround).lerp(nightGround,n);
      sun.intensity=lerp(3.05,.62,n);sun.color.copy(daySun).lerp(nightSun,n);
      rim.intensity=lerp(.7,.38,n);renderer.toneMappingExposure=lerp(1.13,.95,n);
      scene.background.copy(dayHorizon).lerp(nightHorizon,n);scene.fog.color.copy(scene.background);
      lampMats.forEach(m=>m.emissiveIntensity=lerp(.35,2.6,n));lampLights.forEach((l,i)=>l.intensity=lerp(.08,i===2?6.5:3.7,n));
      starMat.opacity=n*.8;stars.visible=n>.01;fireflyMat.opacity=n*.75;fireflies.visible=n>.01;waterMat.color.set('#579b9a').lerp(new THREE.Color('#385e69'),n);
      lastMix=n;
    }
    if(Math.abs(n-lastCssMix)>.003||n===0||n===1) {
      if(n!==lastCssMix){
        const a=colorA.copy(dayTop).lerp(nightTop,n).getStyle(),b=colorB.copy(dayMid).lerp(nightMid,n).getStyle(),c=colorC.copy(dayEdge).lerp(nightEdge,n).getStyle();
        $('app').style.background=`radial-gradient(ellipse at 52% 40%,${a} 0%,${b} 57%,${c} 100%)`;lastCssMix=n;
      }
    }
    const flicker=reduceMotion?1:1+Math.sin(time*11)*.085+Math.sin(time*17.7)*.05+Math.sin(time*6.3)*.06;
    fireLight.intensity=lerp(27,43,n)*f*flicker;
    coalMat.emissiveIntensity=f*lerp(.6,1.6,n);
    flameGroup.visible=f>.006;flameGroup.scale.setScalar(Math.max(.001,f));
    glow.visible=f>.006;glow.material.opacity=f*lerp(.15,.46,n)*flicker;
    sparks.visible=f>.006;sparkMat.opacity=f*.88;
    for(const flame of flames) {
      flame.mesh.scale.y=1+(reduceMotion?0:Math.sin(time*8+flame.phase)*.18);
      flame.mesh.rotation.z=Math.sin(time*5+flame.phase)*.11;
      flame.mesh.scale.x=1+Math.sin(time*6+flame.phase)*.1;
    }
    for(let i=0;i<sparkCount;i++) {
      const s=sparkSeeds[i],age=(s.age+time*s.speed)%1;
      sparkPositions[i*3]=Math.sin(s.phase+age*3)*(.14+age*.3)+age*.3;
      sparkPositions[i*3+1]=.4+age*1.95;
      sparkPositions[i*3+2]=Math.cos(s.phase+age*2)*(.16+age*.27);
    }
    sparkGeo.attributes.position.needsUpdate=true;
    for(const puff of smoke) {
      const age=(puff.offset+time*.15)%1;
      puff.mesh.visible=f>.006;
      puff.mesh.position.set(age*.75+Math.sin(age*8)*.07,.9+age*2.1,Math.sin(age*4)*.2);
      puff.mesh.scale.setScalar(.10+age*.38);puff.mesh.rotation.y=time*.17+puff.offset;
      puff.mesh.material.opacity=Math.sin(age*Math.PI)*f*lerp(.11,.06,n);
    }
    if(!reduceMotion)treeCrowns.forEach(t=>t.crown.rotation.z=Math.sin(time*.65+t.phase)*t.strength);
    ripples.forEach((r,i)=>r.material.opacity=(.16+Math.sin(time*1.2+i)*.075)*lerp(1,.6,n));
    for(let i=0;i<fireflyCount;i++) {
      const s=fireflySeeds[i];fireflyPositions[i*3]=s.x+Math.sin(time*.3+s.phase)*.35;fireflyPositions[i*3+1]=s.y+Math.sin(time*.6+s.phase)*.2;fireflyPositions[i*3+2]=s.z+Math.cos(time*.4+s.phase)*.3;
    }
    fireflyGeo.attributes.position.needsUpdate=true;
    controls.update();renderer.render(scene,camera);
    frameCount++;frameSum+=rawDt;
    if(frameSum>1){
      averageFPS=Math.round(frameCount/frameSum);frameCount=0;frameSum=0;
      $('scene').dataset.diagnostics=JSON.stringify(window.__CAMP_DEBUG__);
    }
  }
  // Read-only diagnostics make interaction and lighting verification repeatable.
  Object.defineProperty(window,'__CAMP_DEBUG__',{get:()=>({
    ready:true,three:THREE.REVISION,landscape:'continuous',terrainSpan:840,forestTrees:forest.length+15,night:state.night,nightMix:state.nightMix,fire:state.fire,fireMix:state.fireMix,
    fireLightIntensity:fireLight.intensity,flamesVisible:flameGroup.visible,sparksVisible:sparks.visible,glowVisible:glow.visible,
    lampLightIntensity:lampLights.reduce((sum,l)=>sum+l.intensity,0),ambientIntensity:hemi.intensity,
    camera:camera.position.toArray(),target:controls.target.toArray(),distance:camera.position.distanceTo(controls.target),
    viewport:[lastWidth,lastHeight],pixelRatio:renderer.getPixelRatio(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fps:averageFPS,
  })});
  renderer.render(scene,camera);
  $('loading').classList.add('done');
  setTimeout(()=>$('loading').remove(),650);
  renderer.setAnimationLoop(animate);
  addEventListener('pagehide',()=>renderer.setAnimationLoop(null),{once:true});
  addEventListener('pageshow',event=>{if(event.persisted){lastNow=performance.now();renderer.setAnimationLoop(animate);}});
  document.addEventListener('visibilitychange',()=>{lastNow=performance.now();});
}
