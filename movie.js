// The 10-second concept movie that plays before the demo becomes interactive.
//
// It is drawn in the page rather than shipped as a video: Ato's static web
// delivery does not accept video media types, and drawing it here means its
// last frame is literally the demo's first screen. Beats are in ms from the
// start, so a Remotion clip can follow the same timeline.

import { SEAL, cssEasing } from "./seal.js";

export const MOVIE = Object.freeze({
  totalMs: 10000,
  lines: Object.freeze([0, 2000, 4000, 6500]),
  draw: Object.freeze({ start: 0, duration: 1600 }),
  stop: Object.freeze({ start: 2000, duration: 600 }),
  detach: Object.freeze({ start: 3300, duration: SEAL.durationMs.detach }),
  fold: Object.freeze({ start: 4000, duration: SEAL.durationMs.fold }),
  capsule: Object.freeze({ start: 4500, duration: 600 }),
  ring: Object.freeze({ start: 5000, duration: SEAL.durationMs.ring }),
  ref: Object.freeze({ start: 5600, duration: SEAL.durationMs.ref }),
  shift: Object.freeze({ start: 6500, duration: 600 }),
  branch: Object.freeze({ start: 7000, duration: 1200 }),
  fadeOut: Object.freeze({ start: 8700, duration: 600 }),
  handoffMs: 9300,
});

const SQUARES = [
  [120, 186, 1],
  [178, 220, 2],
  [236, 190, 3],
  [294, 222, 1],
  [352, 186, 2],
  [410, 214, 3],
];
const KEY = { x: 290, y: 140, to: { x: 520, y: 350 } };
const CENTER = { x: 480, y: 210 };

function scene(ref) {
  const squares = SQUARES.map(
    ([x, y, c]) => `<rect class="m-square p${c}" x="${x}" y="${y}" width="16" height="16" rx="4"/>`,
  ).join("");
  const mini = [0, 1, 2, 3]
    .flatMap((row) =>
      [0, 1, 2, 3].map((col) => {
        const lit = (row === 1 && col < 2) || (row === 2 && col === 1) || (row === 3 && col === 3);
        const c = lit ? ` p${((row + col) % 3) + 1}` : "";
        return `<rect class="m-mini${c}" x="${394 + col * 11}" y="${188 + row * 11}" width="8" height="8" rx="2"/>`;
      }),
    )
    .join("");
  return `
<svg class="movie-svg" viewBox="0 0 960 420" role="img" aria-hidden="true">
  <path class="m-continuation" d="M448 210 H900"/>
  <path class="m-line" d="M60 210 H440" pathLength="1"/>
  <circle class="m-head" cx="60" cy="210" r="7"/>
  ${squares}
  <path class="m-tether" d="M${KEY.x} ${KEY.y + 12} V204"/>
  <g class="m-tray">
    <rect x="390" y="326" width="180" height="48" rx="24"/>
    <text x="414" y="355">Binding</text>
  </g>
  <g class="m-key">
    <circle cx="${KEY.x}" cy="${KEY.y}" r="8"/>
    <path d="M${KEY.x + 6} ${KEY.y - 6} l14 -14 m-5 5 l5 5 m-9 -1 l4 4"/>
  </g>
  <path class="m-branch p2" d="M420 210 C 560 210, 640 112, 900 112" pathLength="1"/>
  <path class="m-branch p3" d="M420 210 C 560 210, 640 308, 900 308" pathLength="1"/>
  <g class="m-run m-run--b"><circle cx="900" cy="112" r="7"/><text x="868" y="92">Run</text></g>
  <g class="m-run m-run--c"><circle cx="900" cy="308" r="7"/><text x="868" y="340">Run</text></g>
  <g class="m-capsule">
    <rect class="m-capsule-body" x="360" y="162" width="240" height="96" rx="48"/>
    ${mini}
    <text class="m-capsule-label" x="458" y="203">CAPSULE</text>
    <text class="m-capsule-ref" x="458" y="228">${ref}</text>
    <rect class="m-ring" x="352" y="154" width="256" height="112" rx="56" pathLength="1"/>
  </g>
</svg>`;
}

/**
 * Plays the movie inside `stage`. Resolves when it ends or is skipped; a
 * skip cancels every running animation by removing the scene.
 */
