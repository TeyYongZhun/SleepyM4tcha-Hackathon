"use client";

import { useEffect, type RefObject } from "react";

/**
 * Closes a <details> dropdown when the person moves on: a click anywhere outside it, Escape,
 * or tabbing past it. Left alone, a <details> stays open until its own summary is clicked
 * again, which is not how a menu is expected to behave.
 *
 * Listens on pointerdown rather than click so it closes as the press lands, instead of only
 * once the button underneath has been released.
 */
export function useDetailsDismiss(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const closeIfOutside = (e: Event) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("pointerdown", closeIfOutside);
    // Focus events don't bubble, so this relies on focusin rather than focus
    document.addEventListener("focusin", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("focusin", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [ref]);
}
