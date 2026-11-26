"use client";

import { useEffect, useRef, type ReactNode } from 'react';

export default function PatientMotion({ children, className }: { children: ReactNode; className: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const active = new Set<Animation>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (preference.matches) continue;
        const animation = entry.target.animate([
          { opacity: .25, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 480, easing: 'cubic-bezier(.2,.65,.3,1)' });
        active.add(animation);
        const clear = () => active.delete(animation);
        animation.onfinish = clear; animation.oncancel = clear;
      }
    }, { threshold: .08 });
    root.current?.querySelectorAll('[data-patient-reveal]').forEach(element => observer.observe(element));
    const stop = () => { if (preference.matches) { active.forEach(animation => animation.cancel()); active.clear(); } };
    preference.addEventListener('change', stop);
    return () => { observer.disconnect(); preference.removeEventListener('change', stop); active.forEach(animation => animation.cancel()); };
  }, []);
  return <div ref={root} className={className}>{children}</div>;
}
