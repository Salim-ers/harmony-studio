/**
 * Runner ISOLÉ pour construire et tester les applications générées : Vercel Sandbox
 * (micro-VM Firecracker éphémère). Le code généré n'est JAMAIS exécuté dans Harmony Studio.
 * - Aucun secret de l'application mère n'est transmis (env vide).
 * - Réseau limité au registre npm pendant l'installation, puis coupé (deny-all) pour build/tests.
 * - Délais bornés, ressources bornées, arrêt systématique de la sandbox.
 * Coût : facturé par Vercel selon l'usage (CPU/mémoire/temps) — voir DEPLOYMENT.md.
 */
import { sandboxConfigured } from '../env';
import type { GenFile } from '../ai/fileformat';

export type BuildStep = { name: string; command: string; exitCode: number | null; output: string; durationMs: number };
export type BuildReport = { executed: boolean; ok: boolean; steps: BuildStep[]; reason?: string; ran_at: string };

const TAIL = (s: string, n = 6000) => (s.length > n ? '…\n' + s.slice(-n) : s);

export async function buildInSandbox(files: GenFile[], opts: { timeoutMs?: number } = {}): Promise<BuildReport> {
  const ran_at = new Date().toISOString();
  if (!sandboxConfigured()) {
    return { executed: false, ok: false, steps: [], ran_at, reason: 'Runner isolé non configuré (SANDBOX_ENABLED=1 et identifiants Vercel Sandbox requis). Le code a été généré mais n’a été ni installé, ni compilé, ni testé : il ne peut pas être considéré comme fonctionnel.' };
  }
  const { Sandbox } = await import('@vercel/sandbox');
  const credentials = process.env.VERCEL_OIDC_TOKEN ? {} : { teamId: process.env.SANDBOX_VERCEL_TEAM_ID!, projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!, token: process.env.SANDBOX_VERCEL_TOKEN! };
  const sandbox = await Sandbox.create({
    ...credentials,
    timeout: Math.min(opts.timeoutMs ?? 12 * 60_000, 30 * 60_000),
    resources: { vcpus: 2 },
    networkPolicy: { allow: ['registry.npmjs.org', '*.npmjs.org'] },
    env: {},
  } as Parameters<typeof Sandbox.create>[0]);
  const steps: BuildStep[] = [];
  try {
    await sandbox.writeFiles(files.map((f) => ({ path: f.path, content: Buffer.from(f.content) })));
    const run = async (name: string, cmd: string, args: string[], timeoutMs: number) => {
      const start = Date.now();
      try {
        const done = await sandbox.runCommand(cmd, args, { timeoutMs });
        const output = await done.output('both');
        steps.push({ name, command: [cmd, ...args].join(' '), exitCode: done.exitCode, output: TAIL(output), durationMs: Date.now() - start });
        return done.exitCode === 0;
      } catch (e) {
        steps.push({ name, command: [cmd, ...args].join(' '), exitCode: null, output: e instanceof Error ? e.message.slice(0, 2000) : 'Erreur', durationMs: Date.now() - start });
        return false;
      }
    };
    const hasLock = files.some((f) => f.path === 'package-lock.json');
    const installed = await run('Installation des dépendances', 'npm', [hasLock ? 'ci' : 'install', '--no-audit', '--no-fund', '--ignore-scripts'], 6 * 60_000);
    // Le code généré (build, tests) ne doit JAMAIS s'exécuter avec un accès réseau : si la coupure échoue, on arrête.
    try {
      await sandbox.updateNetworkPolicy('deny-all');
    } catch (e) {
      steps.push({ name: 'Coupure du réseau', command: 'updateNetworkPolicy(deny-all)', exitCode: null, output: `Échec de la coupure réseau : construction annulée par sécurité. ${e instanceof Error ? e.message.slice(0, 500) : ''}`, durationMs: 0 });
      return { executed: false, ok: false, steps, ran_at, reason: 'Coupure réseau impossible : le build n’a pas été exécuté.' };
    }
    if (!installed) return { executed: true, ok: false, steps, ran_at };
    const pkg = JSON.parse(files.find((f) => f.path === 'package.json')?.content ?? '{}') as { scripts?: Record<string, string> };
    let ok = true;
    if (pkg.scripts?.typecheck) ok = (await run('Vérification des types', 'npm', ['run', 'typecheck'], 4 * 60_000)) && ok;
    if (pkg.scripts?.lint) ok = (await run('Lint', 'npm', ['run', 'lint'], 3 * 60_000)) && ok;
    ok = (await run('Build', 'npm', ['run', 'build'], 8 * 60_000)) && ok;
    if (pkg.scripts?.test) ok = (await run('Tests', 'npm', ['test', '--', '--run'], 5 * 60_000)) && ok;
    return { executed: true, ok, steps, ran_at };
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}
