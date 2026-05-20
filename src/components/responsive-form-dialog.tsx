import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger?: ReactNode;
  title: string;
  children: ReactNode;
};

export function ResponsiveFormDialog({ open, onOpenChange, trigger, title, children }: Props) {
  const isMobile = useIsMobile() ?? false;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[92dvh] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="sticky top-0 z-10 -mx-6 -mt-6 mb-2 bg-background px-6 pt-6 pb-3 rounded-t-3xl">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
