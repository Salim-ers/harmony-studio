import { motion, useReducedMotion } from 'motion/react';
import { EASE, useIntensity } from './intensity.js';

/**
 * Apparition en cascade d'une liste (cartes, prestations, galerie).
 * <Stagger className="grid"> <StaggerItem>…</StaggerItem> … </Stagger>
 */
export function Stagger({ as = 'div', className, children, delay = 0, ...rest }) {
  const p = useIntensity();
  const reduce = useReducedMotion();
  const Tag = motion[as] ?? motion.div;
  return (
    <Tag
      className={className}
      initial={reduce ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: p.stagger, delayChildren: delay } } }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({ as = 'div', className, children, ...rest }) {
  const p = useIntensity();
  const Tag = motion[as] ?? motion.div;
  return (
    <Tag
      className={className}
      variants={{ hidden: { opacity: 0, y: p.distance }, visible: { opacity: 1, y: 0, transition: { duration: p.duration, ease: EASE } } }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
