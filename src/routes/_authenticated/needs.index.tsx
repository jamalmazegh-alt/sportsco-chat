import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { HandHelping, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  listMyOpenNeeds,
  applyToEventNeed,
  withdrawSignup,
  declareUnavailable,
} from "@/lib/needs/needs.functions";
import { NeedCandidateCard } from "@/components/needs/need-candidate-card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/needs/")({
  head: () => ({
    meta: [
      { title: "Coups de main · Clubero" },
      { name: "description", content: "Besoins en volontaires du club" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NeedsFeedPage,
});

function NeedsFeedPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyOpenNeeds);
  const applyFn = useServerFn(applyToEventNeed);
  const withdrawFn = useServerFn(withdrawSignup);
  const unavailableFn = useServerFn(declareUnavailable);

  const { data, isLoading } = useQuery({
    queryKey: ["my-open-needs"],
    queryFn: () => listFn({ data: {} }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["my-open-needs"] });
    qc.invalidateQueries({ queryKey: ["home-my-open-needs"] });
  };

  const applyM = useMutation({
    mutationFn: (need_id: string) => applyFn({ data: { need_id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.applied"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const withdrawM = useMutation({
    mutationFn: (signup_id: string) => withdrawFn({ data: { signup_id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.withdrawn"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const unavailM = useMutation({
    mutationFn: (need_id: string) => unavailableFn({ data: { need_id } }),
    onSuccess: () => {
      toast.success(t("needs:unavailable.confirmed"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [unavailOpen, setUnavailOpen] = useState(false);
  const [declinedOpen, setDeclinedOpen] = useState(false);

  const allNeeds = (data?.needs ?? []) as any[];
  const activeNeeds = allNeeds.filter(
    (n) => n.my_signup?.status !== "unavailable" && n.my_signup?.status !== "declined",
  );
  const unavailNeeds = allNeeds.filter((n) => n.my_signup?.status === "unavailable");
  const declinedNeeds = allNeeds.filter((n) => n.my_signup?.status === "declined");

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <HandHelping className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-extrabold tracking-tight">
          {t("needs:feed.title")}
        </h1>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">…</p>}

      {!isLoading && allNeeds.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t("needs:feed.empty")}
          </CardContent>
        </Card>
      )}

      {activeNeeds.length > 0 && (
        <div className="space-y-2.5">
          {activeNeeds.map((n) => (
            <NeedCandidateCard
              key={n.id}
              need={n}
              showDescription
              onApply={() => {
                setPendingId(n.id);
                applyM.mutate(n.id);
              }}
              onWithdraw={() => {
                if (!n.my_signup) return;
                setPendingId(n.id);
                withdrawM.mutate(n.my_signup.id);
              }}
              onUnavailable={() => {
                setPendingId(n.id);
                unavailM.mutate(n.id);
              }}
              applyPending={pendingId === n.id && applyM.isPending}
              withdrawPending={pendingId === n.id && withdrawM.isPending}
              unavailablePending={pendingId === n.id && unavailM.isPending}
            />
          ))}
        </div>
      )}

      {unavailNeeds.length > 0 && (
        <div className="pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setUnavailOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground h-7 px-2"
          >
            {unavailOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {t("needs:unavailable.sectionTitleCount", { count: unavailNeeds.length })}
          </Button>
          {unavailOpen && (
            <div className="space-y-2.5 mt-2">
              {unavailNeeds.map((n) => (
                <NeedCandidateCard
                  key={n.id}
                  need={n}
                  showDescription
                  onApply={() => {
                    setPendingId(n.id);
                    applyM.mutate(n.id);
                  }}
                  applyPending={pendingId === n.id && applyM.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {declinedNeeds.length > 0 && (
        <div className="pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDeclinedOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground h-7 px-2"
          >
            {declinedOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {t("needs:declined.sectionTitleCount", { count: declinedNeeds.length })}
          </Button>
          {declinedOpen && (
            <div className="space-y-2.5 mt-2">
              {declinedNeeds.map((n) => (
                <NeedCandidateCard key={n.id} need={n} showDescription />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
