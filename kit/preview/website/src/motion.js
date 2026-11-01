import { useEffect, useRef, useState } from 'react';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

// Continuous values stay outside React rendering. Fixed substeps preserve the
// same damping at different refresh rates; the loop stops after the spring settles.
export function useSpringPointer({ tilt = false } = {}) {
  const box = useRef(null);
  const layer = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const parent = box.current;
    const el = layer.current;
    if (!parent || !el || reduced) { if (el) el.style.transform = ''; return; }
    let frame = 0, last = 0, x = 0, y = 0, vx = 0, vy = 0, tx = 0, ty = 0;
    const paint = now => {
      let remaining = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 120);
        vx += ((tx - x) * 170 - vx * 19) * dt;
        vy += ((ty - y) * 170 - vy * 19) * dt;
        x += vx * dt; y += vy * dt; remaining -= dt;
      }
      const jelly = Math.max(-.035, Math.min(.035, vx * .00008));
      el.style.transform = tilt
        ? `perspective(1800px) rotateX(${-y * .17}deg) rotateY(${x * .17}deg) translate3d(${x * .16}px,${y * .16}px,0)`
        : `translate3d(${x}px,${y}px,0) scale(${1 + jelly},${1 - jelly})`;
      if (Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) + Math.abs(vy) > .06) frame = requestAnimationFrame(paint);
      else { frame = 0; last = 0; }
    };
    const start = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const move = event => {
      if (event.pointerType !== 'mouse') return;
      const rect = parent.getBoundingClientRect();
      const gain = tilt ? 16 : 11;
      tx = Math.max(-gain, Math.min(gain, ((event.clientX - rect.left) / rect.width - .5) * gain * 2));
      ty = Math.max(-gain, Math.min(gain, ((event.clientY - rect.top) / rect.height - .5) * gain * 2));
      start();
    };
    const leave = () => { tx = 0; ty = 0; start(); };
    parent.addEventListener('pointermove', move);
    parent.addEventListener('pointerleave', leave);
    return () => { cancelAnimationFrame(frame); parent.removeEventListener('pointermove', move); parent.removeEventListener('pointerleave', leave); el.style.transform = ''; };
  }, [reduced, tilt]);
  return { box, layer };
}

export function useReveals(root, dependency) {
  const reduced = useReducedMotion();
  useEffect(() => {
    const elements = root.current?.querySelectorAll('[data-reveal]');
    if (!elements) return;
    if (reduced) { elements.forEach(el => el.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: .14 });
    elements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [dependency, reduced]);
}
