import { spellVoiceRoute, spellVoices } from './workbench-voice-assets.js';

const conversationSelector = '[data-slot="main.conversation"]';
// The host uses data-streaming for other surfaces as well, including reasoning.
const assistantSelector = '.XNZzAa_root[data-streaming="true"]';
const proseSelector = ':scope > .XNZzAa_body > ._markdown_rve47_5';
const excluded = 'button, svg, [hidden], [aria-hidden="true"], [role="button"]';
const texture = '/gojo-theme/streams/v1/orbs.webp';
const colors = [
  { name: '術式順転・蒼', light: '#a9f7ff', edge: '#1f95ff', glow: '#3ddcff' },
  { name: '術式反転・赫', light: '#ffd3c7', edge: '#ee193c', glow: '#ff5265' },
  { name: '虚式・茈', light: '#f8c9ff', edge: '#843ef6', glow: '#df78ff' },
];
const width = 164;
const height = 84;
const tailLifetime = 470;
const finishLifetime = 300;

function findLastGlyph(markdown) {
  const walker = document.createTreeWalker(markdown, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return node.matches(excluded) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      }
      return /\S/u.test(node.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const range = document.createRange();
  for (let node = walker.lastChild(); node; node = walker.previousNode()) {
    const text = node.data.trimEnd();
    const end = text.length;
    const low = text.charCodeAt(end - 1);
    const start = end - (low >= 0xDC00 && low <= 0xDFFF ? 2 : 1);
    range.setStart(node, Math.max(0, start));
    range.setEnd(node, end);
    const rect = range.getBoundingClientRect();
    if (rect.width && rect.height) return { rect, node, end, suffix: text.slice(-40) };
  }
  return null;
}

function drawTrail(ctx, color, trail, time, origin) {
  ctx.lineCap = 'round';
  for (const stroke of trail) {
    const life = Math.max(0, 1 - (time - stroke.time) / tailLifetime);
    const y = stroke.y - origin.y;
    ctx.beginPath();
    ctx.moveTo(stroke.from - origin.x, y);
    ctx.lineTo(stroke.to - origin.x, y);
    for (const [size, tint, alpha] of [[7, color.glow, .19], [2.4, color.edge, .54], [.8, color.light, .85]]) {
      ctx.globalAlpha = alpha * life ** 1.55;
      ctx.lineWidth = size * (.5 + .5 * life);
      ctx.strokeStyle = tint;
      ctx.stroke();
    }
  }
}

function drawOrb(ctx, sprite, spell, x, y, time, motion) {
  const color = colors[spell];
  ctx.globalAlpha = 1;
  if (!motion || !sprite.naturalWidth) {
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, 2 * Math.PI);
    ctx.fillStyle = color.edge;
    ctx.fill();
    return;
  }
  const frame = Math.floor(time * .03) % 36;
  const phase = 2 * Math.PI * time / 920;
  const pulse = ((1 - Math.cos(phase)) / 2) ** .8;
  const size = 29 + 25 * pulse + 1.4 * Math.sin(time * .018);
  y += 1.1 * Math.sin(phase - .5);
  ctx.drawImage(sprite, (frame % 6) * 128, (spell * 6 + Math.floor(frame / 6)) * 128, 128, 128,
    x - size / 2, y - size / 2, size, size);
}

