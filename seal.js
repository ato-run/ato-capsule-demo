// The one definition of how a seal looks and moves.
//
// The demo reads this file at runtime, and the Remotion clips are meant to
// read the same values (ms → frames with `ms * fps / 1000`, easing through
// `Easing.bezier(...SEAL.easing.fold)`), so the clip and the thing a viewer
// touches cannot drift apart.

export const SEAL = Object.freeze({
  version: 1,
  colors: Object.freeze({
    capsule: "#202b49",
    capsuleInk: "#ffffff",
    ring: "#ff8ca0",
    binding: "#8a93ab",
    paint: Object.freeze(["#ff8ca0", "#8fb8ff", "#7fd8b6"]),
  }),
  easing: Object.freeze({
    detach: Object.freeze([0.4, 0, 0.2, 1]),
    fold: Object.freeze([0.65, 0, 0.35, 1]),
    settle: Object.freeze([0.22, 1, 0.36, 1]),
  }),
  durationMs: Object.freeze({
    detach: 560,
    fold: 760,
    ring: 680,
    ref: 420,
  }),
  // Start offset of each beat from the moment encap is pressed.
  startMs: Object.freeze({
    detach: 0,
    fold: 380,
    ring: 980,
    ref: 1480,
  }),
});

export function sealTotalMs() {
  return Math.max(
    ...Object.keys(SEAL.startMs).map(
      (beat) => SEAL.startMs[beat] + SEAL.durationMs[beat],
    ),
  );
}

export function cssEasing(name) {
  return `cubic-bezier(${SEAL.easing[name].join(", ")})`;
}

/** Colours as custom properties, so the stylesheet never restates them. */
export function applySealProperties(root) {
  const { colors } = SEAL;
  root.style.setProperty("--seal-capsule", colors.capsule);
  root.style.setProperty("--seal-capsule-ink", colors.capsuleInk);
  root.style.setProperty("--seal-ring", colors.ring);
  root.style.setProperty("--seal-binding", colors.binding);
  colors.paint.forEach((value, index) =>
    root.style.setProperty(`--paint-${index + 1}`, value),
  );
}
