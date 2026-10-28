"use client";

import { useEffect, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

export type KeyboardShortcut = {
  keys: string[];
  description: string;
};

type KeyboardShortcutGuideProps = {
  shortcuts: KeyboardShortcut[];
  backHref?: string;
};

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("input, textarea, select, [contenteditable='true']") !== null)
  );
}

export default function KeyboardShortcutGuide({
  shortcuts,
  backHref,
}: KeyboardShortcutGuideProps) {
  const router = useRouter();

  useEffect(() => {
    function handleKeyboardNavigation(event: KeyboardEvent) {
      if (event.altKey || event.metaKey || isEditableTarget(event.target)) return;
      if (event.target instanceof HTMLElement && event.target.closest('[role="dialog"]')) {
        return;
      }

      if (event.ctrlKey && event.key === "ArrowLeft" && backHref) {
        event.preventDefault();
        router.push(backHref);
        return;
      }

      if (
        event.key === "Tab" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowUp"
      ) {
        const items = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-keyboard-menu] [data-keyboard-item]",
          ),
        ).filter((item) => !item.hasAttribute("disabled") && item.getClientRects().length > 0);

        if (items.length === 0) return;

        const currentIndex = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === "Tab") {
          event.preventDefault();
          const nextIndex =
            currentIndex === -1
              ? event.shiftKey
                ? items.length - 1
                : 0
              : (currentIndex + (event.shiftKey ? -1 : 1) + items.length) % items.length;
          items[nextIndex].focus();
          return;
        }

        if (
          (event.key === "ArrowDown" || event.key === "ArrowUp") &&
          currentIndex !== -1
        ) {
          event.preventDefault();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          items[(currentIndex + direction + items.length) % items.length].focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyboardNavigation, true);
    return () => window.removeEventListener("keydown", handleKeyboardNavigation, true);
  }, [backHref, router]);

  return (
    <aside className="keyboard-guide" aria-label="Keyboard shortcuts">
      <span className="keyboard-guide-label">
        <span className="keyboard-guide-spark" aria-hidden="true">✦</span>
        Quick keys
      </span>
      <ul className="keyboard-guide-list">
        {shortcuts.map((shortcut, index) => (
          <li
            className="keyboard-guide-item"
            key={shortcut.description}
            style={{ "--shortcut-index": index } as CSSProperties}
          >
            <span className="keyboard-guide-keys">
              {shortcut.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
            <span>{shortcut.description}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
