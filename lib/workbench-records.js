import { mountRecordFlame } from './workbench-record-flame.js';

import { recordRoot } from './workbench-media.js';

const trackSlots = [
  { id: 'specialz', format: 'm4a', title: 'SPECIALZ', artist: 'King Gnu' },
  { id: 'kaikai-kitan', format: 'm4a', title: '廻廻奇譚', artist: 'Eve' },
  { id: 'where-our-blue-is-acoustic', format: 'm4a', title: '青のすみか (Acoustic)', caption: '青のすみか', artist: 'キタニタツヤ' },
];
const recordUrl = record => recordRoot + record.id + '.' + record.format;
const conversation = '[data-slot="main.conversation"] > [data-phase]';
const path = d => `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${d}"></path></svg>`;
const playIcon = path('M9 5.5v13l10-6.5z');
const pauseIcon = path('M7 5.5h3.3v13H7zM13.7 5.5H17v13h-3.3z');
const previousIcon = path('M5 5.5h2.2v13H5zM18.5 5.5 8 12l10.5 6.5z');
const nextIcon = path('M17 5.5h2.2v13H17zM5.5 5.5 16 12 5.5 18.5z');

export function mountRecords(available) {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return () => {};

  const records = trackSlots.filter(record => available.has(recordUrl(record)));
  const hasTracks = records.length > 0;
  const dock = document.createElement('section');
  dock.className = 'gojo-records';
  dock.setAttribute('aria-label', '咒术回战主题曲转盘');
  dock.hidden = true;
  dock.innerHTML = `
    <button class="gojo-record-toggle" type="button" aria-expanded="false"
      aria-controls="gojo-record-list" aria-label="展开歌曲列表"
      aria-keyshortcuts="ArrowLeft Space ArrowRight" aria-description="空格播放或暂停，左右方向键切歌">
      <canvas class="gojo-record-fire" aria-hidden="true"></canvas>
      <span class="gojo-record-disc" aria-hidden="true"><i></i></span>
    </button>
    <div class="gojo-record-caption" aria-live="polite"></div>
    <div class="gojo-record-transport" role="group" aria-label="播放控制">
      <button type="button" data-record-prev aria-label="上一首">${previousIcon}</button>
      <button type="button" data-record-play aria-label="播放">${playIcon}</button>
      <button type="button" data-record-next aria-label="下一首">${nextIcon}</button>
    </div>
    <div class="gojo-record-list" id="gojo-record-list" hidden>
      <ul aria-label="曲目"></ul>
      <p class="gojo-record-status" role="status" hidden></p>
    </div>`;
  document.body.append(dock);

  const events = new AbortController();
  const { signal } = events;
  const setFlamePlaying = mountRecordFlame(dock.querySelector('.gojo-record-fire'), signal);
  const toggle = dock.querySelector('.gojo-record-toggle');
  const list = dock.querySelector('.gojo-record-list');
  const caption = dock.querySelector('.gojo-record-caption');
  const status = dock.querySelector('.gojo-record-status');
  const playButton = dock.querySelector('[data-record-play]');
  const audio = new Audio();
  audio.hidden = true;
  dock.append(audio);
  audio.preload = 'none';
  audio.volume = .4;
  if (records.length < 2) {
    for (const button of dock.querySelectorAll('[data-record-prev], [data-record-next]')) button.hidden = true;
  }
  if (!hasTracks) {
    dock.querySelector('.gojo-record-transport').hidden = true;
    toggle.removeAttribute('aria-keyshortcuts');
    toggle.removeAttribute('aria-description');
    status.hidden = false;
    status.textContent = '尚未导入本地曲目。';
  } else if (records.length === 1) {
    toggle.setAttribute('aria-keyshortcuts', 'Space');
    toggle.setAttribute('aria-description', '空格播放或暂停');
  }
  let selected = 0;
  try {
    const saved = localStorage.getItem('gojo-record');
    const initial = records.findIndex(record => record.id === saved);
    if (initial >= 0) selected = initial;
  } catch { /* Playback still works when storage is unavailable. */ }
  let pendingPlay = 0;
  let phase;
  let card;
  let request;

  const rows = records.map((record, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = '<span></span><small></small>';
    button.firstElementChild.textContent = record.title;
    button.lastElementChild.textContent = record.artist;
    button.addEventListener('click', () => select(index, true), { signal });
    item.append(button);
    list.querySelector('ul').append(item);
    return button;
  });

  function sync() {
    const playing = !audio.paused && !audio.ended;
    dock.toggleAttribute('data-playing', playing);
    setFlamePlaying(playing);
    const label = playing ? '暂停' : '播放';
    playButton.setAttribute('aria-label', label);
    playButton.title = label;
    playButton.innerHTML = playing ? pauseIcon : playIcon;
  }

  function setError(message) {
    status.hidden = !message;
    status.textContent = message;
    if (message) setListOpen(true);
  }

  function setListOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '收起歌曲列表' : '展开歌曲列表');
    list.hidden = !open;
  }

  function updateTrack() {
    const record = records[selected];
    caption.textContent = record?.caption ?? record?.title ?? '';
    caption.title = record?.title ?? '';
    rows.forEach((row, index) => row.setAttribute('aria-pressed', String(index === selected)));
  }

  async function playSelection() {
    if (!hasTracks) return;
    const attempt = ++pendingPlay;
    const record = records[selected];
    setError('');
    if (audio.dataset.record !== record.id || audio.error) {
      audio.src = recordUrl(record);
      audio.dataset.record = record.id;
    }
    try {
      await audio.play();
    } catch (error) {
      if (attempt === pendingPlay && !signal.aborted && error.name !== 'AbortError') setError('这首歌暂时无法播放。');
    }
    if (!signal.aborted) sync();
  }

  function select(index, play) {
    selected = (index + records.length) % records.length;
    try { localStorage.setItem('gojo-record', records[selected].id); } catch { /* Optional preference. */ }
    updateTrack();
    setError('');
    if (play) void playSelection();
    else {
      pendingPlay++;
      audio.pause();
      audio.removeAttribute('src');
      delete audio.dataset.record;
      audio.load();
      sync();
    }
  }

  updateTrack();
  sync();
  toggle.addEventListener('click', () => setListOpen(list.hidden), { signal });
  function togglePlayback() {
    if (audio.paused || audio.ended) void playSelection();
    else {
      pendingPlay++;
      audio.pause();
    }
  }
  function shiftTrack(step) {
    if (records.length < 2) return;
    select(selected + step, !audio.paused);
  }
  playButton.addEventListener('click', togglePlayback, { signal });
  toggle.addEventListener('keydown', event => {
    if (!hasTracks || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    switch (event.key) {
      case ' ':
        event.preventDefault();
        if (!event.repeat) togglePlayback();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        shiftTrack(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        shiftTrack(1);
        break;
    }
  }, { signal });
  for (const button of dock.querySelectorAll('[data-record-prev]')) {
    button.title = '上一首';
    button.addEventListener('click', () => shiftTrack(-1), { signal });
  }
  for (const button of dock.querySelectorAll('[data-record-next]')) {
    button.title = '下一首';
    button.addEventListener('click', () => shiftTrack(1), { signal });
  }
  for (const event of ['play', 'pause', 'ended', 'emptied']) audio.addEventListener(event, sync, { signal });
  document.addEventListener('pointerdown', event => {
    if (!list.hidden && !dock.contains(event.target)) setListOpen(false);
  }, { signal });
  dock.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || list.hidden) return;
    event.stopPropagation();
    setListOpen(false);
    toggle.focus({ preventScroll: true });
  }, { signal });

  const resize = new ResizeObserver(schedule);
  function schedule() {
    if (request === undefined) request = requestAnimationFrame(place);
  }

  function place() {
    request = undefined;
    const current = document.querySelector(`#root ${conversation}:has([data-composer-card])`);
    const composer = current?.querySelector('[data-composer-card]');
    if (phase !== current || card !== composer) {
      resize.disconnect();
      phase = current;
      card = composer;
      if (phase && card) {
        resize.observe(phase);
        resize.observe(card);
      }
    }
    const panel = phase?.getBoundingClientRect();
    const input = card?.getBoundingClientRect();
    const hidden = !input?.width || !panel?.width;
    if (dock.hidden !== hidden) dock.hidden = hidden;
    if (dock.hidden) {
      if (!audio.paused) audio.pause();
      setListOpen(false);
      return;
    }

    const right = Math.min(window.innerWidth, panel.right);
    const gap = right - input.right;
    const compact = gap < 132;
    const size = compact ? 44 : 116;
    const outside = gap >= size + 12;
    const left = outside ? Math.min(input.right + Math.max(6, (gap - size) / 2), right - size - 6) : right - size - 8;
    const bottom = outside ? Math.max(input.bottom, panel.bottom - 26) - 3 : input.top - 8;
    dock.toggleAttribute('data-compact', compact);
    dock.style.left = `${Math.round(left)}px`;
    dock.style.bottom = `${Math.round(Math.max(8, window.innerHeight - bottom))}px`;
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.querySelector('#root') ?? document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-phase', 'data-composer-card', 'data-slot', 'hidden'],
  });
  window.addEventListener('resize', schedule, { signal });
  schedule();

  return () => {
    pendingPlay++;
    events.abort();
    observer.disconnect();
    resize.disconnect();
    if (request !== undefined) cancelAnimationFrame(request);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    dock.remove();
  };
}
