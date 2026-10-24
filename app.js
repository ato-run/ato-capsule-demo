import { SEAL, applySealProperties, cssEasing } from "./seal.js";
import { STRINGS, pickLang } from "./i18n.js";
import { playMovie } from "./movie.js";

const GRID = 8;
const CELLS = GRID * GRID;
const MIN_PAINT = 3;
const PALETTE = SEAL.colors.paint.length;
const RUN_IDS = ["B", "C"];

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const ms = (value) => (reduceMotion.matches ? 1 : value);

const els = {
  title: document.getElementById("title"),
  lang: document.getElementById("lang"),
  steps: document.getElementById("steps"),
  caption: document.getElementById("caption"),
  app: document.querySelector(".app"),
  stage: document.getElementById("stage"),
  actions: document.getElementById("actions"),
};

let lang = pickLang();
let t = STRINGS[lang];
let s = freshState();

function freshState() {
  return {
    phase: "work",
    color: 1,
    cells: new Array(CELLS).fill(0),
    steps: 0,
    capsule: null,
    runs: [],
    answer: null,
    verify: null,
    busy: false,
  };
}

// ---------------------------------------------------------------------------
// Embedding: a host player (FrameTrail or a plain <video> page) hears where the
// viewer is and can send the demo back to the start. Nothing here leaves the
// browser beyond these messages to the parent frame.

function notify(type, detail = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ source: "ato-capsule-demo", type, ...detail }, "*");
}

window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ato-capsule-demo:reset") restart();
});

// ---------------------------------------------------------------------------
// The ref is a hash of exactly what the Capsule holds. The API key is never
// part of the hashed bytes, which is what "leaves out" means on screen.

function canonical(cells, steps) {
  return JSON.stringify({ v: 1, grid: GRID, cells: cells.join(""), steps });
}

