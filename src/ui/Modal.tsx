import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { focusableIn, nextFocus, topOf, trapKey } from "./focusTrap";

/* One dialog shell for every modal that used to hand-roll it.

   axe found six modals with no role, no name and no trap — Tab walked
   straight out into the page behind. The fix is one component rather than
   six patches, and it renders exactly the class names those modals already
   used (.modal-backdrop, .modal, .modal-head, .icon-btn), so app.css does
   not change. The body is left to the caller: Settings, the preview and
   the rest each shape their own .modal-body.

   Keys are handled once, on window, in the capture phase, for the topmost
   open dialog only. Not on the dialog element: when a focused button is
   disabled or unmounted mid-action (Import's commit, Style me's run),
   focus drops to <body>, keydown never reaches the dialog again, and a
   dialog-level handler would stop closing on Escape and stop trapping
   Tab — the exact failure axe reported. Capture on window also runs ahead
   of the bubble listeners in ProjectsPanel and App, so Projects → Preview
   → Esc closes the preview and nothing else. The cost: an Escape or Tab
   pressed inside a dialog never reaches React's own handlers beneath it.
   A control that needs its own Escape (an inline edit, say) must claim it
   in a capture listener of its own before this one sees it.

   Focus lands on the shell, not the first control, so a screen reader
   reads the title before it reads "Close". */

type Layer = { order: number; root: HTMLElement; close: () => void };

const layers: Layer[] = [];
let opened = 0;

function onWindowKey(e: KeyboardEvent) {
  const top = topOf(layers);
  const action = trapKey(e);
  if (!top || !action) return;
  const active = document.activeElement;
  // Focus somewhere else entirely means another overlay (the command
  // palette, say) sits on top of this dialog and owns the keys.
  const inside = active instanceof Node && top.root.contains(active);
  const nowhere = active === null || active === document.body;
  if (!inside && !nowhere) return;
  e.preventDefault();
  e.stopPropagation();
  if (action === "close") {
    top.close();
    return;
  }
  const current = active instanceof HTMLElement ? active : null;
  const next = nextFocus<HTMLElement>(focusableIn(top.root), current, action === "back");
  (next ?? top.root).focus();
}

/* The trap without the shell, for a surface that is not a backdrop modal
   (QuickCreate's anchored popover). `root` must be focusable — give it
   tabIndex={-1}. */
export function useDialogFocus(
  root: RefObject<HTMLElement | null>,
  { active, onClose }: { active: boolean; onClose: () => void },
): void {
  // Every call site passes an inline arrow, so the latest one is read at
  // keypress time instead of re-registering the layer on every render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // The opener is captured during render, before commit. Read later, in
  // the effect, it would already be whatever a child's autoFocus or
  // effect had moved focus to — somewhere inside the dialog, and gone by
  // the time there is anything to restore. Kept in a ref so StrictMode's
  // rehearsal unmount does not lose it.
  const opener = useRef<Element | null>(null);
  const order = useRef(0);
  if (!active) {
    opener.current = null;
    order.current = 0;
  } else if (order.current === 0) {
    opener.current = document.activeElement;
    order.current = ++opened;
  }

  useEffect(() => {
    if (!active) return;
    const el = root.current;
    if (!el) return;
    const from = opener.current;
    const layer: Layer = { order: order.current, root: el, close: () => close.current() };
    if (layers.push(layer) === 1) window.addEventListener("keydown", onWindowKey, true);
    // A child that already took focus (QuickCreate's name field) keeps it.
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });

    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      if (layers.length === 0) window.removeEventListener("keydown", onWindowKey, true);
      // Give focus back only when closing left it nowhere or still inside
      // us — never steal it from something a close handler focused on
      // purpose.
      const now = document.activeElement;
      const orphaned = now === null || now === document.body || el.contains(now);
      if (orphaned && from instanceof HTMLElement && from.isConnected) {
        from.focus({ preventScroll: true });
      }
    };
  }, [root, active]);
}

type ModalProps = {
  title: ReactNode;
  onClose: () => void;
  /** Added after `modal` on the panel, e.g. "export-modal". */
  className?: string;
  /** Added after `modal-backdrop`. */
  backdropClassName?: string;
  closeTitle?: string;
  /** Overrides the visible title as the accessible name. */
  label?: string;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "title" | "className" | "children" | "role">;

export function Modal({
  title,
  onClose,
  className,
  backdropClassName,
  closeTitle = "Close (Esc)",
  label,
  ref,
  children,
  onClick,
  ...rest
}: ModalProps) {
  const inner = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useDialogFocus(inner, { active: true, onClose });

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      inner.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <div className={["modal-backdrop", backdropClassName].filter(Boolean).join(" ")} onClick={onClose}>
      <div
        {...rest}
        ref={setRef}
        className={["modal", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={label ? undefined : titleId}
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} title={closeTitle} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
