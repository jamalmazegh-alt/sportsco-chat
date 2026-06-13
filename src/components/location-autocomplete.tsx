import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { getGoogleMapsKey } from "@/lib/maps.functions";

interface Suggestion {
  display_name: string;
  lat?: string;
  lon?: string;
  place_id: number | string;
  source?: "google" | "osm";
}

declare global {
  interface Window {
    __cluberoGoogleMapsPromise?: Promise<void>;
  }
}

let cachedMapsKeyPromise: Promise<string | null> | null = null;

function fetchGoogleMapsKey(): Promise<string | null> {
  if (!cachedMapsKeyPromise) {
    cachedMapsKeyPromise = getGoogleMapsKey().then((res) => res.key).catch(() => null);
  }
  return cachedMapsKeyPromise;
}

function loadGoogleMapsPlaces(key: string | null | undefined): Promise<void> | null {
  if (typeof window === "undefined" || !key) return null;
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (!window.__cluberoGoogleMapsPromise) {
    window.__cluberoGoogleMapsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>("script[data-clubero-google-maps]");
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Google Maps load failed")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
      script.async = true;
      script.dataset.cluberoGoogleMaps = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Maps load failed"));
      document.head.appendChild(script);
    });
  }
  return window.__cluberoGoogleMapsPromise;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Address autocomplete using OpenStreetMap Nominatim (free, no API key).
 * Behaves like a Google Places search for picking a venue.
 */
export function LocationAutocomplete({ value, onChange, placeholder, className }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const googleServiceRef = useRef<any>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchGoogleMapsKey().then((key) => {
      const loader = loadGoogleMapsPlaces(key);
      loader?.then(() => {
        const googlePlaces = (window as any).google?.maps?.places;
        if (!cancelled && googlePlaces) {
          googleServiceRef.current = new googlePlaces.AutocompleteService();
        }
      }).catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function onInput(v: string) {
    setQuery(v);
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const googleService = googleServiceRef.current;
        if (googleService) {
          googleService.getPlacePredictions(
            {
              input: v,
              componentRestrictions: { country: ["fr", "be", "ch", "lu", "mc"] },
              types: ["establishment", "geocode"],
            },
            (predictions: Array<{ description: string; place_id: string }> | null) => {
              setSuggestions(
                (predictions ?? []).map((item) => ({
                  display_name: item.description,
                  place_id: item.place_id,
                  source: "google",
                })),
              );
              setOpen((predictions ?? []).length > 0);
              setLoading(false);
            },
          );
          return;
        }
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(v)}`,
          { headers: { "Accept-Language": navigator.language || "fr" } }
        );
        const data: Suggestion[] = await res.json();
        setSuggestions(data.map((item) => ({ ...item, source: "osm" })));
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }

  function pick(s: Suggestion) {
    onChange(s.display_name);
    setQuery(s.display_name);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder ?? "Rechercher une adresse, un stade…"}
          className="pl-9"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          <ul className="max-h-64 overflow-y-auto">
            {suggestions.map((s) => (
              <li key={s.place_id}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-start gap-2"
                >
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="line-clamp-2">{s.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
