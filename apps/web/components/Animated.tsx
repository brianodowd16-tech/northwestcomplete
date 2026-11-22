"use client";
import { useEffect, useState } from "react";

/** Counts up to `value` on first show (skipped when the visitor prefers reduced motion). */
export function CountUp({ value, format }: { value: number; format?: "eur" | "int" }) {
  const [n, setN] = useState(value);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || value === 0) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 700);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const text = format === "eur" ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(n / 100) : n.toLocaleString("en-IE");
  return <span className="num">{text}</span>;
}

/** A progress fill that grows to `pct` after the page appears. */
export function Grow({ pct, style }: { pct: number; style?: React.CSSProperties }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return <i style={{ width: `${w}%`, transition: "width .9s cubic-bezier(.2,.8,.2,1)", ...style }} />;
}
