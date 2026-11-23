import { introVideo, themeRoot } from './workbench-media.js';
const workbench = '#root [data-slot="main.conversation"] > [data-phase] > [data-conversation-content]';
const modal = 'dialog[open], [role="alertdialog"], [role="dialog"][aria-modal="true"]:not([data-slot="sidebar"])';
const voiceEnd = 104 / 24;
const revealLead = .24;

export function mountIntro() {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return () => {};

  const lifetime = new AbortController();
  let observer;
  let stopPlayback;
  let claiming = false;
  let deadline;

  const stop = () => {
    lifetime.abort();
    observer?.disconnect();
    clearTimeout(deadline);
    stopPlayback?.();
  };

  const visible = () => document.visibilityState === 'visible';
  const nativeModal = () => Array.from(document.querySelectorAll(modal)).some(element =>
    element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
  );

  async function start() {
    if (claiming || lifetime.signal.aborted || !visible() || nativeModal() ||
        !document.querySelector(workbench)) return;
    claiming = true;
    clearTimeout(deadline);
    try {
      const response = await fetch(themeRoot + 'intro/v6/claim', {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(2000)]),
      });
      if (response.status !== 204 || lifetime.signal.aborted || !visible() || nativeModal()) {
        stop();
        return;
      }
      stopPlayback = playIntro(stop);
    } catch {
      stop();
    }
  }

  observer = new MutationObserver(() => {
    if (stopPlayback) {
      if (nativeModal()) stop();
    } else {
      void start();
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open', 'aria-modal', 'data-phase'],
  });
  document.addEventListener('visibilitychange', () => {
    if (!visible() && claiming) stop();
    else void start();
  }, { signal: lifetime.signal });
  window.addEventListener('blur', () => {
    if (stopPlayback) stop();
  }, { signal: lifetime.signal });
  deadline = setTimeout(stop, 12000);
  void start();
  return stop;
}

function playIntro(stop) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const overlay = document.createElement('div');
  overlay.className = 'gojo-intro';
  overlay.setAttribute('role', 'region');
  overlay.setAttribute('aria-label', '领域展开 · 无量空处');
  if (reduced) overlay.dataset.reduced = '';

  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.disablePictureInPicture = true;
  video.setAttribute('aria-hidden', 'true');
  video.src = introVideo;
  overlay.append(video);

  if (reduced) {
    const still = document.createElement('img');
    still.src = themeRoot + 'art/six-eyes.svg';
    still.alt = '';
    still.addEventListener('error', stop, { signal });
    overlay.append(still);
  }

  const controls = document.createElement('div');
  controls.className = 'gojo-intro-controls';
  const play = document.createElement('button');
  play.type = 'button';
  play.textContent = '播放原声开场';
  play.hidden = true;
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.textContent = '跳过';
  skip.setAttribute('aria-keyshortcuts', 'Escape');
  controls.append(play, skip);
  overlay.append(controls);
  document.body.append(overlay);

  let timeout = setTimeout(stop, 2500);
  let frameRequest;
  let finishing = false;
  const arm = ms => {
    clearTimeout(timeout);
    timeout = setTimeout(stop, ms);
  };
  const finish = () => {
    if (finishing || signal.aborted) return;
    finishing = true;
    if (reduced) video.pause();
    controls.inert = true;
    overlay.dataset.ending = '';
    arm(reduced ? 280 : 1000);
  };
  function updatePosition(time) {
    if (reduced) {
      if (time >= voiceEnd) finish();
      return;
    }
    if (video.duration - time <= revealLead) finish();
  }
  function watchFrame(_now, frame) {
    frameRequest = undefined;
    updatePosition(frame.mediaTime);
    if (!finishing && !signal.aborted) frameRequest = video.requestVideoFrameCallback(watchFrame);
  }
  async function begin(automatic) {
    try {
      await video.play();
    } catch (error) {
      if (signal.aborted) return;
      if (automatic && error.name === 'NotAllowedError') {
        play.hidden = false;
        play.focus({ preventScroll: true });
        arm(3000);
        return;
      }
      stop();
    }
  }

  video.addEventListener('playing', () => {
    if (finishing) return;
    play.hidden = true;
    overlay.dataset.playing = '';
    arm(32000);
    if (frameRequest === undefined && typeof video.requestVideoFrameCallback === 'function') {
      frameRequest = video.requestVideoFrameCallback(watchFrame);
    }
  }, { signal });
  video.addEventListener('timeupdate', () => {
    if (!finishing) updatePosition(video.currentTime);
  }, { signal });
  video.addEventListener('ended', finish, { signal });
  overlay.addEventListener('transitionend', event => {
    if (finishing && event.target === overlay && event.propertyName === 'opacity') stop();
  }, { signal });
  video.addEventListener('error', stop, { signal });
  skip.addEventListener('click', stop, { signal });
  play.addEventListener('click', () => {
    play.hidden = true;
    arm(1800);
    void begin(false);
  }, { signal });
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    stop();
  }, { capture: true, signal });
  void begin(true);

  return () => {
    lifetime.abort();
    clearTimeout(timeout);
    if (frameRequest !== undefined) video.cancelVideoFrameCallback(frameRequest);
    video.pause();
    video.removeAttribute('src');
    video.load();
    overlay.remove();
  };
}