async function computeRef(cells, steps) {
  const bytes = new TextEncoder().encode(canonical(cells, steps));
  if (window.crypto && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return `cap_${hex(new Uint8Array(digest)).slice(0, 16)}`;
  }
  // Insecure contexts (a file:// preview) have no SubtleCrypto.
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (const byte of bytes) {
    a = Math.imul(a ^ byte, 0x01000193) >>> 0;
    b = Math.imul(b ^ byte, 0x5bd1e995) >>> 0;
  }
  return `cap_${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const painted = (cells) => cells.filter(Boolean).length;

// ---------------------------------------------------------------------------
// DOM helpers

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function svg(markup, className) {
  const wrap = document.createElement("span");
  wrap.className = className;
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = markup;
  return wrap;
}

const KEY_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg>';
const FORK_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 12h3l4-5M11.5 12l4 5"/></svg>';

/**
 * Swap the stage contents with a short cross-fade, and slide the Capsule from
 * where it was to where it now sits. Done by hand rather than with View
 * Transitions: WebKit's implementation injects an inline stylesheet that the
 * static edge's CSP (no 'unsafe-inline') refuses.
 */
async function swap(update) {
  if (reduceMotion.matches) {
    update();
    return;
  }
  const before = document.getElementById("capsule")?.getBoundingClientRect();
  await animate(els.stage, [{ opacity: 1 }, { opacity: 0.0 }], 140, "ease-out");
  update();
  const capsule = document.getElementById("capsule");
  const fadeIn = animate(els.stage, [{ opacity: 0 }, { opacity: 1 }], 220, "ease-in");
  if (before && capsule) {
    const after = capsule.getBoundingClientRect();
    const dx = before.left + before.width / 2 - (after.left + after.width / 2);
    const dy = before.top + before.height / 2 - (after.top + after.height / 2);
    const scale = before.width / after.width;
    els.stage.getAnimations().forEach((animation) => animation.finish());
    await animate(
      capsule,
      [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: "none" }],
      480,
      cssEasing("settle"),
    );
    return;
  }
  await fadeIn;
}

function animate(node, keyframes, duration, easing, delay = 0) {
  if (!node || !node.animate) return Promise.resolve();
  return node
    .animate(keyframes, { duration: ms(duration), delay: ms(delay), easing, fill: "both" })
    .finished.catch(() => {});
}

// ---------------------------------------------------------------------------
// Board

function board(cells, { editable = false, size = "normal", onPaint } = {}) {
  const grid = h("div", {
    class: `grid grid--${size}${editable ? " is-editable" : ""}`,
    role: editable ? "group" : "img",
    "aria-label": t.board(painted(cells)),
  });
  cells.forEach((value, index) => {
    const row = Math.floor(index / GRID) + 1;
    const col = (index % GRID) + 1;
    const cell = editable
      ? h("button", {
          type: "button",
          class: `cell c${value}`,
          "data-index": index,
          "aria-label": t.cell(row, col),
        })
      : h("span", { class: `cell c${value}`, "data-index": index });
    grid.append(cell);
  });
  if (!editable) return grid;

  let painting = false;
  const paintFromPoint = (event) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cell = target && target.closest(".cell");
    if (cell && grid.contains(cell)) onPaint(Number(cell.dataset.index), cell);
  };
  grid.addEventListener("pointerdown", (event) => {
    painting = true;
    grid.setPointerCapture(event.pointerId);
    paintFromPoint(event);
  });
  grid.addEventListener("pointermove", (event) => painting && paintFromPoint(event));
  const end = () => (painting = false);
  grid.addEventListener("pointerup", end);
  grid.addEventListener("pointercancel", end);
  // Keyboard activation arrives as a click with no pointer behind it.
  grid.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    const cell = event.target.closest(".cell");
    if (cell) onPaint(Number(cell.dataset.index), cell);
  });
  return grid;
}

function paintInto(target, index, cell) {
  if (target.cells[index] === s.color) return false;
  target.cells[index] = s.color;
  target.steps += 1;
  cell.className = `cell c${s.color}`;
  animate(cell, [{ transform: "scale(0.7)" }, { transform: "scale(1)" }], 220, cssEasing("settle"));
  return true;
}

function palette() {
  const group = h("div", { class: "palette", role: "radiogroup" });
  for (let n = 1; n <= PALETTE; n += 1) {
    group.append(
      h("button", {
        type: "button",
        role: "radio",
        class: `swatch c${n}`,
        "aria-checked": String(s.color === n),
        "aria-label": t.color(n),
        onclick: () => {
          s.color = n;
          group.querySelectorAll(".swatch").forEach((swatch, i) =>
            swatch.setAttribute("aria-checked", String(i + 1 === n)),
          );
        },
      }),
    );
  }
  return group;
}

function keyChip(label, { id } = {}) {
  return h(
    "span",
    { class: "key-chip", id },
    svg(KEY_ICON, "icon"),
    h("span", {}, label),
    h("span", { class: "key-mask", "aria-hidden": "true" }, "••••••"),
  );
}

// ---------------------------------------------------------------------------
// Capsule

function capsuleEl(capsule, { compact = false, withRing = true } = {}) {
  const ring = withRing
    ? svg(
        '<svg viewBox="0 0 300 120" preserveAspectRatio="none"><rect x="3" y="3" width="294" height="114" rx="57" ry="57" pathLength="1" fill="none" stroke-width="3"/></svg>',
        "capsule-ring",
      )
    : null;
  return h(
    "div",
    { class: `capsule${compact ? " capsule--compact" : ""}`, id: "capsule" },
    ring,
    board(capsule ? capsule.cells : s.cells, { size: "mini" }),
    h(
      "div",
      { class: "capsule-text" },
      h("span", { class: "capsule-label" }, t.capsule),
      h("code", { class: "capsule-ref", id: "capsule-ref" }, capsule ? capsule.ref : ""),
    ),
  );
}

function contents(capsule) {
  return h(
    "dl",
    { class: "contents" },
    h("div", {}, h("dt", {}, t.contains), h("dd", {}, t.containsValue(painted(capsule.cells), capsule.steps))),
    h("div", {}, h("dt", {}, t.excludes), h("dd", {}, t.apiKey)),
  );
}

function bindingTray(withKey) {
  return h(
    "div",
    { class: `binding-tray${withKey ? " has-key" : ""}`, id: "binding-tray" },
    h("span", { class: "binding-label" }, t.binding),
    h("span", { class: "binding-slot", id: "binding-slot" }, withKey ? keyChip(t.apiKey) : null),
  );
}

// ---------------------------------------------------------------------------
// Runs

function runPanel(run, index) {
  const added = run.steps - s.capsule.steps;
  const counter = h("span", { class: "run-steps" }, t.stepsCount(run.steps), " ", h("em", {}, t.stepsAdded(added)));
  const grid = board(run.cells, {
    editable: run.bound && run.id === "B" && s.phase !== "quiz",
    onPaint: (cellIndex, cell) => {
      if (!paintInto(run, cellIndex, cell)) return;
      counter.replaceChildren(t.stepsCount(run.steps), " ", h("em", {}, t.stepsAdded(run.steps - s.capsule.steps)));
    },
  });
  const key = run.bound
    ? keyChip(t.ownKey(run.id))
    : h(
        "button",
        {
          type: "button",
          class: "bind-button",
          onclick: () => {
            run.bound = true;
            setCaption(t.caption.handoffBound);
            rerenderStage();
            renderActions();
          },
        },
        svg(KEY_ICON, "icon"),
        t.bindKey(run.id),
      );
  return h(
    "section",
    { class: "run", "data-run": run.id, "aria-label": `${t.person(run.id)} · ${t.run(index + 1)}` },
    h(
      "header",
      { class: "run-head" },
      svg(FORK_ICON, "icon run-icon"),
      h("strong", {}, t.person(run.id)),
      h("span", { class: "run-label" }, t.run(index + 1)),
      counter,
    ),
    grid,
    run.id === "B" && run.bound && s.phase === "handoff" ? palette() : null,
    h("div", { class: "run-key" }, key),
  );
}

function startRun(id) {
  return { id, cells: s.capsule.cells.slice(), steps: s.capsule.steps, bound: false };
}

// ---------------------------------------------------------------------------
// Phases

const STEP_OF = { movie: -1, work: 0, stopped: 1, sealing: 2, sealed: 2, handoff: 3, second: 3, quiz: 4, done: 4 };

function renderChrome() {
  document.documentElement.lang = lang;
  els.app.classList.toggle("is-movie", s.phase === "movie");
  els.title.textContent = t.title;
  els.lang.textContent = t.langToggle;
  els.lang.setAttribute("lang", lang === "ja" ? "en" : "ja");
  const current = STEP_OF[s.phase];
  els.steps.replaceChildren(
    ...t.steps.map((label, i) =>
      h(
        "li",
        { class: i < current ? "is-done" : i === current ? "is-current" : "", "aria-current": i === current ? "step" : null },
        h("span", { class: "step-dot" }, String(i + 1)),
        h("span", { class: "step-label" }, label),
      ),
    ),
  );
}

function setCaption(text) {
  els.caption.textContent = text;
}

function captionFor() {
  switch (s.phase) {
    case "work":
      return painted(s.cells) >= MIN_PAINT ? `${t.caption.work} ${t.caption.workKey}` : t.caption.work;
    case "handoff":
      return s.runs[0] && s.runs[0].bound ? t.caption.handoffBound : t.caption.handoff;
    default:
      return t.caption[s.phase] || "";
  }
}

function workScene({ frozen = false } = {}) {
  const counter = h("span", { class: "work-steps", id: "work-steps" }, t.stepsCount(s.steps));
  const showKey = painted(s.cells) >= MIN_PAINT;
  const grid = board(s.cells, {
    editable: !frozen,
    onPaint: (index, cell) => {
      if (!paintInto(s, index, cell)) return;
      counter.textContent = t.stepsCount(s.steps);
      if (painted(s.cells) === MIN_PAINT) {
        setCaption(captionFor());
        revealKey();
        renderActions();
      }
    },
  });
  const card = h(
    "div",
    { class: `work-card${frozen ? " is-frozen" : ""}`, id: "work-card" },
    h("div", { class: "work-head" }, h("strong", {}, t.you), counter),
    h("div", { class: "work-board" }, grid, frozen ? h("span", { class: "continuation", "aria-hidden": "true" }) : null),
    frozen ? h("span", { class: "continuation-tag" }, t.continuesHere) : palette(),
    h("div", { class: `work-key${showKey ? " is-shown" : ""}`, id: "work-key" }, keyChip(t.apiKey, { id: "key-chip" })),
  );
  return h("div", { class: "scene scene--work" }, card, frozen ? bindingTray(false) : null);
}

function revealKey() {
  const slot = document.getElementById("work-key");
  if (!slot || slot.classList.contains("is-shown")) return;
  slot.classList.add("is-shown");
  // `translate`, not `transform`: the slot's own transform places it beside the card.
  animate(slot, [{ opacity: 0, translate: "0 6px" }, { opacity: 1, translate: "0 0" }], 360, cssEasing("settle"));
}

function sealedScene() {
  return h(
    "div",
    { class: "scene scene--sealed" },
    h("div", { class: "capsule-wrap" }, capsuleEl(s.capsule)),
    contents(s.capsule),
    bindingTray(true),
  );
}

function handoffScene() {
  return h(
    "div",
    { class: "scene scene--handoff" },
    h(
      "div",
      { class: "handoff-source" },
      capsuleEl(s.capsule, { compact: true, withRing: false }),
      s.phase === "second" || s.phase === "quiz"
        ? h("span", { class: "unchanged", id: "unchanged" }, svg(CHECK_ICON, "icon"), t.refUnchanged)
        : null,
      bindingTray(false),
    ),
    h("div", { class: `runs runs--${s.runs.length}` }, ...s.runs.map(runPanel)),
  );
}

function quizScene() {
  const q = t.quiz;
  const answered = s.answer != null;
  const options = q.options.map((label, i) =>
    h(
      "button",
      {
        type: "button",
        class: `option${answered && i === 1 ? " is-correct" : ""}${answered && i === s.answer && i !== 1 ? " is-wrong" : ""}`,
        "aria-pressed": String(s.answer === i),
        disabled: answered,
        onclick: () => answer(i),
      },
      h("span", { class: "option-mark" }, String.fromCharCode(65 + i)),
      label,
    ),
  );
  const panel = h("div", { class: "quiz" }, h("h2", { class: "quiz-question" }, q.question), h("div", { class: "options" }, ...options));
  if (answered && s.verify) {
    const [b, c] = s.runs;
    panel.append(
      h("p", { class: "feedback" }, h("strong", {}, q.feedback[s.answer]), " ", q.explain),
      h(
        "div",
        { class: "verify" },
        h("h3", {}, q.verifyTitle),
        verifyRow(q.stored, s.capsule.ref, null),
        verifyRow(q.recomputed, s.verify.recomputed, s.verify.recomputed === s.capsule.ref ? q.same : null),
        verifyRow(q.runB, s.verify.runB, q.different, true),
        h("p", { class: "record" }, h("span", {}, q.record), " ", q.recordValue(b.steps - s.capsule.steps, c.steps - s.capsule.steps)),
      ),
    );
  }
  return h("div", { class: "scene scene--quiz" }, panel, answered ? h("p", { class: "tagline" }, t.tagline) : null);
}

function verifyRow(label, ref, verdict, other = false) {
  return h(
    "div",
    { class: `verify-row${other ? " is-other" : ""}` },
    h("span", { class: "verify-label" }, label),
    h("code", {}, ref),
    verdict ? h("span", { class: "verdict" }, other ? null : svg(CHECK_ICON, "icon"), verdict) : h("span", {}),
  );
}

function sceneFor() {
  switch (s.phase) {
    case "work":
      return workScene();
    case "stopped":
      return workScene({ frozen: true });
    case "sealed":
      return sealedScene();
    case "handoff":
    case "second":
      return handoffScene();
    case "quiz":
    case "done":
      return quizScene();
    default:
      return null;
  }
}

function rerenderStage() {
  const scene = sceneFor();
  if (scene) els.stage.replaceChildren(scene);
}

function button(label, onClick, { primary = true, disabled = false, href } = {}) {
  if (href) {
    return h("a", { class: `ato-button ${primary ? "is-primary" : "is-secondary"}`, href, target: "_blank", rel: "noopener" }, label);
  }
  return h("button", { type: "button", class: `ato-button ${primary ? "is-primary" : "is-secondary"}`, disabled: disabled || s.busy, onclick: onClick }, label);
}

function renderActions() {
  const a = t.action;
  let nodes = [];
  switch (s.phase) {
    case "work":
      nodes = [button(a.stop, stop, { disabled: painted(s.cells) < MIN_PAINT })];
      break;
    case "stopped":
      nodes = [button(a.encap, seal)];
      break;
    case "sealed":
      nodes = [button(a.handoff, handoff)];
      break;
    case "handoff":
      nodes = [button(a.second, secondRun, { disabled: !s.runs[0].bound })];
      break;
    case "second":
      nodes = [button(a.check, check, { disabled: !s.runs[1] || !s.runs[1].bound })];
      break;
    case "done":
      nodes = [button(a.again, restart, { primary: false }), button(a.open, null, { href: "https://ato.run/" })];
      break;
    case "movie":
      nodes = [h("button", { type: "button", class: "quiet-button skip-button", onclick: () => movieSkip.abort() }, a.skip)];
      break;
    default:
      nodes = [];
  }
  els.actions.replaceChildren(...nodes);
}

function render() {
  renderChrome();
  setCaption(captionFor());
  rerenderStage();
  renderActions();
}

async function go(phase, { transition = true } = {}) {
  s.phase = phase;
  notify("ato-capsule-demo:step", { phase, step: STEP_OF[phase] + 1 });
  if (transition) await swap(render);
  else render();
}

// ---------------------------------------------------------------------------
// Transitions between beats

async function stop() {
  await go("stopped");
}

async function seal() {
  if (s.busy) return;
  s.busy = true;
  renderActions();
  s.phase = "sealing";
  renderChrome();
  setCaption(t.caption.sealing);
  notify("ato-capsule-demo:step", { phase: "sealing", step: 3 });

  const cells = Object.freeze(s.cells.slice());
  const refPromise = computeRef(cells, s.steps);

  const card = document.getElementById("work-card");
  const chip = document.getElementById("key-chip");
  const slot = document.getElementById("binding-slot");
  const tray = document.getElementById("binding-tray");
  const scene = card.parentElement;

  // Beat 1 — detach: the key leaves the work and lands in the binding tray.
  // It flies as a fixed-position copy, because the card it sits in is about
  // to fade out.
  const from = chip.getBoundingClientRect();
  const to = slot.getBoundingClientRect();
  const flying = keyChip(t.apiKey);
  flying.classList.add("key-chip--flying");
  flying.style.left = `${from.left}px`;
  flying.style.top = `${from.top}px`;
  document.body.append(flying);
  chip.style.visibility = "hidden";
  const detach = animate(
    flying,
    [
      { transform: "translate(0, 0)" },
      { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)` },
    ],
    SEAL.durationMs.detach,
    cssEasing("detach"),
    SEAL.startMs.detach,
  ).then(() => {
    tray.classList.add("has-key");
    slot.replaceChildren(keyChip(t.apiKey));
    flying.remove();
  });

  // Beat 2 — fold: the work closes into the capsule shape.
  const fold = animate(
    card,
    [
      { transform: "scale(1)", borderRadius: "20px", opacity: 1 },
      { transform: "scale(0.42)", borderRadius: "999px", opacity: 0 },
    ],
    SEAL.durationMs.fold,
    cssEasing("fold"),
    SEAL.startMs.fold,
  );

  const ref = await refPromise;
  s.capsule = Object.freeze({ cells, steps: s.steps, ref });

  // Beat 3 — the capsule appears where the work was and its ring closes.
  const capsule = capsuleEl({ cells, steps: s.steps, ref: "" });
  const wrap = h("div", { class: "capsule-wrap capsule-wrap--overlay" }, capsule);
  wrap.style.top = `${card.offsetTop}px`;
  wrap.style.height = `${card.offsetHeight}px`;
  scene.append(wrap);
  const ringEl = capsule.querySelector(".capsule-ring");
  const ringRect = ringEl.querySelector("rect");
  ringEl.classList.add("is-drawing");
  const appear = animate(
    capsule,
    [
      { opacity: 0, transform: "scale(0.9)" },
      { opacity: 1, transform: "scale(1)" },
    ],
    SEAL.durationMs.fold * 0.6,
    cssEasing("settle"),
    SEAL.startMs.fold + SEAL.durationMs.fold * 0.55,
  );
  const ring = animate(
    ringRect,
    [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    SEAL.durationMs.ring,
    cssEasing("fold"),
    SEAL.startMs.ring,
  ).then(() => ringEl.classList.remove("is-drawing"));

  // Beat 4 — the ref is written onto it.
  const refEl = capsule.querySelector("#capsule-ref");
  refEl.textContent = ref;
  const refIn = animate(
    refEl,
    [
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 1, transform: "none" },
    ],
    SEAL.durationMs.ref,
    cssEasing("settle"),
    SEAL.startMs.ref,
  );

  await Promise.all([detach, fold, appear, ring, refIn]);
  s.busy = false;
  await go("sealed");
  const list = els.stage.querySelector(".contents");
  animate(list, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], 360, cssEasing("settle"));
}

