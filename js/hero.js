// Erster Bildschirm: Tausende Lichtpunkte fliegen herein und formen den Namen.
// Die Maus schiebt sie weg (wie Wind), beim Scrollen fliegen sie auseinander.
// Ohne WebGL bleibt der Name als normaler Text stehen (siehe .name im CSS).
(() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
  const canvas = document.getElementById('gl');
  const hero = document.getElementById('hero');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
  const COUNT = PHONE ? 7000 : 18000; // Punkte im Namen
  const STARS = PHONE ? 500 : 1400;  // ferne Punkte im Hintergrund
  const TEXT_WIDTH = 10;             // Breite des Namens in 3D-Einheiten
  const FLY_IN = 2.2;                // Sekunden bis der Name steht

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

  /** Schreibt den Namen auf ein unsichtbares Canvas und sammelt die Pixel, die zur Schrift gehören */
  function sampleName(lines) {
    const W = 1200;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = '800 100px Unbounded, sans-serif';
    const widest = Math.max(...lines.map((l) => probe.measureText(l).width));
    const size = Math.floor((100 * W * 0.96) / widest); // Schrift so groß, dass die längste Zeile passt
    const lineHeight = size * 1.02;
    const H = Math.ceil(lines.length * lineHeight + size * 0.3);

    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.font = `800 ${size}px Unbounded, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lineHeight));

    const data = ctx.getImageData(0, 0, W, H).data;
    const points = [];
    for (let y = 0; y < H; y += 3) {
      for (let x = 0; x < W; x += 3) {
        if (data[(y * W + x) * 4 + 3] > 140) points.push([x, y]);
      }
    }
    return { points, W, H };
  }

  /** Runder, weicher Lichtpunkt als Textur */
  function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  function build() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1.5 : 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 11);
    const group = new THREE.Group();
    scene.add(group);
    const sprite = glowTexture();

    // --- Punkte des Namens: Start (zufällige Wolke) und Ziel (Pixel der Schrift) ---
    const { points, W, H } = sampleName(['KYRYLO', 'YAKHNO']);
    const start = new Float32Array(COUNT * 3);
    const target = new Float32Array(COUNT * 3);
    const scatterDir = new Float32Array(COUNT * 3); // Richtung beim Auseinanderfliegen
    const offset = new Float32Array(COUNT * 3);     // Verschiebung durch die Maus
    const delay = new Float32Array(COUNT);
    const position = new Float32Array(COUNT * 3);
    const colour = new Float32Array(COUNT * 3);
    const palette = [[0.95, 0.94, 0.91], [0.95, 0.94, 0.91], [0.95, 0.94, 0.91], [0.73, 0.64, 1.0], [0.55, 0.82, 1.0]];

    for (let i = 0; i < COUNT; i++) {
      const [px, py] = points[(Math.random() * points.length) | 0];
      target[i * 3] = (px / W - 0.5) * TEXT_WIDTH + (Math.random() - 0.5) * 0.03;
      target[i * 3 + 1] = -((py - H / 2) / W) * TEXT_WIDTH + (Math.random() - 0.5) * 0.03;
      target[i * 3 + 2] = (Math.random() - 0.5) * 0.35;

      // Start irgendwo in einer großen Kugel um die Kamera
      const r = 6 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      start[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      start[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      start[i * 3 + 2] = r * Math.cos(phi) - 4;

      const len = Math.hypot(target[i * 3], target[i * 3 + 1], 1) || 1;
      scatterDir[i * 3] = target[i * 3] / len + (Math.random() - 0.5) * 0.6;
      scatterDir[i * 3 + 1] = target[i * 3 + 1] / len + (Math.random() - 0.5) * 0.6;
      scatterDir[i * 3 + 2] = 0.6 + Math.random();

      delay[i] = Math.random() * 0.9;
      const c = palette[(Math.random() * palette.length) | 0];
      colour.set(c, i * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(REDUCED ? target.slice() : start.slice(), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    const material = new THREE.PointsMaterial({
      size: PHONE ? 0.075 : 0.06, map: sprite, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    group.add(new THREE.Points(geometry, material));

    // --- Ferne Punkte für Tiefe ---
    const starPos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 60;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 36;
      starPos[i * 3 + 2] = -6 - Math.random() * 30;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 0.09, map: sprite, color: 0x8f86b8, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    scene.add(stars);

    // --- Größe: Name so skalieren, dass er in den Bildschirm passt ---
    function resize() {
      const w = hero.clientWidth;
      const h = hero.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const visibleH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      const visibleW = visibleH * camera.aspect;
      const nameH = (TEXT_WIDTH * H) / W;
      const scale = Math.min(visibleW * 0.88 / TEXT_WIDTH, visibleH * 0.5 / nameH);
      group.scale.setScalar(scale);
      group.position.y = visibleH * (w < 700 ? 0.06 : 0.04); // etwas über der Mitte, unten steht Text
    }
    new ResizeObserver(resize).observe(hero);
    resize();

    // --- Maus in 3D-Koordinaten der Namensebene umrechnen ---
    const mouse = { x: 999, y: 999, nx: 0, ny: 0 };
    const v = new THREE.Vector3();
    hero.addEventListener('pointermove', (e) => {
      const rect = hero.getBoundingClientRect();
      mouse.nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      v.set(mouse.nx, mouse.ny, 0.5).unproject(camera).sub(camera.position).normalize();
      const dist = -camera.position.z / v.z; // Schnittpunkt mit der Ebene z = 0
      const p = camera.position.clone().add(v.multiplyScalar(dist));
      mouse.x = (p.x - group.position.x) / group.scale.x;
      mouse.y = (p.y - group.position.y) / group.scale.y;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = 999; });

    // Nur rendern, solange der erste Bildschirm sichtbar ist
    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(hero);

    const easeOutCubic = (x) => 1 - (1 - x) ** 3;
    const RADIUS = 1.1;
    const pos = geometry.attributes.position.array;
    let startTime = 0;
    let lastTime = 0;
    let slowFrames = 0;
    let active = COUNT; // so viele Punkte werden gerade gezeichnet

    /**
     * Läuft das Gerät dauerhaft unter ~40 Bildern pro Sekunde, zeichnen wir
     * weniger Punkte und mit weniger Schärfe. Flüssig ist wichtiger als dicht.
     */
    function adaptQuality(frameMs) {
      if (document.hidden || frameMs > 1000) return;
      if (frameMs > 25) slowFrames++;
      else if (frameMs < 18) slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames < 20) return;
      slowFrames = 0;
      if (renderer.getPixelRatio() > 1) {
        renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.5));
        resize();
      } else if (active > 3000) {
        active = Math.max(3000, Math.floor(active * 0.6));
        geometry.setDrawRange(0, active);
      }
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible) return;
      if (!startTime) startTime = now;
      const t = (now - startTime) / 1000;
      if (lastTime) adaptQuality(now - lastTime);
      lastTime = now;

      if (!REDUCED) {
        // Beim Scrollen aus dem ersten Bildschirm fliegen die Punkte auseinander
        const rect = hero.getBoundingClientRect();
        const scatter = Math.min(1, Math.max(0, -rect.top / (rect.height * 0.75))) ** 1.6 * 7;

        for (let i = 0; i < active; i++) {
          const i3 = i * 3;
          const k = easeOutCubic(Math.min(1, Math.max(0, (t - delay[i]) / FLY_IN)));
          let x = start[i3] + (target[i3] - start[i3]) * k;
          let y = start[i3 + 1] + (target[i3 + 1] - start[i3 + 1]) * k;
          let z = start[i3 + 2] + (target[i3 + 2] - start[i3 + 2]) * k;
          // leichtes Atmen, damit der Name lebt
          x += Math.sin(t * 0.9 + i) * 0.012 * k;
          y += Math.cos(t * 0.7 + i * 1.3) * 0.012 * k;

          // Maus drückt Punkte im Umkreis weg und etwas zur Kamera hin
          const dx = x - mouse.x;
          const dy = y - mouse.y;
          const d2 = dx * dx + dy * dy;
          let px = 0, py = 0, pz = 0;
          if (d2 < RADIUS * RADIUS) {
            const d = Math.sqrt(d2) || 0.001;
            const f = (1 - d / RADIUS) ** 2 * 0.9;
            px = (dx / d) * f;
            py = (dy / d) * f;
            pz = f * 1.2;
          }
          // weich nachziehen (Feder), statt hart zu springen
          offset[i3] += (px - offset[i3]) * 0.1;
          offset[i3 + 1] += (py - offset[i3 + 1]) * 0.1;
          offset[i3 + 2] += (pz - offset[i3 + 2]) * 0.1;

          pos[i3] = x + offset[i3] + scatterDir[i3] * scatter;
          pos[i3 + 1] = y + offset[i3 + 1] + scatterDir[i3 + 1] * scatter;
          pos[i3 + 2] = z + offset[i3 + 2] + scatterDir[i3 + 2] * scatter;
        }
        geometry.attributes.position.needsUpdate = true;
        stars.rotation.y = t * 0.01;
        // Kamera folgt der Maus ein wenig (Parallaxe, wirkt räumlich)
        camera.position.x += (mouse.nx * 0.7 - camera.position.x) * 0.04;
        camera.position.y += (mouse.ny * 0.4 - camera.position.y) * 0.04;
        camera.lookAt(0, group.position.y * 0.5, 0);
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  async function start() {
    if (!canvas || !supportsWebGL()) return;
    try {
      await Promise.all([
        loadScript(THREE_URL),
        document.fonts ? document.fonts.load('800 100px Unbounded') : Promise.resolve(),
      ]);
      if (!window.THREE) return;
      document.body.classList.add('gl-on');
      build();
    } catch (error) {
      document.body.classList.remove('gl-on');
      console.warn('Hero-Effekt deaktiviert:', error);
    }
  }
  start();
})();
