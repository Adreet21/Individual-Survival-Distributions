/**
 * ---------------------------------------------------------------------------------- 
 * CardShell
 * ----------------------------------------------------------------------------------
 * - A shared “shell” for cards (PredictorCard / DatasetCard).
 * - Handles layout (title, optional description, sticky-to-bottom footer),
 *   selection ring, and an action toolbar that sits in-flow (no overlap).
 *
 * Styling:
 * - Hover: subtle lift + scale + shadow when NOT selected.
 * - Click: quick zoom in/out via CSS animation.
 * - Selected: solid ring + slightly stronger shadow, but no hover pop-out.
 */

import { useState } from "react";
import type {
  PropsWithChildren,
  CSSProperties,
  KeyboardEvent,
  ReactNode,
  MouseEvent,
} from "react";

type CardShellProps = {
  title: ReactNode;
  description?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  onDoubleClick?: () => void;
  onActionAreaClick?: (e: MouseEvent) => void;
  actionVisibility?: "hover" | "selected" | "always";
  eyebrowLeft?: ReactNode;
};

const clamp3: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

export default function CardShell({
  title,
  description,
  footerLeft,
  footerRight,
  selected = false,
  onSelect,
  onDoubleClick,
  onActionAreaClick,
  actionVisibility = "hover",
  eyebrowLeft,
  children,
}: PropsWithChildren<CardShellProps>) {
  const [isClickAnimating, setIsClickAnimating] = useState(false);

  // Visibility classes that REMOVE layout space when hidden.
  const actionsRowClass =
    actionVisibility === "always"
      ? "flex"
      : actionVisibility === "selected"
      ? selected
        ? "flex"
        : "hidden"
      : // hover
        "hidden group-hover:flex";

  // We render the header row only if there’s either an eyebrowLeft OR visible actions.
  const showHeaderRow =
    Boolean(eyebrowLeft) ||
    actionVisibility === "always" ||
    (actionVisibility === "selected" && selected) ||
    actionVisibility === "hover"; // renders but hidden until hover (no space)

  const triggerSelect = () => {
    onSelect?.();
    setIsClickAnimating(true);
    window.setTimeout(() => {
      setIsClickAnimating(false);
    }, 170); 
  };

  const baseClasses =
    "group relative cursor-pointer rounded-md border border-neutral-200 bg-white p-4 shadow-card " +
    "transform-gpu transition-all duration-200 ease-out";

  const hoverClasses = selected
    ? ""
    : "hover:-translate-y-1 hover:scale-[1.03] hover:shadow-[0_18px_40px_rgba(15,23,42,0.18)] hover:z-10 hover:ring-1 hover:ring-neutral-400";

  const selectedClasses = selected
    ? "ring-2 ring-neutral-900 shadow-md"
    : "";

  const clickAnimClass = isClickAnimating ? "card-zoom" : "";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={triggerSelect}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          triggerSelect();
        }
      }}
      className={[
        baseClasses,
        hoverClasses,
        selectedClasses,
        clickAnimClass,
      ].join(" ")}
    >
      <div className="flex min-h-[168px] flex-col gap-1">
        {showHeaderRow ? (
          <div className="flex items-center justify-between">
            <div className="min-h-[1rem]">{eyebrowLeft}</div>
            {children ? (
              <div
                className={`${actionsRowClass} gap-1`}
                onClick={(e) => {
                  onActionAreaClick?.(e);
                  e.stopPropagation();
                }}
              >
                {children}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Title (separate from actions, never overlapped) */}
        <h3 className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-snug">
          {title}
        </h3>

        {/* Description */}
        {description ? (
          <div
            className="break-words text-sm leading-5 text-neutral-600 hyphens-auto"
            style={clamp3}
          >
            {description}
          </div>
        ) : null}

        {/* Footer pinned to bottom */}
        {(footerLeft || footerRight) && (
          <div className="mt-auto flex items-center justify-between text-xs">
            <div className="text-neutral-500">{footerLeft}</div>
            <div className="flex items-center gap-2">{footerRight}</div>
          </div>
        )}
      </div>
    </div>
  );
}
