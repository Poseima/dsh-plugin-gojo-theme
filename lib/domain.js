const ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 13.5 5 10a1.4 1.4 0 0 1 2.2-1.7l3.2 3.5V4a1.3 1.3 0 0 1 2.6 0v6.8l2-5.3a1.3 1.3 0 0 1 2.5.9l-1.9 6 1.6-.9a1.6 1.6 0 0 1 2 2.4l-3 4.4a5 5 0 0 1-4.2 2.2 5 5 0 0 1-4.6-3.3l-1-2.5"/><path d="M4 4h2M5 3v2m14-2h2m-1-1v2"/></svg>';
const PREVIEW = [
  { role: "user", label: "用户", text: "把对话 A 的来龙去脉交给对话 B。现有的草稿继续保留。" },
  { role: "assistant", label: "助手", text: "正在整理历史。交接只落入来源会话 ID，原文为此次术式的视觉回放。" },
  { role: "activity", label: "附件", text: "设计参考 · 1 个文件" },
  { role: "user", label: "用户", text: "把所有可见的文字按时间顺序快速扫过。" },
  { role: "assistant", label: "助手", text: "从第一条历史直到当前边界。选定目标后，领域展开。" },
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, label, action) {
  const node = element("button", className, label);
  node.type = "button";
  if (action) node.addEventListener("click", action);
  return node;
}

function overlayHost() {
  return document.getElementById("root") ?? document.body;
}

export function visibleApproval() {
  return [...document.querySelectorAll('[role="alertdialog"], [data-approval-key]')].some((node) =>
    node.getClientRects().length
      && node.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false
      && !node.closest('[inert], [aria-hidden="true"]'),
  );
}

export function* wrapDomainText(text, width, measure) {
  let line = "";
  let used = 0;
  for (const character of text) {
    if (character === "\n") {
      yield line;
      line = "";
      used = 0;
      continue;
    }
    const size = measure(character);
    if (line && used + size > width) {
      yield line;
      line = "";
      used = 0;
    }
    line += character;
    used += size;
  }
  yield line;
}

function frame(signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => {
      cancelAnimationFrame(handle);
      reject(signal.reason);
    };
    const handle = requestAnimationFrame((time) => {
      signal.removeEventListener("abort", abort);
      resolve(time);
    });
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function delay(milliseconds, signal) {
  let start;
  let now;
  do {
    now = await frame(signal);
    start ??= now;
  } while (now - start < milliseconds);
}

function scene(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const width = Math.max(480, canvas.clientWidth);
  const height = Math.max(330, canvas.clientHeight);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);
  const lanes = width >= 1150 ? 5 : width >= 830 ? 4 : width >= 630 ? 3 : 2;
  const lineHeight = 15;
  const lineCount = Math.min(19, Math.max(9, Math.floor((height - 142) / lineHeight)));
  const cellWidth = (width - 38) / lanes;
  ctx.font = '12px ui-monospace, "PingFang SC", monospace';

  function paint(items, page, progress) {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    const orbitX = width * .5;
    const orbitY = height * .36;
    for (let i = 0; i < 31; i += 1) {
      const angle = i * (Math.PI * 2 / 31);
      const delta = (i * 59 % 113) / 113;
      const radius = (delta + (page + progress) * .14) % 1;
      const r = 16 + radius * width * .36;
      ctx.strokeStyle = i % 5 === 0 ? "#91cfff38" : "#4466bb28";
      ctx.beginPath();
      ctx.moveTo(orbitX + Math.cos(angle) * r, orbitY + Math.sin(angle) * r * .68);
      const tail = r + 8 + radius * 24;
      ctx.lineTo(orbitX + Math.cos(angle) * tail, orbitY + Math.sin(angle) * tail * .68);
      ctx.stroke();
    }
    for (let lane = 0; lane < lanes; lane += 1) {
      const x = 19 + lane * cellWidth;
      const y = 68 + Math.abs(lane - ((lanes - 1) / 2)) * 15;
      const depth = .88 + progress * .12;
      ctx.save();
      ctx.translate((x + cellWidth / 2) * (1 - depth), (y - 52) * (1 - depth));
      ctx.scale(depth, depth);
      ctx.fillStyle = lane % 2 === 0 ? "#faffffe4" : "#eef7ffdb";
      ctx.fillRect(x, y - 4, cellWidth - 5, lineCount * lineHeight + 11);
      ctx.strokeStyle = lane % 2 === 0 ? "#5c9dbe65" : "#436a9f56";
      ctx.strokeRect(x + .5, y - 3.5, cellWidth - 5, lineCount * lineHeight + 11);
      ctx.textBaseline = "top";
      for (let row = 0; row < lineCount; row += 1) {
        const line = items[lane * lineCount + row];
        if (!line) break;
        ctx.fillStyle = line.tag
          ? line.role === "user" ? "#195f91" : line.role === "assistant" ? "#34598a" : "#4c677c"
          : "#243d58";
        ctx.globalAlpha = line.tag ? 1 : .86 + (Math.min(row, 5) * .028);
        ctx.fillText(line.text, x + 8, y + 4 + row * lineHeight, cellWidth - 22);
      }
      ctx.restore();
    }
  }

  return { ctx, lineCount, lanes, cellWidth, paint };
}

