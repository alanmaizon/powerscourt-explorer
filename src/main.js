import {LitElement, css, html} from 'lit';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

class PowerscourtGame extends LitElement {
  static properties = {loading: {state: true}, error: {state: true}, locked: {state: true}};
  static styles = css`
    :host { display:block; min-height:100vh; background:#17251e; color:#edf1e8; }
    * { box-sizing:border-box; } .app { min-height:100vh; position:relative; overflow:hidden; }
    header { position:absolute; z-index:2; inset:0 0 auto; display:flex; justify-content:space-between; align-items:center; padding:20px clamp(18px,4vw,48px); pointer-events:none; text-shadow:0 2px 8px #0b1710; }
    .brand, .header-status { pointer-events:auto; } .eyebrow { color:#c18d68; font-size:10px; letter-spacing:.18em; text-transform:uppercase; }
    h1 { margin:4px 0 0; font:clamp(24px,3vw,36px) Georgia,serif; font-weight:400; } .header-status { color:#d8e3d6; font-size:12px; letter-spacing:.08em; }
    .stage { position:absolute; inset:0; background:#9baaa2; } canvas { width:100%; height:100%; display:block; outline:none; cursor:crosshair; }
    .hud { position:absolute; z-index:1; inset:0; pointer-events:none; } .crosshair { position:absolute; left:50%; top:50%; width:18px; height:18px; transform:translate(-50%,-50%); }
    .crosshair:before, .crosshair:after { content:''; position:absolute; background:#fff; box-shadow:0 0 4px #000; } .crosshair:before { width:2px; height:18px; left:8px; } .crosshair:after { width:18px; height:2px; top:8px; }
    .prompt { position:absolute; left:50%; bottom:10%; transform:translateX(-50%); padding:10px 14px; border:1px solid #d9e0d6aa; border-radius:5px; background:#17251ecc; backdrop-filter:blur(8px); font-size:12px; letter-spacing:.05em; }
    .prompt[hidden], .status[hidden] { display:none; } .status { position:absolute; inset:0; display:grid; place-items:center; background:#9baaa2; color:#173024; font-size:14px; }
    .controls { position:absolute; right:24px; bottom:22px; display:flex; gap:8px; pointer-events:auto; } button { color:inherit; border:1px solid #b8c9b7; background:#1c3025cc; border-radius:5px; padding:9px 12px; cursor:pointer; backdrop-filter:blur(8px); }
    button:hover, button[aria-pressed="true"] { background:#3b5a42; } .legend { position:absolute; left:24px; bottom:22px; color:#d5dfd2; font-size:11px; letter-spacing:.04em; text-shadow:0 1px 4px #000; }
    @media (max-width:600px) { header { padding:16px; } .header-status { display:none; } .legend { left:16px; bottom:76px; } .controls { left:16px; right:16px; bottom:18px; justify-content:flex-end; } }
  `;

  constructor() {
    super();
    this.loading = true;
    this.error = '';
    this.locked = false;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3();
    this.inputActive = false;
  }

  render() {
    return html`
      <div class="app">
        <header><div class="brand"><h1>Powerscourt House</h1></div></header>
        <main class="stage"><canvas tabindex="0" aria-label="Powerscourt first-person map"></canvas><div class="hud"><div class="crosshair"></div><div class="prompt" ?hidden=${this.locked || this.loading || !!this.error}>Click to explore · WASD to move · Mouse to look</div><div class="status" ?hidden=${!this.loading}>Preparing Powerscourt map…</div><div class="status" ?hidden=${!this.error}>${this.error}</div><div class="legend">WASD move · Shift run · Esc release mouse</div><div class="controls"><button @click=${this.toggleLock}>${this.locked ? 'Release mouse' : 'Enter map'}</button><button @click=${this.toggleFullscreen}>Fullscreen</button><button @click=${this.enterXR}>XR</button></div></div></main>
      </div>
    `;
  }

