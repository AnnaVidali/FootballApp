"use client";

import { useEffect, useState } from "react";

/**
 * A clock that is safe to render.
 *
 * `Date.now()` must not be called during render: it is an impure call (the
 * React Compiler lint rules reject it) and the server and the browser would
 * compute different values, which React reports as a hydration mismatch.
 *
 * Instead the value is `null` for the server render *and* for the first
 * client render, and the real clock starts from an effect. The first tick is
 * scheduled with `setTimeout(0)` so the countdown appears immediately after
 * hydration rather than one second later.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initial = setTimeout(tick, 0);
    const interval = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [intervalMs]);

  return now;
}
