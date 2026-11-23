import { wrapDomainText } from './domain.js';

const lineHeight = 20;
const scanTime = 2350;

export function scanForkPaper(canvas, rows, signal) {
  if (signal.aborted || !rows.length) return Promise.resolve();
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas.getBoundingClientRect();
  if (!ctx || width < 20 || height < lineHeight) return Promise.resolve();

  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.scale(ratio, ratio);
  const family = getComputedStyle(canvas).getPropertyValue('--gojo-font-family').trim() || 'monospace';
  ctx.font = `15px ${family}`;
  ctx.textBaseline = 'top';
  const widths = new Map();
  function measure(character) {
    if (!widths.has(character)) widths.set(character, ctx.measureText(character).width);
    return widths.get(character);
  }

  const inset = 5;
  const maxLineWidth = width * .77;
  const lines = [];
  for (const { role, text } of rows) {
    const right = role === 'user';
    for (const wrapped of wrapDomainText(text.replaceAll('\t', '    '), maxLineWidth, measure)) {
      const x = right ? width - inset - Math.min(maxLineWidth, ctx.measureText(wrapped).width) : inset;
      lines.push({ text: wrapped, x, right });
    }
    lines.push({ text: '', x: inset, right });
  }
  lines.pop();

  function paint(progress) {
    const typed = Math.floor(progress);
    const offset = Math.max(0, progress * lineHeight - height + lineHeight * 2.4);
    const first = Math.floor(offset / lineHeight);
    ctx.clearRect(0, 0, width, height);
    for (let line = first; line <= typed && line < lines.length; line++) {
      const full = line < typed;
      const source = lines[line];
      const chars = full ? null : Array.from(source.text);
      const text = full ? source.text : chars.slice(0, Math.ceil(chars.length * (progress - typed))).join('');
      const y = 9 + line * lineHeight - offset;
      ctx.fillStyle = source.right ? '#e0cff8' : '#edf6ff';
      ctx.fillText(text, source.x, y, maxLineWidth);
      if (!full && chars.length) {
        const caret = source.x + Math.min(maxLineWidth, ctx.measureText(text).width);
        ctx.fillRect(caret + 2, y + 3, 1.5, 13);
      }
    }
  }

  return new Promise(resolve => {
    let handle;
    let start;
    let position = 0;
    const duration = Math.min(scanTime, Math.max(450, lines.length * 58));
    const linesPerFrame = Math.max(1, (height / lineHeight) * .68);
    function finish() {
      cancelAnimationFrame(handle);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    function tick(time) {
      start ??= time;
      const target = Math.min(1, (time - start) / duration) * lines.length;
      position = Math.min(target, position + linesPerFrame);
      paint(position);
      if (position >= lines.length) finish();
      else handle = requestAnimationFrame(tick);
    }
    signal.addEventListener('abort', finish, { once: true });
    handle = requestAnimationFrame(tick);
  });
}
