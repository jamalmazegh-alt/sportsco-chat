import type { ReactNode } from "react";

/**
 * Coque visuelle partagée entre le bandeau sponsor réel (page d'accueil) et la
 * preview admin. Garantit que les deux rendus utilisent la même structure
 * (bordures, fond, espacement, libellé). Le logo lui-même est passé en enfant.
 */
export function SponsorBannerFrame({
  label,
  children,
  action,
  ariaLabel,
  onClick,
  href,
}: {
  label: string;
  children: ReactNode;
  action?: boolean;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  href?: string;
}) {
  const inner = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="relative inline-flex max-w-full items-center justify-center overflow-visible transition-transform active:scale-[0.98] dark:bg-white dark:rounded-md dark:px-1.5 dark:py-0.5">
        {children}
      </span>
    </>
  );

  return (
    <div
      className="w-full border-y border-border/60 bg-transparent"
      style={{ borderTopWidth: "0.5px", borderBottomWidth: "0.5px" }}
    >
      {action && href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          aria-label={ariaLabel}
          className="group flex w-full min-h-12 cursor-pointer flex-col items-center justify-center gap-2 bg-transparent px-4 py-4 text-center transition-opacity hover:opacity-95 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {inner}
        </a>
      ) : (
        <div className="group flex w-full min-h-12 flex-col items-center justify-center gap-2 bg-transparent px-4 py-4 text-center">
          {inner}
        </div>
      )}
    </div>
  );
}
