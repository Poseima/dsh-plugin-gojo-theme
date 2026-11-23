import { visibleApproval } from './domain.js';
import { scanForkPaper } from './fork-paper-scroll.js';
import { captureSessionHistory, readSessionHistory } from './host-adapter.js';

import { forkMediaRoot } from './workbench-media.js';

function wait(ms, signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

function playClip(audio, url, maxDuration, signal, available) {
  if (signal.aborted || !available.has(url)) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('error', finish);
      signal.removeEventListener('abort', finish);
      audio.pause();
      resolve();
    };
    const timer = setTimeout(finish, maxDuration);
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
    signal.addEventListener('abort', finish, { once: true });
    audio.src = url;
    void audio.play().catch(finish);
  });
}

function showDomain(sessions, sourceId, fence, available) {
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const panel = document.createElement('section');
  panel.className = 'gojo-fork-domain';
  panel.dataset.phase = 'opening';
  if (reduced) panel.dataset.reduced = '';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '领域展开 · 无量空处');
  panel.innerHTML = `
    <div class="gojo-fork-stage" aria-hidden="true">
      <div class="gojo-fork-warp"></div>
      <div class="gojo-fork-paper"><img src="${forkMediaRoot}paper.webp" alt=""><canvas></canvas></div>
    </div>
    <button type="button" aria-keyshortcuts="Escape">跳过</button>
    <audio preload="none"></audio>`;
  const audio = panel.querySelector('audio');
  const canvas = panel.querySelector('canvas');
  const skip = panel.querySelector('button');
  const approval = new MutationObserver(() => { if (visibleApproval()) close(); });

  function close() {
    if (signal.aborted) return;
    lifetime.abort();
    approval.disconnect();
    audio.removeAttribute('src');
    audio.load();
    canvas.width = canvas.height = 0;
    panel.remove();
    fence = undefined;
  }

  skip.addEventListener('click', close, { signal });
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }, { capture: true, signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) close(); }, { signal });
  document.body.append(panel);
  approval.observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['role', 'open', 'hidden', 'data-approval-key', 'aria-hidden', 'inert'] });
  const invocation = playClip(audio, forkMediaRoot + 'voice.m4a', 3700, signal, available);

  async function play() {
    try {
      if (signal.aborted) return;
      const rows = (await readSessionHistory(sessions, sourceId, signal, fence)).filter(row => row.role !== 'tool');
      fence = undefined;
      await invocation;
      if (signal.aborted) return;
      if (rows.length) {
        panel.dataset.phase = 'scan';
        const scan = reduced ? wait(2400, signal) : scanForkPaper(canvas, rows, signal);
        await Promise.all([scan, playClip(audio, forkMediaRoot + 'scan.m4a', 3400, signal, available)]);
      }
    } catch {
      await invocation;
    } finally {
      if (!signal.aborted) {
        panel.dataset.phase = 'closing';
        await wait(reduced ? 100 : 240, signal);
        close();
      }
    }
  }

  return { play, close };
}

export function mountForkDomain(sessions, available) {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return () => {};
  const original = sessions.fork;
  if (typeof original !== 'function') return () => {};
  const ownFork = Object.getOwnPropertyDescriptor(sessions, 'fork');
  let active;
  function forkWithDomain(options) {
    let domain;
    try {
      if (options?.sessionId && !document.hidden && !visibleApproval()) {
        active?.close();
        const fence = captureSessionHistory(sessions, options.sessionId);
        domain = showDomain(sessions, options.sessionId, fence, available);
        active = domain;
      }
    } catch {
      // The visual effect is optional. The native method still receives the original request.
    }
    try {
      const fork = original.apply(this, arguments);
      if (domain) void fork.then(domain.play, domain.close);
      return fork;
    } catch (error) {
      domain?.close();
      throw error;
    }
  }
  sessions.fork = forkWithDomain;
  return () => {
    active?.close();
    if (sessions.fork !== forkWithDomain) return;
    if (ownFork) Object.defineProperty(sessions, 'fork', ownFork);
    else delete sessions.fork;
  };
}