function* scanPages(rows, visual) {
  const capacity = visual.lanes * visual.lineCount;
  const cache = new Map();
  function measure(character) {
    if (!cache.has(character)) cache.set(character, visual.ctx.measureText(character).width);
    return cache.get(character);
  }
  let page = [];
  const total = rows.length;
  for (let index = 0; index < total; index += 1) {
    const row = rows[index];
    const tag = row.label || (row.role === "user" ? "用户" : row.role === "assistant" ? "助手" : "活动");
    page.push({ tag: true, role: row.role, text: `${String(index + 1).padStart(3, "0")}  ${tag}` });
    if (page.length >= capacity) {
      yield page;
      page = [];
    }
    for (const line of wrapDomainText(String(row.text ?? "").replaceAll("\t", "    "), visual.cellWidth - 22, measure)) {
      page.push({ text: line });
      if (page.length >= capacity) {
        yield page;
        page = [];
      }
    }
  }
  if (page.length) yield page;
}

async function animateScan(canvas, rows, status, signal) {
  const visual = scene(canvas);
  if (!visual || !rows.length) return;
  const pages = scanPages(rows, visual);
  let current = pages.next();
  let index = 0;
  let start;
  let lastPage;
  const minimumDuration = 2000;
  const charactersPerLine = (visual.cellWidth - 22) / 10;
  const estimatedLines = rows.reduce((total, row) => {
    const text = String(row.text ?? "");
    let lineBreaks = 0;
    for (let newline = text.indexOf("\n"); newline >= 0; newline = text.indexOf("\n", newline + 1)) {
      lineBreaks += 1;
    }
    return total + 2 + lineBreaks + text.length / charactersPerLine;
  }, 0);
  const estimatedPages = Math.max(1, Math.round(estimatedLines / (visual.lanes * visual.lineCount)));
  const interval = Math.max(26, minimumDuration / estimatedPages);
  try {
    while (!current.done) {
      let began;
      let tick;
      lastPage = current.value;
      status.textContent = `扫描 ${rows.length} 条历史 · 第 ${index + 1} 屏`;
      do {
        tick = await frame(signal);
        start ??= tick;
        began ??= tick;
        visual.paint(lastPage, index, Math.min(1, (tick - began) / interval));
      } while (tick - began < interval);
      current = pages.next();
      index += 1;
    }
    while (performance.now() - start < minimumDuration) {
      const tick = await frame(signal);
      visual.paint(lastPage, index + (tick - start) / minimumDuration, 1);
    }
  } finally {
    pages.return();
  }
}

function focusFirst(root) {
  root.querySelector('input, button:not([disabled])')?.focus({ preventScroll: true });
}

