// Zwei weitere 3D-Szenen. Sie nutzen three.js, das hero.js schon lädt.
//  - "Netz": ein Ikosaeder aus Lichtpunkten und Linien (wie ein Datennetz), dreht sich beim Scrollen
//  - "Galaxie": Spiralarme aus Punkten hinter "Ausbildungsplatz frei?", folgt der Maus
// Jede Szene rendert nur, wenn ihr Abschnitt sichtbar ist.
(() => {
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
  const MAX_DPR = PHONE ? 1.5 : 2;
  const pointer = { x: 0, y: 0 }; // -1 … 1, für alle Szenen
  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /** Gemeinsames Gerüst: Renderer, Kamera, Größe, Sichtbarkeit, Schleife */
  function createScene(canvas, section, fov, onFrame) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !PHONE });
    renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
    const resize = () => {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(canvas);
    resize();

    let visible = false;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '100px 0px' }).observe(section);
    let start = 0;
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (!visible) return;
      if (!start) start = now;
      const r = section.getBoundingClientRect();
      const scroll = 1 - (r.top + r.height) / (innerHeight + r.height); // 0 = kommt rein, 1 = geht raus
      onFrame(((now - start) / 1000) * (REDUCED ? 0.4 : 1), scroll); // ruhiger, aber nicht eingefroren
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);
    return { scene, camera };
  }

  /* ---------- Netz: Ikosaeder aus Punkten und Kanten ---------- */
  function buildNet() {
    const canvas = document.getElementById('net');
    if (!canvas) return;
    const sprite = glowTexture();
    const { scene, camera } = createScene(canvas, document.getElementById('process'), 35, (t, scroll) => {
      outer.rotation.y = t * 0.12 + scroll * 2.4;
      outer.rotation.x = 0.3 + scroll * 0.8 + pointer.y * 0.15;
      inner.rotation.y = -t * 0.2 - scroll * 1.6;
      inner.rotation.z = t * 0.07;
      const pulse = 1 + Math.sin(t * 1.4) * 0.03; // Kern "atmet"
      inner.scale.setScalar(pulse);
      camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.05;
      camera.lookAt(0, 0, 0);
    });
    camera.position.set(0, 0, 8);

    const shell = (radius, detail, colour, opacity, size) => {
      const geo = new THREE.IcosahedronGeometry(radius, detail);
      const group = new THREE.Group();
      group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending }),
      ));
      // Eckpunkte als leuchtende "Knoten" (doppelte Punkte entfernen)
      const seen = new Set();
      const pts = [];
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        if (!seen.has(key)) { seen.add(key); pts.push(p.getX(i), p.getY(i), p.getZ(i)); }
      }
      const nodes = new THREE.BufferGeometry();
      nodes.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      group.add(new THREE.Points(nodes, new THREE.PointsMaterial({
        size, map: sprite, color: colour, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      })));
      return group;
    };
    const outer = shell(2.3, 2, 0xb9a4ff, 0.28, 0.16);
    const inner = shell(1.1, 1, 0x3ddc84, 0.45, 0.14);
    scene.add(outer, inner);
  }

  /* ---------- Galaxie: Spiralarme aus Punkten ---------- */
  function buildGalaxy() {
    const canvas = document.getElementById('galaxy');
    if (!canvas) return;
    const COUNT = PHONE ? 4000 : 11000;
    const ARMS = 3;
    const positions = new Float32Array(COUNT * 3);
    const colours = new Float32Array(COUNT * 3);
    const inside = new THREE.Color(0xf2efe8);
    const outside = new THREE.Color(0xb9a4ff);
    const accent = new THREE.Color(0xf0442e);
    for (let i = 0; i < COUNT; i++) {
      const r = Math.random() ** 1.6 * 7;                       // mehr Punkte innen
      const arm = ((i % ARMS) / ARMS) * Math.PI * 2;
      const twist = r * 0.9;                                    // Spirale: je weiter außen, desto mehr gedreht
      const spread = () => (Math.random() - 0.5) * (0.25 + r * 0.18);
      positions[i * 3] = Math.cos(arm + twist) * r + spread();
      positions[i * 3 + 1] = spread() * 0.5;
      positions[i * 3 + 2] = Math.sin(arm + twist) * r + spread();
      const c = inside.clone().lerp(outside, r / 7);
      if (Math.random() < 0.06) c.copy(accent);
      colours.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const galaxy = new THREE.Points(geo, new THREE.PointsMaterial({
      size: PHONE ? 0.07 : 0.05, map: glowTexture(), vertexColors: true, transparent: true,
      opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    galaxy.position.y = 1.1; // helles Zentrum hinter der Überschrift, nicht hinter dem Fließtext

    const { scene, camera } = createScene(canvas, document.getElementById('contact'), 50, (t, scroll) => {
      galaxy.rotation.y = t * 0.05 + scroll * 0.6;
      galaxy.rotation.x = 0.95 + pointer.y * 0.12;
      galaxy.rotation.z = pointer.x * 0.12;
      camera.position.z = 9 - scroll * 2; // beim Hinscrollen kommt die Galaxie näher
    });
    camera.position.set(0, 0, 9);
    scene.add(galaxy);
  }

  function start() {
    try { buildNet(); } catch (e) { console.warn('Netz-Szene aus:', e); }
    try { buildGalaxy(); } catch (e) { console.warn('Galaxie-Szene aus:', e); }
  }
  if (window.THREE) start();
  else addEventListener('three:ready', start, { once: true });
})();
