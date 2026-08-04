import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  listCampProgramItems,
  upsertCampProgramItem,
  deleteCampProgramItem,
  reorderCampProgramItems,
  type CampProgramItem,
} from "@/lib/camps-content.functions";

type Draft = {
  id?: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
};

const empty: Draft = { title: "", description: "", starts_at: "", ends_at: "" };

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // 'YYYY-MM-DDTHH:mm' in the user's local timezone.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatRange(startIso: string | null, endIso: string | null, lang: string): string {
  if (!startIso && !endIso) return "";
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  };
  const s = startIso ? new Date(startIso).toLocaleString(lang, opts) : "";
  const e = endIso
    ? new Date(endIso).toLocaleString(lang, { hour: "2-digit", minute: "2-digit" })
    : "";
  return s && e ? `${s} → ${e}` : s || e;
}

export function CampProgramEditor({
  campId,
  disabled = false,
}: {
  campId: string;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation("camps");
  const qc = useQueryClient();
  const listFn = useServerFn(listCampProgramItems);
  const upsertFn = useServerFn(upsertCampProgramItem);
  const deleteFn = useServerFn(deleteCampProgramItem);
  const reorderFn = useServerFn(reorderCampProgramItems);

  const { data: items = [] } = useQuery({
    queryKey: ["camp-program", campId],
    queryFn: () => listFn({ data: { campId } }),
  });

  const [localOrder, setLocalOrder] = useState<CampProgramItem[]>([]);
  useEffect(() => setLocalOrder(items), [items]);

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["camp-program", campId] });
  }

  const upsertMut = useMutation({
    mutationFn: (payload: Draft) =>
      upsertFn({
        data: {
          campId,
          item: {
            id: payload.id,
            title: payload.title.trim(),
            description: payload.description.trim() || null,
            starts_at: fromDateTimeLocal(payload.starts_at),
            ends_at: fromDateTimeLocal(payload.ends_at),
          },
        },
      }),
    onSuccess: () => {
      setDraft(empty);
      setShowForm(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { campId, id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) => reorderFn({ data: { campId, orderedIds } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = localOrder.findIndex((i) => i.id === active.id);
    const newIdx = localOrder.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(localOrder, oldIdx, newIdx);
    setLocalOrder(next);
    reorderMut.mutate(next.map((i) => i.id));
  }

  function beginEdit(item: CampProgramItem) {
    setDraft({
      id: item.id,
      title: item.title,
      description: item.description ?? "",
      starts_at: toDateTimeLocal(item.starts_at),
      ends_at: toDateTimeLocal(item.ends_at),
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-3">
      {localOrder.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">{t("program.empty")}</p>
      )}

      {localOrder.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={localOrder.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {localOrder.map((item) => (
                <SortableProgramRow
                  key={item.id}
                  item={item}
                  lang={i18n.language || "fr"}
                  disabled={disabled}
                  onEdit={() => beginEdit(item)}
                  onDelete={() => deleteMut.mutate(item.id)}
                  formatRange={formatRange}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {showForm ? (
        <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {draft.id ? t("program.editTitle") : t("program.addTitle")}
          </Label>
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={t("program.titlePlaceholder")}
            disabled={disabled}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("program.startsAt")}</Label>
              <Input
                type="datetime-local"
                value={draft.starts_at}
                onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("program.endsAt")}</Label>
              <Input
                type="datetime-local"
                value={draft.ends_at}
                onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
                disabled={disabled}
              />
            </div>
          </div>
          <Textarea
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder={t("program.descPlaceholder")}
            disabled={disabled}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => upsertMut.mutate(draft)}
              disabled={disabled || upsertMut.isPending || !draft.title.trim()}
            >
              {upsertMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span className="ml-1.5">{t("common.save")}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(empty);
                setShowForm(false);
              }}
            >
              <X className="h-4 w-4 mr-1.5" />
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(empty);
            setShowForm(true);
          }}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          {t("program.add")}
        </Button>
      )}
    </div>
  );
}

function SortableProgramRow({
  item,
  lang,
  disabled,
  onEdit,
  onDelete,
  formatRange,
}: {
  item: CampProgramItem;
  lang: string;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  formatRange: (s: string | null, e: string | null, l: string) => string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const range = formatRange(item.starts_at, item.ends_at, lang);
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-lg border border-border bg-card p-2"
    >
      <button
        type="button"
        className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label="reorder"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{item.title}</div>
        {range && <div className="text-xs text-muted-foreground">{range}</div>}
        {item.description && (
          <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">
            {item.description}
          </div>
        )}
      </div>
      <Button type="button" size="icon" variant="ghost" onClick={onEdit} disabled={disabled}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={onDelete} disabled={disabled}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  );
}
