import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useIntensity } from './intensity.js';

/**
 * Déplacement vertical léger lié au scroll.
 * <Parallax speed={1}>…</Parallax>   (speed : -2 à 2, multiplié par l'intensité)
 */
export function Parallax({ speed = 1, className, children }) {
  const ref = useRef(null);
  const p = useIntensity();
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const amount = 200 * p.parallax * speed;
  const y = useTransform(scrollYProgress, [0, 1], [amount, -amount]);
  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { y }}>
      {children}
    </motion.div>
  );
}

/**
 * Image avec parallaxe interne, sans recadrage destructif (agrandissement ≤ 12 %).
 * <ParallaxImage src="images/photo-01.webp" alt="…" className="hero-media" priority />
 */
export function ParallaxImage({ src, alt, className, priority = false, position = 'center', width, height }) {
  const ref = useRef(null);
  const p = useIntensity();
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const shift = Math.min(10, 40 * p.parallax);
  const y = useTransform(scrollYProgress, [0, 1], [`-${shift}%`, `${shift}%`]);
  return (
    <div ref={ref} className={className} style={{ overflow: 'hidden', position: 'relative' }}>
      <motion.img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        style={{ width: '100%', height: reduce ? '100%' : `${100 + shift * 2}%`, objectFit: 'cover', objectPosition: position, display: 'block', y: reduce ? 0 : y, marginTop: reduce ? 0 : `-${shift}%` }}
      />
    </div>
  );
}
