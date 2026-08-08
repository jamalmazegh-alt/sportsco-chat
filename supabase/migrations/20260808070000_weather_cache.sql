-- Cache des prévisions météo par (lieu arrondi, jour).
--
-- Une liste d'événements affiche des dizaines de cartes : sans cache, un seul
-- défilement suffirait à épuiser le quota du fournisseur. La clé arrondit les
-- coordonnées à 2 décimales (~1,1 km), ce qui fait partager une même entrée à
-- tous les terrains d'un même complexe.
--
-- La table ne contient aucune donnée personnelle : uniquement des coordonnées
-- arrondies et une prévision publique. Elle n'est ni lue ni écrite par les
-- clients — seule la server function y accède, via la clé service_role — donc
-- RLS est activée sans aucune policy pour `authenticated`, ce qui refuse tout.

CREATE TABLE public.weather_cache (
  cache_key text PRIMARY KEY,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  forecast_date date NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- Purge des entrées périmées : on balaie par date, jamais par clé.
CREATE INDEX weather_cache_forecast_date_idx ON public.weather_cache (forecast_date);
CREATE INDEX weather_cache_fetched_at_idx ON public.weather_cache (fetched_at);

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

-- Aucune policy pour `authenticated` : RLS activée sans policy = refus total.
-- Seul service_role, qui contourne RLS, manipule cette table.
GRANT ALL ON public.weather_cache TO service_role;

COMMENT ON TABLE public.weather_cache IS
  'Prévisions météo mises en cache par (coordonnées arrondies, jour). Écrite et lue uniquement par les server functions via service_role.';
COMMENT ON COLUMN public.weather_cache.cache_key IS
  'Format "<lat 2 déc>:<lng 2 déc>:<YYYY-MM-DD>" — voir weatherCacheKey().';
