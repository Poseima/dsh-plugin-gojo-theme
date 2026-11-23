const retainSource = 'workspaceOperation';
const frozenDraftPhases = new Set(['adjudicating', 'submitting', 'sending']);
const conversationSelector = '[data-conversation-content][data-conversation-session]';
const unavailable = '目标会话当前不可写入，草稿没有改动。';

function messageParts(role, content, rows) {
  if (typeof content === 'string') content = [{ type: 'text', text: content }];
  const label = role === 'user' ? '用户' : '助手';
  let text = '';
  const flush = () => {
    if (text) rows.push({ role, label, text });
    text = '';
  };
  for (const block of content ?? []) {
    if (block.type === 'text') text += block.text;
    if (block.type === 'image' || block.type === 'file') {
      flush();
      rows.push({ role, label, text: block.type === 'image' ? '[图片附件]' : '[文件附件]' });
    }
  }
  flush();
}

export function historyRows(entries) {
  const rows = [];
  let live = null;
  const flush = () => {
    if (live?.text) rows.push({ role: 'assistant', label: '助手', text: live.text });
    live = null;
  };
  for (const { event } of entries) {
    const { type, data, surfaceOp } = event;
    if (type === 'assistant/live-chunk') {
      if (live?.id !== data.attemptId) {
        flush();
        live = { id: data.attemptId, text: '', streamedBlocks: new Set() };
      }
      const { chunk } = data;
      if (chunk.type === 'text-delta') {
        live.streamedBlocks.add(chunk.index);
        live.text += chunk.text;
      }
      if (chunk.type === 'block-end' && chunk.block.type === 'text' && !live.streamedBlocks.has(chunk.index)) {
        live.text += chunk.block.text;
      }
      if (chunk.type === 'block-end' && ['image', 'file'].includes(chunk.block.type)) {
        flush();
        messageParts('assistant', [chunk.block], rows);
      }
      continue;
    }
    if (type === 'user/message' && surfaceOp === 'append' && data.source?.kind === 'user') {
      flush();
      messageParts('user', data.content, rows);
    }
    if (type === 'assistant/message' && surfaceOp === 'append') {
      flush();
      messageParts('assistant', data.message.content, rows);
    }
    if (type === 'tool/call' || (type === 'tool/result' && surfaceOp === 'append')) {
      flush();
      rows.push({ role: 'tool', label: '工具', text: type === 'tool/call' ? '[工具调用]' : '[工具结果]' });
    }
  }
  flush();
  return rows;
}

function waitForCheck(check, { signal, timeout = 4000 } = {}) {
  return new Promise((resolve) => {
    const deadline = performance.now() + timeout;
    let timer;
    const finish = (result) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = () => finish(null);
    const poll = () => {
      if (signal?.aborted) return finish(null);
      const result = check();
      if (result || performance.now() > deadline) return finish(result);
      timer = setTimeout(poll, 24);
    };
    signal?.addEventListener('abort', abort, { once: true });
    poll();
  });
}

export function captureSessionHistory(sessions, id) {
  const binding = sessions.binding(id);
  if (binding?.session.getSnapshot().openState === 'open') return binding.eventSource.getSnapshot();
}

export async function readSessionHistory(sessions, id, signal, fence) {
  signal?.throwIfAborted();
  if (fence && !fence.hasMore) return historyRows(fence.entries);
  return sessions.using(id, { source: retainSource, signal }, async () => {
    signal?.throwIfAborted();
    const { session, eventSource } = sessions.binding(id);
    const captured = fence ?? captureSessionHistory(sessions, id);
    if (!captured) throw new Error('来源会话历史尚未加载完成。');
    if (!captured.hasMore) return historyRows(captured.entries);
    if (session.getSnapshot().loadingOlder) {
      await waitForCheck(() => !session.getSnapshot().loadingOlder, { signal });
    }
    signal?.throwIfAborted();
    await session.loadThrough(0);
    signal?.throwIfAborted();
    const paged = eventSource.getSnapshot();
    if (paged.hasMore || session.getSnapshot().openState !== 'open') {
      throw new Error('历史分页读取失败。');
    }
    const firstCaptured = captured.entries[0]?.event.seq;
    if (firstCaptured == null) throw new Error('无法定位会话历史边界。');
    const earlier = paged.entries.filter(({ event }) => event.seq < firstCaptured);
    return historyRows([...earlier, ...captured.entries]);
  });
}

export function makeHost(ctx, lifetime) {
  const { sessions, conversation, uiWorkspace, workspaces, remoteAccess, uiSession } = ctx;
  const getList = () => sessions.list.getSnapshot();
  const title = (id) => getList().byId[id]?.displayTitle || id;
  const activeId = () => getList().ids.find(id => getList().byId[id]?.retainedBy?.mainView > 0)
    ?? document.querySelector(conversationSelector)?.getAttribute('data-conversation-session');
  const isWritable = (id) => {
    const list = getList();
    const row = list.byId[id];
    if (list.phase !== 'ready' || !row || row.origin === 'subagent') return false;
    if (workspaces.list.getSnapshot().archivedSessionIds.includes(id)) return false;
    if (remoteAccess.source('session', id, 'session/prompt').getSnapshot() !== true) return false;
    if (conversation.blocks.storeFor(id).getSnapshot() != null) return false;
    const binding = sessions.binding(id);
    if (binding?.session.getSnapshot().removed) return false;
    const composer = binding && conversation.input.for(binding.ctx);
    return !frozenDraftPhases.has(composer?.snapshot?.phase)
      && !(id === activeId() && document.querySelector('[data-composer-composing]'));
  };

  return {
    activeId,
    sessions,
    status: uiSession.sessionStatus,
    getSource() {
      const id = activeId();
      return id ? { id, title: title(id) } : null;
    },
    listTargets(sourceId) {
      return getList().ids
        .filter(id => id !== sourceId && isWritable(id))
        .map(id => ({ id, title: title(id), writable: true }));
    },
    captureHistory(sourceId) {
      const fence = captureSessionHistory(sessions, sourceId);
      if (!fence) throw new Error('来源会话历史尚未加载完成。');
      return fence;
    },
    async readHistory(sourceId, signal, fence) {
      if (!fence) throw new Error('来源会话历史尚未加载完成。');
      return readSessionHistory(sessions, sourceId, signal, fence);
    },
    async appendId(targetId, sourceId, signal) {
      if (targetId === sourceId || !isWritable(targetId)) throw new Error(unavailable);
      return sessions.using(targetId, { source: retainSource, signal }, async () => {
        signal?.throwIfAborted();
        const binding = sessions.binding(targetId);
        if (!binding || !isWritable(targetId)) throw new Error(unavailable);
        if (conversation.input.requestDraftInitialization(binding, {
          prompt: sourceId,
          whenDraftExists: 'append',
        }) !== 'applied') throw new Error(unavailable);
        // Start the host's navigation before releasing this retained draft shell.
        uiWorkspace.openSession(targetId);
        await waitForCheck(
          () => (getList().byId[targetId]?.retainedBy?.mainView ?? 0) > 0,
          { signal: lifetime },
        );
        return true;
      });
    },
    async focusTarget(targetId) {
      const input = await waitForCheck(() => {
        if (document.querySelector('[role="alertdialog"], [data-approval-key]')) return null;
        const view = [...document.querySelectorAll(conversationSelector)]
          .find(node => node.getAttribute('data-conversation-session') === targetId);
        return view?.querySelector('[data-composer-input][contenteditable="true"]');
      }, { signal: lifetime });
      input?.focus({ preventScroll: true });
    },
  };
}
