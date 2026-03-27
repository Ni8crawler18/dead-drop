import { useState, useRef, useEffect, useCallback } from "react";
import { CrewmateIcon } from "./CrewmateIcon";

const COLORS = ["#e63946", "#39d98a", "#ffc312", "#4dabf7", "#9775fa", "#ff6b6b", "#22d3ee", "#ff9f43"];

export function WalkingCrewmate() {
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: -40, y: 0 });
  const [direction, setDirection] = useState<1 | -1>(1); // 1 = right, -1 = left
  const [color] = useState(() => COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [bobFrame, setBobFrame] = useState(0);
  const animRef = useRef<number>(0);
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Walking animation
  useEffect(() => {
    if (dragging) return;

    let lastTime = 0;
    const speed = 0.6; // pixels per frame (~36px/sec at 60fps)

    const animate = (time: number) => {
      if (lastTime === 0) lastTime = time;
      const delta = time - lastTime;
      lastTime = time;

      setPos((prev) => {
        const width = window.innerWidth;
        let newX = prev.x + speed * direction * (delta / 16);

        // Bounce at edges
        if (newX > width - 20) {
          setDirection(-1);
          newX = width - 20;
        } else if (newX < -40) {
          setDirection(1);
          newX = -40;
        }

        return { ...prev, x: newX };
      });

      setBobFrame((f) => f + 1);
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [dragging, direction]);

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    setPos({ x: newX, y: newY });

    // Update direction based on movement
    if (e.movementX > 0) setDirection(1);
    else if (e.movementX < 0) setDirection(-1);
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
    // Snap back to bottom after release
    setPos((prev) => ({ ...prev, y: 0 }));
  }, []);

  // Bob animation (walking bounce)
  const bobY = dragging ? 0 : Math.sin(bobFrame * 0.15) * 2;
  const legTilt = dragging ? 0 : Math.sin(bobFrame * 0.15) * 3;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "fixed",
        bottom: pos.y === 0 ? 28 : "auto",
        top: pos.y !== 0 ? pos.y : "auto",
        left: pos.x,
        zIndex: 999,
        cursor: dragging ? "grabbing" : "grab",
        transform: `scaleX(${direction}) translateY(${bobY}px) rotate(${dragging ? "0deg" : `${legTilt}deg`})`,
        transition: dragging ? "none" : "transform 0.1s ease",
        userSelect: "none",
        touchAction: "none",
        filter: dragging ? "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" : "none",
      }}
    >
      <CrewmateIcon size={32} bodyColor={color} visorColor="#22d3ee" glow={dragging} />
    </div>
  );
}
