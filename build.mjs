import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['lib/workbench-client.js'],
  bundle: true,
  format: 'iife',
  globalName: 'gojoClient',
  loader: { '.css': 'text' },
  write: false,
});
await mkdir('build', { recursive: true });
await writeFile('build/client.js', `window.__ModuleLoader__.load({
  id: 'dsh-plugin-gojo-theme',
  factory: () => {
${outputFiles[0].text}
    return gojoClient;
  }
});\n`);
