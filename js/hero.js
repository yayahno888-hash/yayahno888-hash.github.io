// Erster Bildschirm: ein Feld aus Tausenden Blüten bis zum Horizont.
//  - Die Blüten sind in Blender modelliert und gerendert (tools/blender/flower.py → img/flowers.png)
//  - Beim Öffnen erblüht das Feld als Welle vom Horizont zur Kamera, dann erscheint der Name
//  - Windböen laufen als helle Wellen über das Feld, einzelne Blütenblätter fliegen davon
//  - Unter der Maus heben sich die Blüten und leuchten, beim Scrollen fliegt die Kamera nach vorn
// Ohne WebGL bleibt nur der Name auf dunklem Grund stehen.
(() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
  const canvas = document.getElementById('gl');
  const hero = document.getElementById('hero');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
  const FLOWERS = PHONE ? 6500 : 16000;
  const LEAVES = PHONE ? 1500 : 3500;
  const PETALS = PHONE ? 40 : 110;   // fliegende Blütenblätter
  const STARS = PHONE ? 250 : 600;
  const INTRO = 2.6;                 // Sekunden, bis das ganze Feld erblüht ist

  /** Name und Text erscheinen lassen (auch ohne 3D) */
  const revealText = () => document.body.classList.add('intro-done');

  function supportsWebGL() {
    try {
      const c = document.createElement('canvas');
      return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch {
      return false;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  /** Einfache Formen auf Canvas: Blatt der Wiese und einzelnes Blütenblatt */
  function canvasTexture(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.translate(32, 32);
    ctx.fillStyle = '#ffffff';
    draw(ctx);
    return new THREE.CanvasTexture(c);
  }
  const leafTexture = () => canvasTexture((ctx) => {
    ctx.rotate(0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 28, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  const petalTexture = () => canvasTexture((ctx) => {
    const g = ctx.createLinearGradient(0, -26, 0, 26);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d9d8e4');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 26);
    ctx.bezierCurveTo(-18, 10, -16, -22, 0, -26);
    ctx.bezierCurveTo(16, -22, 18, 10, 0, 26);
    ctx.fill();
  });

  /** Sanfte Hügel: Höhe des Bodens an Position x, z */
  const ground = (x, z) => Math.sin(x * 0.22 + 1.2) * 0.35 + Math.cos(z * 0.17) * 0.4 + Math.max(0, x) * 0.035;

  const vertexShader = `
    uniform float uTime;
    uniform float uIntro;     // Front der Blüh-Welle (z-Position)
    uniform vec2 uMouse;
    uniform float uScale;
    uniform float uGlow;
    attribute float aSize;
    attribute float aPhase;
    attribute float aTile;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vGlow;
    varying float vRot;
    varying float vTile;
    void main() {
      vec3 p = position;

      // Intro: Blüten hinter der Welle sind schon offen, davor noch geschlossen
      float bloom = clamp((uIntro - p.z) / 3.0, 0.0, 1.0);
      float pop = bloom + sin(bloom * 3.1416) * 0.25;        // kurz größer, dann normal
      p.y -= (1.0 - bloom) * 0.35;                           // wächst aus dem Boden

      // Grundwind und Böen, die als helle Wellen zur Kamera laufen
      float gust = pow(max(0.0, sin(p.z * 0.22 - uTime * 1.5 + sin(p.x * 0.15) * 1.2)), 8.0);
      p.x += sin(uTime * 0.9 + aPhase * 6.283 + p.z * 0.35) * 0.05 + gust * 0.16;
      p.y += cos(uTime * 0.7 + aPhase * 12.0) * 0.018 + gust * 0.05;

      // Maus: Blüten im Umkreis heben sich und leuchten
      float g = smoothstep(1.9, 0.0, distance(p.xz, uMouse)) * uGlow;
      p.y += g * 0.4;
      vGlow = g + gust * 0.35 * uGlow;

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * pop * (1.0 + g * 0.55) * uScale / -mv.z;
      vAlpha = smoothstep(48.0, 16.0, -mv.z) * bloom;
      vColor = aColor;
      vRot = aPhase * 6.283 + uTime * 0.25 * (aPhase - 0.5) + gust * 0.8;
      vTile = aTile;
    }
  `;
  const fragmentShader = `
    uniform sampler2D uTex;
    uniform float uOpacity;
    uniform float uAtlas;     // 1 = Textur hat 2×2 Blüten-Varianten
    varying vec3 vColor;
    varying float vAlpha;
    varying float vGlow;
    varying float vRot;
    varying float vTile;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float s = sin(vRot), co = cos(vRot);
      vec2 uv = vec2(co * c.x - s * c.y, s * c.x + co * c.y) + 0.5;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
      if (uAtlas > 0.5) {
        vec2 tile = vec2(mod(vTile, 2.0), floor(vTile / 2.0));
        uv = (uv + tile) * 0.5;
        uv.y = 1.0 - uv.y;
      }
      vec4 t = texture2D(uTex, uv);
      if (t.a < 0.3) discard;
      vec3 tex = t.rgb / max(t.a, 0.001);   // ohne dunkle Kanten
      vec3 col = mix(vColor, vec3(0.72, 0.96, 1.0), vGlow * 0.75) * (0.82 + vGlow * 0.55);
      gl_FragColor = vec4(col * tex, smoothstep(0.3, 0.6, t.a) * vAlpha * uOpacity);
    }
  `;

  function makeMaterial(texture, opacity, glow, atlas) {
    return new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: true,
      uniforms: {
        uTime: { value: 0 }, uIntro: { value: -60 }, uMouse: { value: new THREE.Vector2(999, 999) },
        uScale: { value: 400 }, uTex: { value: texture }, uOpacity: { value: opacity },
        uGlow: { value: glow }, uAtlas: { value: atlas },
      },
    });
  }

  /** Punktwolke auf dem Feld (Blüten oder Blätter) */
  function field(count, material, pickColour, sizeRange, yOffset) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const tile = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const z = 6 - Math.random() ** 0.8 * 50;     // von kurz vor der Kamera bis weit hinten, hinten dichter
      const width = 16 + -Math.min(0, z) * 1.5;    // hinten breiter, weil die Sicht sich öffnet
      const x = (Math.random() - 0.5) * width;
      pos[i * 3] = x;
      pos[i * 3 + 1] = ground(x, z) + yOffset + Math.random() * 0.12;
      pos[i * 3 + 2] = z;
      col.set(pickColour(), i * 3);
      size[i] = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
      phase[i] = Math.random();
      tile[i] = (Math.random() * 4) | 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aTile', new THREE.BufferAttribute(tile, 1));
    return new THREE.Points(geo, material);
  }

  /** Blütenblätter, die vom Feld aufsteigen und mit dem Wind davonfliegen (auf der CPU, es sind wenige) */
  function flyingPetals(material) {
    const pos = new Float32Array(PETALS * 3);
    const state = [];
    const spawn = (i, anywhere) => {
      const z = -4 - Math.random() * 22;
      const x = (Math.random() - 0.5) * (14 + -z);
      state[i] = {
        x, z, y: ground(x, z) + (anywhere ? Math.random() * 3 : 0.1),
        vx: 0.25 + Math.random() * 0.35, vy: 0.12 + Math.random() * 0.25, vz: 0.4 + Math.random() * 0.6,
        wobble: Math.random() * 6.283,
      };
    };
    for (let i = 0; i < PETALS; i++) spawn(i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ones = (n, v) => new THREE.BufferAttribute(new Float32Array(n).fill(v), 1);
    const colours = new Float32Array(PETALS * 3).fill(0.95);
    geo.setAttribute('aColor', new THREE.BufferAttribute(colours, 3));
    const sizes = new Float32Array(PETALS).map(() => 0.08 + Math.random() * 0.07);
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(PETALS).map(() => Math.random()), 1));
    geo.setAttribute('aTile', ones(PETALS, 0));
    const points = new THREE.Points(geo, material);
    points.update = (dt, t) => {
      for (let i = 0; i < PETALS; i++) {
        const p = state[i];
        p.x += (p.vx + Math.sin(t * 1.3 + p.wobble) * 0.3) * dt;
        p.y += (p.vy + Math.cos(t * 1.7 + p.wobble) * 0.08) * dt;
        p.z += p.vz * dt;
        if (p.y > 4.5 || p.z > 7) spawn(i, false);
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
      }
      geo.attributes.position.needsUpdate = true;
    };
    return points;
  }

  function build(flowerTex) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.5 : 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
    const LOOK = new THREE.Vector3(0, 0.1, -14);

    // Blütenfarben: meist weiß, dazu zartes Rosa, Eisblau und Flieder (perlmuttartig)
    const tints = [[0.96, 0.95, 0.97], [0.96, 0.95, 0.97], [0.96, 0.95, 0.97], [0.98, 0.82, 0.9], [0.76, 0.93, 0.98], [0.86, 0.82, 1.0]];
    const flowerMat = makeMaterial(flowerTex, 1, 1, 1);
    const leafMat = makeMaterial(leafTexture(), 0.32, 0, 0);
    const petalMat = makeMaterial(petalTexture(), 0.85, 0, 0);
    const flowers = field(FLOWERS, flowerMat, () => tints[(Math.random() * tints.length) | 0], [0.15, 0.32], 0.05);
    const leaves = field(LEAVES, leafMat, () => [0.12 + Math.random() * 0.06, 0.3 + Math.random() * 0.12, 0.25], [0.22, 0.45], -0.05);
    const petals = REDUCED ? null : flyingPetals(petalMat);
    scene.add(leaves, flowers);
    if (petals) scene.add(petals);

    // Ein paar ferne Sterne über dem Horizont
    const starPos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 120;
      starPos[i * 3 + 1] = 4 + Math.random() * 30;
      starPos[i * 3 + 2] = -50 - Math.random() * 20;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.12, color: 0x9a94b8, transparent: true, opacity: 0.6 })));

    const materials = [flowerMat, leafMat, petalMat];
    function resize() {
      const w = hero.clientWidth;
      const h = hero.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w < 700 ? 62 : 48; // schmal: mehr Feld zeigen
      camera.updateProjectionMatrix();
      materials.forEach((m) => { m.uniforms.uScale.value = h * renderer.getPixelRatio() * 0.5; });
    }
    new ResizeObserver(resize).observe(hero);
    resize();

    // Maus auf den Boden projizieren (Ebene y = 0)
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const pointer = { nx: 0, ny: 0, active: false };
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      pointer.nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.ny = -((e.clientY - r.top) / r.height) * 2 + 1;
      pointer.active = true;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { pointer.active = false; });

    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(hero);

    // Wird das Gerät dauerhaft langsam, weniger Schärfe und weniger Blüten
    let slow = 0;
    let drawn = FLOWERS;
    function adaptQuality(ms) {
      if (document.hidden || ms > 1000) return;
      if (ms > 25) slow++;
      else if (ms < 18) slow = Math.max(0, slow - 1);
      if (slow < 20) return;
      slow = 0;
      if (renderer.getPixelRatio() > 1) {
        renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.5));
        resize();
      } else if (drawn > 3000) {
        drawn = Math.floor(drawn * 0.6);
        flowers.geometry.setDrawRange(0, drawn);
      }
    }

    const camBase = new THREE.Vector3(0, 1.35, 6.5);
    camera.position.copy(camBase);
    camera.lookAt(LOOK);
    const easeOut = (x) => 1 - (1 - x) ** 3;
    let start = 0;
    let lastTime = 0;
    let textShown = false;

    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible) { lastTime = 0; return; }
      if (!start) start = now;
      const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0.016;
      if (lastTime) adaptQuality(now - lastTime);
      lastTime = now;
      const age = (now - start) / 1000;
      const t = REDUCED ? 0 : now / 1000;

      // Intro: Welle vom Horizont (z = -50) bis hinter die Kamera (z = 10)
      const k = REDUCED ? 1 : Math.min(1, age / INTRO);
      const front = -50 + easeOut(k) * 62;
      if (!textShown && k > 0.45) { textShown = true; revealText(); }

      // Kamera: leichte Parallaxe mit der Maus, beim Scrollen über das Feld nach vorn
      const r = hero.getBoundingClientRect();
      const scroll = REDUCED ? 0 : Math.min(1, Math.max(0, -r.top / r.height));
      camera.position.x += (camBase.x + pointer.nx * 0.5 - camera.position.x) * 0.05;
      camera.position.y += (camBase.y + pointer.ny * 0.15 - scroll * 0.5 - camera.position.y) * 0.05;
      camera.position.z = camBase.z - scroll * 5 + (1 - easeOut(k)) * 1.5; // beim Intro leicht heranfahren
      camera.lookAt(LOOK);

      if (pointer.active && !REDUCED && ray) {
        ndc.set(pointer.nx, pointer.ny);
        ray.setFromCamera(ndc, camera);
        if (ray.ray.intersectPlane(plane, hit)) flowerMat.uniforms.uMouse.value.set(hit.x, hit.z);
      } else {
        flowerMat.uniforms.uMouse.value.set(999, 999);
      }
      materials.forEach((m) => {
        m.uniforms.uTime.value = t;
        m.uniforms.uIntro.value = m === petalMat ? 99 : front;
      });
      if (petals && k >= 1) petals.update(dt, t);
      petals && (petals.visible = k >= 1);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  /** Blender-Textur laden; wenn das scheitert, eine einfache Blüte auf Canvas zeichnen */
  function loadFlowerTexture() {
    return new Promise((resolve) => {
      new THREE.TextureLoader().load('img/flowers.png', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      }, undefined, () => resolve(null));
    });
  }

  async function start() {
    if (!canvas || !supportsWebGL()) { revealText(); return; }
    setTimeout(revealText, 3500); // Sicherheitsnetz: Text erscheint auf jeden Fall
    try {
      await loadScript(THREE_URL);
      if (!window.THREE) { revealText(); return; }
      const tex = await loadFlowerTexture();
      if (!tex) { revealText(); return; }
      document.body.classList.add('gl-on');
      window.dispatchEvent(new Event('three:ready')); // weitere 3D-Szenen warten darauf
      build(tex);
    } catch (error) {
      document.body.classList.remove('gl-on');
      revealText();
      console.warn('Hero-Effekt deaktiviert:', error);
    }
  }
  start();
})();
