import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type SR = any;

function getSpeechRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export interface UseSpeechToTextOptions {
  onResult: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

/**
 * Web Speech API wrapper for dictating text input.
 * Returns isListening, isSupported, and start/stop helpers.
 */
export function useSpeechToText({ onResult, onError }: UseSpeechToTextOptions) {
  const { i18n } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(!!getSpeechRecognition());
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      onError?.("unsupported");
      return;
    }
    try {
      const rec = new SR();
      rec.lang = i18n.language?.startsWith("fr") ? "fr-FR" : "en-US";
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) final += res[0].transcript;
          else interim += res[0].transcript;
        }
        if (final) onResult(final, true);
        else if (interim) onResult(interim, false);
      };
      rec.onerror = (e: any) => {
        onError?.(e?.error ?? "error");
        setIsListening(false);
      };
      rec.onend = () => setIsListening(false);

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch (err: any) {
      onError?.(err?.message ?? "error");
      setIsListening(false);
    }
  }, [i18n.language, onError, onResult]);

  useEffect(() => () => stop(), [stop]);

  return { isListening, isSupported, start, stop };
}
