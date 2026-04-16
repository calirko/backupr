import { useEffect, useRef } from "react";

const CELL_SIZE = 37;
const GLOW_RADIUS = 160;
const LINE_WIDTH = 1;
const COLOR = "40,40,40";
const BASE_OPACITY = 0.15;

export default function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;

      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;

      canvas.style.width = "100%";
      canvas.style.height = "100%";

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // reset scale safely
    };

    const draw = () => {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const { x: mx, y: my } = mouseRef.current;

      ctx.clearRect(0, 0, W, H);

      // Base grid
      ctx.lineWidth = LINE_WIDTH;

      for (let x = 0; x <= W; x += CELL_SIZE) {
        ctx.strokeStyle = `rgba(${COLOR}, ${BASE_OPACITY})`;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      for (let y = 0; y <= H; y += CELL_SIZE) {
        ctx.strokeStyle = `rgba(${COLOR}, ${BASE_OPACITY})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Glow effect (GPU-friendly)
      if (mx > 0) {
        const gradient = ctx.createRadialGradient(
          mx,
          my,
          0,
          mx,
          my,
          GLOW_RADIUS
        );

        gradient.addColorStop(0, `rgba(${COLOR}, 0.9)`);
        gradient.addColorStop(1, `rgba(${COLOR}, 0)`);

        ctx.globalCompositeOperation = "lighter";

        ctx.strokeStyle = gradient;

        for (let x = 0; x <= W; x += CELL_SIZE) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
          ctx.stroke();
        }

        for (let y = 0; y <= H; y += CELL_SIZE) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }

        ctx.globalCompositeOperation = "source-over";
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    resize();
    draw();

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="bg-black"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
