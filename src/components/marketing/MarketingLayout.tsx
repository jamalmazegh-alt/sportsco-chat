import type { ReactNode } from "react";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingChatWidget } from "./MarketingChatWidget";

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      <MarketingChatWidget />
    </div>
  );
}
