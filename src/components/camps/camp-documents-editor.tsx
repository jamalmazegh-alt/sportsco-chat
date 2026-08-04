import { useEffect, useRef, useState } from "react";
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
import {
  GripVertical,
  Upload,
  Trash2,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  listCampDocuments,
  createSignedCampDocumentUpload,
  addCampDocumentFromUpload,
  deleteCampDocument,
  reorderCampDocuments,
  type CampDocument,
} from "@/lib/camps-content.functions";

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_BYTES = 15 * 1024 * 1024;
const BUCKET = "attachments";

export function CampDocumentsEditor({
  campId,
  disabled = false,
}: {
  campId: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation("camps");
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingTitle, setPendingTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  const listFn = useServerFn(listCampDocuments);
  const signFn = useServerFn(createSignedCampDocumentUpload);
  const addFn = useServerFn(addCampDocumentFromUpload);
  const deleteFn = useServerFn(deleteCampDocument);
  const reorderFn = useServerFn(reorderCampDocuments);

  const { data: docs = [] } = useQuery({
    queryKey: ["camp-documents", campId],
    queryFn: () => listFn({ data: { campId } }),
  });

  const [localOrder, setLocalOrder] = useState<CampDocument[]>([]);
  useEffect(() => setLocalOrder(docs), [docs]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["camp-documents", campId] });
  }

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

  async function handleUpload(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(t("documents.tooLarge"));
      return;
    }
    setUploading(true);
    try {
      const { path, token } = await signFn({
        data: {
          campId,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        },
      });
      const { error } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw error;
      const title = pendingTitle.trim() || file.name.replace(/\.[^.]+$/, "");
      await addFn({ data: { campId, path, title, documentType: null } });
      setPendingTitle("");
      invalidate();
      toast.success(t("documents.uploaded"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {localOrder.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={localOrder.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {localOrder.map((doc) => (
                <SortableDocRow
                  key={doc.id}
                  doc={doc}
                  disabled={disabled}
                  onDelete={() => deleteMut.mutate(doc.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("documents.addTitle")}
        </Label>
        <Input
          value={pendingTitle}
          onChange={(e) => setPendingTitle(e.target.value)}
          placeholder={t("documents.titlePlaceholder")}
          disabled={disabled || uploading}
        />
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span className="ml-1.5">{t("documents.upload")}</span>
          </Button>
          <span className="text-[11px] text-muted-foreground">{t("documents.maxHint")}</span>
        </div>
      </div>
    </div>
  );
}

function SortableDocRow({
  doc,
  disabled,
  onDelete,
}: {
  doc: CampDocument;
  disabled: boolean;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: doc.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const isPdf = /\.pdf(?:\?|$)/i.test(doc.file_url);
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
      {isPdf ? (
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <a
        href={doc.file_url}
        target="_blank"
        rel="noreferrer"
        className="flex-1 min-w-0 text-sm text-primary hover:underline truncate flex items-center gap-1.5"
      >
        <span className="truncate">{doc.title}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
      <Button type="button" size="icon" variant="ghost" onClick={onDelete} disabled={disabled}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  );
}
