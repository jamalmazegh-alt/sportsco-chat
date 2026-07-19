import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ChevronRight, HandHelping } from "lucide-react";
import {
  listMyOpenNeeds,
  applyToEventNeed,
  withdrawSignup,
  declareUnavailable,
} from "@/lib/needs/needs.functions";
import { NeedCandidateCard } from "@/components/needs/need-candidate-card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function HomeNeedsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyOpenNeeds);
  const applyFn = useServerFn(applyToEventNeed);
  const withdrawFn = useServerFn(withdrawSignup);
  const unavailFn = useServerFn(declareUnavailable);

  const { data } = useQuery({
    queryKey: ["home-my-open-needs"],
    queryFn: () => listFn({ data: {} }),
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["home-my-open-needs"] });
    qc.invalidateQueries({ queryKey: ["my-open-needs"] });
  };

  const [pendingId, setPendingId] = useState<string | null>(null);

  const applyMut = useMutation({
    mutationFn: (need_id: string) => applyFn({ data: { need_id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.applied"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const withdrawMut = useMutation({
    mutationFn: (signup_id: string) => withdrawFn({ data: { signup_id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.withdrawn"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const unavailMut = useMutation({
    mutationFn: (need_id: string) => unavailFn({ data: { need_id } }),
    onSuccess: () => {
      toast.success(t("needs:unavailable.confirmed"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });

  const allNeeds = (data?.needs ?? []) as any[];
  // Hide needs the user marked unavailable (server persists it, cross-device)
  const needs = allNeeds.filter((n) => n.my_signup?.status !== "unavailable");
  const sorted = [...needs].sort((a, b) => {
    const aPending = !a.my_signup ? 0 : 1;
    const bPending = !b.my_signup ? 0 : 1;
    return aPending - bPending;
  });
  const visible = sorted.slice(0, 3);

  if (needs.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-[11px] font-bold text-foreground uppercase tracking-[0.14em] inline-flex items-center gap-1.5">
          <HandHelping className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
          {t("needs:feed.title")}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {needs.length}
          </Badge>
        </h2>
        <Link
          to="/needs"
          className="text-[11px] text-foreground font-bold inline-flex items-center gap-0.5 hover:text-[#2d9d5f] transition-colors"
        >
          {t("common.seeAll", { defaultValue: "Tout voir" })}
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {visible.map((n) => (
          <NeedCandidateCard
            key={n.id}
            need={n}
            onApply={() => {
              setPendingId(n.id);
              applyMut.mutate(n.id);
            }}
            onWithdraw={() => {
              if (!n.my_signup) return;
              setPendingId(n.id);
              withdrawMut.mutate(n.my_signup.id);
            }}
            onUnavailable={() => {
              setPendingId(n.id);
              unavailMut.mutate(n.id);
            }}
            applyPending={pendingId === n.id && applyMut.isPending}
            withdrawPending={pendingId === n.id && withdrawMut.isPending}
            unavailablePending={pendingId === n.id && unavailMut.isPending}
          />
        ))}
      </div>
    </section>
  );
}
