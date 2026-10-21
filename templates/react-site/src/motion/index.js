/**
 * KIT MOTION HARMONY — composants d'animation prêts à l'emploi.
 *   import { Reveal, Stagger, StaggerItem, TextReveal, Parallax, ParallaxImage, Magnetic, TiltCard, Marquee, CountUp, ScrollProgress } from '../motion';
 * Tous respectent prefers-reduced-motion. L'intensité se règle dans src/site.config.js (motion: 'sobre' | 'dynamique' | 'spectaculaire').
 */
export { Reveal } from './Reveal.jsx';
export { Stagger, StaggerItem } from './Stagger.jsx';
export { TextReveal } from './TextReveal.jsx';
export { Parallax, ParallaxImage } from './Parallax.jsx';
export { Magnetic, TiltCard, Marquee, CountUp } from './Interactive.jsx';
export { PageTransition, ScrollProgress } from './PageTransition.jsx';
export { PRESETS, EASE, IntensityContext, useIntensity } from './intensity.js';
