"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { slides } from './slides';
import styles from './presentation.module.css';

export default function Presentation() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [duration, setDuration] = useState(270);
  const [elapsed, setElapsed] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const elapsedRef = useRef(0);
  const [cycles, setCycles] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [narrate, setNarrate] = useState(false);
  const [notice, setNotice] = useState('');
  const current = slides[index];
  const stepDuration = duration * 1000 / slides.length;
  const progress = Math.min(elapsed / stepDuration, 1);
  const active = playing && visible;

  const jump = useCallback((next: number) => {
    elapsedRef.current = 0; setElapsed(0);
    setEpoch(e => e + 1);
    setIndex((next + slides.length) % slides.length);
  }, []);

  useEffect(() => {
    if (!active) return;
    const start = performance.now() - elapsedRef.current;
    const timer = window.setInterval(() => {
      const next = performance.now() - start;
      if (next >= stepDuration) {
        if (index === slides.length - 1) setCycles(c => c + 1);
        jump(index + 1);
      } else { elapsedRef.current = next; setElapsed(next); }
    }, 100);
    return () => window.clearInterval(timer);
  }, [active, index, stepDuration, jump, epoch]);

  useEffect(() => {
    for (const image of new Set(slides.map(slide => slide.image))) {
      const preload = new Image(); preload.src = `/apresentacao/${image}.webp`;
    }
  }, []);

  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    const full = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', full);
    visibility();
    return () => { document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', full); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('button, a, select, input, textarea')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); jump(index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); jump(index - 1); }
      if (event.code === 'Space') { event.preventDefault(); setStarted(true); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, jump]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => {
      const local = speechSynthesis.getVoices().filter(v => v.localService && v.lang.startsWith('pt'));
      setVoice(local.find(v => v.lang === 'pt-BR') ?? local[0] ?? null);
    };
    update(); speechSynthesis.addEventListener('voiceschanged', update);
    return () => { speechSynthesis.removeEventListener('voiceschanged', update); speechSynthesis.cancel(); };
  }, []);

  useEffect(() => {
    if (!voice || !narrate || !active) return;
    speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(current.narration);
    speech.voice = voice; speech.lang = voice.lang; speech.rate = 1.08;
    speechSynthesis.speak(speech);
    return () => speechSynthesis.cancel();
  }, [current, voice, narrate, active, epoch]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setNotice('');
    } catch { setNotice('Use F11 para colocar o navegador em tela cheia.'); }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}><img src="/fotos/logo-transparente.png" alt="" width="40" height="40" /><strong>ClínicaFlow</strong><span>Modo feira</span></Link>
      <div className={styles.settings}>
        <label>Duração do ciclo<select aria-label="Duração da apresentação" value={duration} onChange={e => {setDuration(Number(e.target.value));elapsedRef.current=0;setElapsed(0);}}><option value={240}>4 minutos</option><option value={270}>4 min e 30 s</option><option value={300}>5 minutos</option></select></label>
        <button type="button" aria-pressed={narrate} disabled={!voice} title={voice ? 'Usar a voz em português instalada no computador, sem internet' : 'Voz local em português indisponível neste navegador. As legendas funcionam normalmente.'} onClick={() => setNarrate(n => !n)}>Narração {narrate ? 'ligada' : 'desligada'}</button>
        <button type="button" onClick={toggleFullscreen}>{fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} <span aria-hidden="true">⛶</span></button>
      </div>
    </header>

    <div className={styles.progress} aria-label={`Etapa ${index + 1} de ${slides.length}`}>
      {slides.map((slide, i) => <button key={slide.label} type="button" aria-label={`Ir para ${slide.label}`} aria-current={i === index ? 'step' : undefined} onClick={() => jump(i)}><span style={{ transform: `scaleX(${i < index ? 1 : i === index ? progress : 0})` }} /></button>)}
    </div>

    <section className={styles.stage} aria-label="Apresentação do ClínicaFlow">
      <div className={styles.screen}>
        <div className={styles.browserBar}><span aria-hidden="true">● ● ●</span><span>ClínicaFlow / {current.label}</span><span>Tela real do projeto</span></div>
        <div className={styles.capture} key={current.image + index}>
          <img src={`/apresentacao/${current.image}.webp`} alt={`Captura da tela: ${current.label}, com dados fictícios de apresentação`} width={1440} height={1000} />
        </div>
      </div>
      <aside className={styles.story} key={index}>
        <span className={styles.step}>{String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')} · {current.label}</span>
        <h1>{current.title}</h1>
        <p>{current.description}</p>
        <ul>{current.points.map(point => <li key={point}><span aria-hidden="true">✓</span>{point}</li>)}</ul>
        <details className={styles.script}><summary>Ler roteiro desta etapa</summary><p>{current.narration}</p></details>
        {!started && <div className={styles.start}><p>Um percurso de 4 a 5 minutos, que recomeça sozinho.</p><button type="button" onClick={() => {setStarted(true);setPlaying(true);}}>Começar apresentação <span aria-hidden="true">▶</span></button></div>}
        {index === slides.length - 1 && <Link href="/" className={styles.explore}>Abrir o site para demonstrar →</Link>}
      </aside>
    </section>

    <footer className={styles.controls}>
      <div className={styles.status}><span className={active ? styles.running : styles.idle} aria-hidden="true" /><div><strong>{!started ? 'Pronto para apresentar' : !playing ? 'Apresentação pausada' : !visible ? 'Pausada enquanto a aba está oculta' : 'Apresentação automática'}</strong><small>Repetição contínua{cycles > 0 ? ` · ${cycles} ciclo${cycles > 1 ? 's' : ''} concluído${cycles > 1 ? 's' : ''}` : ''}</small></div></div>
      <div className={styles.playback}>
        <button type="button" aria-label="Etapa anterior" onClick={() => jump(index - 1)}>←</button>
        <button type="button" className={styles.play} onClick={() => {setStarted(true);setPlaying(p => !p);}} aria-pressed={playing}>{playing ? 'Ⅱ Pausar' : '▶ Continuar'}</button>
        <button type="button" aria-label="Próxima etapa" onClick={() => jump(index + 1)}>→</button>
        <button type="button" className={styles.restart} onClick={() => {jump(0);setCycles(0);setStarted(true);setPlaying(true);}}>Reiniciar</button>
      </div>
      <span className={styles.remaining}>{index + 1}/{slides.length} · {Math.max(0, Math.ceil((stepDuration - elapsed) / 1000))} s nesta etapa</span>
    </footer>
    <div className={styles.footnote}><span>Capturas com dados fictícios. A exibição não cria nem altera consultas.</span><span>Setas: navegar · Espaço: pausar · Esc: sair da tela cheia</span></div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
  </main>;
}
