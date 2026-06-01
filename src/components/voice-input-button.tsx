import { useCallback, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSpeechToText } from "@/hooks/use-speech-to-text";

interface VoiceInputButtonProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  className?: string;
}

/**
 * Microphone button that dictates speech into a textarea via Web Speech API.
 * Appends final transcripts to the existing value; shows interim results live.
 */
export function VoiceInputButton({ textareaRef, disabled, className }: VoiceInputButtonProps) {
  const { t } = useTranslation();
  const baseValueRef = useRef<string>("");

  const setTextareaValue = useCallback(
    (value: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      // React tracks input via a native setter; bypass it so onChange fires.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      setter?.call(ta, value);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [textareaRef]
  );

  const { isListening, isSupported, start, stop } = useSpeechToText({
    onResult: (text, isFinal) => {
      const base = baseValueRef.current;
      const merged = base ? `${base} ${text}`.trim() : text;
      setTextareaValue(merged);
      if (isFinal) baseValueRef.current = merged;
    },
    onError: (err) => {
      if (err === "not-allowed") {
        toast.error(t("voice.permissionDenied", { defaultValue: "Microphone refusé" }));
      } else if (err !== "aborted") {
        toast.error(t("voice.error", { defaultValue: "Erreur dictée vocale" }));
      }
    },
  });

  if (!isSupported) return null;

  const handleClick = () => {
    if (isListening) {
      stop();
      return;
    }
    baseValueRef.current = textareaRef.current?.value ?? "";
    start();
  };

  return (
    <Button
      type="button"
      variant={isListening ? "default" : "ghost"}
      size="icon-sm"
      onClick={handleClick}
      disabled={disabled}
      aria-label={
        isListening
          ? t("voice.stop", { defaultValue: "Arrêter la dictée" })
          : t("voice.start", { defaultValue: "Dicter" })
      }
      title={
        isListening
          ? t("voice.stop", { defaultValue: "Arrêter la dictée" })
          : t("voice.start", { defaultValue: "Dicter" })
      }
      className={cn(isListening && "animate-pulse", className)}
    >
      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}
