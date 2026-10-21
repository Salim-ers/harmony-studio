import { motion, useReducedMotion } from 'motion/react';
import { EASE, useIntensity } from './intensity.js';

/**
 * Titre révélé mot par mot (idéal pour le H1 du hero).
 * <TextReveal as="h1" text="Le goût du vrai pain." className="hero-title" />
 * Le texte reste lisible par les lecteurs d'écran (aria-label) et par les moteurs de recherche.
 */
export function TextReveal({ as = 'h2', text = '', className, delay = 0 }) {
  const p = useIntensity();
  const reduce = useReducedMotion();
  const Tag = as;
  if (reduce) return <Tag className={className}>{text}</Tag>;
  const words = String(text).split(' ');
  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, i) => (
        <span key={i} aria-hidden="true" style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.08em' }}>
          <motion.span
            style={{ display: 'inline-block' }}
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{ duration: p.duration, delay: delay + i * p.stagger, ease: EASE }}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
