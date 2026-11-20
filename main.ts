// NEON COAST — Vice Cover Studio: entrypoint.
//
// Copies the static app (app/) and the screenshots (screenshots/) into the
// output directory the harness names (MAKEFUN_OUTPUT_DIR, default /output)
// and writes dossier.json there with the vendored buildDossier, byte for
// byte what the scorer recomputes from the same tree.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// Safety: never let the output directory point at the repository root or
// at a source directory itself — the wipe below would eat what it copies.
// (A scratch dir inside the repo, e.g. MAKEFUN_OUTPUT_DIR=out, is fine.)
const protectedDirs = [repoRoot, join(repoRoot, 'app'), join(repoRoot, 'screenshots'), join(repoRoot, 'vendor')];
if (protectedDirs.includes(outputDir)) {
  throw new Error(`refusing to use a source directory as the output directory: ${outputDir}`);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'app'), join(outputDir, 'app'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`neon-coast: copied app/ + screenshots/ to ${outputDir} and wrote dossier.json (${dossier.length} bytes)`);