  firstUpdated() {
    this.canvas = this.renderRoot.querySelector('canvas');
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({canvas: this.canvas, antialias: true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    new HDRLoader().load('/skyboxes/overcast.hdr', texture => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.LinearSRGBColorSpace;
      this.scene.background = texture;
      this.scene.environment = texture;
    }, undefined, error => console.error('Skybox could not load.', error));
    this.camera = new THREE.PerspectiveCamera(72, 1, .1, 600);
    this.camera.position.set(0, .9, -42);
    this.yaw = Math.PI;
    this.scene.add(new THREE.HemisphereLight(0xdce8e0, 0x6d7764, 1.7));
    const sun = new THREE.DirectionalLight(0xffebca, 2.3);
    sun.position.set(-40, 70, 45); sun.castShadow = true; this.scene.add(sun);
    this.loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('/node_modules/three/examples/jsm/libs/draco/');
    this.loader.setDRACOLoader(draco);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
    this.canvas.addEventListener('click', () => this.toggleLock());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas || this.inputActive;
    });
    document.addEventListener('mousemove', event => this.look(event));
    window.addEventListener('blur', () => { this.keys.clear(); this.inputActive = false; this.locked = false; });
    document.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        this.inputActive = false;
        this.locked = false;
        this.keys.clear();
        return;
      }
      if (['w', 'a', 's', 'd', 'shift'].includes(key)) {
        this.inputActive = true;
        this.locked = true;
        this.keys.add(key);
        event.preventDefault();
      }
    });
    document.addEventListener('keyup', event => {
      this.keys.delete(event.key.toLowerCase());
    });
    this.loadMap(); this.animate();
  }

  async loadMap() {
    try {
      const gltf = await this.loader.loadAsync('/models/powerscourt-house.glb');
      this.map = gltf.scene;
      this.map.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      this.scene.add(this.map);
      const bounds = new THREE.Box3().setFromObject(this.map);
      this.playBounds = {
        minX: bounds.min.x + 1.5,
        maxX: bounds.max.x - 1.5,
        minZ: bounds.min.z + 1.5,
        maxZ: bounds.max.z - 1.5
      };
      this.houseFootprints = [
        {minX: -40, maxX: 40, minZ: -13.2, maxZ: 4.5},
        {minX: -22.5, maxX: 22.5, minZ: 4, maxZ: 15.5}
      ];
      const size = bounds.getSize(new THREE.Vector3());
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(size.x, size.z, 80) * 2, Math.max(size.x, size.z, 80) * 2), new THREE.MeshStandardMaterial({color:'#6f7f6b', roughness:.96}));
      this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = bounds.min.y - .08; this.ground.receiveShadow = true; this.scene.add(this.ground);
      this.scene.add(this.camera);
      this.camera.position.set(0, .9, -42);
      this.yaw = 0;
      this.yaw = Math.PI;
      this.pitch = 0;
      this.loading = false; this.requestUpdate();
    } catch (error) { this.error = 'The Powerscourt map could not load.'; this.loading = false; console.error(error); }
  }

  look(event) {
    if (!this.locked) return;
    this.yaw -= event.movementX * .0022; this.pitch -= event.movementY * .0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.35);
  }
  move(delta) {
    if (!this.locked || !this.map) return;
    const direction = new THREE.Vector3((this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0), 0, (this.keys.has('s') ? 1 : 0) - (this.keys.has('w') ? 1 : 0));
    if (!direction.lengthSq()) return;
    direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const speed = this.keys.has('shift') ? 14 : 7;
    const next = this.camera.position.clone().addScaledVector(direction, speed * delta);
    const insideGround = next.x >= this.playBounds.minX && next.x <= this.playBounds.maxX &&
      next.z >= this.playBounds.minZ && next.z <= this.playBounds.maxZ;
    const insideStairApproach = Math.abs(next.x) <= 12 && next.z >= -45 && next.z < this.playBounds.minZ;
    if (!insideGround && !insideStairApproach) return;
    if (this.insideHouse(next.x, next.z) && !this.onGardenStairs(next.x, next.z)) return;
    const nextLevel = this.walkLevel(next.x, next.z);
    this.camera.position.copy(next);
    this.camera.position.y = nextLevel;
  }
  onGardenStairs(x, z) { return Math.abs(x) <= 12 && z >= -43 && z <= -31; }
  insideHouse(x, z) {
    return this.houseFootprints.some(footprint =>
      x >= footprint.minX && x <= footprint.maxX &&
      z >= footprint.minZ && z <= footprint.maxZ
    );
  }
  walkLevel(x, z) {
    if (this.onGardenStairs(x, z)) {
      const progress = THREE.MathUtils.clamp((-z - 31) / 12, 0, 1);
      return THREE.MathUtils.lerp(2.1, .9, progress);
    }
    return z < -43 ? .9 : 2.1;
  }
  animate() {
    const now = performance.now(); const delta = Math.min((now - (this.lastFrame || now)) / 1000, .05); this.lastFrame = now;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); this.move(delta);
    this.renderer.render(this.scene, this.camera); requestAnimationFrame(() => this.animate());
  }
  resize() { const box = this.canvas.parentElement.getBoundingClientRect(); this.renderer.setSize(box.width, box.height, false); this.camera.aspect = box.width / box.height; this.camera.updateProjectionMatrix(); }
  toggleLock() {
    if (this.locked) {
      this.inputActive = false;
      this.locked = false;
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    } else {
      this.inputActive = true;
      this.locked = true;
      this.canvas.focus();
      Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
    }
  }
  toggleFullscreen() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  async enterXR() {
    if (!navigator.xr || !await navigator.xr.isSessionSupported('immersive-vr')) { this.error = 'WebXR is not available in this browser.'; return; }
    this.renderer.xr.enabled = true; this.renderer.setAnimationLoop(() => this.renderer.render(this.scene, this.camera));
    this.renderer.xr.setSession(await navigator.xr.requestSession('immersive-vr', {optionalFeatures:['local-floor']}));
  }
}

customElements.define('house-studies-app', PowerscourtGame);