export function playMovie({ stage, lines, ref, reduceMotion, signal }) {
  const root = document.createElement("div");
  root.className = "movie";
  root.innerHTML = scene(ref);
  const caption = document.createElement("p");
  caption.className = "movie-line";
  caption.setAttribute("aria-live", "polite");
  root.append(caption);
  stage.replaceChildren(root);

  const svg = root.querySelector("svg");
  const q = (selector) => svg.querySelector(selector);
  const all = (selector) => Array.from(svg.querySelectorAll(selector));
  const run = (node, keyframes, { start, duration }, easing = "linear") =>
    node.animate(keyframes, {
      // Reduced motion keeps the beats but cuts between them.
      duration: reduceMotion ? 1 : duration,
      delay: start,
      easing,
      // Never "backwards": a later beat on the same property would otherwise
      // pin its first keyframe from t=0. Initial states live in styles.css.
      fill: "forwards",
    });

  const settle = cssEasing("settle");
  const fold = cssEasing("fold");

  // 0–2s: work in motion.
  run(q(".m-line"), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], MOVIE.draw, "cubic-bezier(0.3, 0, 0.4, 1)");
  run(q(".m-head"), [{ transform: "translateX(0)" }, { transform: "translateX(380px)" }], MOVIE.draw, "cubic-bezier(0.3, 0, 0.4, 1)");
  all(".m-square").forEach((square, i) =>
    run(square, [{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1)" }], { start: 200 + i * 230, duration: 360 }, settle),
  );
  run(q(".m-key"), [{ opacity: 0 }, { opacity: 1 }], { start: 700, duration: 400 });
  run(q(".m-tether"), [{ opacity: 0 }, { opacity: 1 }], { start: 700, duration: 400 });

  // 2–4s: it stops; the way forward is still there.
  run(q(".m-continuation"), [{ opacity: 0 }, { opacity: 1 }], MOVIE.stop);
  run(q(".m-head"), [{ scale: "1" }, { scale: "1.6" }, { scale: "1" }], MOVIE.stop, settle);
  run(q(".m-tether"), [{ opacity: 1 }, { opacity: 0 }], { start: MOVIE.detach.start, duration: 200 });
  run(q(".m-tray"), [{ opacity: 0 }, { opacity: 1 }], { start: MOVIE.detach.start - 200, duration: 400 });
  run(
    q(".m-key"),
    [{ transform: "translate(0, 0)" }, { transform: `translate(${KEY.to.x - KEY.x}px, ${KEY.to.y - KEY.y}px)` }],
    MOVIE.detach,
    cssEasing("detach"),
  );

  // 4–6.5s: everything else folds into a Capsule.
  all(".m-square").forEach((square, i) => {
    const [x, y] = SQUARES[i];
    run(
      square,
      [{ transform: "translate(0, 0) scale(1)", opacity: 1 }, { transform: `translate(${CENTER.x - x - 8}px, ${CENTER.y - y - 8}px) scale(0.3)`, opacity: 0 }],
      MOVIE.fold,
      fold,
    );
  });
  run(q(".m-line"), [{ opacity: 1 }, { opacity: 0 }], MOVIE.fold, fold);
  run(q(".m-head"), [{ opacity: 1 }, { opacity: 0 }], MOVIE.fold, fold);
  run(q(".m-continuation"), [{ opacity: 1 }, { opacity: 0 }], MOVIE.fold, fold);
  run(q(".m-capsule"), [{ opacity: 0, transform: "scale(0.88)" }, { opacity: 1, transform: "scale(1)" }], MOVIE.capsule, settle);
  run(q(".m-ring"), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], MOVIE.ring, fold);
  run(q(".m-capsule-ref"), [{ opacity: 0 }, { opacity: 1 }], MOVIE.ref, settle);

  // 6.5–8.7s: the Capsule stays put while two Runs leave from it.
  run(q(".m-capsule"), [{ transform: "translateX(0)" }, { transform: "translateX(-180px)" }], MOVIE.shift, settle);
  run(q(".m-tray"), [{ transform: "translateX(0)" }, { transform: "translateX(-180px)" }], MOVIE.shift, settle);
  run(q(".m-key"), [{ translate: "0 0" }, { translate: "-180px 0" }], MOVIE.shift, settle);
  all(".m-branch").forEach((branch, i) =>
    run(branch, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { start: MOVIE.branch.start + i * 200, duration: MOVIE.branch.duration }, settle),
  );
  all(".m-run").forEach((node, i) =>
    run(node, [{ opacity: 0 }, { opacity: 1 }], { start: MOVIE.branch.start + MOVIE.branch.duration - 300 + i * 200, duration: 400 }, settle),
  );

  // 8.7–9.3s: clear the frame for the demo.
  run(svg, [{ opacity: 1 }, { opacity: 0 }], MOVIE.fadeOut, "ease-in");

  // Caption lines.
  const timers = lines.map((text, i) =>
    setTimeout(() => {
      caption.textContent = text;
      if (!reduceMotion) caption.animate([{ opacity: 0, translate: "0 6px" }, { opacity: 1, translate: "0 0" }], { duration: 420, easing: settle });
    }, MOVIE.lines[i]),
  );
  const fadeCaption = setTimeout(
    () => caption.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduceMotion ? 1 : 500, fill: "both" }),
    MOVIE.fadeOut.start,
  );

  return new Promise((resolve) => {
    const done = () => {
      timers.forEach(clearTimeout);
      clearTimeout(fadeCaption);
      clearTimeout(end);
      resolve();
    };
    const end = setTimeout(done, MOVIE.handoffMs);
    signal.addEventListener("abort", done, { once: true });
  });
}
