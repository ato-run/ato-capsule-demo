# ato-capsule-demo

A hands-on demo of the Capsule idea: paint a few squares, stop, seal the work
as a Capsule, hand it to someone who resumes from exactly that point, and then
check that your Capsule did not change.

It is the interactive part of the Ato explainer (Remotion clips × FrameTrail
hypervideo). It also runs on its own.

## Run locally

No build step. Serve the folder and open it:

```sh
python3 -m http.server 5391
open http://127.0.0.1:5391/
```

`?lang=ja` or `?lang=en` overrides the browser language. `?movie=0` skips the
opening movie (for hosts that already played the concept clip).

## Opening movie

The first ten seconds are a concept movie the viewer only watches: work in
motion → it stops, with the way forward still there → the key comes out and
the rest is sealed into a Capsule → two Runs leave from the unchanged Capsule.
Its last frame is the demo's first screen. A small Skip button is the only
control while it plays; "Start again" goes straight to the board.

It is drawn in the page (SVG + Web Animations) rather than shipped as a video,
because Ato's static web delivery does not accept video media types. The beat
timings are exported as `MOVIE` from `movie.js` so a Remotion clip can follow
the same timeline.

## What the demo shows

| Step | The viewer | What it stands for |
|---|---|---|
| Work | paints squares; an API key appears | a computation in motion that also uses a secret |
| Stop | presses Stop | a point the work can continue from |
| Seal | presses Seal | the key is taken out (Binding); the rest becomes an immutable Capsule with a ref |
| Hand over | B resumes and paints on; C resumes from the same Capsule | each resume is its own Run |
| Check | answers one question, then sees the ref recomputed | the Capsule is unchanged; B's state is a different point |

The ref is the SHA-256 of exactly what the Capsule holds (board + step
count). The API key is never part of the hashed bytes. The Capsule's cells are
a frozen copy, and each Run starts from its own copy.

## Seal spec

`seal.js` is the single definition of the seal's colours, durations and
easing. The demo reads it at runtime; the Remotion clips should import the
same files (`ms * fps / 1000` for frames, `Easing.bezier(...SEAL.easing.fold)`
for curves) so the clip and the demo cannot drift apart.

## Embedding

The page posts these messages to its parent frame (FrameTrail or a plain
`<video>` page):

| `type` | Extra fields |
|---|---|
| `ato-capsule-demo:ready` | |
| `ato-capsule-demo:step` | `phase`, `step` (0 = movie, 1–5) |
| `ato-capsule-demo:answer` | `answer` (0–2), `correct` |
| `ato-capsule-demo:complete` | `answer`, `correct` |

Every message also carries `source: "ato-capsule-demo"`. Posting
`{ type: "ato-capsule-demo:reset" }` to the frame starts it over. Nothing is
sent over the network.

## Hosting constraints

The page is served by Ato's static web delivery, whose CSP allows only
same-origin scripts and styles: no inline `<script>`, `<style>` or `style=""`
attributes, and no external fonts. Styles are set through the CSSOM or the
stylesheet only.
