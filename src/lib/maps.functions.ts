import { createServerFn } from "@tanstack/react-start";

export const getGoogleMapsKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env.GOOGLE_MAPS_API_KEY ?? null };
});
