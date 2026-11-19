import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../Store";
import { prefersReducedMotion, shouldShowSnow } from "./snowSeason";
import styles from "./Snowfall.module.css";

interface Flake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  sway: number;
  phase: number;
}

// one flake per this many px of width, so a phone gets a light flurry and a wide monitor a fuller one
const PIXELS_PER_FLAKE = 14;
const MAX_FLAKES = 140;

/** Падающий снег поверх страницы: не ловит клики и не занимает места в разметке. */
export default function Snowfall() {
  const choice = useSelector((state: RootState) => state.preferences?.snowEnabled);
  const visible = shouldShowSnow(new Date(), choice, prefersReducedMotion());

  if (!visible) return null;
  return <SnowCanvas />;
}

function SnowCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let flakes: Flake[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = performance.now();
    let color = getComputedStyle(canvas).color;

    const makeFlake = (anywhere: boolean): Flake => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -5,
      radius: 1 + Math.random() * 2.5,
      speed: 20 + Math.random() * 45, // px per second
      sway: 10 + Math.random() * 25,
      phase: Math.random() * Math.PI * 2,
    });

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(MAX_FLAKES, Math.round(width / PIXELS_PER_FLAKE));
      flakes = Array.from({ length: count }, (_, index) => flakes[index] ?? makeFlake(true));
      // the theme may have changed together with the window
      color = getComputedStyle(canvas).color;
    };

    const draw = (time: number) => {
      // a long pause (hidden tab) must not teleport flakes across the screen
      const seconds = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      context.clearRect(0, 0, width, height);
      context.fillStyle = color;
      for (const flake of flakes) {
        flake.y += flake.speed * seconds;
        flake.phase += seconds;
        const x = flake.x + Math.sin(flake.phase) * flake.sway;
        if (flake.y > height + 5) Object.assign(flake, makeFlake(false));
        context.beginPath();
        context.arc(x, flake.y, flake.radius, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
        lastTime = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };

    // theme switch sets data-theme on <html>: pick up the new flake colour
    const themeObserver = new MutationObserver(() => {
      color = getComputedStyle(canvas).color;
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.snow} aria-hidden="true" />;
}
