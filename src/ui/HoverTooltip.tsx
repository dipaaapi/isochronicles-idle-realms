import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hover card rendered in a portal on document.body with fixed positioning, so
 * no `overflow-hidden` / scrolling parent (HUD sidebar, modal body) can clip it.
 * It prefers the given side of the anchor, flips when there is no room, and is
 * clamped inside the viewport with an 8px margin.
 */
type Placement = 'top' | 'bottom' | 'left' | 'right';

interface HoverTooltipProps {
  anchor: HTMLElement | null;
  open: boolean;
  placement?: Placement;
  className?: string;
  children: ReactNode;
}

const GAP = 8;
const MARGIN = 8;

export function HoverTooltip({ anchor, open, placement = 'top', className = '', children }: HoverTooltipProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor || !cardRef.current) { setPos(null); return; }
    const a = anchor.getBoundingClientRect();
    const c = cardRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const fits: Record<Placement, boolean> = {
      top: a.top - GAP - c.height >= MARGIN,
      bottom: a.bottom + GAP + c.height <= vh - MARGIN,
      left: a.left - GAP - c.width >= MARGIN,
      right: a.right + GAP + c.width <= vw - MARGIN,
    };
    const opposite: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    const order: Placement[] = [placement, opposite[placement], 'left', 'right', 'top', 'bottom'];
    const side = order.find((p) => fits[p]) ?? placement;

    let left: number;
    let top: number;
    if (side === 'top' || side === 'bottom') {
      left = a.left + a.width / 2 - c.width / 2;
      top = side === 'top' ? a.top - GAP - c.height : a.bottom + GAP;
    } else {
      top = a.top + a.height / 2 - c.height / 2;
      left = side === 'left' ? a.left - GAP - c.width : a.right + GAP;
    }
    left = Math.min(Math.max(MARGIN, left), vw - MARGIN - c.width);
    top = Math.min(Math.max(MARGIN, top), vh - MARGIN - c.height);
    setPos({ left, top });
  }, [open, anchor, placement, children]);

  if (!open || !anchor) return null;
  return createPortal(
    <div
      ref={cardRef}
      role="tooltip"
      className={`pixel-ui fixed z-[1000] pointer-events-none max-w-[calc(100vw-16px)] ${className}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}
