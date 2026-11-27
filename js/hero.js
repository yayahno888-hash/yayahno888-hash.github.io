// Erster Bildschirm: ein Feld aus Tausenden kleinen Blüten, das bis zum Horizont reicht.
// Wind bewegt sie leicht, unter der Maus heben sich die Blüten und leuchten auf.
// Beim Scrollen fliegt die Kamera ein Stück über das Feld.
// Ohne WebGL bleibt nur der Name auf dunklem Grund stehen.
(() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
  const canvas = document.getElementById('gl');
  const hero = document.getElementById('hero');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
  const FLOWERS = PHONE ? 6500 : 16000;
  const LEAVES = PHONE ? 1500 : 3500;
  const STARS = PHONE ? 250 : 600;

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

  /** Eine Blüte mit fünf Blättern, auf Canvas gezeichnet (weiß, die Farbe kommt pro Blüte dazu) */
  function flowerTexture() {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.translate(S / 2, S / 2);
    for (let k = 0; k < 5; k++) {
      ctx.save();
      ctx.rotate((k / 5) * Math.PI * 2);
      const g = ctx.createLinearGradient(0, -8, 0, -58);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#dcdbe6'); // Blattspitzen etwas dunkler, wirkt plastisch
      ctx.fillStyle = g;
      ctx.beginPath();
      // Blatt: unten schmal, oben rund
      ctx.moveTo(0, -6);
      ctx.bezierCurveTo(-20, -18, -22, -50, 0, -58);
      ctx.bezierCurveTo(22, -50, 20, -18, 0, -6);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#fff6e8';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    return new THREE.CanvasTexture(c);
  }

  /** Ein schmales Blatt für die dunkle Wiese unter den Blüten */
  function leafTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.translate(32, 32);
    ctx.rotate(0.5);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    return new THREE.CanvasTexture(c);
  }

  /** Sanfte Hügel: Höhe des Bodens an Position x, z */
  const ground = (x, z) => Math.sin(x * 0.22 + 1.2) * 0.35 + Math.cos(z * 0.17) * 0.4 + Math.max(0, x) * 0.035;

  // Shader: Wind, Leuchten unter der Maus, Ausblenden in der Ferne, gedrehte Blüten
  const vertexShader = `
    uniform float uTime;
    uniform vec2 uMouse;
    uniform float uScale;
    uniform float uGlow;
    attribute float aSize;
    attribute float aPhase;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vGlow;
    varying float vRot;
    void main() {
      vec3 p = position;
      // Wind: Wellen laufen über das Feld
      p.x += sin(uTime * 0.9 + aPhase * 6.283 + p.z * 0.35) * 0.05;
      p.y += cos(uTime * 0.7 + aPhase * 12.0) * 0.018;
      // Maus: Blüten im Umkreis heben sich und leuchten
      float g = smoothstep(1.9, 0.0, distance(p.xz, uMouse)) * uGlow;
      p.y += g * 0.4;
      vGlow = g;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * (1.0 + g * 0.55) * uScale / -mv.z;
      vAlpha = smoothstep(48.0, 16.0, -mv.z);   // in der Ferne verblassen
      vColor = aColor;
      vRot = aPhase * 6.283 + uTime * 0.25 * (aPhase - 0.5);
    }
  `;
  const fragmentShader = `
    uniform sampler2D uTex;
    uniform float uOpacity;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vGlow;
    varying float vRot;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float s = sin(vRot), co = cos(vRot);
      vec4 t = texture2D(uTex, vec2(co * c.x - s * c.y, s * c.x + co * c.y) + 0.5);
      if (t.a < 0.3) discard;
      // Farbe ohne die dunklen Ränder der Textur (Kantenpixel sind sonst fast schwarz)
      vec3 tex = t.rgb / max(t.a, 0.001);
      vec3 col = mix(vColor, vec3(0.72, 0.96, 1.0), vGlow * 0.75) * (0.82 + vGlow * 0.55);
      gl_FragColor = vec4(col * tex, smoothstep(0.3, 0.6, t.a) * vAlpha * uOpacity);
    }
  `;

  /** Erzeugt eine Punktwolke (Blüten oder Blätter) mit dem Shader oben */
  function field(count, texture, pickColour, sizeRange, opacity, glow, yOffset) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
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
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: true,
      uniforms: {
        uTime: { value: 0 }, uMouse: { value: new THREE.Vector2(999, 999) }, uScale: { value: 400 },
        uTex: { value: texture }, uOpacity: { value: opacity }, uGlow: { value: glow },
      },
    });
    return new THREE.Points(geo, material);
  }

  function build() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.5 : 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
    const LOOK = new THREE.Vector3(0, 0.1, -14);

    // Blütenfarben: meist weiß, dazu zartes Rosa, Eisblau und Flieder (perlmuttartig)
    const tints = [[0.96, 0.95, 0.97], [0.96, 0.95, 0.97], [0.96, 0.95, 0.97], [0.98, 0.82, 0.9], [0.76, 0.93, 0.98], [0.86, 0.82, 1.0]];
    const flowers = field(FLOWERS, flowerTexture(), () => tints[(Math.random() * tints.length) | 0], [0.14, 0.3], 1, 1, 0.05);
    const leaves = field(LEAVES, leafTexture(), () => [0.12 + Math.random() * 0.06, 0.3 + Math.random() * 0.12, 0.25], [0.22, 0.45], 0.32, 0, -0.05);
    scene.add(leaves, flowers);

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

    const materials = [flowers.material, leaves.material];
    function resize() {
      const w = hero.clientWidth;
      const h = hero.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Auf schmalen Bildschirmen weiter weg, damit das Feld nicht zu eng wirkt
      camera.fov = w < 700 ? 62 : 48;
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
    let lastTime = 0;
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
    camera.position.copy(camBase); // sofort über dem Feld starten, nicht im Boden
    camera.lookAt(LOOK);
    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible) return;
      if (lastTime) adaptQuality(now - lastTime);
      lastTime = now;
      const t = REDUCED ? 0 : now / 1000;

      // Kamera: leichte Parallaxe mit der Maus, beim Scrollen über das Feld nach vorn
      const r = hero.getBoundingClientRect();
      const scroll = REDUCED ? 0 : Math.min(1, Math.max(0, -r.top / r.height));
      const targetX = camBase.x + pointer.nx * 0.5;
      const targetY = camBase.y + pointer.ny * 0.15 - scroll * 0.5;
      camera.position.x += (targetX - camera.position.x) * 0.05;
      camera.position.y += (targetY - camera.position.y) * 0.05;
      camera.position.z = camBase.z - scroll * 5;
      camera.lookAt(LOOK);

      if (pointer.active && !REDUCED) {
        ndc.set(pointer.nx, pointer.ny);
        ray.setFromCamera(ndc, camera);
        if (ray.ray.intersectPlane(plane, hit)) materials.forEach((m) => m.uniforms.uMouse.value.set(hit.x, hit.z));
      } else {
        materials.forEach((m) => m.uniforms.uMouse.value.set(999, 999));
      }
      materials.forEach((m) => { m.uniforms.uTime.value = t; });
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  async function start() {
    if (!canvas || !supportsWebGL()) return;
    try {
      await loadScript(THREE_URL);
      if (!window.THREE) return;
      document.body.classList.add('gl-on');
      window.dispatchEvent(new Event('three:ready')); // weitere 3D-Szenen warten darauf
      build();
    } catch (error) {
      document.body.classList.remove('gl-on');
      console.warn('Hero-Effekt deaktiviert:', error);
    }
  }
  start();
})();