function modalControls(event, el, escape) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    escape();
    return;
  }
  if (event.key !== "Tab") return;
  const candidates = [...el.querySelectorAll('button:not([disabled]), input:not([disabled])')];
  if (!candidates.length) {
    event.preventDefault();
    return;
  }
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  if (!el.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function mountDomain({ host, playSound, signal, eyeUrl }) {
  const trigger = button("gojo-domain-trigger", "");
  trigger.innerHTML = ICON + '<span>无量空处</span>';
  trigger.setAttribute("aria-label", "无量空处");
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.title = "无量空处 · 点击选择目标，或拖到另一会话";
  let picker = null;
  let transfer = null;
  let drag = null;
  let disposed = false;
  let suppressClick = false;
  let toastTimer;
  let toast;
  const approvalObserver = new MutationObserver(() => {
    if (!visibleApproval()) return;
    drag = null;
    suppressClick = true;
    closePicker(false);
    if (!transfer) return;
    if (transfer.committing) {
      if (!transfer.layer.hidden) transfer.layer.hidden = true;
    }
    else closeTransfer(transfer, false);
  });

  function watchApproval() {
    approvalObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "inert", "aria-hidden", "class", "style", "role", "data-approval-key", "open"],
    });
  }

  function stopWatchingApproval() {
    if (!transfer && !picker) approvalObserver.disconnect();
  }

  function announce(text) {
    toast?.remove();
    clearTimeout(toastTimer);
    toast = element("div", "gojo-domain-toast", text);
    toast.setAttribute("role", "status");
    overlayHost().append(toast);
    toastTimer = setTimeout(() => toast?.remove(), 3200);
  }

  function closePicker(restore = true) {
    if (!picker) return;
    picker.layer.remove();
    picker = null;
    stopWatchingApproval();
    trigger.setAttribute("aria-expanded", "false");
    if (restore) trigger.focus({ preventScroll: true });
  }

  function stopAttempt(task) {
    task.attempt?.abort();
    task.attempt = null;
    if (typeof task.stopSound === "function") task.stopSound();
    task.stopSound = null;
    if (task.canvas) {
      task.canvas.width = 0;
      task.canvas.height = 0;
      task.canvas.remove();
      task.canvas = null;
    }
  }

  function closeTransfer(task, restore = true) {
    if (transfer !== task) return;
    stopAttempt(task);
    task.operation.abort();
    task.fence = null;
    task.layer.remove();
    transfer = null;
    stopWatchingApproval();
    if (restore) {
      const focusTarget = task.preview && task.previousFocus?.isConnected ? task.previousFocus : trigger;
      focusTarget.focus({ preventScroll: true });
    }
  }

  function dismiss() {
    closePicker();
    if (transfer && !transfer.committing) closeTransfer(transfer);
    drag = null;
  }

  function displayError(task, message, controls) {
    if (transfer !== task) return;
    stopAttempt(task);
    task.layer.dataset.phase = "problem";
    task.status.textContent = message;
    task.controls.replaceChildren(...controls);
    focusFirst(task.controls);
  }

  async function commit(task) {
    if (transfer !== task || task.committing) return;
    stopAttempt(task);
    task.fence = null;
    if (task.preview) {
      closeTransfer(task, false);
      if (task.previousFocus?.isConnected) task.previousFocus.focus({ preventScroll: true });
      return;
    }
    task.committing = true;
    task.layer.dataset.phase = "landing";
    task.status.textContent = "正在追加来源会话 ID";
    task.controls.replaceChildren();
    try {
      await host.appendId(task.target.id, task.source.id, task.operation.signal);
    } catch {
      task.committing = false;
      if (task.layer.hidden) {
        closeTransfer(task, false);
        announce("目标会话现在无法写入草稿。");
        return;
      }
      displayError(task, "目标会话现在无法写入草稿。", [
        button("gojo-domain-control", "关闭", () => closeTransfer(task)),
      ]);
      return;
    }
    if (disposed || transfer !== task) return;
    closeTransfer(task, false);
    try {
      await host.focusTarget(task.target.id);
      if (!disposed) announce("来源会话 ID 已追加到草稿");
    } catch {
      if (!disposed) announce("ID 已写入草稿。请手动打开目标会话。");
    }
  }

  async function run(task) {
    if (transfer !== task || task.committing) return;
    stopAttempt(task);
    const attempt = new AbortController();
    task.attempt = attempt;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    task.layer.dataset.phase = "loading";
    task.status.textContent = task.preview ? "领域演示" : "正在准备会话历史";
    task.controls.replaceChildren(
      button("gojo-domain-control", task.preview ? "关闭演示" : "跳过动画并交接", () => commit(task)),
      button("gojo-domain-control gojo-domain-text-control", "取消", () => closeTransfer(task)),
    );
    if (!task.controls.contains(document.activeElement)) focusFirst(task.controls);
    let rows;
    try {
      if (task.preview) rows = PREVIEW;
      else if (task.fenceError) throw task.fenceError;
      else rows = await host.readHistory(task.source.id, attempt.signal, task.fence);
    } catch {
      if (attempt.signal.aborted || transfer !== task) return;
      displayError(task, "未能读取完整历史。可以重试或仅交接 ID。", [
        button("gojo-domain-control", "重试", () => {
          if (task.fenceError) freeze(task);
          run(task);
        }),
        button("gojo-domain-control", "仅交接 ID", () => commit(task)),
        button("gojo-domain-control gojo-domain-text-control", "取消", () => closeTransfer(task)),
      ]);
      return;
    }
    if (attempt.signal.aborted || transfer !== task) return;
    try {
      task.layer.dataset.phase = motion.matches ? "still" : "eye";
      task.status.textContent = motion.matches ? "领域展开 · 无量空处" : "领域展开";
      if (!motion.matches) {
        task.stopSound = playSound?.("domain");
        await delay(220, attempt.signal);
        task.layer.dataset.phase = "scan";
        if (rows.length) {
          task.canvas = element("canvas", "gojo-domain-canvas");
          task.canvas.setAttribute("aria-hidden", "true");
          task.stage.append(task.canvas);
          await animateScan(task.canvas, rows, task.status, attempt.signal);
        } else {
          task.status.textContent = "本会话暂无可见历史";
          await delay(500, attempt.signal);
        }
      } else {
        await delay(420, attempt.signal);
      }
      rows = null;
      task.layer.dataset.phase = motion.matches ? "still" : "flight";
      task.status.textContent = task.preview ? "领域演示" : "准备写入目标草稿";
      await delay(motion.matches ? 250 : 580, attempt.signal);
      await commit(task);
    } catch {
      if (attempt.signal.aborted || transfer !== task) return;
      displayError(task, "领域动画未能完成。", [
        button("gojo-domain-control", "重试", () => run(task)),
        button("gojo-domain-control", task.preview ? "关闭" : "仅交接 ID", () => commit(task)),
      ]);
    }
  }

  function freeze(task) {
    task.fenceError = null;
    try {
      task.fence = host.captureHistory?.(task.source.id);
    } catch (error) {
      task.fenceError = error;
    }
  }

  function openTransfer(source, target, preview = false) {
    if (transfer || disposed || visibleApproval()) return;
    const previousFocus = document.activeElement;
    const layer = element("section", "gojo-domain-overlay");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.setAttribute("aria-label", preview ? "无量空处演示" : "无量空处会话交接");
    layer.tabIndex = -1;

    const shell = element("div", "gojo-domain-theater");
    const top = element("header", "gojo-domain-top");
    const heading = element("div", "gojo-domain-title");
    heading.append(element("span", "gojo-domain-caption", "领域展开"), element("h2", "", "无量空处"));
    const connection = element("div", "gojo-domain-connection");
    connection.append(
      element("span", "", source.title || source.id),
      element("b", "", "→"),
      element("span", "", target.title || target.id),
    );
    top.append(heading, connection);

    const stage = element("div", "gojo-domain-stage");
    const eye = element("div", "gojo-domain-eye");
    eye.setAttribute("aria-hidden", "true");
    if (eyeUrl) {
      const image = element("img", "gojo-domain-eye-image");
      image.src = eyeUrl;
      image.alt = "";
      eye.append(image);
    }
    const focus = element("i", "gojo-domain-focus-line");
    eye.append(focus);
    const idCard = element("code", "gojo-domain-id", source.id);
    const landing = element("div", "gojo-domain-landing");
    landing.append(element("span", "", target.title || target.id), element("i", "", "草稿"));
    stage.append(eye, idCard, landing);
    const footer = element("footer", "gojo-domain-footer");
    const status = element("p", "gojo-domain-status");
    status.setAttribute("role", "status");
    const controls = element("div", "gojo-domain-controls");
    footer.append(status, controls);
    shell.append(top, stage, footer);
    layer.append(shell);
    const task = { source, target, layer, stage, controls, status, preview, previousFocus, operation: new AbortController(), committing: false };
    if (!preview) freeze(task);
    transfer = task;
    layer.addEventListener("keydown", (event) => modalControls(event, layer, () => {
      if (!task.committing) closeTransfer(task);
    }));
    overlayHost().append(layer);
    watchApproval();
    run(task);
  }

  function choose(target) {
    const source = picker?.source;
    if (!source || !target || target.id === source.id || target.writable === false || target.archived || transfer) return;
    closePicker(false);
    openTransfer(source, target);
  }

  function openPicker(source, keyboard) {
    if (transfer || disposed || visibleApproval()) return;
    closePicker(false);
    if (!source) {
      announce("请先打开来源会话");
      return;
    }
    let targets;
    try {
      targets = host.listTargets(source.id);
    } catch {
      announce("暂时无法读取目标会话");
      return;
    }
    const layer = element("div", "gojo-domain-picker-scrim");
    const panel = element("section", "gojo-domain-picker");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "选择交接目标");
    const top = element("header", "gojo-domain-picker-head");
    const label = element("div", "gojo-domain-picker-title");
    label.append(element("span", "gojo-domain-caption", "无量空处"), element("h2", "", "选择目标会话"));
    const close = button("gojo-domain-close", "×", () => closePicker());
    close.setAttribute("aria-label", "关闭会话选择");
    top.append(label, close);
    const from = element("p", "gojo-domain-picker-source", source.title || source.id);
    from.title = "来源会话";
    const search = element("input", "gojo-domain-search");
    search.type = "search";
    search.placeholder = "搜索名称或 ID";
    search.setAttribute("aria-label", "搜索目标会话");
    const list = element("div", "gojo-domain-targets");
    const hint = element("p", "gojo-domain-picker-hint", "拖放或选择一个会话。它的草稿会追加来源 ID。");
    const choices = targets.filter((target) => target.id !== source.id && target.writable !== false && !target.archived);
    function draw() {
      const query = search.value.toLocaleLowerCase().trim();
      const matching = choices.filter((target) => `${target.title ?? ""} ${target.id}`.toLocaleLowerCase().includes(query));
      const fragment = document.createDocumentFragment();
      for (const target of matching) {
        const row = button("gojo-domain-target", "", () => choose(target));
        row.dataset.targetId = target.id;
        row.append(element("span", "", target.title || target.id), element("small", "", target.id));
        fragment.append(row);
      }
      if (!matching.length) fragment.append(element("p", "gojo-domain-empty", query ? "没有匹配的会话" : "没有可写入的其他会话"));
      list.replaceChildren(fragment);
    }
    panel.append(top, from, search, list, hint);
    layer.append(panel);
    picker = { layer, panel, source, choices };
    layer.addEventListener("keydown", (event) => modalControls(event, panel, () => closePicker()));
    layer.addEventListener("click", (event) => {
      if (event.target === layer) closePicker();
    });
    search.addEventListener("input", draw);
    draw();
    overlayHost().append(layer);
    watchApproval();
    trigger.setAttribute("aria-expanded", "true");
    if (keyboard) search.focus({ preventScroll: true });
  }

  trigger.addEventListener("click", (event) => {
    if (suppressClick && event.detail !== 0) return;
    if (picker) closePicker();
    else openPicker(host.getSource(), true);
  });
  trigger.addEventListener("pointerdown", (event) => {
    suppressClick = false;
    if (event.button !== 0 || !event.isPrimary || transfer || picker) return;
    const source = host.getSource();
    if (!source) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, source, moved: false, over: null };
    trigger.setPointerCapture?.(event.pointerId);
  });
  trigger.addEventListener("pointermove", (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 7) {
      drag.moved = true;
      openPicker(drag.source, false);
      if (picker) picker.layer.dataset.dragging = "true";
    }
    if (!drag.moved || !picker) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".gojo-domain-target");
    if (drag.over === target) return;
    drag.over?.removeAttribute("data-drop");
    drag.over = target;
    target?.setAttribute("data-drop", "true");
  });
  trigger.addEventListener("pointerup", (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    const finished = drag;
    drag = null;
    if (!finished.moved) return;
    suppressClick = true;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest(".gojo-domain-target");
    const selected = picker?.choices.find((target) => target.id === row?.dataset.targetId);
    if (selected) choose(selected);
    else closePicker();
  });
  function cancelDrag() {
    if (!drag) return;
    if (drag.moved) closePicker();
    drag = null;
  }
  trigger.addEventListener("pointercancel", cancelDrag);
  trigger.addEventListener("lostpointercapture", cancelDrag);
  function onGlobalEscape(event) {
    if (event.key !== "Escape" || (!picker && !transfer)) return;
    const layer = picker?.layer ?? transfer?.layer;
    if (layer?.contains(event.target) || layer?.hidden || visibleApproval()) return;
    if (drag?.moved) suppressClick = true;
    event.preventDefault();
    event.stopImmediatePropagation();
    dismiss();
  }
  window.addEventListener("keydown", onGlobalEscape, true);
  document.addEventListener("visibilitychange", onVisibilityChange);

  function onVisibilityChange() {
    if (document.hidden && typeof transfer?.stopSound === "function") {
      transfer.stopSound();
      transfer.stopSound = null;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", dispose);
    window.removeEventListener("keydown", onGlobalEscape, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    clearTimeout(toastTimer);
    approvalObserver.disconnect();
    toast?.remove();
    closePicker(false);
    if (transfer) closeTransfer(transfer, false);
    trigger.remove();
    drag = null;
  }

  if (signal?.aborted) dispose();
  else signal?.addEventListener("abort", dispose, { once: true });

  return {
    button: trigger,
    preview() {
      closePicker(false);
      openTransfer({ id: "session-demo", title: "术式档案" }, { id: "preview", title: "交接演示" }, true);
    },
    dismiss,
    dispose,
  };
}
