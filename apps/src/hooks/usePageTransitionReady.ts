"use client";

import { useEffect, useRef, useState } from "react";

export function usePageTransitionReady(
  transitionKey: string,
  enabled = true,
  settleDelayMs = 140,
): boolean {
  const [ready, setReady] = useState(true);
  const lastTransitionKeyRef = useRef(transitionKey);

  useEffect(() => {
    if (!enabled) {
      lastTransitionKeyRef.current = transitionKey;
      return;
    }

    if (lastTransitionKeyRef.current === transitionKey) {
      return;
    }

    lastTransitionKeyRef.current = transitionKey;

    let settled = false;
    let frameOne = 0;
    let frameTwo = 0;
    const markPendingTimer = window.setTimeout(() => {
      setReady(false);
    }, 0);
    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      setReady(true);
    };

    frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(settle);
    });
    const timer = window.setTimeout(settle, settleDelayMs);

    return () => {
      settled = true;
      window.clearTimeout(markPendingTimer);
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      window.clearTimeout(timer);
    };
  }, [enabled, settleDelayMs, transitionKey]);

  return enabled ? ready : true;
}
