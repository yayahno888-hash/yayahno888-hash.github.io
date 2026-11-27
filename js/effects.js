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
    if (Number.isNaN(end)) return;
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
  if (card && FINE) { // kleine Bewegung, nur wenn der Nutzer selbst die Maus bewegt
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

  /* 5. Fortschrittsbalken oben und aktiver Abschnitt in der Navigation */
  const bar = document.getElementById('progress');
  const navLinks = [...document.querySelectorAll('.nav a')];
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute('href')));
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.setProperty('--s', (max > 0 ? scrollY / max : 0).toFixed(4));
    let current = -1;
    sections.forEach((sec, i) => { if (sec && sec.getBoundingClientRect().top < innerHeight * 0.4) current = i; });
    navLinks.forEach((a, i) => a.classList.toggle('on', i === current));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* 7. Magnetische Knöpfe: ziehen sich leicht zur Maus */
  if (FINE && !REDUCED) {
    document.querySelectorAll('.mail, .contact a.b').forEach((el) => {
      el.classList.add('btn-mag');
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.3;
        const y = (e.clientY - r.top - r.height / 2) * 0.4;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* Menü auf dem Handy: auf- und zuklappen, nach Klick auf einen Link oder mit Escape schließen */
  const header = document.getElementById('top');
  const menuButton = document.querySelector('.menu-btn');
  if (menuButton) {
    const setOpen = (open) => {
      header.classList.toggle('open', open);
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.textContent = open ? 'Schließen' : 'Menü';
    };
    menuButton.addEventListener('click', () => setOpen(!header.classList.contains('open')));
    document.querySelectorAll('.nav a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
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
