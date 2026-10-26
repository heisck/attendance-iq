"use client";

import { useEffect, useRef, useState } from "react";
import { LOGO_H, LOGO_PATHS, LOGO_W } from "./logoPaths";

// Load splash: snakes slide in along the grid from the screen edges, one after
// another, each laying down its own piece of the logo. The finished logo then
// shrinks into the page's [data-logo-anchor] (or the top-left corner).
const LAUNCH_SPREAD = 2600; // ms between the first and last snake setting off
const SPEED = 0.06; // cells per ms
const MIN_RUN = 1200; // ms, so short trips still glide
const HOLD = 600; // ms the finished logo rests before flying
const FLY = 900; // ms

const INK = "#000";

type Cell = [number, number];

const STEP: Record<string, Cell> = { R: [1, 0], L: [-1, 0], D: [0, 1], U: [0, -1] };

const PIECES: Cell[][] = LOGO_PATHS.map((p) => {
  const [start, moves] = p.split(":");
  const cells: Cell[] = [start.split(",").map(Number) as Cell];
  for (const m of moves) {
    const [x, y] = cells[cells.length - 1];
    cells.push([x + STEP[m][0], y + STEP[m][1]]);
  }
  return cells;
});

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u);

function splitInto(total: number, parts: number): number[] {
  const cuts = Array.from({ length: parts - 1 }, () => Math.random()).sort();
  const edges = [0, ...cuts, 1].map((f) => Math.round(f * total));
  return edges.slice(1).map((e, i) => e - edges[i]);
}

// Grid route from just off-screen to the piece, turning like a snake would,
// with `tail` extra cells behind the start so the body begins fully hidden.
function approach(piece: Cell[], view: { x0: number; y0: number; x1: number; y1: number }, tail: number): Cell[] {
  const [ex, ey] = piece[0];
  const mx = piece.reduce((s, c) => s + c[0], 0) / piece.length - LOGO_W / 2;
  const my = piece.reduce((s, c) => s + c[1], 0) / piece.length - LOGO_H / 2;
  // Come from the side the piece faces, with some spill toward the corners.
  const horizontal = Math.abs(mx) * rand(0.6, 1.4) > Math.abs(my);
  const sx = horizontal ? (mx < 0 ? view.x0 : view.x1) : Math.round(rand(view.x0, view.x1) * 0.5 + ex * 0.5);
  const sy = horizontal ? Math.round(rand(view.y0, view.y1) * 0.5 + ey * 0.5) : my < 0 ? view.y0 : view.y1;

  // Alternate axes, starting and ending on the one facing the logo.
  const legs = Math.random() < 0.5 ? 3 : 5;
  const axes = Array.from({ length: legs }, (_, i) => (i % 2 === 0) === horizontal);
  const hs = splitInto(ex - sx, axes.filter(Boolean).length);
  const vs = splitInto(ey - sy, legs - hs.length);
  const moves: Cell[] = [];
  for (const isH of axes) {
    const n = isH ? hs.shift()! : vs.shift()!;
    for (let k = 0; k < Math.abs(n); k++) moves.push(isH ? [Math.sign(n), 0] : [0, Math.sign(n)]);
  }

  const first = moves[0] ?? [1, 0];
  const route: Cell[] = [];
  for (let k = tail; k > 0; k--) route.push([sx - first[0] * k, sy - first[1] * k]);
  route.push([sx, sy]);
  for (const [dx, dy] of moves) {
    const [x, y] = route[route.length - 1];
    route.push([x + dx, y + dy]);
  }
  return [...route.slice(0, -1), ...piece];
}

export function Splash() {
  const [phase, setPhase] = useState<"build" | "fly" | "done">("build");
  const inkRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Hidden by CSS under reduced motion.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const c = Math.max(4, Math.floor(Math.min(w * 0.72, h * 0.45, 392) / LOGO_W));
    const ox = Math.round((w - LOGO_W * c) / 2);
    const oy = Math.round((h - LOGO_H * c) / 2);

    const view = {
      x0: Math.floor(-ox / c) - 1,
      y0: Math.floor(-oy / c) - 1,
      x1: Math.ceil((w - ox) / c),
      y1: Math.ceil((h - oy) / c),
    };
    const snakes = PIECES.map((piece, i) => {
      const route = approach(piece, view, piece.length);
      const travel = route.length - piece.length;
      return {
        route,
        len: piece.length,
        travel,
        start: (i / (PIECES.length - 1)) * LAUNCH_SPREAD,
        run: Math.max(MIN_RUN, travel / SPEED),
      };
    });
    const end = Math.max(...snakes.map((s) => s.start + s.run));

    // Snakes move on the logo's (invisible) cell grid, extended across the screen.
    const canvas = inkRef.current!;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ink = canvas.getContext("2d")!;
    ink.scale(dpr, dpr);
    ink.strokeStyle = INK;
    ink.lineWidth = c;
    ink.lineCap = "square";
    ink.lineJoin = "miter";
    const at = (route: Cell[], f: number): Cell => {
      const i = Math.floor(f);
      const a = route[i];
      const b = route[Math.min(i + 1, route.length - 1)];
      const t = f - i;
      return [ox + (a[0] + (b[0] - a[0]) * t + 0.5) * c, oy + (a[1] + (b[1] - a[1]) * t + 0.5) * c];
    };

    const t0 = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const t = now - t0;
      ink.clearRect(0, 0, w, h);
      for (const s of snakes) {
        if (t < s.start) continue;
        // Head index along the route; the body is the `len` cells behind it.
        const head = s.len - 1 + s.travel * easeOut(Math.min(1, (t - s.start) / s.run));
        const tail = head - s.len + 1;
        ink.beginPath();
        ink.moveTo(...at(s.route, tail));
        for (let k = Math.ceil(tail); k < head; k++) ink.lineTo(...at(s.route, k));
        ink.lineTo(...at(s.route, head));
        ink.stroke();
      }
      if (t < end) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const timers = [
      setTimeout(() => {
        // Pages can mark several anchors per layout; use the one that's visible.
        const box = [...document.querySelectorAll("[data-logo-anchor]")]
          .map((el) => el.getBoundingClientRect())
          .find((r) => r.width > 0);
        const size = box?.height ?? 36;
        const k = size / (LOGO_H * c);
        const tx = (box?.left ?? 16) + (box?.width ?? size) / 2 - (ox + (LOGO_W * c) / 2);
        const ty = (box?.top ?? 16) + size / 2 - (oy + (LOGO_H * c) / 2);
        const el = inkRef.current!;
        el.style.transformOrigin = `${ox + (LOGO_W * c) / 2}px ${oy + (LOGO_H * c) / 2}px`;
        el.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
        // Page-level animations (e.g. the sign-in portrait) wait for the reveal.
        document.documentElement.dataset.splash = "done";
        setPhase("fly");
      }, end + HOLD),
      setTimeout(() => setPhase("done"), end + HOLD + FLY + 50),
    ];
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div className="splash" data-phase={phase} aria-hidden="true" style={{ transitionDuration: `${FLY}ms` }}>
      <canvas ref={inkRef} className="splash-layer splash-ink" style={{ transitionDuration: `${FLY}ms` }} />
    </div>
  );
}
