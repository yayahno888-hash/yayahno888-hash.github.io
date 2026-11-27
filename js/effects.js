// Animationen ohne 3D: Wörter in Überschriften, Zähler, kippende Projektkarte,
// Linie im Werdegang. Alles respektiert "Bewegung reduzieren".
(() => {
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(pointer: fine)').matches;

  /* 1. Überschriften in Wörter teilen (die Klasse "in" setzt der Scroll-Observer der Seite) */
  document.querySelectorAll('h2.split').forEach((h) => {
    const words = h.textContent.trim().split(/\s+/);
    h.setAttribute('aria-label', h.textContent.trim());
    h.innerHTML = words
      .map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`)
      .join(' ');
  });

  /* 2. Zahlen zählen hoch, sobald sie sichtbar werden */
  const counters = document.querySelectorAll('.proof b');
  const countUp = (el) => {
    const end = parseInt(el.textContent, 10);
    if (Number.isNaN(end) || REDUCED) return;
    const from = end > 1000 ? end - 30 : 0; // 2027 zählt von 1997 hoch, nicht von 0
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 1400);
      el.textContent = Math.round(from + (end - from) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const countObserver = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    countUp(e.target);
    countObserver.unobserve(e.target);
  }), { threshold: 0.6 });
  counters.forEach((c) => countObserver.observe(c));

  /* 3. Projektkarte kippt in 3D zur Maus, ein Lichtfleck folgt dem Zeiger */
  const card = document.querySelector('.case');
  if (card && FINE && !REDUCED) {
    let targetX = 0, targetY = 0, x = 0, y = 0, running = false;
    const animate = () => {
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      card.style.transform = `rotateX(${y}deg) rotateY(${x}deg) translateZ(0)`;
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.01) requestAnimationFrame(animate);
      else running = false;
    };
    const kick = () => { if (!running) { running = true; requestAnimationFrame(animate); } };
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      targetX = (px - 0.5) * 9;   // bis ±4,5° links/rechts
      targetY = -(py - 0.5) * 7;  // bis ±3,5° oben/unten
      card.style.setProperty('--gx', `${px * 100}%`);
      card.style.setProperty('--gy', `${py * 100}%`);
      kick();
    });
    card.addEventListener('pointerleave', () => { targetX = targetY = 0; kick(); });
  }

  /* 4. Werdegang: Linie füllt sich beim Scrollen, Punkte leuchten auf */
  const path = document.querySelector('.path');
  if (path) {
    const items = [...path.children];
    const update = () => {
      const r = path.getBoundingClientRect();
      const p = REDUCED ? 1 : Math.min(1, Math.max(0, (innerHeight * 0.75 - r.top) / r.height));
      path.style.setProperty('--p', p.toFixed(3));
      items.forEach((li) => li.classList.toggle('on', li.offsetTop + 30 <= p * r.height));
    };
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
  }
})();
