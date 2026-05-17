import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { searchUsers } from "@/lib/superadmin.functions";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/_superadmin/users")({
  component: SuperAdminUsers,
});

type Profile = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
};

function SuperAdminUsers() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      searchUsers({ data: { search: search || undefined, limit: 50 } })
        .then((r) => setItems(r.items as Profile[]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Global search across all platform users.
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or phone…"
            className="pl-9 h-9"
          />
        </div>
      </header>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Name</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Phone</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                <Loader2 className="h-4 w-4 inline animate-spin mr-2" /> Loading…
              </td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">No users.</td></tr>
            )}
            {!loading && items.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-muted/20">
                <td className="px-3 py-2">
                  {(u.full_name ?? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()) || "—"}
                  <div className="text-[10px] font-mono text-muted-foreground/70">{u.id.slice(0, 8)}</div>
                </td>
                <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{u.phone ?? "—"}</td>
                <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
