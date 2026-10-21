/**
 * Kit motion Harmony — préréglages d'intensité.
 * « sobre » : élégant et discret · « dynamique » : vivant · « spectaculaire » : effet waouh assumé.
 * Les animations sont automatiquement neutralisées si le visiteur a activé « réduire les animations ».
 */
import { createContext, useContext } from 'react';

export const PRESETS = {
  sobre: { distance: 18, duration: 0.6, stagger: 0.06, parallax: 0.08, tilt: 0, magnetic: 0, pageShift: 8, scale: 1 },
  dynamique: { distance: 36, duration: 0.75, stagger: 0.09, parallax: 0.16, tilt: 6, magnetic: 0.25, pageShift: 18, scale: 0.98 },
  spectaculaire: { distance: 64, duration: 0.95, stagger: 0.12, parallax: 0.28, tilt: 10, magnetic: 0.4, pageShift: 32, scale: 0.94 },
};

export const EASE = [0.22, 1, 0.36, 1];

export const IntensityContext = createContext(PRESETS.dynamique);

export function useIntensity() {
  return useContext(IntensityContext);
}
