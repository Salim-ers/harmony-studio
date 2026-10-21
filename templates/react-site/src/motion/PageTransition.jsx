import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { EASE, useIntensity } from './intensity.js';

/** Transition d'entrée/sortie entre les pages (utilisée automatiquement par App.jsx). */
export function PageTransition({ children }) {
  const p = useIntensity();
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: p.pageShift, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -p.pageShift / 2, filter: 'blur(4px)' }}
      transition={{ duration: p.duration * 0.7, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Barre de progression de lecture en haut de page. <ScrollProgress /> */
export function ScrollProgress({ className = 'hs-scroll-progress' }) {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, restDelta: 0.001 });
  if (reduce) return null;
  return <motion.div className={className} style={{ scaleX, transformOrigin: '0% 50%' }} aria-hidden="true" />;
}
