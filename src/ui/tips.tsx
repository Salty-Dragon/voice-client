// Tooltips. Any element with a `data-tip` attribute gets one, drawn by the
// single TipLayer at the top of the app. It sits above everything in a fixed
// position, so it is never clipped by a scrolling panel.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Spread onto an element: `<button {...tip("What this does")}>`. */
export const tip = (text: string) => ({ "data-tip": text });

const SHOW_DELAY_MS = 350;

export function TipLayer() {
  const [target, setTarget] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: number | undefined;
    let current: Element | null = null;

    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTarget(null);
    };
    const consider = (node: EventTarget | null, delay: number) => {
      const el = node instanceof Element ? node.closest("[data-tip]") : null;
      if (el === current) return;
      window.clearTimeout(timer);
      current = el;
      setTarget(null);
      if (!el) return;
      timer = window.setTimeout(() => {
        const text = el.getAttribute("data-tip");
        if (text && el.isConnected) setTarget({ text, rect: el.getBoundingClientRect() });
      }, delay);
    };

    const over = (e: PointerEvent) => consider(e.target, SHOW_DELAY_MS);
    // Keyboard users get the same help when they tab onto something.
    const focus = (e: FocusEvent) => {
      if (e.target instanceof Element && e.target.matches(":focus-visible")) consider(e.target, SHOW_DELAY_MS);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && hide();

    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Place it under the element, centred, kept inside the window; above if there is no room below.
  useLayoutEffect(() => {
    if (!target || !box.current) return setPos(null);
    const { width, height } = box.current.getBoundingClientRect();
    const gap = 8;
    const left = Math.max(gap, Math.min(window.innerWidth - width - gap, target.rect.left + target.rect.width / 2 - width / 2));
    const below = target.rect.bottom + gap;
    const top = below + height > window.innerHeight - gap ? Math.max(gap, target.rect.top - height - gap) : below;
    setPos({ left, top });
  }, [target]);

  if (!target) return null;
  return (
    <div ref={box} role="tooltip" className="tip" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}>
      {target.text}
    </div>
  );
}
