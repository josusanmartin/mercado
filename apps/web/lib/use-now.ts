"use client";
import { useEffect, useState } from "react";

/** Unix seconds, ticking every `ms`. Undefined until mounted (keeps render pure for prerendering). */
export function useNow(ms = 1_000) {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const t = setInterval(tick, ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
