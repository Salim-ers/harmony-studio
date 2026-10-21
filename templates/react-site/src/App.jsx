/**
 * Coquille de l'application (fournie par le kit Harmony, ne pas modifier) :
 * routeur, transitions de pages, intensité du motion, retour en haut de page, page 404.
 */
import { useEffect } from 'react';
import { BrowserRouter, HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { IntensityContext, PRESETS, PageTransition } from './motion/index.js';
import Layout from './components/Layout.jsx';
import { Seo } from './components/Kit.jsx';
import { routes } from './routes.js';
import site from './site.config.js';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <main className="hs-404">
      <Seo title="Page introuvable" description="Cette page n’existe pas." />
      <h1>Page introuvable</h1>
      <p><Link to="/">Revenir à l’accueil</Link></p>
    </main>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        {routes.map(({ path, Component }) => (
          <Route key={path} path={path} element={<PageTransition><Component /></PageTransition>} />
        ))}
        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
}

const basename = (() => {
  try { return new URL(document.baseURI).pathname.replace(/\/$/, ''); } catch { return ''; }
})();

export default function App() {
  // Dans l'aperçu Harmony Studio (iframe isolée), l'historique navigateur est indisponible : routeur par ancre.
  const Router = import.meta.env.HARMONY_PREVIEW ? HashRouter : BrowserRouter;
  const preset = PRESETS[site.motion] ?? PRESETS.dynamique;
  return (
    <MotionConfig reducedMotion="user">
      <IntensityContext.Provider value={preset}>
        <Router {...(import.meta.env.HARMONY_PREVIEW ? {} : { basename })}>
          <ScrollToTop />
          <Layout>
            <AnimatedRoutes />
          </Layout>
        </Router>
      </IntensityContext.Provider>
    </MotionConfig>
  );
}
