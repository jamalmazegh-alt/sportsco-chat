import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TargetType = "player" | "coach" | "club";

interface Props {
  targetType: TargetType;
  targetId: string;
  size?: "sm" | "md";
  initialFollowersCount?: number;
  className?: string;
}

const COL: Record<TargetType, "followed_player_id" | "followed_coach_id" | "followed_club_id"> = {
  player: "followed_player_id",
  coach: "followed_coach_id",
  club: "followed_club_id",
};

export function FollowButton({ targetType, targetId, size = "md", initialFollowersCount, className }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const col = COL[targetType];

  const queryKey = ["follow-state", targetType, targetId, user?.id ?? null];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!user && !!targetId,
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user!.id)
        .eq("target_type", targetType)
        .eq(col, targetId)
        .maybeSingle();
      return { following: !!data, count: initialFollowersCount ?? 0 };
    },
    initialData:
      initialFollowersCount != null
        ? { following: false, count: initialFollowersCount }
        : undefined,
  });

  const isFollowing = data?.following ?? false;
  const count = data?.count ?? initialFollowersCount ?? 0;

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!user) throw new Error("not-auth");
      if (next) {
        const row: any = { follower_id: user.id, target_type: targetType, [col]: targetId };
        const { error } = await supabase.from("follows").insert(row);
        if (error && !/duplicate/i.test(error.message)) throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("target_type", targetType)
          .eq(col, targetId);
        if (error) throw error;
      }
    },
    onMutate: async (next: boolean) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<{ following: boolean; count: number }>(queryKey);
      qc.setQueryData(queryKey, {
        following: next,
        count: Math.max(0, (prev?.count ?? count) + (next ? 1 : -1)),
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(t("follow.error", { defaultValue: "Something went wrong, try again" }));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["following-list"] });
    },
  });

  function handleClick() {
    if (!user) {
      toast(t("follow.loginRequired", { defaultValue: "Log in to follow this profile" }));
      navigate({ to: "/login" });
      return;
    }
    mutation.mutate(!isFollowing);
  }

  const busy = mutation.isPending || isLoading;
  const Icon = isFollowing ? UserCheck : UserPlus;

  if (size === "sm") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant={isFollowing ? "default" : "outline"}
              onClick={handleClick}
              disabled={busy}
              aria-label={
                isFollowing
                  ? t("follow.following", { defaultValue: "Following" })
                  : t("follow.follow", { defaultValue: "Follow" })
              }
              className={cn(isFollowing && "bg-teal-600 hover:bg-teal-700 text-white border-teal-600", className)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isFollowing
              ? t("follow.following", { defaultValue: "Following ✓" })
              : t("follow.follow", { defaultValue: "Follow" })}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <Button
        type="button"
        variant={isFollowing ? "default" : "outline"}
        onClick={handleClick}
        disabled={busy}
        className={cn(isFollowing && "bg-teal-600 hover:bg-teal-700 text-white border-teal-600")}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
        {isFollowing
          ? t("follow.following", { defaultValue: "Following ✓" })
          : t("follow.follow", { defaultValue: "Follow" })}
      </Button>
      <span className="text-xs text-muted-foreground">
        {t("follow.followers", { count, defaultValue: "{{count}} follower(s)" })}
      </span>
    </div>
  );
}
