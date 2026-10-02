/* =====================================================================
 * World: phần cảnh dùng chung cho mọi màn — renderer, scene, camera, ánh trăng (đổ bóng mềm),
 * ánh sáng môi trường, bản đồ phản chiếu PBR, vòm trời + sao + trăng, sương mù hàm mũ.
 * Nội dung riêng của từng màn (mặt đất, nhà cửa, cây...) do lớp Level tự dựng vào level.root.
 * ===================================================================== */
import { THREE } from './three.js';
import { CFG } from '../config.js';
import { mulberry32 } from './utils.js';
import { Device } from './Device.js';

export class World {
  constructor(container) {
    // cấu hình đồ hoạ theo thiết bị: mobile tắt khử răng cưa, pixelRatio ≤ 1.5, bóng đổ 1024 (QualityScaler tinh chỉnh tiếp)
    this.profile = Device.profile;
    const Q = this.profile;
    const r = new THREE.WebGLRenderer({ antialias: Q.antialias, powerPreference: Device.mobile ? 'default' : 'high-performance', stencil: false });
    r.setPixelRatio(Q.pixelRatio);
    r.setSize(container.clientWidth, container.clientHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = Q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; // PC: bóng mềm · mobile: PCF thường, nhẹ hơn
    r.toneMapping = THREE.ACESFilmicToneMapping;     // dải sáng tối điện ảnh
    r.toneMappingExposure = 0.92;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a2634);
    // sương mù chiều tối dạng hàm mũ: gần thì rõ, xa thì chìm dần vào màn sương xanh xám
    this.scene.fog = new THREE.FogExp2(0x1a2634, CFG.fog.play);
    this.camera = new THREE.PerspectiveCamera(CFG.camera.fov, container.clientWidth / container.clientHeight, 0.1, 400);
    this.rng = mulberry32(777);
    this.buildLights();
    this.buildEnvironment();
    this.buildSky();
    this.container = container;
    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      r.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250)); // iOS báo kích thước mới hơi trễ
  }

  // dùng cho QualityScaler (cân bằng đồ hoạ động)
  setPixelRatio(v) { this.renderer.setPixelRatio(v); this.renderer.setSize(this.container.clientWidth, this.container.clientHeight); }
  setShadowSize(n) {
    const sh = this.moon.shadow;
    sh.mapSize.set(n, n);
    if (sh.map) { sh.map.dispose(); sh.map = null; } // three.js tự tạo lại shadow map với kích thước mới
  }

  buildLights() {
    const s = this.scene;
    // ánh sáng môi trường: trời đêm xanh lạnh hắt từ trên, đất cỏ ấm hắt từ dưới → khối có chiều sâu, vẫn tối mà không bết
    s.add(new THREE.HemisphereLight(0x5a76b2, 0x1a2414, 0.6));
    s.add(new THREE.AmbientLight(0x2a3650, 0.25));
    // ánh trăng: nguồn sáng chính, đổ bóng mềm 2048×2048 (khung bóng bám theo người chơi)
    const moon = new THREE.DirectionalLight(0xb4c8ff, 1.0);
    moon.castShadow = true;
    moon.shadow.mapSize.set(this.profile.shadow, this.profile.shadow); // PC 2048 · mobile 1024 / 512
    Object.assign(moon.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.03;
    // ánh chiều tà còn sót ở chân trời phía tây: viền cam rất nhẹ lên các mặt hướng tây (không đổ bóng)
    const dusk = new THREE.DirectionalLight(0xff9a5a, 0.22); dusk.position.set(-60, 8, 10); s.add(dusk);
    s.add(moon, moon.target);
    this.moon = moon;
  }

  buildEnvironment() {
    const env = new THREE.Scene();
    const sky = new THREE.SphereGeometry(10, 24, 12), cols = [], top = new THREE.Color(0x24345a), hor = new THREE.Color(0x3a4a5e), bot = new THREE.Color(0x101a10);
    const pos = sky.attributes.position, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10; c.copy(y > 0 ? hor : bot).lerp(y > 0 ? top : bot, Math.abs(y)); cols.push(c.r, c.g, c.b); }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    for (const [x, y, z, k] of [[6, 1, 4, 1], [-7, 2, -3, 0.7], [2, 1.5, -8, 0.8]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.6 * k, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb04a }));
      m.position.set(x, y, z); env.add(m);
    }
    const moonBlob = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdfe8ff })); moonBlob.position.set(-4, 7, 5); env.add(moonBlob);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(env, 0.04).texture;
    pm.dispose();
  }


  glowTex() {
    if (this._glow) return this._glow;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    this._glow = new THREE.CanvasTexture(cv);
    return this._glow;
  }


  buildSky() {
    // vòm trời: đỉnh xanh đen, sát chân trời trùng màu sương mù để cảnh xa tan vào trời
    const dome = new THREE.SphereGeometry(300, 32, 16), dp = dome.attributes.position, dc = [], zen = new THREE.Color(0x050b16), hor = new THREE.Color(0x1a2634), cc = new THREE.Color();
    for (let i = 0; i < dp.count; i++) { const y = Math.max(0, dp.getY(i) / 300); cc.copy(hor).lerp(zen, Math.pow(y, 0.55)); dc.push(cc.r, cc.g, cc.b); }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
    this.skyDome = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.skyDome.renderOrder = -1; this.scene.add(this.skyDome);
    const n = 900, pos = new Float32Array(n * 3), rng = this.rng;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, e = 0.12 + rng() * 1.4, r = 220;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    this.scene.add(this.stars);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex(), color: 0xe8efff, fog: false, depthWrite: false, transparent: true }));
    moon.scale.set(34, 34, 1); this.moonSprite = moon; this.scene.add(moon);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.4, 32), new THREE.MeshBasicMaterial({ color: 0xf2f5ff, fog: false }));
    this.moonDisc = disc; this.scene.add(disc);
  }


  // mỗi khung hình: khung bóng của trăng bám theo nhân vật, trời/sao/trăng đi theo camera
  update(time, cam, focus) {
    this.moon.position.set(focus.x - 22, 34, focus.z - 16);
    this.moon.target.position.set(focus.x, 0, focus.z);
    this.stars.position.copy(cam.position);
    this.skyDome.position.copy(cam.position);
    const md = new THREE.Vector3(-0.45, 0.62, 0.65).normalize().multiplyScalar(190);
    this.moonDisc.position.copy(cam.position).add(md); this.moonDisc.lookAt(cam.position);
    this.moonSprite.position.copy(this.moonDisc.position);
  }
}
