// Shared types for public camp pages (client-safe, no server imports).

export interface PublicCampClub {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  theme_color: string | null;
  city: string | null;
  country: string | null;
}

export interface PublicCampVenue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
}

export interface PublicCampFacility {
  id: string;
  name: string;
  sport: string | null;
  surface_type: string | null;
}

export interface PublicCampAgeGroup {
  id: string;
  label: string;
  birth_year_min: number | null;
  birth_year_max: number | null;
  sort_order: number;
}

export interface PublicCampProgramItem {
  id: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
}

export interface PublicCampDocument {
  id: string;
  title: string;
  document_type: string | null;
  file_url: string;
  sort_order: number;
}

export interface PublicCampRequiredDocument {
  id: string;
  title: string;
  document_type: string | null;
  required: boolean;
  sort_order: number;
  // is_sensitive intentionally excluded from public payloads
}

export interface PublicCampDetails {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  start_date: string;
  end_date: string;
  registration_deadline: string | null;
  capacity: number;
  price: number | null;
  currency: string;
  external_location: string | null;
  payment_instructions: string | null;
  status: string;
  document_retention_months: number;
  taken_count?: number;
  remaining?: number;
  is_full?: boolean;
}

export interface PublicCampBundle {
  camp: PublicCampDetails;
  club: PublicCampClub;
  venue: PublicCampVenue | null;
  facility: PublicCampFacility | null;
  age_groups: PublicCampAgeGroup[];
  program_items: PublicCampProgramItem[];
  documents: PublicCampDocument[];
  required_documents: PublicCampRequiredDocument[];
}

export const CAMP_UPLOAD_ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const CAMP_UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
