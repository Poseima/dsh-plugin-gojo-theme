import assert from 'node:assert/strict';
import test from 'node:test';
import { watchCompletedReplies } from '../lib/workbench-completion-voice.js';

test('plays once after a live completed reply and ignores history, cancellations and tool steps', () => {
  let snapshot = { revision: 0 };
  let listener;
  const list = {
    getSnapshot: () => ({ byId: { session: {}, agent: { origin: 'subagent' } } }),
    subscribe: () => () => {},
  };
  const eventSource = {
    getSnapshot: () => snapshot,
    subscribe: fn => {
      listener = fn;
      return () => { listener = undefined; };
    },
  };
  const sessions = {
    list,
    binding: id => {
      assert.equal(id, 'session');
      return { eventSource, session: { getSnapshot: () => ({}) } };
    },
  };
  let cues = 0;
  const dispose = watchCompletedReplies(sessions, () => cues++);
  const publish = change => {
    snapshot = { revision: snapshot.revision + 1, change };
    listener();
  };
  const entry = (type, data) => ({ event: { type, data: { turn: 1, ...data }, surfaceOp: 'append' } });
  const append = (...entries) => publish({ kind: 'append', entries });
  const start = entry('turn/start');
  const end = entry('turn/end', { reason: { kind: 'completed' } });
  const reply = entry('assistant/message', { message: { content: [{ type: 'text', text: 'A reply.' }] } });
  const tool = entry('assistant/message', { message: { content: [{ type: 'tool-call' }] } });

  publish({ kind: 'replace', entries: [start, reply, end] });
  publish({ kind: 'prepend', entries: [start, reply, end] });
  append(end);
  assert.equal(cues, 0);
  append(start, tool, end);
  append(start, reply, entry('turn/end', { reason: { kind: 'cancelled' } }));
  append(start, reply, entry('turn/end', { reason: { kind: 'error' } }));
  assert.equal(cues, 0);
  append(start, tool);
  publish({ kind: 'settle-assistant', entry: reply });
  assert.equal(cues, 0);
  append(end);
  listener();
  append(end);
  assert.equal(cues, 1);
  append(start);
  publish({ kind: 'replace', entries: [start, reply] });
  append(end);
  assert.equal(cues, 1);
  dispose();
  assert.equal(listener, undefined);
});
