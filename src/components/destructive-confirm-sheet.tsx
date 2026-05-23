import { useEffect, useState, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type BaseProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  /** What the destructive action does. Shown as bullet/list under description. */
  consequences?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
};

type DelayProps = BaseProps & {
  mode: "delay";
  /** seconds. default 3 */
  delaySeconds?: number;
};

type TypeProps = BaseProps & {
  mode: "type";
  /** word the user must type to unlock the confirm button. default "EFFACER" */
  confirmWord?: string;
};

type SimpleProps = BaseProps & {
  mode: "simple";
};

export type DestructiveConfirmSheetProps = DelayProps | TypeProps | SimpleProps;

/**
 * Friction-tiered destructive confirmation.
 *
 * - mode="simple"  → no friction, just a confirm button (use when consequences are reversible)
 * - mode="delay"   → confirm button locked for N seconds (default 3s)
 * - mode="type"    → confirm button locked until user types a specific word
 *
 * Renders as a bottom sheet on mobile, a centered dialog on desktop.
 */
export function DestructiveConfirmSheet(props: DestructiveConfirmSheetProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    consequences,
    confirmLabel,
    cancelLabel = "Annuler",
    onConfirm,
    loading,
  } = props;

  const isMobile = useIsMobile() ?? false;
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [typed, setTyped] = useState("");

  const delaySeconds = props.mode === "delay" ? (props.delaySeconds ?? 3) : 0;
  const confirmWord = props.mode === "type" ? (props.confirmWord ?? "EFFACER") : "";

  // Reset state when sheet opens
  useEffect(() => {
    if (!open) return;
    setTyped("");
    if (props.mode === "delay") {
      setSecondsLeft(delaySeconds);
    }
  }, [open, props.mode, delaySeconds]);

  // Countdown timer for delay mode
  useEffect(() => {
    if (!open || props.mode !== "delay" || secondsLeft <= 0) return;
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [open, props.mode, secondsLeft]);

  const unlocked = (() => {
    if (loading) return true; // visual: not blocking but loading shown
    if (props.mode === "delay") return secondsLeft === 0;
    if (props.mode === "type") return typed.trim().toUpperCase() === confirmWord.toUpperCase();
    return true;
  })();

  const body = (
    <>
      <div className="flex items-start gap-3 pt-2">
        <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div className="space-y-1 min-w-0">
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
      </div>

      {consequences && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
          {consequences}
        </div>
      )}

      {props.mode === "type" && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            Tape <span className="font-mono font-semibold text-foreground">{confirmWord}</span>{" "}
            pour débloquer
          </label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoComplete="off"
            autoCapitalize="characters"
            className="font-mono"
          />
        </div>
      )}
    </>
  );

  const footer = (
    <>
      <Button
        variant="ghost"
        onClick={() => onOpenChange(false)}
        disabled={loading}
        className="sm:order-1"
      >
        {cancelLabel}
      </Button>
      <Button
        variant="destructive"
        onClick={() => onConfirm()}
        disabled={!unlocked || loading}
        className={cn("sm:order-2", !unlocked && "opacity-60")}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : props.mode === "delay" && secondsLeft > 0 ? (
          `${confirmLabel} (${secondsLeft}s)`
        ) : (
          confirmLabel
        )}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[92dvh] p-0 flex flex-col overflow-hidden"
        >
          <SheetHeader className="shrink-0 px-6 pt-6 pb-3 pr-12 border-b border-border text-left">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-4">
            {body}
          </div>
          <SheetFooter className="shrink-0 flex-col gap-2 border-t border-border px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {footer}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {/* DialogDescription used as a screen-reader anchor only; visible copy is in body */}
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">{body}</div>
        <DialogFooter className="gap-2 sm:gap-2">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
