import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type MentionUser = { id: string; full_name: string | null };

/** Encoded inline format: @[Full Name](user_id) */
export function parseMentions(text: string): string[] {
  const ids: string[] = [];
  const re = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ids.push(m[2]);
  return Array.from(new Set(ids));
}

/** Strip encoding for storage-friendly display (keeps @Name only). */
export function stripMentionMarkup(text: string): string {
  return text.replace(/@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g, "@$1");
}

/** Render text with highlighted @mentions (expects encoded format). */
export function RenderWithMentions({ text, className }: { text: string; className?: string }) {
  const parts: Array<{ type: "text" | "mention"; value: string; id?: string }> = [];
  const re = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "mention", value: m[1], id: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((p, i) =>
        p.type === "mention" ? (
          <span key={i} className="text-primary font-medium">@{p.value}</span>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </span>
  );
}

type Props = {
  clubId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  asInput?: boolean;
  className?: string;
};

export function MentionInput({ clubId, value, onChange, placeholder, rows = 3, asInput, className }: Props) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [members, setMembers] = useState<MentionUser[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState<number | null>(null);
  const [hover, setHover] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: cm } = await supabase
        .from("club_members").select("user_id").eq("club_id", clubId);
      const ids = Array.from(new Set((cm ?? []).map((r) => r.user_id)));
      if (!ids.length) return;
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name").in("id", ids);
      if (!cancelled) setMembers((profs ?? []) as MentionUser[]);
    })();
    return () => { cancelled = true; };
  }, [clubId]);

  const matches = useMemo(() => {
    if (!open) return [];
    const q = query.toLowerCase().trim();
    return members
      .filter((m) => (m.full_name ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [members, query, open]);

  function handleChange(next: string, caret: number) {
    onChange(next);
    // Find @ token before caret
    const before = next.slice(0, caret);
    const match = /(?:^|\s)@([\p{L}0-9 _-]{0,30})$/u.exec(before);
    if (match) {
      setOpen(true);
      setQuery(match[1]);
      setAnchor(caret - match[1].length - 1); // position of '@'
      setHover(0);
    } else {
      setOpen(false);
      setAnchor(null);
    }
  }

  function pick(u: MentionUser) {
    if (anchor == null || !u.full_name) { setOpen(false); return; }
    const before = value.slice(0, anchor);
    const after = value.slice(anchor + 1 + query.length);
    const token = `@[${u.full_name}](${u.id}) `;
    const next = before + token + after;
    onChange(next);
    setOpen(false);
    setAnchor(null);
    setTimeout(() => {
      const el = ref.current;
      if (el) {
        const pos = (before + token).length;
        el.focus();
        try { (el as HTMLTextAreaElement).setSelectionRange(pos, pos); } catch { /* noop */ }
      }
    }, 0);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHover((h) => (h + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHover((h) => (h - 1 + matches.length) % matches.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[hover]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  const baseCls = cn(
    "w-full rounded-md border border-border bg-background px-3 text-sm",
    asInput ? "h-9" : "py-2 min-h-[5rem]",
    className,
  );

  return (
    <div className="relative">
      {asInput ? (
        <input
          ref={(el) => { ref.current = el; }}
          value={value}
          placeholder={placeholder}
          className={baseCls}
          onKeyDown={onKeyDown}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        />
      ) : (
        <textarea
          ref={(el) => { ref.current = el; }}
          rows={rows}
          value={value}
          placeholder={placeholder}
          className={baseCls}
          onKeyDown={onKeyDown}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        />
      )}
      {open && matches.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-auto rounded-md border border-border bg-popover shadow-lg text-sm">
          {matches.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                onMouseEnter={() => setHover(i)}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-accent",
                  i === hover && "bg-accent",
                )}
              >
                {m.full_name ?? "—"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
