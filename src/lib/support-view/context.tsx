import { createContext, useContext } from "react";
import type { SupportViewSessionDTO } from "@/lib/support-view/schemas";

export type SupportViewContextValue = {
  session: SupportViewSessionDTO;
  sessionId: string;
};

const Ctx = createContext<SupportViewContextValue | null>(null);

export function SupportViewProvider(props: {
  value: SupportViewContextValue;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={props.value}>{props.children}</Ctx.Provider>;
}

/** Throws if used outside a support-view branch — enforces cloisonnement. */
export function useSupportView(): SupportViewContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useSupportView must be used inside a support-view route branch. " +
        "Do not import components that call useSupportView from the normal app.",
    );
  }
  return v;
}
