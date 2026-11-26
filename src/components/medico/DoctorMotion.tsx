"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './doctor.module.css';

const MotionContext = createContext({ enabled: true, paused: false, toggle: () => {} });
export function useDoctorMotion() { return useContext(MotionContext); }

export function DoctorMotionButton() {
  const { paused, toggle } = useDoctorMotion();
  return <button type="button" className={styles.motionToggle} aria-pressed={paused} onClick={toggle}>{paused ? 'Ativar animações' : 'Pausar animações'}</button>;
}

export default function DoctorMotion({ children, className }: { children: ReactNode; className: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const enabled = !paused && !reduced;
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update(); preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!enabled) { root.current?.getAnimations({ subtree: true }).forEach(animation => animation.cancel()); return; }
    const active = new Set<Animation>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const animation = entry.target.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
        active.add(animation);
        animation.onfinish = animation.oncancel = () => { active.delete(animation); };
      }
    }, { threshold: .08 });
    root.current?.querySelectorAll('[data-doctor-reveal]').forEach(el => observer.observe(el));
    return () => { observer.disconnect(); active.forEach(animation => animation.cancel()); };
  }, [enabled]);
  return <MotionContext.Provider value={{ enabled, paused, toggle: () => setPaused(p => !p) }}><div ref={root} className={className} data-motion-paused={!enabled}>{children}</div></MotionContext.Provider>;
}
