import { motion, useReducedMotion } from 'motion/react';
import { EASE, useIntensity } from './intensity.js';

const DIRS = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0], none: [0, 0] };

/**
 * Apparition au scroll.
 * <Reveal from="up" delay={0.1}>…</Reveal>  — props : as ('div'), from (up|down|left|right|none), delay (s), once (true), scale (false)
 */
export function Reveal({ as = 'div', from = 'up', delay = 0, once = true, scale = false, className, children, ...rest }) {
  const p = useIntensity();
  const reduce = useReducedMotion();
  const Tag = motion[as] ?? motion.div;
  const [dx, dy] = DIRS[from] ?? DIRS.up;
  if (reduce) return <Tag className={className} {...rest}>{children}</Tag>;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, x: dx * p.distance, y: dy * p.distance, scale: scale ? p.scale : 1 }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once, amount: 0.2 }}
      transition={{ duration: p.duration, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