export function mountStreamOrb(available) {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return;

  const lifetime = new AbortController();
  const { signal } = lifetime;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sprite = new Image();
  sprite.decoding = 'async';
  const canvas = document.createElement('canvas');
  canvas.className = 'gojo-stream-orb';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = true;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(canvas.width / width, canvas.height / height);
  document.body.append(canvas);

  const spells = new WeakMap();
  const runs = new Map();
  const cast = new Audio();
  let pane, clip, offset, active, lastGlyph, point, trail = [];
  let activeRun;
  let finishingAt;
  let castTimer;
  let frameId = 0;
  let lastDraw = -Infinity;
  let needsMeasure = false;
  const resize = new ResizeObserver(invalidate);

  function visibleSession() {
    return document.querySelector(`${conversationSelector} [data-conversation-session]`)?.dataset.conversationSession;
  }

  function onStart(id, turn) {
    const run = { turn, spell: Math.floor(Math.random() * colors.length), ended: false };
    runs.set(id, run);
    invalidate();
    const voice = spellVoiceRoute + spellVoices[run.spell];
    if (!available.has(voice) || document.hidden || (visibleSession() && visibleSession() !== id)) return;

    clearTimeout(castTimer);
    const deadline = performance.now() + 320;
    function playWhenVisible() {
      if (signal.aborted || document.hidden || runs.get(id) !== run) return;
      if (visibleSession() === id) {
        cast.src = voice;
        void cast.play().catch(() => {});
      } else if (performance.now() < deadline) {
        castTimer = setTimeout(playWhenVisible, 32);
      }
    }
    playWhenVisible();
  }

  function onEnd(id, turn) {
    const run = runs.get(id);
    if (run?.turn !== turn) return;
    run.ended = true;
    runs.delete(id);
    invalidate();
  }

  function schedule() {
    if (!signal.aborted && !frameId && !document.hidden) frameId = requestAnimationFrame(tick);
  }

  function invalidate() {
    needsMeasure = true;
    schedule();
  }

  function clear() {
    canvas.hidden = true;
    active = activeRun = lastGlyph = point = finishingAt = undefined;
    trail = [];
  }

  function measure(time) {
    const conversation = document.querySelector(conversationSelector);
    const run = runs.get(visibleSession());
    const running = activeRun?.ended && !run ? null : Array.from(conversation?.querySelectorAll(assistantSelector) ?? []).pop();
    const liveMarkdown = running?.querySelectorAll(proseSelector);
    // Reuse the same assistant node when DSH settles it in place.
    const previousReply = active && conversation?.contains(active) ? active : null;
    const reply = liveMarkdown?.length ? running : previousReply;
    const markdown = reply === running ? liveMarkdown : reply?.querySelectorAll(proseSelector);
    const nextPane = reply?.closest('[data-conversation-scroll]');
    if (!markdown?.length || !nextPane) {
      clear();
      return;
    }
    if (pane !== nextPane) {
      resize.disconnect();
      pane = nextPane;
      resize.observe(pane);
    }
    const glyph = findLastGlyph(markdown[markdown.length - 1]);
    if (!glyph) {
      clear();
      return;
    }
    if (active !== reply || (run && activeRun !== run)) {
      clear();
      active = reply;
      activeRun = run;
      if (run || !spells.has(reply)) spells.set(reply, run?.spell ?? Math.floor(Math.random() * colors.length));
      canvas.dataset.spell = colors[spells.get(reply)].name;
    }
    if (activeRun?.ended || (!activeRun && reply !== running)) finishingAt ??= time;
    const rect = pane.getBoundingClientRect();
    const composer = pane.querySelector(':scope > [data-conversation-region="composer"]');
    const composerTop = composer?.getBoundingClientRect().top ?? rect.bottom;
    clip = { left: rect.left, top: rect.top, right: rect.right, bottom: Math.min(rect.bottom, composerTop) };
    offset = { x: rect.left - pane.scrollLeft, y: rect.top - pane.scrollTop };
    const next = {
      x: glyph.rect.right - offset.x,
      y: (glyph.rect.top + glyph.rect.bottom) / 2 - offset.y,
      line: glyph.rect.bottom - offset.y + 1,
    };
    const code = glyph.node.parentElement?.closest('pre');
    if (code) {
      const bounds = code.getBoundingClientRect();
      clip.left = Math.max(clip.left, bounds.left);
      clip.right = Math.min(clip.right, bounds.right);
    }
    const changed = !lastGlyph || glyph.end !== lastGlyph.end || glyph.suffix !== lastGlyph.suffix ||
      (glyph.node !== lastGlyph.node && Math.abs(next.y - point.y) > 3);
    if (reply === running && changed && !reduced.matches) {
      const previous = point;
      const sameLine = previous && Math.abs(next.y - previous.y) < 4 &&
        next.x > previous.x && next.x - previous.x < 78;
      const from = sameLine ? previous.x : next.x - Math.min(20, glyph.rect.width + 4);
      trail.push({ from, to: next.x + 4, y: next.line, time });
      if (trail.length > 14) trail.shift();
    }
    lastGlyph = glyph;
    point = next;
    if (!reduced.matches && !sprite.getAttribute('src')) sprite.src = texture;
  }

  function paint(time) {
    const spell = spells.get(active);
    const x = point.x + offset.x;
    const y = point.y + offset.y;
    if (x < clip.left - 2 || x > clip.right + 2 || y < clip.top || y > clip.bottom) {
      canvas.hidden = true;
      return false;
    }
    const left = Math.floor(x - 110);
    const top = Math.floor(y - 40);
    const inset = [clip.top - top, left + width - clip.right,
      top + height - clip.bottom, clip.left - left].map(value => Math.max(0, value) + 'px');
    canvas.style.transform = `translate(${left}px, ${top}px)`;
    canvas.style.clipPath = `inset(${inset.join(' ')})`;
    canvas.hidden = false;
    canvas.style.opacity = finishingAt === undefined ? '1' : String(Math.max(0, 1 - (time - finishingAt) / finishLifetime));
    ctx.clearRect(0, 0, width, height);
    if (!reduced.matches) {
      trail = trail.filter(stroke => time - stroke.time < tailLifetime);
      drawTrail(ctx, colors[spell], trail, time, { x: left - offset.x, y: top - offset.y });
    }
    drawOrb(ctx, sprite, spell, x - left + 11, y - top, time, !reduced.matches);
    return true;
  }

  function tick(time) {
    frameId = 0;
    const dirty = needsMeasure;
    if (dirty) {
      needsMeasure = false;
      measure(time);
    }
    if (!point) return;
    if (finishingAt !== undefined && (reduced.matches || time - finishingAt >= finishLifetime)) {
      clear();
      return;
    }
    const redraw = dirty || time - lastDraw >= 32;
    if (redraw) {
      lastDraw = time;
      if (!paint(time)) return;
    }
    if (!reduced.matches) schedule();
  }

  const observer = new MutationObserver(records => {
    if ((active && !active.isConnected) || records.some(({ target }) =>
      (target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement)?.closest(conversationSelector)
    )) invalidate();
  });
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-streaming'],
  });
  document.addEventListener('scroll', event => {
    if (pane?.contains(event.target)) invalidate();
  }, { capture: true, signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frameId);
      frameId = 0;
      canvas.hidden = true;
      trail = [];
    } else invalidate();
  }, { signal });
  reduced.addEventListener('change', () => {
    trail = [];
    invalidate();
  }, { signal });
  invalidate();

  return {
    onStart,
    onEnd,
    dispose() {
      lifetime.abort();
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frameId);
      clearTimeout(castTimer);
      cast.pause();
      cast.removeAttribute('src');
      cast.load();
      canvas.remove();
    },
  };
}
