import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { apply } from '../lib/workbench-host.js';

test('public plugin serves only the available local media and supports seeking', async t => {
  const directory = await mkdtemp(join(process.cwd(), '.media-test-'));
  const routes = new Map();
  const oldOverride = process.env.GOJO_HARNESS_MEDIA_DIR;
  const server = createServer((request, response) => {
    const handler = routes.get(request.url);
    if (handler) handler(request, response);
    else response.writeHead(404).end();
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
    if (oldOverride === undefined) delete process.env.GOJO_HARNESS_MEDIA_DIR;
    else process.env.GOJO_HARNESS_MEDIA_DIR = oldOverride;
  });

  process.env.GOJO_HARNESS_MEDIA_DIR = directory;
  apply({
    inject(_services, mount) {
      mount({ effect: register => register(), webServer: {
        register({ path, handler }) { routes.set(path, handler); },
      } });
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/gojo-theme/`;
  const desktop = (path, options = {}) => fetch(base + path, {
    ...options, headers: { cookie: 'fixture=1', ...options.headers },
  });
  const track = 'records/specialz.m4a';

  assert.deepEqual(await (await desktop('local-media')).json(), []);
  assert.equal((await desktop('intro/v6/claim', { method: 'POST' })).status, 404);
  assert.equal((await desktop(track)).status, 404);
  assert.equal((await fetch(base + 'local-media')).status, 403);
  assert.equal((await desktop('local-media', { headers: { origin: 'https://example.test' } })).status, 403);
  assert.equal((await desktop('local-media', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(base + 'art/six-eyes.svg')).status, 200);

  await mkdir(join(directory, 'records'));
  await writeFile(join(directory, track), '0123456789');
  await symlink(join(directory, track), join(directory, 'records/kaikai-kitan.m4a'));
  assert.deepEqual(await (await desktop('local-media')).json(), ['/gojo-theme/' + track]);
  assert.equal((await desktop('records/kaikai-kitan.m4a')).status, 404);
  assert.equal((await desktop(track, { method: 'HEAD' })).headers.get('content-length'), '10');

  const range = await desktop(track, { headers: { range: 'bytes=2-5' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await range.text(), '2345');
  assert.equal((await desktop(track, { headers: { range: 'bytes=20-30' } })).status, 416);

  await writeFile(join(directory, 'intro.mp4'), 'fixture');
  assert.equal((await desktop('intro/v6/claim', { method: 'POST' })).status, 204);
  assert.equal((await desktop('intro/v6/claim', { method: 'POST' })).status, 409);
});
