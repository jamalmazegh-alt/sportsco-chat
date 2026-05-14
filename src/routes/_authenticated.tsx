import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { session, loading, memberships, refreshMemberships, user } = useAuth();
  const { t } = useTranslation();
  const [clubName, setClubName] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;

  if (memberships.length === 0) {
    return <NoMembershipScreen
      clubName={clubName}
      setClubName={setClubName}
      busy={busy}
      setBusy={setBusy}
      userId={user?.id ?? ""}
      onDone={refreshMemberships}
      t={t}
    />;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-xl">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
