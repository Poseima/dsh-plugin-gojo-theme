import { completionVoices, voiceRoute } from './workbench-voice-assets.js';

function hasReply(event) {
  return event.type === 'assistant/message' && event.surfaceOp === 'append' &&
    event.data.message.content.some(block =>
      block.type === 'text' ? block.text.trim() !== '' : block.type === 'image');
}

export function watchCompletedReplies(sessions, onReply, { onStart, onEnd } = {}) {
  const subscriptions = new Map();

  function sync() {
    const tracked = new Set();
    for (const [id, info] of Object.entries(sessions.list.getSnapshot().byId)) {
      if (info.origin === 'subagent') continue;
      const binding = sessions.binding(id);
      const source = binding?.eventSource;
      if (!source || binding.session.getSnapshot().subagent) continue;
      tracked.add(id);
      if (subscriptions.get(id)?.source === source) continue;
      subscriptions.get(id)?.stop();

      let revision = source.getSnapshot().revision;
      let turn;
      let replied = false;
      function resetTurn() {
        if (turn !== undefined) onEnd?.(id, turn);
        turn = undefined;
        replied = false;
      }
      function accept({ event }) {
        if (event.type === 'turn/start') {
          if (turn === event.data.turn) return;
          resetTurn();
          turn = event.data.turn;
          onStart?.(id, turn);
        } else if (turn !== undefined && turn === event.data?.turn) {
          if (event.type === 'turn/end') {
            const completed = replied && event.data.reason.kind === 'completed';
            resetTurn();
            if (completed) onReply();
          } else if (hasReply(event)) {
            replied = true;
          }
        }
      }
      const stop = source.subscribe(() => {
        const next = source.getSnapshot();
        if (next.revision <= revision) return;
        revision = next.revision;
        const change = next.change;
        if (change.kind === 'replace') {
          resetTurn();
        } else if (change.kind === 'append') {
          for (const entry of change.entries) accept(entry);
        } else if (change.kind === 'settle-assistant' && change.entry) {
          accept(change.entry);
        }
      });
      subscriptions.set(id, { source, stop() { stop(); resetTurn(); } });
    }
    for (const [id, { stop }] of subscriptions) {
      if (tracked.has(id)) continue;
      stop();
      subscriptions.delete(id);
    }
  }

  const stopList = sessions.list.subscribe(sync);
  sync();
  return () => {
    stopList();
    for (const { stop } of subscriptions.values()) stop();
    subscriptions.clear();
  };
}

export function mountCompletionVoice(sessions, turnEvents, available) {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return () => {};

  const life = new AbortController();
  const audio = new Audio();
  let remaining = [];
  let previous;
  let queued = 0;
  let playing = false;
  let playback = 0;

  function nextVoice() {
    if (!remaining.length) remaining = completionVoices.filter(voice => available.has(voiceRoute + voice));
    const choices = remaining.filter(voice => voice !== previous);
    const voice = choices.length ? choices[Math.floor(Math.random() * choices.length)] : remaining[0];
    remaining.splice(remaining.indexOf(voice), 1);
    previous = voice;
    return voiceRoute + voice;
  }

  function pump() {
    if (playing || !queued) return;
    playing = true;
    queued--;
    const token = ++playback;
    audio.src = nextVoice();
    void audio.play().catch(() => {
      if (token === playback) finish();
    });
  }

  function finish() {
    if (!playing) return;
    playback++;
    playing = false;
    pump();
  }

  function reset() {
    queued = 0;
    playing = false;
    playback++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  audio.addEventListener('ended', finish, { signal: life.signal });
  audio.addEventListener('error', () => {
    if (audio.error) finish();
  }, { signal: life.signal });

  const stop = watchCompletedReplies(sessions, () => {
    if (!completionVoices.some(voice => available.has(voiceRoute + voice))) return;
    queued++;
    pump();
  }, turnEvents);
  return () => {
    stop();
    life.abort();
    reset();
  };
}
