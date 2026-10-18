import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

// Hero background: one source point ("your key") fanning out into many routes
// that end at model nodes, with pulses travelling along them. Original artwork
// drawn on a canvas, so nothing to download and nothing to license.

type Route = { y: number; bend: number; endX: number; alpha: number };
type Pulse = { route: number; t: number; speed: number; accent: boolean };

const ROUTES = 26;
const PULSES = 34;
const ACCENT = "236, 168, 214";

function makeRoutes(): Route[] {
  return Array.from({ length: ROUTES }, (_, i) => {
    const y = (i + 0.5) / ROUTES;
    return {
      y,
      bend: 0.25 + Math.random() * 0.35,
      endX: 0.9 + Math.random() * 0.12,
      alpha: 0.05 + Math.random() * 0.12,
    };
  });
}

function makePulse(): Pulse {
  return {
    route: Math.floor(Math.random() * ROUTES),
    t: Math.random(),
    speed: 0.0012 + Math.random() * 0.0028,
    accent: Math.random() < 0.3,
  };
}

export function RoutingCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const routes = makeRoutes();
    const pulses = Array.from({ length: PULSES }, makePulse);
    let w = 0, h = 0, raf = 0, visible = true;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Cubic bezier from the source to a route's end node.
    function point(r: Route, t: number): [number, number] {
      const sx = w * 0.5, sy = h * 0.52;
      const ex = w * r.endX, ey = h * (0.08 + r.y * 0.84);
      const c1x = sx + (ex - sx) * r.bend, c1y = sy;
      const c2x = sx + (ex - sx) * (1 - r.bend * 0.5), c2y = ey;
      const u = 1 - t;
      return [
        u * u * u * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
        u * u * u * sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
      ];
    }

    function draw(advance: boolean) {
      ctx!.clearRect(0, 0, w, h);

      // Routes.
      ctx!.lineWidth = 1;
      for (const r of routes) {
        ctx!.strokeStyle = `rgba(255,255,255,${r.alpha})`;
        ctx!.beginPath();
        for (let i = 0; i <= 40; i++) {
          const [x, y] = point(r, i / 40);
          if (i === 0) ctx!.moveTo(x, y); else ctx!.lineTo(x, y);
        }
        ctx!.stroke();
        // End node.
        const [ex, ey] = point(r, 1);
        ctx!.fillStyle = `rgba(255,255,255,${r.alpha * 2.5})`;
        ctx!.fillRect(ex - 2, ey - 2, 4, 4);
      }

      // Pulses with short fading tails.
      for (const p of pulses) {
        const r = routes[p.route]!;
        const color = p.accent ? ACCENT : "255, 255, 255";
        for (let k = 0; k < 8; k++) {
          const t = p.t - k * 0.008;
          if (t < 0) break;
          const [x, y] = point(r, t);
          ctx!.fillStyle = `rgba(${color}, ${(p.accent ? 0.9 : 0.6) * (1 - k / 8)})`;
          ctx!.beginPath();
          ctx!.arc(x, y, k === 0 ? 1.8 : 1.2, 0, Math.PI * 2);
          ctx!.fill();
        }
        if (advance) {
          p.t += p.speed;
          if (p.t > 1.05) Object.assign(p, makePulse(), { t: 0 });
        }
      }

      // Source: the one key.
      const sx = w * 0.5, sy = h * 0.52;
      const glow = ctx!.createRadialGradient(sx, sy, 0, sx, sy, 90);
      glow.addColorStop(0, `rgba(${ACCENT}, 0.35)`);
      glow.addColorStop(1, `rgba(${ACCENT}, 0)`);
      ctx!.fillStyle = glow;
      ctx!.fillRect(sx - 90, sy - 90, 180, 180);
      ctx!.fillStyle = "#ffffff";
      ctx!.beginPath();
      ctx!.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx!.fill();
    }

    function loop() {
      if (visible) draw(true);
      raf = requestAnimationFrame(loop);
    }

    resize();
    const ro = new ResizeObserver(() => { resize(); draw(false); });
    ro.observe(canvas);
    // Stop drawing while the hero is scrolled out of view.
    const io = new IntersectionObserver(([e]) => { visible = e?.isIntersecting ?? true; });
    io.observe(canvas);

    if (reduced) draw(false);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [reduced]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