async function handoff() {
  s.runs = [startRun(RUN_IDS[0])];
  await go("handoff");
  const run = els.stage.querySelector('[data-run="B"]');
  animate(run, [{ opacity: 0, transform: "translateX(-24px)" }, { opacity: 1, transform: "none" }], 520, cssEasing("settle"));
}

async function secondRun() {
  const run = startRun(RUN_IDS[1]);
  s.runs = [s.runs[0], run];
  await go("second");
  const panel = () => els.stage.querySelector('[data-run="C"]');
  await animate(panel(), [{ opacity: 0, transform: "translateX(-24px)" }, { opacity: 1, transform: "none" }], 520, cssEasing("settle"));
  await wait(400);
  run.bound = true;
  rerenderStage();

  // C takes a different path from the same point.
  const path = continuationPath(run.cells);
  for (const index of path) {
    if (s.phase !== "second" || !panel()) return;
    run.cells[index] = 3;
    run.steps += 1;
    const cell = panel().querySelector(`.cell[data-index="${index}"]`);
    cell.className = "cell c3";
    panel()
      .querySelector(".run-steps")
      .replaceChildren(t.stepsCount(run.steps), " ", h("em", {}, t.stepsAdded(run.steps - s.capsule.steps)));
    animate(cell, [{ transform: "scale(0.7)" }, { transform: "scale(1)" }], 220, cssEasing("settle"));
    await wait(160);
  }
  const unchanged = document.getElementById("unchanged");
  animate(unchanged, [{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], 520, cssEasing("settle"));
  renderActions();
}

/** A short diagonal that starts next to the last square you painted. */
function continuationPath(cells) {
  const last = cells.reduce((acc, value, index) => (value ? index : acc), 0);
  let row = Math.floor(last / GRID);
  let col = last % GRID;
  const path = [];
  for (let i = 0; i < 6; i += 1) {
    row = (row + 1) % GRID;
    col = (col + (i % 2 === 0 ? 1 : 0)) % GRID;
    path.push(row * GRID + col);
  }
  return path;
}

const wait = (value) => new Promise((resolve) => setTimeout(resolve, ms(value)));

async function check() {
  s.answer = null;
  s.verify = null;
  await go("quiz");
}

async function answer(index) {
  s.answer = index;
  notify("ato-capsule-demo:answer", { answer: index, correct: index === 1 });
  const [b] = s.runs;
  s.verify = {
    recomputed: await computeRef(s.capsule.cells, s.capsule.steps),
    runB: await computeRef(b.cells, b.steps),
  };
  s.phase = "done";
  render();
  notify("ato-capsule-demo:complete", { answer: index, correct: index === 1 });
}

async function restart() {
  s = freshState();
  await go("work");
}

els.lang.addEventListener("click", () => {
  lang = lang === "ja" ? "en" : "ja";
  t = STRINGS[lang];
  render();
});

// The first ten seconds are watched, not touched. `?movie=0` starts straight
// at the board, for hosts that already played the concept clip; "Start again"
// does the same.
let movieSkip = new AbortController();

async function startMovie() {
  s.phase = "movie";
  movieSkip = new AbortController();
  renderChrome();
  setCaption("");
  renderActions();
  notify("ato-capsule-demo:step", { phase: "movie", step: 0 });
  await playMovie({
    stage: els.stage,
    lines: t.movie,
    ref: `${(await computeRef(new Array(CELLS).fill(0), 0)).slice(0, 12)}…`,
    reduceMotion: reduceMotion.matches,
    signal: movieSkip.signal,
  });
  if (s.phase !== "movie") return;
  s.phase = "work";
  notify("ato-capsule-demo:step", { phase: "work", step: 1 });
  render();
  animate(els.stage, [{ opacity: 0 }, { opacity: 1 }], 600, "ease-out");
}

applySealProperties(document.documentElement);
notify("ato-capsule-demo:ready");
if (new URLSearchParams(location.search).get("movie") === "0") render();
else startMovie();
