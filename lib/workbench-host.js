import { constants, createReadStream, lstatSync, openSync, fstatSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { pipeline } from 'node:stream';
import { introVideo, localMedia, themeRoot } from './workbench-media.js';

export const name = 'gojo-theme';

const bundled = [
  ['fonts/v2/yuji-boku.woff', 'yuji-boku.woff', 'font/woff'],
  ['fonts/v2/wenkai.woff', 'wenkai.woff', 'font/woff'],
  ['art/ink-sidebar.webp', 'ink-sidebar.webp', 'image/webp'],
  ['art/ink-right.webp', 'ink-right.webp', 'image/webp'],
  ['art/ink-center.webp', 'ink-center.webp', 'image/webp'],
  ['art/six-eyes.svg', 'six-eyes.svg', 'image/svg+xml'],
  ['records/ice-vinyl.webp', 'records/ice-vinyl.webp', 'image/webp'],
  ['fork-domain/paper.webp', 'fork-domain/paper.webp', 'image/webp'],
  ['streams/v1/orbs.webp', 'stream-orbs.webp', 'image/webp'],
];

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = !match[1] || !match[2] ? size - 1 : Math.min(size - 1, Number(match[2]));
  return Number.isSafeInteger(start) && start < size && end >= start ? { start, end } : null;
}

function desktopRequest(headers) {
  // DSH forwards the desktop scheme through its authenticated loopback host.
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(headers.host ?? '') &&
    !headers.origin && !headers['sec-fetch-site'] && Boolean(headers.cookie);
}

function openAsset(file, localRoot) {
  try {
    if (localRoot && (!lstatSync(localRoot).isDirectory() || !lstatSync(dirname(file)).isDirectory())) return;
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = fstatSync(fd);
      if (stat.isFile() && stat.size > 0) return { fd, size: stat.size };
    } catch {
      // Treat unavailable local files as absent.
    }
    closeSync(fd);
  } catch {
    // Missing slots are normal in the public edition.
  }
}

function mediaHandler(request, response, file, type, localRoot) {
  if (localRoot && !desktopRequest(request.headers)) {
    response.writeHead(403).end();
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  const asset = openAsset(file, localRoot);
  if (!asset) {
    response.writeHead(404, { 'cache-control': 'no-store' }).end();
    return;
  }
  const { fd, size } = asset;
  const seekable = /^(audio|video)\//.test(type);
  const requestedRange = seekable && request.headers.range;
  const range = requestedRange && byteRange(requestedRange, size);
  if (requestedRange && !range) {
    closeSync(fd);
    response.writeHead(416, { 'accept-ranges': 'bytes', 'content-range': `bytes */${size}` }).end();
    return;
  }
  const headers = {
    'content-type': type,
    'content-length': range ? range.end - range.start + 1 : size,
    'cache-control': localRoot ? 'no-store' : 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  };
  if (seekable) headers['accept-ranges'] = 'bytes';
  if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${size}`;
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === 'HEAD') {
    closeSync(fd);
    response.end();
  } else {
    pipeline(createReadStream(null, { fd, ...(range || {}) }), response, () => {});
  }
}

export function apply(ctx) {
  const override = process.env.GOJO_HARNESS_MEDIA_DIR;
  const directory = override && isAbsolute(override) ? override : join(homedir(), '.config', 'gojo-harness', 'media');
  const slots = localMedia.map(({ url, file, type }) => ({ url, file: join(directory, file), type }));
  const noCache = { 'cache-control': 'no-store' };
  let introClaimed = false;

  function available(slot) {
    const asset = openAsset(slot.file, directory);
    if (!asset) return false;
    closeSync(asset.fd);
    return true;
  }

  ctx.inject(['webServer'], scope => {
    function register(path, handler) {
      scope.effect(() => scope.webServer.register({ kind: 'exact', path, handler }));
    }
    register(themeRoot + 'local-media', (request, response) => {
      if (!desktopRequest(request.headers)) return response.writeHead(403, noCache).end();
      if (request.method !== 'GET') return response.writeHead(405, { ...noCache, allow: 'GET' }).end();
      const urls = slots.filter(available).map(slot => slot.url);
      response.writeHead(200, {
        ...noCache, 'content-type': 'application/json', 'x-content-type-options': 'nosniff',
      }).end(JSON.stringify(urls));
    });

    register(themeRoot + 'intro/v6/claim', (request, response) => {
      if (!desktopRequest(request.headers)) return response.writeHead(403, noCache).end();
      if (request.method !== 'POST') return response.writeHead(405, { ...noCache, allow: 'POST' }).end();
      if (introClaimed) return response.writeHead(409, noCache).end();
      if (!available(slots.find(slot => slot.url === introVideo))) return response.writeHead(404, noCache).end();
      introClaimed = true;
      response.writeHead(204, noCache).end();
    });

    for (const [path, file, type] of bundled) {
      const url = new URL('../assets/workbench/' + file, import.meta.url);
      register(themeRoot + path, (request, response) => mediaHandler(request, response, url, type));
    }
    for (const { url, file, type } of slots) {
      register(url, (request, response) => mediaHandler(request, response, file, type, directory));
    }
  });
}
