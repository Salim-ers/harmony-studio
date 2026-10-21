import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useIntensity } from './intensity.js';

const finePointer = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

/**
 * Élément « magnétique » : suit légèrement le curseur (boutons d'appel à l'action).
 * <Magnetic><a className="btn" href="…">Nous contacter</a></Magnetic>
 */
export function Magnetic({ children, className, strength = 1 }) {
  const p = useIntensity();
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 });
  if (reduce || !p.magnetic) return <span className={className} style={{ display: 'inline-block' }}>{children}</span>;
  const onMove = (e) => {
    if (!finePointer()) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * p.magnetic * strength);
    y.set((e.clientY - r.top - r.height / 2) * p.magnetic * strength);
  };
  const reset = () => { x.set(0); y.set(0); };
  return (
    <motion.span className={className} style={{ display: 'inline-block', x, y }} onPointerMove={onMove} onPointerLeave={reset}>
      {children}
    </motion.span>
  );
}

/**
 * Carte avec inclinaison 3D au survol (souris uniquement).
 * <TiltCard className="card">…</TiltCard>
 */
export function TiltCard({ children, className, as = 'div', ...rest }) {
  const p = useIntensity();
  const reduce = useReducedMotion();
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [p.tilt, -p.tilt]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-p.tilt, p.tilt]), { stiffness: 200, damping: 20 });
  const Tag = motion[as] ?? motion.div;
  if (reduce || !p.tilt) return <Tag className={className} {...rest}>{children}</Tag>;
  return (
    <Tag
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      whileHover={{ y: -6 }}
      onPointerMove={(e) => {
        if (!finePointer()) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width);
        my.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => { mx.set(0.5); my.set(0.5); }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Bandeau défilant en continu (mots-clés, prestations). Se met en pause au survol ; statique si mouvement réduit.
 * <Marquee items={['Pain au levain', 'Viennoiseries', 'Gâteaux sur commande']} />
 */
export function Marquee({ items = [], speed = 40, className, separator = '•' }) {
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const content = items.flatMap((item, i) => [<span key={`i${i}`}>{item}</span>, <span key={`s${i}`} aria-hidden="true">{separator}</span>]);
  if (reduce) return <div className={className} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>{content}</div>;
  return (
    <div className={className} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div aria-hidden="false" style={{ display: 'inline-flex', gap: '2rem', animation: `hs-marquee ${speed}s linear infinite`, animationPlayState: paused ? 'paused' : 'running' }}>
        <div style={{ display: 'inline-flex', gap: '2rem' }}>{content}</div>
        <div style={{ display: 'inline-flex', gap: '2rem' }} aria-hidden="true">{content}</div>
      </div>
    </div>
  );
}

/**
 * Compteur animé. À utiliser UNIQUEMENT avec un chiffre réel fourni par le client.
 * <CountUp value={1250} suffix=" clients" />
 */
export function CountUp({ value, suffix = '', prefix = '', duration = 1.6, className, locale = 'fr-FR' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const target = Number(value);
  const [shown, setShown] = useState(reduce ? target : 0);
  useEffect(() => {
    if (!inView || reduce || !Number.isFinite(target)) return;
    const controls = animate(0, target, { duration, ease: 'easeOut', onUpdate: (v) => setShown(v) });
    return () => controls.stop();
  }, [inView, reduce, target, duration]);
  if (!Number.isFinite(target)) return null;
  const decimals = Number.isInteger(target) ? 0 : 1;
  return <span ref={ref} className={className}>{prefix}{shown.toLocaleString(locale, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}{suffix}</span>;
}
