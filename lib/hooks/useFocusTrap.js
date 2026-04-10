"use client";

import { useEffect } from "react";

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    return !el.hasAttribute("aria-hidden");
  });
}

export function useFocusTrap({ open, containerRef, onClose }) {
  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    if (!container) return;

    const previousActive = document.activeElement;
    const focusables = getFocusableElements(container);
    const initialTarget = focusables[0] || container;

    if (initialTarget instanceof HTMLElement) {
      initialTarget.focus();
    }

    function onKeyDown(event) {
      if (!containerRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = getFocusableElements(containerRef.current);
      if (!nodes.length) {
        event.preventDefault();
        if (containerRef.current instanceof HTMLElement) {
          containerRef.current.focus();
        }
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !containerRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !containerRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousActive instanceof HTMLElement) {
        previousActive.focus();
      }
    };
  }, [open, containerRef, onClose]);
}
