import { useMemo } from "react";

export function Stars() {
  const stars = useMemo(() => {
    return Array.from({ length: 90 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: Math.random() > 0.88 ? "star--lg" : "",
      duration: 25 + Math.random() * 45,
      delay: Math.random() * 30,
      opacity: 0.15 + Math.random() * 0.4,
    }));
  }, []);

  const asteroids = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 3 + Math.random() * 5,
      duration: 40 + Math.random() * 60,
      delay: Math.random() * 40,
      opacity: 0.15 + Math.random() * 0.2,
      rotation: Math.random() * 360,
      rotSpeed: 10 + Math.random() * 30,
    }));
  }, []);

  return (
    <div className="stars-container">
      {stars.map((s) => (
        <div
          key={`s${s.id}`}
          className={`star ${s.size}`}
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
            opacity: s.opacity,
          }}
        />
      ))}
      {asteroids.map((a) => (
        <div
          key={`a${a.id}`}
          className="asteroid"
          style={{
            left: `${a.left}%`,
            top: `${a.top}%`,
            width: a.size,
            height: a.size,
            animationDuration: `${a.duration}s`,
            animationDelay: `${a.delay}s`,
            opacity: a.opacity,
            // @ts-ignore
            "--rot-speed": `${a.rotSpeed}s`,
            "--init-rot": `${a.rotation}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
