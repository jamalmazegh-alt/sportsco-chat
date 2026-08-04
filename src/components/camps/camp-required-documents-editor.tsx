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
import { GripVertical, Plus, Trash2, Pencil, Check, X, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listCampRequiredDocuments,
  upsertCampRequiredDocument,
  deleteCampRequiredDocument,
  reorderCampRequiredDocuments,
  SENSITIVE_DOCUMENT_TYPES,
  type CampRequiredDocument,
} from "@/lib/camps-content.functions";

// Socle: valeurs stockées strictement medical / license / authorization /
// health_form / insurance / other (voir CHECK sur club_camp_required_documents).
// Les libellés FR/EN restent libres côté i18n.
const DOC_TYPES = [
  { value: "__none", label: { fr: "Sans catégorie", en: "Uncategorized" } },
  { value: "medical", label: { fr: "Certificat médical", en: "Medical certificate" } },
  { value: "license", label: { fr: "Licence", en: "License" } },
  { value: "authorization", label: { fr: "Autorisation parentale", en: "Parental authorization" } },
  { value: "health_form", label: { fr: "Fiche sanitaire", en: "Health form" } },
  { value: "insurance", label: { fr: "Attestation d'assurance", en: "Insurance certificate" } },
  { value: "other", label: { fr: "Autre", en: "Other" } },
];

function typeLabel(v: string | null, lang: string): string {
  const key = (v ?? "__none").toLowerCase();
  const found = DOC_TYPES.find((d) => d.value === key);
  const l = lang.startsWith("en") ? "en" : "fr";
  return found ? found.label[l as "fr" | "en"] : (v ?? "");
}

type Draft = {
  id?: string;
  title: string;
  document_type: string; // "__none" | key
  required: boolean;
  is_sensitive: boolean;
};

const empty: Draft = {
  title: "",
  document_type: "__none",
  required: true,
  is_sensitive: false,
};

export function CampRequiredDocumentsEditor({
  campId,
  disabled = false,
}: {
  campId: string;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation("camps");
  const qc = useQueryClient();

  const listFn = useServerFn(listCampRequiredDocuments);
  const upsertFn = useServerFn(upsertCampRequiredDocument);
  const deleteFn = useServerFn(deleteCampRequiredDocument);
  const reorderFn = useServerFn(reorderCampRequiredDocuments);

  const { data: docs = [] } = useQuery({
    queryKey: ["camp-required", campId],
    queryFn: () => listFn({ data: { campId } }),
  });

  const [localOrder, setLocalOrder] = useState<CampRequiredDocument[]>([]);
  useEffect(() => setLocalOrder(docs), [docs]);

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);

  const typeIsSensitive = SENSITIVE_DOCUMENT_TYPES.has(draft.document_type);
  const effectiveSensitive = typeIsSensitive ? true : draft.is_sensitive;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["camp-required", campId] });
  }

  const upsertMut = useMutation({
    mutationFn: (payload: Draft) =>
      upsertFn({
        data: {
          campId,
          doc: {
            id: payload.id,
            title: payload.title.trim(),
            required: payload.required,
            document_type: payload.document_type === "__none" ? null : payload.document_type,
            is_sensitive: payload.is_sensitive,
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

  function beginEdit(doc: CampRequiredDocument) {
    setDraft({
      id: doc.id,
      title: doc.title,
      document_type: doc.document_type ?? "__none",
      required: doc.required,
      is_sensitive: doc.is_sensitive,
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-3">
      {localOrder.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">{t("required.empty")}</p>
      )}

      {localOrder.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={localOrder.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {localOrder.map((doc) => (
                <SortableRequiredRow
                  key={doc.id}
                  doc={doc}
                  lang={i18n.language || "fr"}
                  disabled={disabled}
                  onEdit={() => beginEdit(doc)}
                  onDelete={() => deleteMut.mutate(doc.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {showForm ? (
        <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {draft.id ? t("required.editTitle") : t("required.addTitle")}
          </Label>
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={t("required.titlePlaceholder")}
            disabled={disabled}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("required.type")}</Label>
              <Select
                value={draft.document_type}
                onValueChange={(v) => setDraft({ ...draft, document_type: v })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {typeLabel(d.value, i18n.language || "fr")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-between rounded-md border border-border px-3 py-2">
              <Label className="text-xs">{t("required.mandatory")}</Label>
              <Switch
                checked={draft.required}
                onCheckedChange={(v) => setDraft({ ...draft, required: v })}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                {t("required.sensitive")}
                {typeIsSensitive && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {typeIsSensitive ? t("required.sensitiveForced") : t("required.sensitiveHint")}
              </p>
            </div>
            <Switch
              checked={effectiveSensitive}
              onCheckedChange={(v) => !typeIsSensitive && setDraft({ ...draft, is_sensitive: v })}
              disabled={disabled || typeIsSensitive}
            />
          </div>

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
          {t("required.add")}
        </Button>
      )}
    </div>
  );
}

function SortableRequiredRow({
  doc,
  lang,
  disabled,
  onEdit,
  onDelete,
}: {
  doc: CampRequiredDocument;
  lang: string;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("camps");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: doc.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label="reorder"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{doc.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {doc.document_type && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
              {typeLabel(doc.document_type, lang)}
            </Badge>
          )}
          {doc.required ? (
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
              {t("required.mandatoryTag")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
              {t("required.optionalTag")}
            </Badge>
          )}
          {doc.is_sensitive && (
            <Badge className="text-[10px] py-0 px-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
              <Lock className="h-2.5 w-2.5 mr-0.5" />
              {t("required.sensitiveTag")}
            </Badge>
          )}
        </div>
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
