export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _backup_u15_merge_20260719_convocations: {
        Row: {
          comment: string | null
          created_at: string | null
          event_id: string | null
          id: string | null
          player_id: string | null
          responded_at: string | null
          response_token: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string | null
          player_id?: string | null
          responded_at?: string | null
          response_token?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string | null
          player_id?: string | null
          responded_at?: string | null
          response_token?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
        }
        Relationships: []
      }
      _backup_u15_merge_20260719_guardians: {
        Row: {
          club_id: string | null
          created_at: string | null
          id: string | null
          is_primary_payer: boolean | null
          player_id: string | null
          relation: string | null
          user_id: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string | null
          id?: string | null
          is_primary_payer?: boolean | null
          player_id?: string | null
          relation?: string | null
          user_id?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string | null
          id?: string | null
          is_primary_payer?: boolean | null
          player_id?: string | null
          relation?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _backup_u15_merge_20260719_parents: {
        Row: {
          can_respond: boolean | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          parent_user_id: string | null
          phone: string | null
          player_id: string | null
        }
        Insert: {
          can_respond?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          parent_user_id?: string | null
          phone?: string | null
          player_id?: string | null
        }
        Update: {
          can_respond?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          parent_user_id?: string | null
          phone?: string | null
          player_id?: string | null
        }
        Relationships: []
      }
      _backup_u15_merge_20260719_players: {
        Row: {
          birth_date: string | null
          can_respond: boolean | null
          child_platform_access: boolean | null
          claim_requested_at: string | null
          claim_requested_by: string | null
          claim_status: string | null
          club_id: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string | null
          jersey_number: number | null
          last_name: string | null
          license_number: string | null
          media_consent_status:
            | Database["public"]["Enums"]["media_consent_status"]
            | null
          phone: string | null
          photo_url: string | null
          position: string | null
          preferred_position: string | null
          public_profile_enabled: boolean | null
          public_slug: string | null
          user_id: string | null
        }
        Insert: {
          birth_date?: string | null
          can_respond?: boolean | null
          child_platform_access?: boolean | null
          claim_requested_at?: string | null
          claim_requested_by?: string | null
          claim_status?: string | null
          club_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          jersey_number?: number | null
          last_name?: string | null
          license_number?: string | null
          media_consent_status?:
            | Database["public"]["Enums"]["media_consent_status"]
            | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          preferred_position?: string | null
          public_profile_enabled?: boolean | null
          public_slug?: string | null
          user_id?: string | null
        }
        Update: {
          birth_date?: string | null
          can_respond?: boolean | null
          child_platform_access?: boolean | null
          claim_requested_at?: string | null
          claim_requested_by?: string | null
          claim_status?: string | null
          club_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          jersey_number?: number | null
          last_name?: string | null
          license_number?: string | null
          media_consent_status?:
            | Database["public"]["Enums"]["media_consent_status"]
            | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          preferred_position?: string | null
          public_profile_enabled?: boolean | null
          public_slug?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _backup_u15_merge_20260719_team_members: {
        Row: {
          created_at: string | null
          id: string | null
          player_id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          team_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          player_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          team_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          player_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          team_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _backup_u15_merge_20260719_timeline: {
        Row: {
          club_id: string | null
          created_at: string | null
          created_by: string | null
          dedup_key: string | null
          description: string | null
          event_date: string | null
          event_type: string | null
          id: string | null
          player_id: string | null
          related_achievement_id: string | null
          related_event_id: string | null
          source: string | null
          team_id: string | null
          title: string | null
          visibility: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dedup_key?: string | null
          description?: string | null
          event_date?: string | null
          event_type?: string | null
          id?: string | null
          player_id?: string | null
          related_achievement_id?: string | null
          related_event_id?: string | null
          source?: string | null
          team_id?: string | null
          title?: string | null
          visibility?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dedup_key?: string | null
          description?: string | null
          event_date?: string | null
          event_type?: string | null
          id?: string | null
          player_id?: string | null
          related_achievement_id?: string | null
          related_event_id?: string | null
          source?: string | null
          team_id?: string | null
          title?: string | null
          visibility?: string | null
        }
        Relationships: []
      }
      account_deletion_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          error: string | null
          hard_delete: boolean
          id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          requested_at: string
          scheduled_for: string
          status: Database["public"]["Enums"]["privacy_request_status"]
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          error?: string | null
          hard_delete?: boolean
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["privacy_request_status"]
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          error?: string | null
          hard_delete?: boolean
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["privacy_request_status"]
          user_id?: string
        }
        Relationships: []
      }
      app_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          changes: Json | null
          club_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          changes?: Json | null
          club_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          changes?: Json | null
          club_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      build_clubero_answers: {
        Row: {
          answer_number: number | null
          answer_options: string[] | null
          answer_ranking: string[] | null
          answer_text: string | null
          created_at: string
          id: string
          question_key: string
          question_type: string
          response_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          answer_number?: number | null
          answer_options?: string[] | null
          answer_ranking?: string[] | null
          answer_text?: string | null
          created_at?: string
          id?: string
          question_key: string
          question_type: string
          response_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          answer_number?: number | null
          answer_options?: string[] | null
          answer_ranking?: string[] | null
          answer_text?: string | null
          created_at?: string
          id?: string
          question_key?: string
          question_type?: string
          response_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "build_clubero_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "build_clubero_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_clubero_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "v_build_clubero_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      build_clubero_responses: {
        Row: {
          beta_consent_at: string | null
          beta_opt_in: boolean
          club: string | null
          completed_at: string | null
          device: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          locale: string
          newsletter_consent_at: string | null
          newsletter_opt_in: boolean
          phone: string | null
          session_id: string
          started_at: string
          status: string
          updated_at: string
          utm: Json | null
        }
        Insert: {
          beta_consent_at?: string | null
          beta_opt_in?: boolean
          club?: string | null
          completed_at?: string | null
          device?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          locale?: string
          newsletter_consent_at?: string | null
          newsletter_opt_in?: boolean
          phone?: string | null
          session_id: string
          started_at?: string
          status?: string
          updated_at?: string
          utm?: Json | null
        }
        Update: {
          beta_consent_at?: string | null
          beta_opt_in?: boolean
          club?: string | null
          completed_at?: string | null
          device?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          locale?: string
          newsletter_consent_at?: string | null
          newsletter_opt_in?: boolean
          phone?: string | null
          session_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          utm?: Json | null
        }
        Relationships: []
      }
      carpool_needs: {
        Row: {
          created_at: string
          event_id: string
          id: string
          note: string | null
          parent_user_id: string
          player_ids: string[]
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          note?: string | null
          parent_user_id: string
          player_ids?: string[]
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          note?: string | null
          parent_user_id?: string
          player_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "carpool_needs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      carpool_passengers: {
        Row: {
          carpool_id: string
          created_at: string
          id: string
          passenger_user_id: string
          player_ids: string[]
        }
        Insert: {
          carpool_id: string
          created_at?: string
          id?: string
          passenger_user_id: string
          player_ids?: string[]
        }
        Update: {
          carpool_id?: string
          created_at?: string
          id?: string
          passenger_user_id?: string
          player_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "carpool_passengers_carpool_id_fkey"
            columns: ["carpool_id"]
            isOneToOne: false
            referencedRelation: "carpools"
            referencedColumns: ["id"]
          },
        ]
      }
      carpools: {
        Row: {
          created_at: string
          departure_note: string | null
          driver_name: string
          driver_user_id: string
          event_id: string
          id: string
          total_seats: number
          vehicle_type: string
        }
        Insert: {
          created_at?: string
          departure_note?: string | null
          driver_name: string
          driver_user_id: string
          event_id: string
          id?: string
          total_seats: number
          vehicle_type: string
        }
        Update: {
          created_at?: string
          departure_note?: string | null
          driver_name?: string
          driver_user_id?: string
          event_id?: string
          id?: string
          total_seats?: number
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "carpools_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_passages: {
        Row: {
          challenge_id: string
          created_at: string
          created_by: string
          event_id: string | null
          id: string
          passage_date: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          created_by: string
          event_id?: string | null
          id?: string
          passage_date?: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          created_by?: string
          event_id?: string | null
          id?: string
          passage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_passages_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_passages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_results: {
        Row: {
          created_at: string
          created_by: string
          id: string
          passage_id: string
          player_id: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          passage_id: string
          player_id: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          passage_id?: string
          player_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_results_passage_id_fkey"
            columns: ["passage_id"]
            isOneToOne: false
            referencedRelation: "challenge_passages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_results_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          aggregate: Database["public"]["Enums"]["challenge_aggregate"]
          club_id: string
          created_at: string
          created_by: string
          direction: Database["public"]["Enums"]["challenge_direction"]
          icon: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["challenge_kind"]
          name: string
          ranking_visibility: Database["public"]["Enums"]["challenge_visibility"]
          recurrence: Database["public"]["Enums"]["challenge_recurrence"]
          season_id: string | null
          team_id: string | null
          template_key: string | null
          unit: Database["public"]["Enums"]["challenge_unit"]
          updated_at: string
        }
        Insert: {
          aggregate?: Database["public"]["Enums"]["challenge_aggregate"]
          club_id: string
          created_at?: string
          created_by: string
          direction?: Database["public"]["Enums"]["challenge_direction"]
          icon?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["challenge_kind"]
          name: string
          ranking_visibility?: Database["public"]["Enums"]["challenge_visibility"]
          recurrence?: Database["public"]["Enums"]["challenge_recurrence"]
          season_id?: string | null
          team_id?: string | null
          template_key?: string | null
          unit: Database["public"]["Enums"]["challenge_unit"]
          updated_at?: string
        }
        Update: {
          aggregate?: Database["public"]["Enums"]["challenge_aggregate"]
          club_id?: string
          created_at?: string
          created_by?: string
          direction?: Database["public"]["Enums"]["challenge_direction"]
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["challenge_kind"]
          name?: string
          ranking_visibility?: Database["public"]["Enums"]["challenge_visibility"]
          recurrence?: Database["public"]["Enums"]["challenge_recurrence"]
          season_id?: string | null
          team_id?: string | null
          template_key?: string | null
          unit?: Database["public"]["Enums"]["challenge_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      club_camp_age_groups: {
        Row: {
          birth_year_max: number | null
          birth_year_min: number | null
          camp_id: string
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          birth_year_max?: number | null
          birth_year_min?: number | null
          camp_id: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          birth_year_max?: number | null
          birth_year_min?: number | null
          camp_id?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_camp_age_groups_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "club_camps"
            referencedColumns: ["id"]
          },
        ]
      }
      club_camp_document_purge_log: {
        Row: {
          camp_id: string | null
          details: Json | null
          error: string | null
          files_deleted: number
          id: string
          rows_deleted: number
          run_at: string
        }
        Insert: {
          camp_id?: string | null
          details?: Json | null
          error?: string | null
          files_deleted?: number
          id?: string
          rows_deleted?: number
          run_at?: string
        }
        Update: {
          camp_id?: string | null
          details?: Json | null
          error?: string | null
          files_deleted?: number
          id?: string
          rows_deleted?: number
          run_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_camp_document_purge_log_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "club_camps"
            referencedColumns: ["id"]
          },
        ]
      }
      club_camp_documents: {
        Row: {
          camp_id: string
          created_at: string
          document_type: string | null
          file_url: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          camp_id: string
          created_at?: string
          document_type?: string | null
          file_url: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          camp_id?: string
          created_at?: string
          document_type?: string | null
          file_url?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_camp_documents_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "club_camps"
            referencedColumns: ["id"]
          },
        ]
      }
      club_camp_program_items: {
        Row: {
          camp_id: string
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          sort_order: number
          starts_at: string | null
          title: string
        }
        Insert: {
          camp_id: string
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          sort_order?: number
          starts_at?: string | null
          title: string
        }
        Update: {
          camp_id?: string
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          sort_order?: number
          starts_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_camp_program_items_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "club_camps"
            referencedColumns: ["id"]
          },
        ]
      }
      club_camp_registration_documents: {
        Row: {
          file_path: string
          id: string
          registration_id: string
          rejection_reason: string | null
          required_document_id: string
          review_status: string
          uploaded_at: string
        }
        Insert: {
          file_path: string
          id?: string
          registration_id: string
          rejection_reason?: string | null
          required_document_id: string
          review_status?: string
          uploaded_at?: string
        }
        Update: {
          file_path?: string
          id?: string
          registration_id?: string
          rejection_reason?: string | null
          required_document_id?: string
          review_status?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_camp_registration_documents_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "club_camp_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_camp_registration_documents_required_document_id_fkey"
            columns: ["required_document_id"]
            isOneToOne: false
            referencedRelation: "club_camp_required_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      club_camp_registrations: {
        Row: {
          access_token: string
          amount_paid: number
          birth_date: string
          camp_id: string
          club_name: string | null
          created_at: string
          gender: string | null
          guardian_email: string
          guardian_first_name: string
          guardian_last_name: string
          guardian_phone: string | null
          id: string
          notes: string | null
          participant_first_name: string
          participant_last_name: string
          payment_status: string
          registration_status: string
          rejection_reason: string | null
          reserved_until: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string
          amount_paid?: number
          birth_date: string
          camp_id: string
          club_name?: string | null
          created_at?: string
          gender?: string | null
          guardian_email: string
          guardian_first_name: string
          guardian_last_name: string
          guardian_phone?: string | null
          id?: string
          notes?: string | null
          participant_first_name: string
          participant_last_name: string
          payment_status?: string
          registration_status?: string
          rejection_reason?: string | null
          reserved_until?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          amount_paid?: number
          birth_date?: string
          camp_id?: string
          club_name?: string | null
          created_at?: string
          gender?: string | null
          guardian_email?: string
          guardian_first_name?: string
          guardian_last_name?: string
          guardian_phone?: string | null
          id?: string
          notes?: string | null
          participant_first_name?: string
          participant_last_name?: string
          payment_status?: string
          registration_status?: string
          rejection_reason?: string | null
          reserved_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_camp_registrations_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "club_camps"
            referencedColumns: ["id"]
          },
        ]
      }
      club_camp_required_documents: {
        Row: {
          camp_id: string
          created_at: string
          document_type: string | null
          id: string
          is_sensitive: boolean
          required: boolean
          sort_order: number
          title: string
        }
        Insert: {
          camp_id: string
          created_at?: string
          document_type?: string | null
          id?: string
          is_sensitive?: boolean
          required?: boolean
          sort_order?: number
          title: string
        }
        Update: {
          camp_id?: string
          created_at?: string
          document_type?: string | null
          id?: string
          is_sensitive?: boolean
          required?: boolean
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_camp_required_documents_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "club_camps"
            referencedColumns: ["id"]
          },
        ]
      }
      club_camps: {
        Row: {
          capacity: number
          club_id: string
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          document_retention_months: number
          end_date: string
          external_location: string | null
          facility_id: string | null
          id: string
          payment_instructions: string | null
          price: number | null
          registration_deadline: string | null
          slug: string
          start_date: string
          status: string
          title: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          capacity: number
          club_id: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          document_retention_months?: number
          end_date: string
          external_location?: string | null
          facility_id?: string | null
          id?: string
          payment_instructions?: string | null
          price?: number | null
          registration_deadline?: string | null
          slug: string
          start_date: string
          status?: string
          title: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          capacity?: number
          club_id?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          document_retention_months?: number
          end_date?: string
          external_location?: string | null
          facility_id?: string | null
          id?: string
          payment_instructions?: string | null
          price?: number | null
          registration_deadline?: string | null
          slug?: string
          start_date?: string
          status?: string
          title?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_camps_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_camps_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "club_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_camps_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "club_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      club_facilities: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_default: boolean
          name: string
          sport: string | null
          surface_type: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_default?: boolean
          name: string
          sport?: string | null
          surface_type?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_default?: boolean
          name?: string
          sport?: string | null
          surface_type?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_facilities_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "club_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      club_group_members: {
        Row: {
          added_by: string
          created_at: string
          group_id: string
          id: string
          member_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          group_id: string
          id?: string
          member_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          group_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "club_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_group_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_group_rules: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          rule_type: string
          team_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          rule_type: string
          team_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          rule_type?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_group_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "club_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_group_rules_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      club_groups: {
        Row: {
          club_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_groups_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_invites: {
        Row: {
          club_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          uses_count: number
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          token: string
          uses_count?: number
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          uses_count?: number
        }
        Relationships: []
      }
      club_members: {
        Row: {
          club_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          roles: string[]
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          roles?: string[]
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          roles?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_notification_settings: {
        Row: {
          club_id: string
          convocation_coach_complete: boolean
          convocation_coach_each_response: boolean
          convocation_on_create: boolean
          convocation_reminder: boolean
          event_cancel: boolean
          event_chat_new_message: boolean
          event_reschedule: boolean
          score_result: boolean | null
          tournament_draw: boolean
          tournament_match_reminder: boolean
          updated_at: string
          wall_new_post: boolean
        }
        Insert: {
          club_id: string
          convocation_coach_complete?: boolean
          convocation_coach_each_response?: boolean
          convocation_on_create?: boolean
          convocation_reminder?: boolean
          event_cancel?: boolean
          event_chat_new_message?: boolean
          event_reschedule?: boolean
          score_result?: boolean | null
          tournament_draw?: boolean
          tournament_match_reminder?: boolean
          updated_at?: string
          wall_new_post?: boolean
        }
        Update: {
          club_id?: string
          convocation_coach_complete?: boolean
          convocation_coach_each_response?: boolean
          convocation_on_create?: boolean
          convocation_reminder?: boolean
          event_cancel?: boolean
          event_chat_new_message?: boolean
          event_reschedule?: boolean
          score_result?: boolean | null
          tournament_draw?: boolean
          tournament_match_reminder?: boolean
          updated_at?: string
          wall_new_post?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "club_notification_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_payment_settings: {
        Row: {
          club_id: string
          created_at: string
          currency: string
          helloasso_enabled: boolean
          helloasso_fundraising_url: string | null
          helloasso_membership_url: string | null
          helloasso_shop_url: string | null
          helloasso_tournament_url: string | null
          min_partial_amount_cents: number
          payment_reminder_offsets_days: number[]
          payment_reminders_enabled: boolean
          platform_fee_bps: number
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          currency?: string
          helloasso_enabled?: boolean
          helloasso_fundraising_url?: string | null
          helloasso_membership_url?: string | null
          helloasso_shop_url?: string | null
          helloasso_tournament_url?: string | null
          min_partial_amount_cents?: number
          payment_reminder_offsets_days?: number[]
          payment_reminders_enabled?: boolean
          platform_fee_bps?: number
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          currency?: string
          helloasso_enabled?: boolean
          helloasso_fundraising_url?: string | null
          helloasso_membership_url?: string | null
          helloasso_shop_url?: string | null
          helloasso_tournament_url?: string | null
          min_partial_amount_cents?: number
          payment_reminder_offsets_days?: number[]
          payment_reminders_enabled?: boolean
          platform_fee_bps?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_payment_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_poll_options: {
        Row: {
          created_at: string
          id: string
          label: string
          publication_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          publication_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          publication_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_poll_options_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "club_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      club_poll_votes: {
        Row: {
          cast_by_user_id: string
          created_at: string
          id: string
          member_id: string | null
          option_id: string
          publication_id: string
          subject_kind: string
          subject_user_id: string | null
          updated_at: string
        }
        Insert: {
          cast_by_user_id: string
          created_at?: string
          id?: string
          member_id?: string | null
          option_id: string
          publication_id: string
          subject_kind?: string
          subject_user_id?: string | null
          updated_at?: string
        }
        Update: {
          cast_by_user_id?: string
          created_at?: string
          id?: string
          member_id?: string | null
          option_id?: string
          publication_id?: string
          subject_kind?: string
          subject_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_poll_votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "club_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_poll_votes_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "club_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      club_publication_audiences: {
        Row: {
          audience_type: Database["public"]["Enums"]["publication_audience_type"]
          category_label: string | null
          created_at: string
          event_id: string | null
          group_id: string | null
          id: string
          publication_id: string
          season_id: string | null
          team_id: string | null
        }
        Insert: {
          audience_type: Database["public"]["Enums"]["publication_audience_type"]
          category_label?: string | null
          created_at?: string
          event_id?: string | null
          group_id?: string | null
          id?: string
          publication_id: string
          season_id?: string | null
          team_id?: string | null
        }
        Update: {
          audience_type?: Database["public"]["Enums"]["publication_audience_type"]
          category_label?: string | null
          created_at?: string
          event_id?: string | null
          group_id?: string | null
          id?: string
          publication_id?: string
          season_id?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_publication_audiences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_publication_audiences_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "club_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_publication_audiences_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "club_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_publication_audiences_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_publication_audiences_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      club_publication_dispatches: {
        Row: {
          created_at: string
          created_by: string
          dispatch_id: string
          id: string
          kind: Database["public"]["Enums"]["publication_dispatch_kind"]
          publication_id: string
          recipients_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          dispatch_id: string
          id?: string
          kind: Database["public"]["Enums"]["publication_dispatch_kind"]
          publication_id: string
          recipients_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          dispatch_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["publication_dispatch_kind"]
          publication_id?: string
          recipients_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_publication_dispatches_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "club_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      club_publication_documents: {
        Row: {
          created_at: string
          document_id: string
          id: string
          publication_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          publication_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          publication_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_publication_documents_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "club_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      club_publication_manual_members: {
        Row: {
          created_at: string
          id: string
          member_id: string
          publication_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          publication_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          publication_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_publication_manual_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_publication_manual_members_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "club_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      club_publication_media: {
        Row: {
          created_at: string
          id: string
          publication_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          publication_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          publication_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_publication_media_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "club_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      club_publication_recipients: {
        Row: {
          created_at: string
          first_dispatch_id: string | null
          id: string
          member_id: string | null
          publication_id: string
          subject_kind: string
          subject_user_id: string | null
        }
        Insert: {
          created_at?: string
          first_dispatch_id?: string | null
          id?: string
          member_id?: string | null
          publication_id: string
          subject_kind?: string
          subject_user_id?: string | null
        }
        Update: {
          created_at?: string
          first_dispatch_id?: string | null
          id?: string
          member_id?: string | null
          publication_id?: string
          subject_kind?: string
          subject_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_publication_recipients_first_dispatch_id_fkey"
            columns: ["first_dispatch_id"]
            isOneToOne: false
            referencedRelation: "club_publication_dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_publication_recipients_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_publication_recipients_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "club_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      club_publications: {
        Row: {
          author_id: string
          closed_at: string | null
          closes_at: string | null
          club_id: string
          content: string
          created_at: string
          deleted_at: string | null
          email_body: string | null
          event_id: string | null
          id: string
          poll_allow_multiple: boolean
          poll_visibility: Database["public"]["Enums"]["poll_visibility"] | null
          publication_type: Database["public"]["Enums"]["publication_type"]
          publish_to_wall: boolean
          published_at: string
          send_email: boolean
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          closed_at?: string | null
          closes_at?: string | null
          club_id: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          email_body?: string | null
          event_id?: string | null
          id?: string
          poll_allow_multiple?: boolean
          poll_visibility?:
            | Database["public"]["Enums"]["poll_visibility"]
            | null
          publication_type: Database["public"]["Enums"]["publication_type"]
          publish_to_wall?: boolean
          published_at?: string
          send_email?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          closed_at?: string | null
          closes_at?: string | null
          club_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          email_body?: string | null
          event_id?: string | null
          id?: string
          poll_allow_multiple?: boolean
          poll_visibility?:
            | Database["public"]["Enums"]["poll_visibility"]
            | null
          publication_type?: Database["public"]["Enums"]["publication_type"]
          publish_to_wall?: boolean
          published_at?: string
          send_email?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_publications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_publications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      club_receipt_counters: {
        Row: {
          club_id: string
          last_number: number
        }
        Insert: {
          club_id: string
          last_number?: number
        }
        Update: {
          club_id?: string
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_receipt_counters_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_social_connections: {
        Row: {
          access_token: string
          account_id: string | null
          account_name: string | null
          club_id: string
          connected_at: string
          id: string
          is_active: boolean
          last_sync_error: string | null
          last_synced_at: string | null
          network: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          account_id?: string | null
          account_name?: string | null
          club_id: string
          connected_at?: string
          id?: string
          is_active?: boolean
          last_sync_error?: string | null
          last_synced_at?: string | null
          network: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          account_id?: string | null
          account_name?: string | null
          club_id?: string
          connected_at?: string
          id?: string
          is_active?: boolean
          last_sync_error?: string | null
          last_synced_at?: string | null
          network?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_social_connections_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_venues: {
        Row: {
          address: string
          city: string | null
          club_id: string
          country: string | null
          created_at: string
          display_order: number
          id: string
          is_default: boolean
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address: string
          city?: string | null
          club_id: string
          country?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string | null
          club_id?: string
          country?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_venues_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          archived_at: string | null
          auto_reminder_hours_before: number[]
          auto_reminders_enabled: boolean
          convocation_channels: Json
          created_at: string
          created_by: string
          default_channels: Json
          default_language: string
          event_chat_enabled: boolean
          event_chat_parents_enabled: boolean
          event_chat_players_enabled: boolean
          followers_count: number | null
          id: string
          is_personal: boolean
          logo_url: string | null
          looking_for_coach: boolean | null
          name: string
          show_called_up_players_default: boolean
          slug: string
          stripe_account_created_at: string | null
          stripe_account_id: string | null
          stripe_account_status: string | null
          stripe_charges_enabled: boolean
          stripe_payouts_enabled: boolean
          theme_color: string
          wall_comments_enabled: boolean
        }
        Insert: {
          archived_at?: string | null
          auto_reminder_hours_before?: number[]
          auto_reminders_enabled?: boolean
          convocation_channels?: Json
          created_at?: string
          created_by: string
          default_channels?: Json
          default_language?: string
          event_chat_enabled?: boolean
          event_chat_parents_enabled?: boolean
          event_chat_players_enabled?: boolean
          followers_count?: number | null
          id?: string
          is_personal?: boolean
          logo_url?: string | null
          looking_for_coach?: boolean | null
          name: string
          show_called_up_players_default?: boolean
          slug?: string
          stripe_account_created_at?: string | null
          stripe_account_id?: string | null
          stripe_account_status?: string | null
          stripe_charges_enabled?: boolean
          stripe_payouts_enabled?: boolean
          theme_color?: string
          wall_comments_enabled?: boolean
        }
        Update: {
          archived_at?: string | null
          auto_reminder_hours_before?: number[]
          auto_reminders_enabled?: boolean
          convocation_channels?: Json
          created_at?: string
          created_by?: string
          default_channels?: Json
          default_language?: string
          event_chat_enabled?: boolean
          event_chat_parents_enabled?: boolean
          event_chat_players_enabled?: boolean
          followers_count?: number | null
          id?: string
          is_personal?: boolean
          logo_url?: string | null
          looking_for_coach?: boolean | null
          name?: string
          show_called_up_players_default?: boolean
          slug?: string
          stripe_account_created_at?: string | null
          stripe_account_id?: string | null
          stripe_account_status?: string | null
          stripe_charges_enabled?: boolean
          stripe_payouts_enabled?: boolean
          theme_color?: string
          wall_comments_enabled?: boolean
        }
        Relationships: []
      }
      coach_club_history: {
        Row: {
          club_id: string | null
          club_name: string
          coach_id: string
          created_at: string | null
          id: string
          is_current: boolean | null
          joined_at: string | null
          left_at: string | null
          role: string | null
          sport: string | null
        }
        Insert: {
          club_id?: string | null
          club_name: string
          coach_id: string
          created_at?: string | null
          id?: string
          is_current?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          role?: string | null
          sport?: string | null
        }
        Update: {
          club_id?: string | null
          club_name?: string
          coach_id?: string
          created_at?: string | null
          id?: string
          is_current?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          role?: string | null
          sport?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_club_history_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_club_history_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_diplomas: {
        Row: {
          coach_id: string
          created_at: string | null
          expiry_date: string | null
          id: string
          issuing_body: string | null
          name: string
          obtained_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          issuing_body?: string | null
          name: string
          obtained_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          issuing_body?: string | null
          name?: string
          obtained_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_diplomas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_insights: {
        Row: {
          action_payload: Json | null
          action_type: string | null
          club_id: string
          created_at: string
          dedup_key: string | null
          dismissed_by: string[]
          expires_at: string | null
          id: string
          insight_type: string
          message_en: string
          message_fr: string
          payload: Json
          priority: string
          resolved_at: string | null
          team_id: string | null
        }
        Insert: {
          action_payload?: Json | null
          action_type?: string | null
          club_id: string
          created_at?: string
          dedup_key?: string | null
          dismissed_by?: string[]
          expires_at?: string | null
          id?: string
          insight_type: string
          message_en: string
          message_fr: string
          payload?: Json
          priority?: string
          resolved_at?: string | null
          team_id?: string | null
        }
        Update: {
          action_payload?: Json | null
          action_type?: string | null
          club_id?: string
          created_at?: string
          dedup_key?: string | null
          dismissed_by?: string[]
          expires_at?: string | null
          id?: string
          insight_type?: string
          message_en?: string
          message_fr?: string
          payload?: Json
          priority?: string
          resolved_at?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_insights_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_insights_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_profiles: {
        Row: {
          created_at: string | null
          current_club_id: string | null
          followers_count: number | null
          id: string
          license_number: string | null
          looking_for_club: boolean | null
          philosophy: string | null
          profile_visibility: string | null
          public_profile_enabled: boolean | null
          public_slug: string | null
          speciality: string | null
          sport: string | null
          updated_at: string | null
          user_id: string
          years_experience: number | null
        }
        Insert: {
          created_at?: string | null
          current_club_id?: string | null
          followers_count?: number | null
          id?: string
          license_number?: string | null
          looking_for_club?: boolean | null
          philosophy?: string | null
          profile_visibility?: string | null
          public_profile_enabled?: boolean | null
          public_slug?: string | null
          speciality?: string | null
          sport?: string | null
          updated_at?: string | null
          user_id: string
          years_experience?: number | null
        }
        Update: {
          created_at?: string | null
          current_club_id?: string | null
          followers_count?: number | null
          id?: string
          license_number?: string | null
          looking_for_club?: boolean | null
          philosophy?: string | null
          profile_visibility?: string | null
          public_profile_enabled?: boolean | null
          public_slug?: string | null
          speciality?: string | null
          sport?: string | null
          updated_at?: string | null
          user_id?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_profiles_current_club_id_fkey"
            columns: ["current_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_versions: {
        Row: {
          content_md: string
          id: string
          kind: Database["public"]["Enums"]["consent_kind"]
          locale: string
          published_at: string
          required: boolean
          title: string
          version: number
        }
        Insert: {
          content_md: string
          id?: string
          kind: Database["public"]["Enums"]["consent_kind"]
          locale?: string
          published_at?: string
          required?: boolean
          title: string
          version: number
        }
        Update: {
          content_md?: string
          id?: string
          kind?: Database["public"]["Enums"]["consent_kind"]
          locale?: string
          published_at?: string
          required?: boolean
          title?: string
          version?: number
        }
        Relationships: []
      }
      conversion_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          properties: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          properties?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          properties?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      convocations: {
        Row: {
          comment: string | null
          created_at: string
          event_id: string
          id: string
          player_id: string
          responded_at: string | null
          response_token: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          comment?: string | null
          created_at?: string
          event_id: string
          id?: string
          player_id: string
          responded_at?: string | null
          response_token?: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          comment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          player_id?: string
          responded_at?: string | null
          response_token?: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "convocations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convocations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      data_export_requests: {
        Row: {
          completed_at: string | null
          error: string | null
          file_path: string | null
          file_url: string | null
          id: string
          processed_by: string | null
          requested_at: string
          status: Database["public"]["Enums"]["privacy_request_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          processed_by?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["privacy_request_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          processed_by?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["privacy_request_status"]
          user_id?: string
        }
        Relationships: []
      }
      email_dispatches: {
        Row: {
          created_at: string
          created_by: string | null
          dispatch_type: string
          event_id: string | null
          id: string
          metadata: Json
          template_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dispatch_type: string
          event_id?: string | null
          id?: string
          metadata?: Json
          template_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dispatch_type?: string
          event_id?: string | null
          id?: string
          metadata?: Json
          template_name?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          attempt_count: number
          created_at: string
          dispatch_id: string | null
          error_message: string | null
          event_id: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          mismatch_count: number
          notification_type: string | null
          provider: string | null
          provider_message_id: string | null
          recipient_email: string
          recipient_id: string | null
          status: string
          template_name: string
          worker_build: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          dispatch_id?: string | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          mismatch_count?: number
          notification_type?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_email: string
          recipient_id?: string | null
          status: string
          template_name: string
          worker_build?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          dispatch_id?: string | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          mismatch_count?: number
          notification_type?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          recipient_id?: string | null
          status?: string
          template_name?: string
          worker_build?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "email_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_batch_size: number | null
          transactional_email_ttl_minutes: number
          transactional_retry_after_until: string | null
          transactional_send_delay_ms: number | null
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_batch_size?: number | null
          transactional_email_ttl_minutes?: number
          transactional_retry_after_until?: string | null
          transactional_send_delay_ms?: number | null
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_batch_size?: number | null
          transactional_email_ttl_minutes?: number
          transactional_retry_after_until?: string | null
          transactional_send_delay_ms?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      event_goals: {
        Row: {
          assist_player_id: string | null
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          kind: string
          minute: number | null
          scorer_player_id: string
        }
        Insert: {
          assist_player_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          kind?: string
          minute?: number | null
          scorer_player_id: string
        }
        Update: {
          assist_player_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          kind?: string
          minute?: number | null
          scorer_player_id?: string
        }
        Relationships: []
      }
      event_lineups: {
        Row: {
          bench: Json
          captain_player_id: string | null
          club_id: string
          created_at: string
          created_by: string
          event_id: string
          formation: string
          gk_player_id: string | null
          id: string
          published_at: string | null
          slots: Json
          team_id: string
          updated_at: string
          visibility: Database["public"]["Enums"]["lineup_visibility"]
        }
        Insert: {
          bench?: Json
          captain_player_id?: string | null
          club_id: string
          created_at?: string
          created_by: string
          event_id: string
          formation?: string
          gk_player_id?: string | null
          id?: string
          published_at?: string | null
          slots?: Json
          team_id: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["lineup_visibility"]
        }
        Update: {
          bench?: Json
          captain_player_id?: string | null
          club_id?: string
          created_at?: string
          created_by?: string
          event_id?: string
          formation?: string
          gk_player_id?: string | null
          id?: string
          published_at?: string | null
          slots?: Json
          team_id?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["lineup_visibility"]
        }
        Relationships: []
      }
      event_messages: {
        Row: {
          attachments: Json
          author_user_id: string
          body: string
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          attachments?: Json
          author_user_id: string
          body: string
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          attachments?: Json
          author_user_id?: string
          body?: string
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: []
      }
      event_need_audience_members: {
        Row: {
          created_at: string
          created_by: string | null
          member_id: string
          need_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          member_id: string
          need_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          member_id?: string
          need_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_need_audience_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_need_audience_members_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "event_needs"
            referencedColumns: ["id"]
          },
        ]
      }
      event_need_audiences: {
        Row: {
          audience_type: string
          category: string | null
          created_at: string
          created_by: string | null
          group_id: string | null
          id: string
          need_id: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          audience_type: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          need_id: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          audience_type?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          need_id?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_need_audiences_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "club_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_need_audiences_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "event_needs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_need_audiences_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      event_need_coverage: {
        Row: {
          club_id: string
          event_id: string
          is_fully_covered: boolean
          missing_seats: number
          open_needs_count: number
          updated_at: string
        }
        Insert: {
          club_id: string
          event_id: string
          is_fully_covered?: boolean
          missing_seats?: number
          open_needs_count?: number
          updated_at?: string
        }
        Update: {
          club_id?: string
          event_id?: string
          is_fully_covered?: boolean
          missing_seats?: number
          open_needs_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_need_coverage_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_need_coverage_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_need_publication_recipients: {
        Row: {
          created_at: string
          member_id: string
          publication_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          member_id: string
          publication_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          member_id?: string
          publication_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_need_publication_recipients_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_need_publication_recipients_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "event_need_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      event_need_publications: {
        Row: {
          id: string
          need_id: string
          published_at: string
          published_by: string | null
          recipients_count: number
        }
        Insert: {
          id?: string
          need_id: string
          published_at?: string
          published_by?: string | null
          recipients_count?: number
        }
        Update: {
          id?: string
          need_id?: string
          published_at?: string
          published_by?: string | null
          recipients_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_need_publications_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "event_needs"
            referencedColumns: ["id"]
          },
        ]
      }
      event_need_signups: {
        Row: {
          applied_at: string
          comment: string | null
          confirmed_at: string | null
          created_at: string
          decided_by: string | null
          declined_at: string | null
          id: string
          member_id: string
          need_id: string
          status: string
          updated_at: string
          user_id: string | null
          withdrawn_at: string | null
        }
        Insert: {
          applied_at?: string
          comment?: string | null
          confirmed_at?: string | null
          created_at?: string
          decided_by?: string | null
          declined_at?: string | null
          id?: string
          member_id: string
          need_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          applied_at?: string
          comment?: string | null
          confirmed_at?: string | null
          created_at?: string
          decided_by?: string | null
          declined_at?: string | null
          id?: string
          member_id?: string
          need_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_need_signups_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_need_signups_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "event_needs"
            referencedColumns: ["id"]
          },
        ]
      }
      event_needs: {
        Row: {
          capacity: number
          club_id: string
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string
          first_published_at: string | null
          id: string
          label: string
          last_published_at: string | null
          role_key: string
          status: string
          team_id: string | null
          updated_at: string
          validation_mode: string
        }
        Insert: {
          capacity: number
          club_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id: string
          first_published_at?: string | null
          id?: string
          label: string
          last_published_at?: string | null
          role_key: string
          status?: string
          team_id?: string | null
          updated_at?: string
          validation_mode: string
        }
        Update: {
          capacity?: number
          club_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string
          first_published_at?: string | null
          id?: string
          label?: string
          last_published_at?: string | null
          role_key?: string
          status?: string
          team_id?: string | null
          updated_at?: string
          validation_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_needs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_needs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_needs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      event_staff_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_staff_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_assignments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attachments: Json
          cancellation_reason: string | null
          cancelled_at: string | null
          carpool_enabled: boolean
          championship_id: string | null
          competition_name: string | null
          competition_type: string | null
          convocation_last_sent_at: string | null
          convocation_sent_snapshot: Json | null
          convocation_time: string | null
          convocations_sent: boolean
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          facility_id: string | null
          id: string
          is_home: boolean | null
          is_official: boolean
          location: string | null
          location_url: string | null
          meeting_point: string | null
          opponent: string | null
          responses_locked: boolean
          series_detached: boolean
          series_id: string | null
          series_slot_id: string | null
          show_called_up_players_override: boolean | null
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          team_id: string
          title: string
          type: Database["public"]["Enums"]["event_type"]
          venue_id: string | null
        }
        Insert: {
          attachments?: Json
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carpool_enabled?: boolean
          championship_id?: string | null
          competition_name?: string | null
          competition_type?: string | null
          convocation_last_sent_at?: string | null
          convocation_sent_snapshot?: Json | null
          convocation_time?: string | null
          convocations_sent?: boolean
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          facility_id?: string | null
          id?: string
          is_home?: boolean | null
          is_official?: boolean
          location?: string | null
          location_url?: string | null
          meeting_point?: string | null
          opponent?: string | null
          responses_locked?: boolean
          series_detached?: boolean
          series_id?: string | null
          series_slot_id?: string | null
          show_called_up_players_override?: boolean | null
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          team_id: string
          title: string
          type?: Database["public"]["Enums"]["event_type"]
          venue_id?: string | null
        }
        Update: {
          attachments?: Json
          cancellation_reason?: string | null
          cancelled_at?: string | null
          carpool_enabled?: boolean
          championship_id?: string | null
          competition_name?: string | null
          competition_type?: string | null
          convocation_last_sent_at?: string | null
          convocation_sent_snapshot?: Json | null
          convocation_time?: string | null
          convocations_sent?: boolean
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          facility_id?: string | null
          id?: string
          is_home?: boolean | null
          is_official?: boolean
          location?: string | null
          location_url?: string | null
          meeting_point?: string | null
          opponent?: string | null
          responses_locked?: boolean
          series_detached?: boolean
          series_id?: string | null
          series_slot_id?: string | null
          show_called_up_players_override?: boolean | null
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          team_id?: string
          title?: string
          type?: Database["public"]["Enums"]["event_type"]
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "team_championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "club_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "training_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_slot_id_fkey"
            columns: ["series_slot_id"]
            isOneToOne: false
            referencedRelation: "training_series_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "club_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_events: {
        Row: {
          actor_club_id: string | null
          actor_coach_id: string | null
          actor_player_id: string | null
          created_at: string | null
          description: string | null
          event_type: string
          id: string
          metadata: Json | null
          occurred_at: string | null
          target_type: string
          title: string
          visibility: string | null
        }
        Insert: {
          actor_club_id?: string | null
          actor_coach_id?: string | null
          actor_player_id?: string | null
          created_at?: string | null
          description?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          occurred_at?: string | null
          target_type: string
          title: string
          visibility?: string | null
        }
        Update: {
          actor_club_id?: string | null
          actor_coach_id?: string | null
          actor_player_id?: string | null
          created_at?: string | null
          description?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string | null
          target_type?: string
          title?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_events_actor_club_id_fkey"
            columns: ["actor_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_actor_coach_id_fkey"
            columns: ["actor_coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_actor_player_id_fkey"
            columns: ["actor_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string | null
          followed_club_id: string | null
          followed_coach_id: string | null
          followed_player_id: string | null
          follower_id: string
          id: string
          target_type: string
        }
        Insert: {
          created_at?: string | null
          followed_club_id?: string | null
          followed_coach_id?: string | null
          followed_player_id?: string | null
          follower_id: string
          id?: string
          target_type: string
        }
        Update: {
          created_at?: string | null
          followed_club_id?: string | null
          followed_coach_id?: string | null
          followed_player_id?: string | null
          follower_id?: string
          id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followed_club_id_fkey"
            columns: ["followed_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_followed_coach_id_fkey"
            columns: ["followed_coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_followed_player_id_fkey"
            columns: ["followed_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraising_campaigns: {
        Row: {
          club_id: string
          collected_cents: number
          cover_url: string | null
          created_at: string
          created_by: string
          currency: string
          description: string | null
          end_date: string | null
          goal_cents: number
          id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          season_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["fundraising_status"]
          title: string
          updated_at: string
        }
        Insert: {
          club_id: string
          collected_cents?: number
          cover_url?: string | null
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          end_date?: string | null
          goal_cents: number
          id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          season_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["fundraising_status"]
          title: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          collected_cents?: number
          cover_url?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          goal_cents?: number
          id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          season_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["fundraising_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundraising_campaigns_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_campaigns_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraising_contributions: {
        Row: {
          amount_gross_cents: number
          amount_net_cents: number
          campaign_id: string
          club_id: string
          comment: string | null
          created_at: string
          currency: string
          donor_email: string | null
          donor_name: string | null
          donor_user_id: string | null
          external_reference: string | null
          id: string
          is_anonymous: boolean
          method: Database["public"]["Enums"]["payment_provider"]
          paid_at: string | null
          provider_fee_cents: number
          recorded_by: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_gross_cents: number
          amount_net_cents: number
          campaign_id: string
          club_id: string
          comment?: string | null
          created_at?: string
          currency?: string
          donor_email?: string | null
          donor_name?: string | null
          donor_user_id?: string | null
          external_reference?: string | null
          id?: string
          is_anonymous?: boolean
          method: Database["public"]["Enums"]["payment_provider"]
          paid_at?: string | null
          provider_fee_cents?: number
          recorded_by?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_gross_cents?: number
          amount_net_cents?: number
          campaign_id?: string
          club_id?: string
          comment?: string | null
          created_at?: string
          currency?: string
          donor_email?: string | null
          donor_name?: string | null
          donor_user_id?: string | null
          external_reference?: string | null
          id?: string
          is_anonymous?: boolean
          method?: Database["public"]["Enums"]["payment_provider"]
          paid_at?: string | null
          provider_fee_cents?: number
          recorded_by?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fundraising_contributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fundraising_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_contributions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_cache: {
        Row: {
          cache_key: string
          created_at: string
          feature: string
          locale: string
          response: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          feature: string
          locale: string
          response: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          feature?: string
          locale?: string
          response?: Json
        }
        Relationships: []
      }
      llm_usage: {
        Row: {
          club_id: string | null
          created_at: string
          feature: string
          id: string
          model: string
          status: string
          tokens_in: number
          tokens_out: number
          user_id: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          feature: string
          id?: string
          model: string
          status: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string
          feature?: string
          id?: string
          model?: string
          status?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
        }
        Relationships: []
      }
      match_results: {
        Row: {
          away_score: number
          created_at: string
          event_id: string
          home_score: number
          id: string
          notes: string | null
          recorded_by: string | null
          score_details: Json | null
          updated_at: string
        }
        Insert: {
          away_score?: number
          created_at?: string
          event_id: string
          home_score?: number
          id?: string
          notes?: string | null
          recorded_by?: string | null
          score_details?: Json | null
          updated_at?: string
        }
        Update: {
          away_score?: number
          created_at?: string
          event_id?: string
          home_score?: number
          id?: string
          notes?: string | null
          recorded_by?: string | null
          score_details?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      meeting_attendees: {
        Row: {
          added_manually: boolean
          club_id: string
          comment: string | null
          created_at: string
          event_id: string
          id: string
          invited_at: string
          member_id: string | null
          responded_at: string | null
          response_token: string
          sources: Json
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          added_manually?: boolean
          club_id: string
          comment?: string | null
          created_at?: string
          event_id: string
          id?: string
          invited_at?: string
          member_id?: string | null
          responded_at?: string | null
          response_token?: string
          sources?: Json
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          added_manually?: boolean
          club_id?: string
          comment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          invited_at?: string
          member_id?: string | null
          responded_at?: string | null
          response_token?: string
          sources?: Json
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_invites: {
        Row: {
          club_id: string
          created_at: string
          created_by: string
          email: string | null
          email_message_id: string | null
          expires_at: string
          first_name: string | null
          id: string
          last_name: string | null
          parent_for_player_id: string | null
          phone: string | null
          player_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          team_id: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by: string
          email?: string | null
          email_message_id?: string | null
          expires_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          parent_for_player_id?: string | null
          phone?: string | null
          player_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string
          email?: string | null
          email_message_id?: string | null
          expires_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          parent_for_player_id?: string | null
          phone?: string | null
          player_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_invites_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_invites_parent_for_player_id_fkey"
            columns: ["parent_for_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_invites_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      parent_link_notifications: {
        Row: {
          notified_at: string
          parent_user_id: string
          player_id: string
        }
        Insert: {
          notified_at?: string
          parent_user_id: string
          player_id: string
        }
        Update: {
          notified_at?: string
          parent_user_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_link_notifications_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_assignments: {
        Row: {
          club_id: string
          created_at: string
          id: string
          payment_item_id: string
          target_kind: Database["public"]["Enums"]["payment_target_kind"]
          target_player_id: string | null
          target_team_id: string | null
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          payment_item_id: string
          target_kind: Database["public"]["Enums"]["payment_target_kind"]
          target_player_id?: string | null
          target_team_id?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          payment_item_id?: string
          target_kind?: Database["public"]["Enums"]["payment_target_kind"]
          target_player_id?: string | null
          target_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_assignments_payment_item_id_fkey"
            columns: ["payment_item_id"]
            isOneToOne: false
            referencedRelation: "payment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_assignments_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_assignments_target_team_id_fkey"
            columns: ["target_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          club_id: string
          comment: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          previous_value: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          club_id: string
          comment?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          club_id?: string
          comment?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_audit_logs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_items: {
        Row: {
          allow_partial: boolean
          amount_cents: number
          club_id: string
          created_at: string
          created_by: string
          currency: string
          description: string | null
          due_date: string | null
          id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          season_id: string
          status: Database["public"]["Enums"]["payment_item_status"]
          team_id: string | null
          title: string
          type: Database["public"]["Enums"]["payment_item_type"]
          updated_at: string
        }
        Insert: {
          allow_partial?: boolean
          amount_cents: number
          club_id: string
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          season_id: string
          status?: Database["public"]["Enums"]["payment_item_status"]
          team_id?: string | null
          title: string
          type: Database["public"]["Enums"]["payment_item_type"]
          updated_at?: string
        }
        Update: {
          allow_partial?: boolean
          amount_cents?: number
          club_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          season_id?: string
          status?: Database["public"]["Enums"]["payment_item_status"]
          team_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["payment_item_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_items_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_items_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_items_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_obligations: {
        Row: {
          amount_due_cents: number
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          club_id: string
          created_at: string
          currency: string
          exempted_at: string | null
          exempted_by: string | null
          exempted_reason: string | null
          id: string
          payer_user_id: string | null
          payment_item_id: string
          player_id: string | null
          status: Database["public"]["Enums"]["payment_obligation_status"]
          updated_at: string
        }
        Insert: {
          amount_due_cents: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          club_id: string
          created_at?: string
          currency?: string
          exempted_at?: string | null
          exempted_by?: string | null
          exempted_reason?: string | null
          id?: string
          payer_user_id?: string | null
          payment_item_id: string
          player_id?: string | null
          status?: Database["public"]["Enums"]["payment_obligation_status"]
          updated_at?: string
        }
        Update: {
          amount_due_cents?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          club_id?: string
          created_at?: string
          currency?: string
          exempted_at?: string | null
          exempted_by?: string | null
          exempted_reason?: string | null
          id?: string
          payer_user_id?: string | null
          payment_item_id?: string
          player_id?: string | null
          status?: Database["public"]["Enums"]["payment_obligation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_obligations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_obligations_payment_item_id_fkey"
            columns: ["payment_item_id"]
            isOneToOne: false
            referencedRelation: "payment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_obligations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          amount_gross_cents: number
          club_id: string
          currency: string
          id: string
          issued_at: string
          item_title: string | null
          kind: Database["public"]["Enums"]["receipt_kind"]
          method: Database["public"]["Enums"]["payment_provider"]
          obligation_id: string
          payer_name: string | null
          pdf_url: string | null
          player_name: string | null
          receipt_number: number
          transaction_id: string
        }
        Insert: {
          amount_gross_cents: number
          club_id: string
          currency?: string
          id?: string
          issued_at?: string
          item_title?: string | null
          kind: Database["public"]["Enums"]["receipt_kind"]
          method: Database["public"]["Enums"]["payment_provider"]
          obligation_id: string
          payer_name?: string | null
          pdf_url?: string | null
          player_name?: string | null
          receipt_number: number
          transaction_id: string
        }
        Update: {
          amount_gross_cents?: number
          club_id?: string
          currency?: string
          id?: string
          issued_at?: string
          item_title?: string | null
          kind?: Database["public"]["Enums"]["receipt_kind"]
          method?: Database["public"]["Enums"]["payment_provider"]
          obligation_id?: string
          payer_name?: string | null
          pdf_url?: string | null
          player_name?: string | null
          receipt_number?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "payment_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminder_log: {
        Row: {
          channel: string
          club_id: string
          id: string
          obligation_id: string
          offset_days: number
          payment_item_id: string
          recipient_email: string
          sent_at: string
          triggered_by: string | null
        }
        Insert: {
          channel?: string
          club_id: string
          id?: string
          obligation_id: string
          offset_days: number
          payment_item_id: string
          recipient_email: string
          sent_at?: string
          triggered_by?: string | null
        }
        Update: {
          channel?: string
          club_id?: string
          id?: string
          obligation_id?: string
          offset_days?: number
          payment_item_id?: string
          recipient_email?: string
          sent_at?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminder_log_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminder_log_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "payment_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminder_log_payment_item_id_fkey"
            columns: ["payment_item_id"]
            isOneToOne: false
            referencedRelation: "payment_items"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount_gross_cents: number
          amount_net_cents: number
          attachment_url: string | null
          club_id: string
          comment: string | null
          created_at: string
          currency: string
          external_reference: string | null
          id: string
          method: Database["public"]["Enums"]["payment_provider"]
          obligation_id: string
          paid_at: string | null
          parent_transaction_id: string | null
          provider_fee_cents: number
          recorded_by: string | null
          refund_reason: string | null
          refunded_amount_cents: number
          refunded_at: string | null
          refunded_by: string | null
          status: Database["public"]["Enums"]["payment_tx_status"]
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
        }
        Insert: {
          amount_gross_cents: number
          amount_net_cents: number
          attachment_url?: string | null
          club_id: string
          comment?: string | null
          created_at?: string
          currency?: string
          external_reference?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_provider"]
          obligation_id: string
          paid_at?: string | null
          parent_transaction_id?: string | null
          provider_fee_cents?: number
          recorded_by?: string | null
          refund_reason?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          refunded_by?: string | null
          status?: Database["public"]["Enums"]["payment_tx_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
        }
        Update: {
          amount_gross_cents?: number
          amount_net_cents?: number
          attachment_url?: string | null
          club_id?: string
          comment?: string | null
          created_at?: string
          currency?: string
          external_reference?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_provider"]
          obligation_id?: string
          paid_at?: string | null
          parent_transaction_id?: string | null
          provider_fee_cents?: number
          recorded_by?: string | null
          refund_reason?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          refunded_by?: string | null
          status?: Database["public"]["Enums"]["payment_tx_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "payment_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_changes_log: {
        Row: {
          action: string | null
          actor_id: string | null
          changed_at: string
          id: string
          new_roles: string[] | null
          note: string | null
          old_roles: string[] | null
          scope: string
          scope_id: string
          target_email: string | null
          target_id: string | null
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          changed_at?: string
          id?: string
          new_roles?: string[] | null
          note?: string | null
          old_roles?: string[] | null
          scope: string
          scope_id: string
          target_email?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          changed_at?: string
          id?: string
          new_roles?: string[] | null
          note?: string | null
          old_roles?: string[] | null
          scope?: string
          scope_id?: string
          target_email?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      player_achievements: {
        Row: {
          achievement_date: string | null
          achievement_type: string
          club_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          player_id: string
          related_tournament_id: string | null
          season_label: string | null
          source: string
          status: string
          team_id: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          achievement_date?: string | null
          achievement_type: string
          club_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          player_id: string
          related_tournament_id?: string | null
          season_label?: string | null
          source?: string
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          achievement_date?: string | null
          achievement_type?: string
          club_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          player_id?: string
          related_tournament_id?: string | null
          season_label?: string | null
          source?: string
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_achievements_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_related_tournament_id_fkey"
            columns: ["related_tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_availabilities: {
        Row: {
          comment: string | null
          created_at: string
          created_by_user_id: string
          end_date: string
          id: string
          player_id: string
          reason: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by_user_id: string
          end_date: string
          id?: string
          player_id: string
          reason: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by_user_id?: string
          end_date?: string
          id?: string
          player_id?: string
          reason?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_availabilities_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_feedback: {
        Row: {
          author_user_id: string
          club_id: string
          comment: string | null
          created_at: string
          deleted_at: string | null
          dev_notes: string | null
          event_id: string | null
          id: string
          improvements: string | null
          player_id: string
          rating: number | null
          shared_summary: string | null
          strengths: string | null
          tags: string[]
          team_id: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["feedback_visibility"]
        }
        Insert: {
          author_user_id: string
          club_id: string
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          dev_notes?: string | null
          event_id?: string | null
          id?: string
          improvements?: string | null
          player_id: string
          rating?: number | null
          shared_summary?: string | null
          strengths?: string | null
          tags?: string[]
          team_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["feedback_visibility"]
        }
        Update: {
          author_user_id?: string
          club_id?: string
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          dev_notes?: string | null
          event_id?: string | null
          id?: string
          improvements?: string | null
          player_id?: string
          rating?: number | null
          shared_summary?: string | null
          strengths?: string | null
          tags?: string[]
          team_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["feedback_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "player_feedback_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_feedback_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_feedback_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_feedback_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_guardians: {
        Row: {
          club_id: string
          created_at: string
          id: string
          is_primary_payer: boolean
          player_id: string
          relation: string | null
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          is_primary_payer?: boolean
          player_id: string
          relation?: string | null
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          is_primary_payer?: boolean
          player_id?: string
          relation?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_guardians_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_guardians_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_parents: {
        Row: {
          can_respond: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          parent_user_id: string | null
          phone: string | null
          player_id: string
        }
        Insert: {
          can_respond?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          parent_user_id?: string | null
          phone?: string | null
          player_id: string
        }
        Update: {
          can_respond?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          parent_user_id?: string | null
          phone?: string | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_parents_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_reviews: {
        Row: {
          author_user_id: string
          club_id: string
          content: string
          created_at: string
          id: string
          kind: string
          model: string | null
          period_end: string | null
          period_start: string | null
          player_id: string
          visibility: Database["public"]["Enums"]["feedback_visibility"]
        }
        Insert: {
          author_user_id: string
          club_id: string
          content: string
          created_at?: string
          id?: string
          kind: string
          model?: string | null
          period_end?: string | null
          period_start?: string | null
          player_id: string
          visibility?: Database["public"]["Enums"]["feedback_visibility"]
        }
        Update: {
          author_user_id?: string
          club_id?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          model?: string | null
          period_end?: string | null
          period_start?: string | null
          player_id?: string
          visibility?: Database["public"]["Enums"]["feedback_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "player_reviews_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_reviews_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_seasons: {
        Row: {
          category: string | null
          club_id: string
          coach_summary: string | null
          created_at: string
          id: string
          player_id: string
          primary_position: string | null
          season_label: string
          secondary_position: string | null
          sport: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          club_id: string
          coach_summary?: string | null
          created_at?: string
          id?: string
          player_id: string
          primary_position?: string | null
          season_label: string
          secondary_position?: string | null
          sport?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          club_id?: string
          coach_summary?: string | null
          created_at?: string
          id?: string
          player_id?: string
          primary_position?: string | null
          season_label?: string
          secondary_position?: string | null
          sport?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_seasons_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_seasons_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_seasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_suspensions: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          first_match_id: string | null
          id: string
          matches_served: number
          matches_to_serve: number
          player_id: string
          served_event_ids: string[]
          status: string
          suspension_notes: string | null
          suspension_reason: string
          suspension_start_date: string
          team_id: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          first_match_id?: string | null
          id?: string
          matches_served?: number
          matches_to_serve: number
          player_id: string
          served_event_ids?: string[]
          status?: string
          suspension_notes?: string | null
          suspension_reason: string
          suspension_start_date?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          first_match_id?: string | null
          id?: string
          matches_served?: number
          matches_to_serve?: number
          player_id?: string
          served_event_ids?: string[]
          status?: string
          suspension_notes?: string | null
          suspension_reason?: string
          suspension_start_date?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_suspensions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_suspensions_first_match_id_fkey"
            columns: ["first_match_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_suspensions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_suspensions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_timeline_events: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          dedup_key: string | null
          description: string | null
          event_date: string
          event_type: string
          id: string
          player_id: string
          related_achievement_id: string | null
          related_event_id: string | null
          source: string
          team_id: string | null
          title: string
          visibility: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          dedup_key?: string | null
          description?: string | null
          event_date: string
          event_type: string
          id?: string
          player_id: string
          related_achievement_id?: string | null
          related_event_id?: string | null
          source?: string
          team_id?: string | null
          title: string
          visibility?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          dedup_key?: string | null
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          player_id?: string
          related_achievement_id?: string | null
          related_event_id?: string | null
          source?: string
          team_id?: string | null
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_timeline_events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_timeline_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_timeline_events_related_achievement_id_fkey"
            columns: ["related_achievement_id"]
            isOneToOne: false
            referencedRelation: "player_achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_timeline_events_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_timeline_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          birth_date: string | null
          can_respond: boolean
          child_platform_access: boolean
          claim_requested_at: string | null
          claim_requested_by: string | null
          claim_status: string | null
          club_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          jersey_number: number | null
          last_name: string
          license_number: string | null
          media_consent_status: Database["public"]["Enums"]["media_consent_status"]
          phone: string | null
          photo_url: string | null
          position: string | null
          preferred_position: string | null
          public_profile_enabled: boolean
          public_slug: string | null
          user_id: string | null
        }
        Insert: {
          birth_date?: string | null
          can_respond?: boolean
          child_platform_access?: boolean
          claim_requested_at?: string | null
          claim_requested_by?: string | null
          claim_status?: string | null
          club_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          jersey_number?: number | null
          last_name: string
          license_number?: string | null
          media_consent_status?: Database["public"]["Enums"]["media_consent_status"]
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          preferred_position?: string | null
          public_profile_enabled?: boolean
          public_slug?: string | null
          user_id?: string | null
        }
        Update: {
          birth_date?: string | null
          can_respond?: boolean
          child_platform_access?: boolean
          claim_requested_at?: string | null
          claim_requested_by?: string | null
          claim_status?: string | null
          club_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          jersey_number?: number | null
          last_name?: string
          license_number?: string | null
          media_consent_status?: Database["public"]["Enums"]["media_consent_status"]
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          preferred_position?: string | null
          public_profile_enabled?: boolean
          public_slug?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_activity_log: {
        Row: {
          action_type: string
          actor_role: string | null
          actor_user_id: string | null
          category: string
          club_id: string | null
          created_at: string
          error_code: string | null
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string | null
          status: string
        }
        Insert: {
          action_type: string
          actor_role?: string | null
          actor_user_id?: string | null
          category: string
          club_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          status?: string
        }
        Update: {
          action_type?: string
          actor_role?: string | null
          actor_user_id?: string | null
          category?: string
          club_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_activity_log_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          first_name: string | null
          followers_count: number | null
          full_name: string | null
          id: string
          is_independent: boolean | null
          last_name: string | null
          looking_for_club: boolean | null
          notifications_email: boolean
          notifications_push: boolean
          parental_public_consent: boolean | null
          person_type: string | null
          phone: string | null
          phone_verified_at: string | null
          preferred_language: string
          profile_visibility: string | null
          public_slug: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          first_name?: string | null
          followers_count?: number | null
          full_name?: string | null
          id: string
          is_independent?: boolean | null
          last_name?: string | null
          looking_for_club?: boolean | null
          notifications_email?: boolean
          notifications_push?: boolean
          parental_public_consent?: boolean | null
          person_type?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          preferred_language?: string
          profile_visibility?: string | null
          public_slug?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          first_name?: string | null
          followers_count?: number | null
          full_name?: string | null
          id?: string
          is_independent?: boolean | null
          last_name?: string | null
          looking_for_club?: boolean | null
          notifications_email?: boolean
          notifications_push?: boolean
          parental_public_consent?: boolean | null
          person_type?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          preferred_language?: string
          profile_visibility?: string | null
          public_slug?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_rate_limits: {
        Row: {
          count: number
          ip: string
          route: string
          window_start: string
        }
        Insert: {
          count?: number
          ip: string
          route: string
          window_start: string
        }
        Update: {
          count?: number
          ip?: string
          route?: string
          window_start?: string
        }
        Relationships: []
      }
      push_dispatch_log: {
        Row: {
          dispatched_at: string
          first_opened_at: string | null
          id: string
          kind: string
          opened_count: number
          ref_id: string
          sent_count: number
          targets_count: number
        }
        Insert: {
          dispatched_at?: string
          first_opened_at?: string | null
          id?: string
          kind: string
          opened_count?: number
          ref_id: string
          sent_count?: number
          targets_count?: number
        }
        Update: {
          dispatched_at?: string
          first_opened_at?: string | null
          id?: string
          kind?: string
          opened_count?: number
          ref_id?: string
          sent_count?: number
          targets_count?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          channel: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          channel?: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          channel?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          channel: Database["public"]["Enums"]["reminder_channel"]
          convocation_id: string
          id: string
          milestone_hours: number | null
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["reminder_channel"]
          convocation_id: string
          id?: string
          milestone_hours?: number | null
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["reminder_channel"]
          convocation_id?: string
          id?: string
          milestone_hours?: number | null
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_convocation_id_fkey"
            columns: ["convocation_id"]
            isOneToOne: false
            referencedRelation: "convocations"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          club_id: string
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          label: string
          start_date: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          label: string
          start_date: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          label?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_stats_daily: {
        Row: {
          clicks: number
          club_id: string
          day: string
          impressions: number
          sponsor_id: string
        }
        Insert: {
          clicks?: number
          club_id: string
          day: string
          impressions?: number
          sponsor_id: string
        }
        Update: {
          clicks?: number
          club_id?: string
          day?: string
          impressions?: number
          sponsor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_stats_daily_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_stats_daily_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          club_id: string
          created_at: string
          id: string
          is_active: boolean
          logo_scale: number
          logo_url: string | null
          name: string
          target_url: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo_scale?: number
          logo_url?: string | null
          name: string
          target_url?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo_scale?: number
          logo_url?: string | null
          name?: string
          target_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_availabilities: {
        Row: {
          certainty: string
          club_id: string
          comment: string | null
          created_at: string
          created_by_user_id: string
          end_date: string
          id: string
          reason: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          certainty?: string
          club_id: string
          comment?: string | null
          created_at?: string
          created_by_user_id: string
          end_date: string
          id?: string
          reason: string
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          certainty?: string
          club_id?: string
          comment?: string | null
          created_at?: string
          created_by_user_id?: string
          end_date?: string
          id?: string
          reason?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_availabilities_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string | null
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type?: string | null
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string | null
          processed_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          club_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          exempt_from_billing: boolean
          exempt_granted_at: string | null
          exempt_granted_by: string | null
          exempt_reason: string | null
          exempt_until: string | null
          id: string
          plan: Database["public"]["Enums"]["subscription_plan"] | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_reminders_sent: number[]
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          club_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          exempt_from_billing?: boolean
          exempt_granted_at?: string | null
          exempt_granted_by?: string | null
          exempt_reason?: string | null
          exempt_until?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"] | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_reminders_sent?: number[]
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          club_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          exempt_from_billing?: boolean
          exempt_granted_at?: string | null
          exempt_granted_by?: string | null
          exempt_reason?: string | null
          exempt_until?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"] | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_reminders_sent?: number[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      superadmin_audit_logs: {
        Row: {
          action: string
          actor_user_id: string
          club_id: string | null
          created_at: string
          id: string
          ip: string | null
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          club_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          club_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      superadmin_imports: {
        Row: {
          club_id: string
          created_at: string
          error_log: Json | null
          file_name: string | null
          ia_used: boolean
          id: string
          import_type: string
          imported_by: string
          invitations_sent: boolean
          rows_imported: number
          rows_total: number
          status: string
        }
        Insert: {
          club_id: string
          created_at?: string
          error_log?: Json | null
          file_name?: string | null
          ia_used?: boolean
          id?: string
          import_type: string
          imported_by: string
          invitations_sent?: boolean
          rows_imported?: number
          rows_total?: number
          status: string
        }
        Update: {
          club_id?: string
          created_at?: string
          error_log?: Json | null
          file_name?: string | null
          ia_used?: boolean
          id?: string
          import_type?: string
          imported_by?: string
          invitations_sent?: boolean
          rows_imported?: number
          rows_total?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "superadmin_imports_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachment_paths: string[]
          body: string
          created_at: string
          id: string
          is_internal_note: boolean
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Insert: {
          attachment_paths?: string[]
          body: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Update: {
          attachment_paths?: string[]
          body?: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          sender_id?: string
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_audit: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string | null
          created_at: string
          from_value: string | null
          id: string
          meta: Json | null
          ticket_id: string
          to_value: string | null
        }
        Insert: {
          action: string
          actor_role: string
          actor_user_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          meta?: Json | null
          ticket_id: string
          to_value?: string | null
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          meta?: Json | null
          ticket_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_audit_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["support_ticket_category"]
          club_id: string | null
          context_data: Json
          created_at: string
          description: string
          id: string
          last_activity_at: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          staff_unread_count: number
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
          user_id: string
          user_unread_count: number
        }
        Insert: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          club_id?: string | null
          context_data?: Json
          created_at?: string
          description: string
          id?: string
          last_activity_at?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          staff_unread_count?: number
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
          user_unread_count?: number
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          club_id?: string | null
          context_data?: Json
          created_at?: string
          description?: string
          id?: string
          last_activity_at?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          staff_unread_count?: number
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
          user_unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      support_view_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          session_id: string
          superadmin_id: string
          target_id: string | null
          target_kind: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          session_id: string
          superadmin_id: string
          target_id?: string | null
          target_kind?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          session_id?: string
          superadmin_id?: string
          target_id?: string | null
          target_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_view_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "support_view_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      support_view_sessions: {
        Row: {
          club_id: string
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          persona: Database["public"]["Enums"]["support_view_persona"]
          reason: string
          started_at: string
          superadmin_id: string
          target_user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          ended_at?: string | null
          expires_at: string
          id?: string
          persona: Database["public"]["Enums"]["support_view_persona"]
          reason: string
          started_at?: string
          superadmin_id: string
          target_user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          persona?: Database["public"]["Enums"]["support_view_persona"]
          reason?: string
          started_at?: string
          superadmin_id?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_view_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          bounce_count: number
          created_at: string
          email: string
          id: string
          last_bounce_at: string | null
          metadata: Json | null
          reason: string
        }
        Insert: {
          bounce_count?: number
          created_at?: string
          email: string
          id?: string
          last_bounce_at?: string | null
          metadata?: Json | null
          reason: string
        }
        Update: {
          bounce_count?: number
          created_at?: string
          email?: string
          id?: string
          last_bounce_at?: string | null
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_championships: {
        Row: {
          club_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          season_label: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          season_label?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          season_label?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_championships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_championships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          player_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          team_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          player_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          team_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          age_group: string | null
          archived_at: string | null
          championship: string | null
          club_id: string
          communication_mode: string
          competitions: string[]
          created_at: string
          deleted_at: string | null
          id: string
          image_url: string | null
          is_internal: boolean
          name: string
          season: string | null
          show_called_up_players_override: boolean | null
          sport: string | null
          whatsapp_group_url: string | null
        }
        Insert: {
          age_group?: string | null
          archived_at?: string | null
          championship?: string | null
          club_id: string
          communication_mode?: string
          competitions?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_internal?: boolean
          name: string
          season?: string | null
          show_called_up_players_override?: boolean | null
          sport?: string | null
          whatsapp_group_url?: string | null
        }
        Update: {
          age_group?: string | null
          archived_at?: string | null
          championship?: string | null
          club_id?: string
          communication_mode?: string
          competitions?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_internal?: boolean
          name?: string
          season?: string | null
          show_called_up_players_override?: boolean | null
          sport?: string | null
          whatsapp_group_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_collaborators: {
        Row: {
          accepted_at: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          invitation_token: string
          invited_at: string
          invited_by: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["tournament_collaborator_role"]
          tournament_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          invitation_token?: string
          invited_at?: string
          invited_by: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["tournament_collaborator_role"]
          tournament_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          invitation_token?: string
          invited_at?: string
          invited_by?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["tournament_collaborator_role"]
          tournament_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_collaborators_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_documents: {
        Row: {
          file_url: string
          generated_at: string
          generated_by: string | null
          id: string
          kind: string
          language: string
          storage_path: string | null
          tournament_id: string
        }
        Insert: {
          file_url: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          kind: string
          language?: string
          storage_path?: string | null
          tournament_id: string
        }
        Update: {
          file_url?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          kind?: string
          language?: string
          storage_path?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_documents_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_entitlements: {
        Row: {
          created_at: string
          id: string
          organizer_id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          tournament_id: string | null
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organizer_id: string
          plan: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          tournament_id?: string | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organizer_id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          tournament_id?: string | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_entitlements_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_flights: {
        Row: {
          color: string | null
          created_at: string
          enable_fifth_place: boolean
          enable_seventh_place: boolean
          enable_third_place: boolean
          id: string
          name: string
          qualification_rules: Json
          short_name: string | null
          sort_order: number
          tournament_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          enable_fifth_place?: boolean
          enable_seventh_place?: boolean
          enable_third_place?: boolean
          id?: string
          name: string
          qualification_rules?: Json
          short_name?: string | null
          sort_order: number
          tournament_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          enable_fifth_place?: boolean
          enable_seventh_place?: boolean
          enable_third_place?: boolean
          id?: string
          name?: string
          qualification_rules?: Json
          short_name?: string | null
          sort_order?: number
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_flights_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          qualifiers_count: number
          sort_order: number
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          qualifiers_count?: number
          sort_order?: number
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          qualifiers_count?: number
          sort_order?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_match_events: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["tournament_event_kind"]
          match_id: string
          minute: number | null
          player_name: string | null
          team_id: string | null
          tournament_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["tournament_event_kind"]
          match_id: string
          minute?: number | null
          player_name?: string | null
          team_id?: string | null
          tournament_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["tournament_event_kind"]
          match_id?: string
          minute?: number | null
          player_name?: string | null
          team_id?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_match_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_match_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_matches: {
        Row: {
          bracket_position: number | null
          bracket_side: string | null
          created_at: string
          decided_in: string | null
          details: Json
          dispute_flag: boolean
          duration_min: number | null
          field: string | null
          flight_id: string | null
          group_id: string | null
          id: string
          match_number: number | null
          notes: string | null
          overtime_score_a: number | null
          overtime_score_b: number | null
          penalty_score_a: number | null
          penalty_score_b: number | null
          placement_kind: string | null
          referee_name: string | null
          referee_user_id: string | null
          round: Database["public"]["Enums"]["tournament_match_round"]
          scheduled_at: string | null
          score_a: number | null
          score_b: number | null
          sets: Json | null
          status: Database["public"]["Enums"]["tournament_match_status"]
          team_a_id: string | null
          team_a_source: Json | null
          team_b_id: string | null
          team_b_source: Json | null
          tournament_id: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          winner_team_id: string | null
        }
        Insert: {
          bracket_position?: number | null
          bracket_side?: string | null
          created_at?: string
          decided_in?: string | null
          details?: Json
          dispute_flag?: boolean
          duration_min?: number | null
          field?: string | null
          flight_id?: string | null
          group_id?: string | null
          id?: string
          match_number?: number | null
          notes?: string | null
          overtime_score_a?: number | null
          overtime_score_b?: number | null
          penalty_score_a?: number | null
          penalty_score_b?: number | null
          placement_kind?: string | null
          referee_name?: string | null
          referee_user_id?: string | null
          round?: Database["public"]["Enums"]["tournament_match_round"]
          scheduled_at?: string | null
          score_a?: number | null
          score_b?: number | null
          sets?: Json | null
          status?: Database["public"]["Enums"]["tournament_match_status"]
          team_a_id?: string | null
          team_a_source?: Json | null
          team_b_id?: string | null
          team_b_source?: Json | null
          tournament_id: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          winner_team_id?: string | null
        }
        Update: {
          bracket_position?: number | null
          bracket_side?: string | null
          created_at?: string
          decided_in?: string | null
          details?: Json
          dispute_flag?: boolean
          duration_min?: number | null
          field?: string | null
          flight_id?: string | null
          group_id?: string | null
          id?: string
          match_number?: number | null
          notes?: string | null
          overtime_score_a?: number | null
          overtime_score_b?: number | null
          penalty_score_a?: number | null
          penalty_score_b?: number | null
          placement_kind?: string | null
          referee_name?: string | null
          referee_user_id?: string | null
          round?: Database["public"]["Enums"]["tournament_match_round"]
          scheduled_at?: string | null
          score_a?: number | null
          score_b?: number | null
          sets?: Json | null
          status?: Database["public"]["Enums"]["tournament_match_status"]
          team_a_id?: string | null
          team_a_source?: Json | null
          team_b_id?: string | null
          team_b_source?: Json | null
          tournament_id?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "tournament_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tournament_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_members: {
        Row: {
          assigned_match_ids: string[]
          created_at: string
          email: string | null
          first_name: string
          id: string
          invite_token: string
          invited_at: string
          invited_by: string | null
          joined_at: string | null
          last_name: string
          role: string
          tournament_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_match_ids?: string[]
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          invite_token?: string
          invited_at?: string
          invited_by?: string | null
          joined_at?: string | null
          last_name: string
          role: string
          tournament_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_match_ids?: string[]
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          invite_token?: string
          invited_at?: string
          invited_by?: string | null
          joined_at?: string | null
          last_name?: string
          role?: string
          tournament_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_members_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_passes: {
        Row: {
          amount_total: number | null
          created_at: string
          currency: string | null
          email: string
          expires_at: string | null
          id: string
          paid_at: string | null
          status: Database["public"]["Enums"]["tournament_pass_status"]
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          tournament_id: string | null
          updated_at: string
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          amount_total?: number | null
          created_at?: string
          currency?: string | null
          email: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["tournament_pass_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tournament_id?: string | null
          updated_at?: string
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount_total?: number | null
          created_at?: string
          currency?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["tournament_pass_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tournament_id?: string | null
          updated_at?: string
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_passes_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_payment_events: {
        Row: {
          actor_id: string | null
          amount: number | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          metadata: Json
          registration_id: string | null
          stripe_event_id: string | null
          tournament_id: string | null
        }
        Insert: {
          actor_id?: string | null
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          metadata?: Json
          registration_id?: string | null
          stripe_event_id?: string | null
          tournament_id?: string | null
        }
        Update: {
          actor_id?: string | null
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          registration_id?: string | null
          stripe_event_id?: string | null
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_payment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_payment_events_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "tournament_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_payment_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_registrations: {
        Row: {
          amount_paid: number | null
          amount_paid_cents: number | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          currency: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          marked_paid_at: string | null
          marked_paid_by: string | null
          notes: string | null
          paid_at: string | null
          payment_intent_id: string | null
          payment_link: string | null
          payment_link_created_at: string | null
          payment_link_expires_at: string | null
          payment_link_sent_at: string | null
          payment_link_sent_via: string | null
          payment_status: string
          platform_fee: number | null
          players: Json
          refund_reason: string | null
          refunded_at: string | null
          registration_state: string
          roster_submitted_at: string | null
          roster_token: string
          short_name: string | null
          status: Database["public"]["Enums"]["tournament_registration_status"]
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          team_name: string
          tournament_id: string
          tournament_team_id: string | null
          updated_at: string
        }
        Insert: {
          amount_paid?: number | null
          amount_paid_cents?: number | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          currency?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          marked_paid_at?: string | null
          marked_paid_by?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_link?: string | null
          payment_link_created_at?: string | null
          payment_link_expires_at?: string | null
          payment_link_sent_at?: string | null
          payment_link_sent_via?: string | null
          payment_status?: string
          platform_fee?: number | null
          players?: Json
          refund_reason?: string | null
          refunded_at?: string | null
          registration_state?: string
          roster_submitted_at?: string | null
          roster_token?: string
          short_name?: string | null
          status?: Database["public"]["Enums"]["tournament_registration_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          team_name: string
          tournament_id: string
          tournament_team_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number | null
          amount_paid_cents?: number | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          currency?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          marked_paid_at?: string | null
          marked_paid_by?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_link?: string | null
          payment_link_created_at?: string | null
          payment_link_expires_at?: string | null
          payment_link_sent_at?: string | null
          payment_link_sent_via?: string | null
          payment_status?: string
          platform_fee?: number | null
          players?: Json
          refund_reason?: string | null
          refunded_at?: string | null
          registration_state?: string
          roster_submitted_at?: string | null
          roster_token?: string
          short_name?: string | null
          status?: Database["public"]["Enums"]["tournament_registration_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          team_name?: string
          tournament_id?: string
          tournament_team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_marked_paid_by_fkey"
            columns: ["marked_paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_tournament_team_id_fkey"
            columns: ["tournament_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_team_players: {
        Row: {
          birth_date: string | null
          created_at: string
          first_name: string
          id: string
          is_captain: boolean
          jersey_number: number | null
          last_name: string
          license_number: string | null
          position: string | null
          tournament_id: string
          tournament_team_id: string
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          first_name: string
          id?: string
          is_captain?: boolean
          jersey_number?: number | null
          last_name: string
          license_number?: string | null
          position?: string | null
          tournament_id: string
          tournament_team_id: string
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          first_name?: string
          id?: string
          is_captain?: boolean
          jersey_number?: number | null
          last_name?: string
          license_number?: string | null
          position?: string | null
          tournament_id?: string
          tournament_team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_team_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_players_tournament_team_id_fkey"
            columns: ["tournament_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          amount_paid_cents: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          group_id: string | null
          id: string
          logo_url: string | null
          marked_paid_by: string | null
          name: string
          notes: string | null
          paid_at: string | null
          payment_currency: string | null
          payment_method: string | null
          payment_note: string | null
          payment_status: string
          seed: number | null
          short_name: string | null
          team_id: string | null
          tournament_id: string
        }
        Insert: {
          amount_paid_cents?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          logo_url?: string | null
          marked_paid_by?: string | null
          name: string
          notes?: string | null
          paid_at?: string | null
          payment_currency?: string | null
          payment_method?: string | null
          payment_note?: string | null
          payment_status?: string
          seed?: number | null
          short_name?: string | null
          team_id?: string | null
          tournament_id: string
        }
        Update: {
          amount_paid_cents?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          logo_url?: string | null
          marked_paid_by?: string | null
          name?: string
          notes?: string | null
          paid_at?: string | null
          payment_currency?: string | null
          payment_method?: string | null
          payment_note?: string | null
          payment_status?: string
          seed?: number | null
          short_name?: string | null
          team_id?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tournament_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_teams_marked_paid_by_fkey"
            columns: ["marked_paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          archived_at: string | null
          break_min: number
          category: string | null
          club_id: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          custom_sport_name: string | null
          daily_end_time: string
          daily_start_time: string
          description: string | null
          double_round_robin: boolean
          ends_on: string | null
          field_streams: Json
          fields: Json
          format: Database["public"]["Enums"]["tournament_format"]
          id: string
          location: string | null
          match_duration_min: number
          max_teams: number | null
          min_rest_minutes: number
          name: string
          num_teams: number
          payment_mode: string
          points_draw: number
          points_loss: number
          points_win: number
          published_programme_at: string | null
          registration_currency: string
          registration_fee: number
          registration_fee_description: string | null
          settings: Json
          slug: string
          sport: string | null
          starts_on: string
          status: Database["public"]["Enums"]["tournament_status"]
          swiss_rounds: number | null
          tiebreakers: Json
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          break_min?: number
          category?: string | null
          club_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          custom_sport_name?: string | null
          daily_end_time?: string
          daily_start_time?: string
          description?: string | null
          double_round_robin?: boolean
          ends_on?: string | null
          field_streams?: Json
          fields?: Json
          format?: Database["public"]["Enums"]["tournament_format"]
          id?: string
          location?: string | null
          match_duration_min?: number
          max_teams?: number | null
          min_rest_minutes?: number
          name: string
          num_teams?: number
          payment_mode?: string
          points_draw?: number
          points_loss?: number
          points_win?: number
          published_programme_at?: string | null
          registration_currency?: string
          registration_fee?: number
          registration_fee_description?: string | null
          settings?: Json
          slug: string
          sport?: string | null
          starts_on: string
          status?: Database["public"]["Enums"]["tournament_status"]
          swiss_rounds?: number | null
          tiebreakers?: Json
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          break_min?: number
          category?: string | null
          club_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          custom_sport_name?: string | null
          daily_end_time?: string
          daily_start_time?: string
          description?: string | null
          double_round_robin?: boolean
          ends_on?: string | null
          field_streams?: Json
          fields?: Json
          format?: Database["public"]["Enums"]["tournament_format"]
          id?: string
          location?: string | null
          match_duration_min?: number
          max_teams?: number | null
          min_rest_minutes?: number
          name?: string
          num_teams?: number
          payment_mode?: string
          points_draw?: number
          points_loss?: number
          points_win?: number
          published_programme_at?: string | null
          registration_currency?: string
          registration_fee?: number
          registration_fee_description?: string | null
          settings?: Json
          slug?: string
          sport?: string | null
          starts_on?: string
          status?: Database["public"]["Enums"]["tournament_status"]
          swiss_rounds?: number | null
          tiebreakers?: Json
          updated_at?: string
        }
        Relationships: []
      }
      training_series: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          ends_on: string
          excluded_dates: string[]
          id: string
          is_official: boolean
          location: string | null
          starts_on: string
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          ends_on: string
          excluded_dates?: string[]
          id?: string
          is_official?: boolean
          location?: string | null
          starts_on: string
          team_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          ends_on?: string
          excluded_dates?: string[]
          id?: string
          is_official?: boolean
          location?: string | null
          starts_on?: string
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_series_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      training_series_slots: {
        Row: {
          created_at: string
          end_time: string
          id: string
          location: string | null
          meeting_time: string | null
          position: number
          series_id: string
          start_time: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          location?: string | null
          meeting_time?: string | null
          position?: number
          series_id: string
          start_time: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          location?: string | null
          meeting_time?: string | null
          position?: number
          series_id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_series_slots_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "training_series"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consents: {
        Row: {
          granted: boolean
          granted_at: string
          id: string
          ip: string | null
          kind: Database["public"]["Enums"]["consent_kind"]
          on_behalf_of_player_id: string | null
          user_agent: string | null
          user_id: string
          version_id: string
          withdrawn_at: string | null
        }
        Insert: {
          granted: boolean
          granted_at?: string
          id?: string
          ip?: string | null
          kind: Database["public"]["Enums"]["consent_kind"]
          on_behalf_of_player_id?: string | null
          user_agent?: string | null
          user_id: string
          version_id: string
          withdrawn_at?: string | null
        }
        Update: {
          granted?: boolean
          granted_at?: string
          id?: string
          ip?: string | null
          kind?: Database["public"]["Enums"]["consent_kind"]
          on_behalf_of_player_id?: string | null
          user_agent?: string | null
          user_id?: string
          version_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_consents_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "consent_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mutes: {
        Row: {
          created_at: string
          id: string
          muted_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          muted_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          muted_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          club_id: string
          created_at: string
          details: string | null
          id: string
          reason: Database["public"]["Enums"]["wall_report_reason"]
          reported_user_id: string
          reporter_user_id: string
          resolution_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["wall_report_status"]
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: Database["public"]["Enums"]["wall_report_reason"]
          reported_user_id: string
          reporter_user_id: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["wall_report_status"]
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["wall_report_reason"]
          reported_user_id?: string
          reporter_user_id?: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["wall_report_status"]
          updated_at?: string
        }
        Relationships: []
      }
      verification_codes: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          target: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          target: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          target?: string
          user_id?: string
        }
        Relationships: []
      }
      waitlist_interest: {
        Row: {
          consent_at: string | null
          created_at: string
          email: string
          features: string[]
          id: string
          marketing_consent: boolean
          role: string | null
          source: string | null
        }
        Insert: {
          consent_at?: string | null
          created_at?: string
          email: string
          features: string[]
          id?: string
          marketing_consent?: boolean
          role?: string | null
          source?: string | null
        }
        Update: {
          consent_at?: string | null
          created_at?: string
          email?: string
          features?: string[]
          id?: string
          marketing_consent?: boolean
          role?: string | null
          source?: string | null
        }
        Relationships: []
      }
      wall_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wall_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "wall_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      wall_comments: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          deleted_at: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          post_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          post_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wall_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      wall_content_reports: {
        Row: {
          club_id: string
          comment_id: string | null
          created_at: string
          details: string | null
          id: string
          post_id: string
          reason: Database["public"]["Enums"]["wall_report_reason"]
          reporter_user_id: string
          resolution_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["wall_report_status"]
          updated_at: string
        }
        Insert: {
          club_id: string
          comment_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          post_id: string
          reason: Database["public"]["Enums"]["wall_report_reason"]
          reporter_user_id: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["wall_report_status"]
          updated_at?: string
        }
        Update: {
          club_id?: string
          comment_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string
          reason?: Database["public"]["Enums"]["wall_report_reason"]
          reporter_user_id?: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["wall_report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wall_content_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "wall_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wall_content_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      wall_post_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wall_post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      wall_post_reads: {
        Row: {
          id: string
          post_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          post_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          post_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wall_posts: {
        Row: {
          attachments: Json
          audience_group_ids: string[] | null
          audience_team_ids: string[] | null
          audience_type: string
          author_user_id: string | null
          body: string
          club_id: string
          created_at: string
          deleted_at: string | null
          external_id: string | null
          external_media_url: string | null
          external_url: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          is_pinned: boolean
          send_email: boolean
          source: string
        }
        Insert: {
          attachments?: Json
          audience_group_ids?: string[] | null
          audience_team_ids?: string[] | null
          audience_type?: string
          author_user_id?: string | null
          body: string
          club_id: string
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          external_media_url?: string | null
          external_url?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          is_pinned?: boolean
          send_email?: boolean
          source?: string
        }
        Update: {
          attachments?: Json
          audience_group_ids?: string[] | null
          audience_team_ids?: string[] | null
          audience_type?: string
          author_user_id?: string | null
          body?: string
          club_id?: string
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          external_media_url?: string | null
          external_url?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          is_pinned?: boolean
          send_email?: boolean
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      player_season_stats: {
        Row: {
          assists_count: number | null
          attendance_rate: number | null
          club_id: string | null
          goals_count: number | null
          matches_count: number | null
          player_id: string | null
          season_label: string | null
          team_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "convocations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      v_build_clubero_funnel: {
        Row: {
          beta_leads: number | null
          duree_min_moyenne: number | null
          newsletter_leads: number | null
          sessions: number | null
          terminees: number | null
        }
        Relationships: []
      }
      v_build_clubero_leads: {
        Row: {
          beta_consent_at: string | null
          beta_opt_in: boolean | null
          club: string | null
          completed_at: string | null
          email: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          newsletter_consent_at: string | null
          newsletter_opt_in: boolean | null
          phone: string | null
        }
        Insert: {
          beta_consent_at?: string | null
          beta_opt_in?: boolean | null
          club?: string | null
          completed_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          newsletter_consent_at?: string | null
          newsletter_opt_in?: boolean | null
          phone?: string | null
        }
        Update: {
          beta_consent_at?: string | null
          beta_opt_in?: boolean | null
          club?: string | null
          completed_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          newsletter_consent_at?: string | null
          newsletter_opt_in?: boolean | null
          phone?: string | null
        }
        Relationships: []
      }
      v_build_clubero_numeric: {
        Row: {
          max: number | null
          mediane: number | null
          min: number | null
          moyenne: number | null
          n: number | null
          question_key: string | null
          question_type: string | null
        }
        Relationships: []
      }
      v_build_clubero_options: {
        Row: {
          n: number | null
          option_key: string | null
          question_key: string | null
          question_type: string | null
        }
        Relationships: []
      }
      v_build_clubero_ranking: {
        Row: {
          avg_position: number | null
          option_key: string | null
          question_key: string | null
          votes: number | null
        }
        Relationships: []
      }
      v_build_clubero_verbatims: {
        Row: {
          answer_text: string | null
          club: string | null
          created_at: string | null
          question_key: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _resolve_audience_subjects: {
        Args: {
          _audiences: Json
          _club_id: string
          _manual_member_ids: string[]
        }
        Returns: {
          member_id: string
          subject_kind: string
          subject_user_id: string
        }[]
      }
      accept_tournament_invite: { Args: { _token: string }; Returns: Json }
      accept_tournament_member_invite: {
        Args: { _token: string; _user_id: string }
        Returns: string
      }
      admin_build_clubero_dashboard: { Args: never; Returns: Json }
      admin_build_clubero_responses: { Args: never; Returns: Json }
      apply_to_event_need_atomic: {
        Args: { _comment?: string; _need_id: string; _user_id: string }
        Returns: {
          auto_confirmed: boolean
          is_minor: boolean
          signup_id: string
          status: string
        }[]
      }
      archive_team: { Args: { _id: string }; Returns: undefined }
      call_up_list_visible: { Args: { p_event_id: string }; Returns: boolean }
      can_access_event: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_event_chat: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      can_apply_to_event_need: {
        Args: { _need_id: string; _user_id: string }
        Returns: boolean
      }
      can_author_player_feedback: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      can_create_tournament: { Args: { _user_id: string }; Returns: boolean }
      can_edit_player_journey: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_club_camp: {
        Args: { _camp_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_tournament: {
        Args: { _tournament_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_tournament_members: {
        Args: { _tournament_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_challenge: {
        Args: { _challenge_id: string; _user_id: string }
        Returns: boolean
      }
      can_respond_for_player: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      can_validate_match: {
        Args: { _match_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_player_feedback: {
        Args: { _feedback_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_player_journey: {
        Args: { _player_id: string; _user_id: string; _visibility: string }
        Returns: boolean
      }
      can_view_player_media: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_player_review: {
        Args: { _review_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_tournament: {
        Args: { _tournament_id: string; _user_id: string }
        Returns: boolean
      }
      cast_poll_vote: {
        Args: {
          _option_id: string
          _publication_id: string
          _subject_id: string
          _subject_kind: string
        }
        Returns: string
      }
      close_publication: {
        Args: { _publication_id: string }
        Returns: undefined
      }
      club_camp_is_published: { Args: { _camp_id: string }; Returns: boolean }
      club_has_active_subscription: {
        Args: { _club_id: string }
        Returns: boolean
      }
      coach_player_payment_status: {
        Args: { _club_id: string }
        Returns: {
          is_paid: boolean
          item_title: string
          payment_item_id: string
          player_id: string
        }[]
      }
      complete_build_clubero_response: {
        Args: { p_contact?: Json; p_session_id: string }
        Returns: undefined
      }
      compute_season_label: { Args: { _dt: string }; Returns: string }
      consume_single_entitlement: {
        Args: { _tournament_id: string; _user_id: string }
        Returns: boolean
      }
      convert_personal_club_to_real: {
        Args: { _club_id: string; _new_name?: string }
        Returns: string
      }
      create_player_review: {
        Args: {
          _content: string
          _kind: string
          _model: string
          _period_end: string
          _period_start: string
          _player_id: string
          _visibility: Database["public"]["Enums"]["feedback_visibility"]
        }
        Returns: {
          author_user_id: string
          content: string
          created_at: string
          id: string
          kind: string
          model: string
          period_end: string
          period_start: string
          visibility: Database["public"]["Enums"]["feedback_visibility"]
        }[]
      }
      create_publication_atomic: {
        Args: {
          _audiences: Json
          _closes_at: string
          _club_id: string
          _content: string
          _document_ids: Json
          _email_body: string
          _event_id: string
          _manual_member_ids: Json
          _media_paths: Json
          _poll_options: Json
          _poll_visibility: Database["public"]["Enums"]["poll_visibility"]
          _publication_type: Database["public"]["Enums"]["publication_type"]
          _publish_to_wall: boolean
          _send_email: boolean
          _title: string
        }
        Returns: {
          dispatch_row_id: string
          new_recipient_count: number
          publication_id: string
          recipients_count: number
        }[]
      }
      create_support_view_session: {
        Args: {
          _club_id: string
          _duration_minutes?: number
          _persona: Database["public"]["Enums"]["support_view_persona"]
          _reason: string
          _target_user_id: string
        }
        Returns: {
          club_id: string
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          persona: Database["public"]["Enums"]["support_view_persona"]
          reason: string
          started_at: string
          superadmin_id: string
          target_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "support_view_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_has_tournament_collab: { Args: never; Returns: boolean }
      decide_signup_atomic: {
        Args: { _actor: string; _decision: string; _signup_id: string }
        Returns: {
          applicant_user_id: string
          event_id: string
          need_id: string
          new_status: string
          signup_id: string
        }[]
      }
      declare_unavailable_atomic: {
        Args: { _need_id: string; _user_id: string }
        Returns: {
          signup_id: string
          status: string
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_event_need_draft: {
        Args: { _actor: string; _need_id: string }
        Returns: undefined
      }
      delete_player_smart: { Args: { _id: string }; Returns: string }
      delete_team_if_empty: { Args: { _id: string }; Returns: undefined }
      email_exists: { Args: { _email: string }; Returns: boolean }
      email_queue_dispatch: { Args: never; Returns: undefined }
      end_support_view_session: {
        Args: { _session_id: string }
        Returns: undefined
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_team_for_registration: {
        Args: { _registration_id: string }
        Returns: string
      }
      gen_coach_public_slug: {
        Args: { _first_name: string; _last_name: string }
        Returns: string
      }
      gen_player_public_slug:
        | { Args: never; Returns: string }
        | {
            Args: {
              _birth_date?: string
              _first_name?: string
              _last_name?: string
            }
            Returns: string
          }
      get_active_sponsors_for_home: {
        Args: { _club_id: string }
        Returns: {
          id: string
          logo_scale: number
          logo_url: string
          name: string
          target_url: string
        }[]
      }
      get_active_support_view_session: {
        Args: { _session_id: string }
        Returns: {
          club_id: string
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          persona: Database["public"]["Enums"]["support_view_persona"]
          reason: string
          started_at: string
          superadmin_id: string
          target_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "support_view_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_assignable_staff: {
        Args: { p_event_id: string }
        Returns: {
          full_name: string
          is_event_team_staff: boolean
          role: string
          user_id: string
          usual_team_name: string
        }[]
      }
      get_call_up_visibility_config: {
        Args: { _id: string; _scope: string }
        Returns: {
          club_default: boolean
          effective: boolean
          event_override: boolean
          source: string
          team_override: boolean
        }[]
      }
      get_camp_registration_by_token: {
        Args: { _token: string }
        Returns: Json
      }
      get_camp_registration_stats: { Args: { _camp_id: string }; Returns: Json }
      get_camps_due_for_document_purge: {
        Args: never
        Returns: {
          document_retention_months: number
          end_date: string
          id: string
        }[]
      }
      get_club_stripe_status: {
        Args: { _club_id: string }
        Returns: {
          stripe_account_id: string
          stripe_account_status: string
          stripe_charges_enabled: boolean
          stripe_payouts_enabled: boolean
        }[]
      }
      get_convocation_by_token: {
        Args: { _token: string }
        Returns: {
          club_name: string
          comment: string
          convocation_id: string
          event_id: string
          event_location: string
          event_opponent: string
          event_starts_at: string
          event_title: string
          event_type: string
          player_first_name: string
          player_last_name: string
          responded_at: string
          status: Database["public"]["Enums"]["attendance_status"]
          team_name: string
        }[]
      }
      get_eligible_vote_subjects: {
        Args: { _publication_id: string }
        Returns: {
          current_option_id: string
          current_option_ids: string[]
          label: string
          relation: string
          subject_id: string
          subject_kind: string
        }[]
      }
      get_meeting_response_by_token: {
        Args: { _token: string }
        Returns: {
          event_id: string
          location: string
          meeting_title: string
          responded_at: string
          starts_at: string
          status: Database["public"]["Enums"]["attendance_status"]
        }[]
      }
      get_member_invite_info: {
        Args: { _token: string }
        Returns: {
          email: string
          expired: boolean
          kind: string
          role: Database["public"]["Enums"]["app_role"]
          suggested_first_name: string
          suggested_last_name: string
          used: boolean
        }[]
      }
      get_or_create_internal_team: {
        Args: { _club_id: string }
        Returns: string
      }
      get_or_create_personal_club: {
        Args: { _user_id: string }
        Returns: string
      }
      get_platform_stats: { Args: never; Returns: Json }
      get_player_coparents: {
        Args: { _player_id: string }
        Returns: {
          full_name: string
          has_account: boolean
          id: string
        }[]
      }
      get_poll_non_voters: {
        Args: { _publication_id: string }
        Returns: {
          subject_kind: string
          subject_name: string
          subject_roles: string[]
          subject_teams: string[]
        }[]
      }
      get_poll_results: {
        Args: { _publication_id: string }
        Returns: {
          below_threshold: boolean
          is_anonymous: boolean
          is_closed: boolean
          label: string
          option_id: string
          sort_order: number
          total_voters: number
          vote_count: number
        }[]
      }
      get_poll_voters: {
        Args: { _publication_id: string }
        Returns: {
          option_id: string
          option_label: string
          sort_order: number
          subject_kind: string
          subject_name: string
          voted_at: string
          voter_name: string
          voter_roles: string[]
          voter_teams: string[]
        }[]
      }
      get_public_camp_by_slug: {
        Args: { _camp_slug: string; _club_slug: string }
        Returns: Json
      }
      get_public_coach_profile: { Args: { _slug: string }; Returns: Json }
      get_public_player_profile: { Args: { _slug: string }; Returns: Json }
      get_registration_by_roster_token: {
        Args: { _token: string }
        Returns: Json
      }
      get_staff_availabilities: {
        Args: {
          p_club_id?: string
          p_end?: string
          p_start?: string
          p_team_id?: string
          p_user_id?: string
        }
        Returns: {
          can_view_reason: boolean
          certainty: string
          club_id: string
          comment: string
          end_date: string
          id: string
          reason: string
          start_date: string
          status: string
          user_id: string
          visibility: string
        }[]
      }
      get_tournament_invite_by_token: {
        Args: { _token: string }
        Returns: Json
      }
      get_tournament_member_by_token: {
        Args: { _token: string }
        Returns: {
          email: string
          first_name: string
          id: string
          joined_at: string
          last_name: string
          role: string
          tournament_id: string
          tournament_name: string
          tournament_slug: string
        }[]
      }
      has_club_role: {
        Args: {
          _club_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_club_role_any: {
        Args: { _club_id: string; _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_club_role_text: {
        Args: { _club_id: string; _role: string; _user_id: string }
        Returns: boolean
      }
      has_convocation_in_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      has_super_admin: { Args: { _user_id: string }; Returns: boolean }
      increment_rate_limit: {
        Args: { _ip: string; _limit: number; _route: string; _window: string }
        Returns: boolean
      }
      is_assignable_staff: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_club_member: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_club_staff: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_match_referee: {
        Args: { _match_id: string; _user_id: string }
        Returns: boolean
      }
      is_parent_of_player: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      is_player_club_admin: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      is_player_team_coach: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      is_reserved_club_slug: { Args: { _slug: string }; Returns: boolean }
      is_team_coach: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_staff: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_staff_of_event: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: boolean
      }
      is_tournament_co_organizer: {
        Args: { _tournament_id: string; _user_id: string }
        Returns: boolean
      }
      is_tournament_member: {
        Args: { _role?: string; _tournament_id: string; _user_id: string }
        Returns: boolean
      }
      is_tournament_owner: {
        Args: { _tournament_id: string; _user_id: string }
        Returns: boolean
      }
      is_tournament_referee: {
        Args: { _tournament_id: string; _user_id: string }
        Returns: boolean
      }
      is_tournament_referee_for_match: {
        Args: { _match_id: string; _user_id: string }
        Returns: boolean
      }
      is_v2: { Args: { _key: string }; Returns: boolean }
      is_wall_moderator: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      jsonb_diff: { Args: { _new: Json; _old: Json }; Returns: Json }
      link_parent_memberships: { Args: never; Returns: number }
      list_public_players: {
        Args: {
          _club_id?: string
          _limit?: number
          _offset?: number
          _region?: string
          _search?: string
          _sport?: string
        }
        Returns: Json
      }
      log_superadmin_action: {
        Args: {
          _action: string
          _club_id?: string
          _ip?: string
          _metadata?: Json
          _target_id?: string
          _target_type?: string
          _user_agent?: string
        }
        Returns: string
      }
      log_support_view_action: {
        Args: {
          _action: string
          _metadata?: Json
          _session_id: string
          _target_id?: string
          _target_kind?: string
        }
        Returns: undefined
      }
      mark_expired_availabilities_completed: { Args: never; Returns: number }
      mark_expired_staff_availabilities_completed: {
        Args: never
        Returns: number
      }
      mark_support_ticket_read: {
        Args: { _ticket_id: string }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      next_receipt_number: { Args: { _club_id: string }; Returns: number }
      normalize_name: { Args: { t: string }; Returns: string }
      player_belongs_to_user: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      player_is_minor: { Args: { _player_id: string }; Returns: boolean }
      preview_group_rule_details: {
        Args: { _club_id: string; _rule: Json }
        Returns: {
          email: string
          full_name: string
          kind: string
          roles: string[]
          subtitle: string
          user_id: string
        }[]
      }
      preview_publication_audience: {
        Args: {
          _audiences: Json
          _club_id: string
          _event_id: string
          _manual_member_ids: string[]
        }
        Returns: {
          count: number
          player_count: number
          user_count: number
        }[]
      }
      privacy_anonymize_user: { Args: { _user_id: string }; Returns: undefined }
      publish_event_need_atomic: {
        Args: { _actor: string; _audiences: Json; _need_id: string }
        Returns: {
          publication_id: string
          recipient_user_ids: string[]
          recipients_count: number
          status: string
          was_idempotent_skip: boolean
        }[]
      }
      publish_publication_atomic: {
        Args: {
          _dispatch_id?: string
          _kind: Database["public"]["Enums"]["publication_dispatch_kind"]
          _publication_id: string
        }
        Returns: {
          dispatch_row_id: string
          new_recipient_count: number
          recipients_count: number
        }[]
      }
      purge_soft_deleted: { Args: never; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_event_need_coverage: {
        Args: { _event_id: string }
        Returns: {
          did_transition: boolean
          is_fully_covered: boolean
          missing_seats: number
          open_needs_count: number
        }[]
      }
      record_sponsor_click: {
        Args: { p_sponsor_id: string }
        Returns: undefined
      }
      record_sponsor_impression: {
        Args: { p_sponsor_id: string }
        Returns: undefined
      }
      redeem_club_invite: { Args: { _token: string }; Returns: string }
      redeem_member_invite: { Args: { _token: string }; Returns: string }
      resolve_audience_members: {
        Args: { _club_id: string; _spec: Json }
        Returns: {
          user_id: string
        }[]
      }
      resolve_camp_registration_document: {
        Args: { _document_id: string; _token: string }
        Returns: string
      }
      resolve_camp_registration_for_upload: {
        Args: { _required_document_id: string; _token: string }
        Returns: Json
      }
      resolve_publication_audience: {
        Args: { _publication_id: string }
        Returns: {
          member_id: string
          subject_kind: string
          subject_user_id: string
        }[]
      }
      respond_meeting_via_token: {
        Args: {
          _status: Database["public"]["Enums"]["attendance_status"]
          _token: string
        }
        Returns: boolean
      }
      respond_via_token: {
        Args: {
          _comment?: string
          _status: Database["public"]["Enums"]["attendance_status"]
          _token: string
        }
        Returns: string
      }
      restore_entity: {
        Args: { _id: string; _kind: string }
        Returns: undefined
      }
      save_build_clubero_answer: {
        Args: {
          p_question_key: string
          p_question_type: string
          p_session_id: string
          p_value: Json
        }
        Returns: undefined
      }
      save_player_feedback: {
        Args: {
          _comment: string
          _dev_notes: string
          _event_id: string
          _id: string
          _improvements: string
          _player_id: string
          _rating: number
          _shared_summary: string
          _strengths: string
          _tags: string[]
          _visibility: Database["public"]["Enums"]["feedback_visibility"]
        }
        Returns: {
          id: string
        }[]
      }
      save_roster_via_token: {
        Args: { _players: Json; _token: string }
        Returns: Json
      }
      set_call_up_visibility: {
        Args: { _choice: string; _id: string; _scope: string }
        Returns: undefined
      }
      set_meeting_attendees_atomic: {
        Args: {
          _actor: string
          _audiences?: Json
          _event_id: string
          _manual_user_ids?: string[]
        }
        Returns: {
          attendees_count: number
          inserted_count: number
          inserted_user_ids: string[]
        }[]
      }
      set_player_public_profile: {
        Args: { _enabled: boolean; _player_id: string }
        Returns: Json
      }
      set_poll_allow_multiple: {
        Args: { _allow: boolean; _publication_id: string }
        Returns: undefined
      }
      set_team_logo_via_token: {
        Args: { _logo_url: string; _token: string }
        Returns: Json
      }
      set_tournament_team_payment: {
        Args: {
          _amount_cents?: number
          _currency?: string
          _method?: string
          _note?: string
          _status: string
          _team_id: string
        }
        Returns: {
          amount_paid_cents: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          group_id: string | null
          id: string
          logo_url: string | null
          marked_paid_by: string | null
          name: string
          notes: string | null
          paid_at: string | null
          payment_currency: string | null
          payment_method: string | null
          payment_note: string | null
          payment_status: string
          seed: number | null
          short_name: string | null
          team_id: string | null
          tournament_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tournament_teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      slugify: { Args: { _input: string }; Returns: string }
      soft_delete_entity: {
        Args: { _id: string; _kind: string }
        Returns: undefined
      }
      soft_delete_publication: {
        Args: { _publication_id: string }
        Returns: undefined
      }
      staff_owns_need_signup: {
        Args: { _need_id: string; _user_id: string }
        Returns: boolean
      }
      start_build_clubero_response: {
        Args: {
          p_device?: string
          p_locale?: string
          p_session_id: string
          p_utm?: Json
        }
        Returns: string
      }
      superadmin_club_activity_summary: {
        Args: never
        Returns: {
          club_id: string
          count_30d: number
          count_7d: number
          last_action_type: string
          last_activity_at: string
        }[]
      }
      superadmin_club_roster: {
        Args: { _club_id: string }
        Returns: {
          parents: Json
          player_birth_date: string
          player_child_platform_access: boolean
          player_email: string
          player_first_name: string
          player_id: string
          player_last_invite_at: string
          player_last_name: string
          player_last_sign_in_at: string
          player_phone: string
          player_user_id: string
          team_age_group: string
          team_id: string
          team_name: string
        }[]
      }
      superadmin_invite_batch_rows: {
        Args: { _batch_id: string }
        Returns: {
          attempt_count: number
          created_at: string
          dispatch_id: string
          error_message: string
          id: string
          message_id: string
          metadata: Json
          recipient_email: string
          status: string
          template_name: string
        }[]
      }
      superadmin_invite_batches: {
        Args: {
          _club_id?: string
          _from?: string
          _limit?: number
          _template?: string
          _to?: string
        }
        Returns: {
          batch_id: string
          bucket_start: string
          club_id: string
          club_name: string
          failed: number
          pending: number
          sent: number
          suppressed: number
          template_name: string
          total: number
        }[]
      }
      superadmin_notifications_emails: {
        Args: {
          _from?: string
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
          _template?: string
          _to?: string
        }
        Returns: {
          attempt_count: number
          created_at: string
          error_message: string
          id: string
          message_id: string
          metadata: Json
          recipient_email: string
          status: string
          template_name: string
        }[]
      }
      superadmin_notifications_push: {
        Args: {
          _from?: string
          _kind?: string
          _limit?: number
          _offset?: number
          _to?: string
        }
        Returns: {
          dispatched_at: string
          first_opened_at: string
          id: string
          kind: string
          opened_count: number
          ref_id: string
          sent_count: number
          targets_count: number
        }[]
      }
      superadmin_player_audit: {
        Args: { _limit?: number; _player_id: string }
        Returns: {
          action: string
          actor_name: string
          actor_user_id: string
          details: Json
          occurred_at: string
          source: string
        }[]
      }
      superadmin_product_activity: {
        Args: {
          _actor?: string
          _category?: string
          _club_id?: string
          _cursor_id?: string
          _cursor_ts?: string
          _from?: string
          _limit?: number
          _status?: string
          _to?: string
        }
        Returns: {
          action_type: string
          actor_full_name: string
          actor_role: string
          actor_user_id: string
          category: string
          club_id: string
          club_name: string
          created_at: string
          error_code: string
          id: string
          metadata: Json
          resource_id: string
          resource_type: string
          status: string
        }[]
      }
      superadmin_watchlist_failed_imports: {
        Args: never
        Returns: {
          club_id: string
          club_name: string
          created_at: string
          error_log: Json
          file_name: string
          id: string
          import_type: string
          imported_by: string
          importer_full_name: string
          rows_imported: number
          rows_total: number
          status: string
        }[]
      }
      superadmin_watchlist_social_failures: {
        Args: never
        Returns: {
          account_name: string
          club_id: string
          club_name: string
          connection_id: string
          is_active: boolean
          last_sync_error: string
          last_synced_at: string
          network: string
        }[]
      }
      superadmin_watchlist_stalled_onboarding: {
        Args: { p_limit_per_signal?: number }
        Returns: {
          club_id: string
          detail: Json
          resource_id: string
          resource_type: string
          signal: string
          since: string
        }[]
      }
      sync_meeting_attendees_atomic: {
        Args: {
          _actor: string
          _audiences?: Json
          _confirm_remove?: string[]
          _dry_run?: boolean
          _event_id: string
          _manual_user_ids?: string[]
        }
        Returns: {
          added_user_ids: string[]
          kept_count: number
          removed_user_ids: string[]
          requires_confirmation_user_ids: string[]
        }[]
      }
      team_has_history: { Args: { _id: string }; Returns: boolean }
      unaccent_compat: { Args: { t: string }; Returns: string }
      unarchive_team: { Args: { _id: string }; Returns: undefined }
      update_event_need_atomic: {
        Args: {
          _actor: string
          _capacity: number
          _description: string
          _has_description: boolean
          _label: string
          _need_id: string
          _validation_mode: string
        }
        Returns: {
          capacity: number
          capacity_changed: boolean
          club_id: string
          description: string
          event_id: string
          id: string
          label: string
          role_key: string
          status: string
          validation_mode: string
        }[]
      }
      update_player_review_content: {
        Args: { _content: string; _id: string; _model: string }
        Returns: {
          author_user_id: string
          content: string
          created_at: string
          id: string
          kind: string
          model: string
          period_end: string
          period_start: string
          visibility: Database["public"]["Enums"]["feedback_visibility"]
        }[]
      }
      user_can_email_recipient: {
        Args: { _email: string; _user_id: string }
        Returns: boolean
      }
      user_can_manage_camp_storage: {
        Args: { _name: string; _user: string }
        Returns: boolean
      }
      user_has_signup_on_need: {
        Args: { _need_id: string; _user_id: string }
        Returns: boolean
      }
      user_in_wall_audience: {
        Args: { _audience_team_ids: string[]; _club_id: string; _user: string }
        Returns: boolean
      }
      user_in_wall_post_audience: {
        Args: { _post_id: string; _user: string }
        Returns: boolean
      }
      user_is_in_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      user_is_need_recipient: {
        Args: { _need_id: string; _user_id: string }
        Returns: boolean
      }
      users_share_club: { Args: { _a: string; _b: string }; Returns: boolean }
      viewer_is_publication_recipient: {
        Args: { _publication_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "coach"
        | "parent"
        | "player"
        | "dirigeant"
        | "financial_admin"
      attendance_status: "present" | "absent" | "uncertain" | "pending"
      challenge_aggregate: "cumulative" | "record"
      challenge_direction: "higher_better" | "lower_better"
      challenge_kind: "challenge" | "physical_test"
      challenge_recurrence: "season" | "half_season" | "punctual"
      challenge_unit:
        | "count"
        | "time_seconds"
        | "distance_meters"
        | "stage"
        | "score"
      challenge_visibility: "staff" | "category"
      consent_kind:
        | "terms"
        | "privacy"
        | "data_processing"
        | "media"
        | "notifications"
        | "legal_notice"
        | "parental_consent"
      event_status: "draft" | "published" | "cancelled"
      event_type: "training" | "match" | "tournament" | "meeting" | "other"
      feedback_visibility:
        | "coach_only"
        | "staff"
        | "share_summary"
        | "parent_summary"
        | "player_summary"
      fundraising_status: "draft" | "active" | "closed" | "archived"
      lineup_visibility: "draft" | "staff" | "selected_players" | "team"
      media_consent_status: "pending" | "granted" | "denied"
      payment_item_status: "draft" | "open" | "closed" | "cancelled"
      payment_item_type:
        | "membership"
        | "license"
        | "equipment"
        | "trip"
        | "tournament"
        | "fundraising"
        | "other"
      payment_obligation_status:
        | "pending"
        | "partially_paid"
        | "paid"
        | "cancelled"
        | "exempted"
        | "refunded"
      payment_provider:
        | "stripe"
        | "helloasso"
        | "cash"
        | "cheque"
        | "bank_transfer"
        | "manual"
      payment_target_kind: "player" | "team" | "club"
      payment_tx_status: "pending" | "succeeded" | "failed" | "refunded"
      poll_visibility: "staff_visible" | "anonymous"
      poll_vote_action: "vote" | "change" | "retrait"
      privacy_request_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      publication_audience_type:
        | "joueurs_convoques"
        | "parents_convoques"
        | "joueurs_equipe"
        | "parents_equipe"
        | "joueurs_categorie"
        | "parents_categorie"
        | "educateurs"
        | "dirigeants"
        | "groupe_personnalise"
        | "selection_manuelle"
        | "staff_equipe"
      publication_dispatch_kind:
        | "publish"
        | "audience_refresh"
        | "manual_resend"
      publication_type: "message" | "poll"
      receipt_kind: "official" | "confirmation"
      reminder_channel: "in_app" | "email" | "push"
      subscription_plan: "monthly" | "yearly"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
        | "paused"
      support_ticket_category:
        | "bug"
        | "payment"
        | "account"
        | "team"
        | "event"
        | "feature_request"
        | "other"
      support_ticket_priority: "low" | "normal" | "high" | "urgent"
      support_ticket_status:
        | "open"
        | "in_progress"
        | "waiting_user"
        | "resolved"
        | "closed"
      support_view_persona:
        | "club_admin"
        | "coach"
        | "player"
        | "parent"
        | "member"
      tournament_collaborator_role: "co_organizer" | "referee"
      tournament_event_kind:
        | "goal"
        | "own_goal"
        | "assist"
        | "yellow_card"
        | "red_card"
        | "second_yellow"
        | "penalty"
        | "foul"
      tournament_format:
        | "group"
        | "knockout"
        | "mixed"
        | "double_elimination"
        | "swiss"
        | "round_robin_home_away"
        | "flighted_finals"
        | "consolation"
      tournament_match_round:
        | "group"
        | "r32"
        | "r16"
        | "qf"
        | "sf"
        | "final"
        | "third_place"
      tournament_match_status:
        | "scheduled"
        | "live"
        | "completed"
        | "cancelled"
        | "forfeit_a"
        | "forfeit_b"
        | "no_show_a"
        | "no_show_b"
        | "abandoned"
      tournament_pass_status: "pending" | "paid" | "used" | "refunded"
      tournament_registration_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
      tournament_status:
        | "draft"
        | "published"
        | "in_progress"
        | "completed"
        | "cancelled"
      wall_report_reason:
        | "inappropriate"
        | "harassment"
        | "spam"
        | "misinformation"
        | "privacy"
        | "other"
      wall_report_status: "pending" | "reviewing" | "dismissed" | "actioned"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "coach",
        "parent",
        "player",
        "dirigeant",
        "financial_admin",
      ],
      attendance_status: ["present", "absent", "uncertain", "pending"],
      challenge_aggregate: ["cumulative", "record"],
      challenge_direction: ["higher_better", "lower_better"],
      challenge_kind: ["challenge", "physical_test"],
      challenge_recurrence: ["season", "half_season", "punctual"],
      challenge_unit: [
        "count",
        "time_seconds",
        "distance_meters",
        "stage",
        "score",
      ],
      challenge_visibility: ["staff", "category"],
      consent_kind: [
        "terms",
        "privacy",
        "data_processing",
        "media",
        "notifications",
        "legal_notice",
        "parental_consent",
      ],
      event_status: ["draft", "published", "cancelled"],
      event_type: ["training", "match", "tournament", "meeting", "other"],
      feedback_visibility: [
        "coach_only",
        "staff",
        "share_summary",
        "parent_summary",
        "player_summary",
      ],
      fundraising_status: ["draft", "active", "closed", "archived"],
      lineup_visibility: ["draft", "staff", "selected_players", "team"],
      media_consent_status: ["pending", "granted", "denied"],
      payment_item_status: ["draft", "open", "closed", "cancelled"],
      payment_item_type: [
        "membership",
        "license",
        "equipment",
        "trip",
        "tournament",
        "fundraising",
        "other",
      ],
      payment_obligation_status: [
        "pending",
        "partially_paid",
        "paid",
        "cancelled",
        "exempted",
        "refunded",
      ],
      payment_provider: [
        "stripe",
        "helloasso",
        "cash",
        "cheque",
        "bank_transfer",
        "manual",
      ],
      payment_target_kind: ["player", "team", "club"],
      payment_tx_status: ["pending", "succeeded", "failed", "refunded"],
      poll_visibility: ["staff_visible", "anonymous"],
      poll_vote_action: ["vote", "change", "retrait"],
      privacy_request_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      publication_audience_type: [
        "joueurs_convoques",
        "parents_convoques",
        "joueurs_equipe",
        "parents_equipe",
        "joueurs_categorie",
        "parents_categorie",
        "educateurs",
        "dirigeants",
        "groupe_personnalise",
        "selection_manuelle",
        "staff_equipe",
      ],
      publication_dispatch_kind: [
        "publish",
        "audience_refresh",
        "manual_resend",
      ],
      publication_type: ["message", "poll"],
      receipt_kind: ["official", "confirmation"],
      reminder_channel: ["in_app", "email", "push"],
      subscription_plan: ["monthly", "yearly"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "unpaid",
        "paused",
      ],
      support_ticket_category: [
        "bug",
        "payment",
        "account",
        "team",
        "event",
        "feature_request",
        "other",
      ],
      support_ticket_priority: ["low", "normal", "high", "urgent"],
      support_ticket_status: [
        "open",
        "in_progress",
        "waiting_user",
        "resolved",
        "closed",
      ],
      support_view_persona: [
        "club_admin",
        "coach",
        "player",
        "parent",
        "member",
      ],
      tournament_collaborator_role: ["co_organizer", "referee"],
      tournament_event_kind: [
        "goal",
        "own_goal",
        "assist",
        "yellow_card",
        "red_card",
        "second_yellow",
        "penalty",
        "foul",
      ],
      tournament_format: [
        "group",
        "knockout",
        "mixed",
        "double_elimination",
        "swiss",
        "round_robin_home_away",
        "flighted_finals",
        "consolation",
      ],
      tournament_match_round: [
        "group",
        "r32",
        "r16",
        "qf",
        "sf",
        "final",
        "third_place",
      ],
      tournament_match_status: [
        "scheduled",
        "live",
        "completed",
        "cancelled",
        "forfeit_a",
        "forfeit_b",
        "no_show_a",
        "no_show_b",
        "abandoned",
      ],
      tournament_pass_status: ["pending", "paid", "used", "refunded"],
      tournament_registration_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
      ],
      tournament_status: [
        "draft",
        "published",
        "in_progress",
        "completed",
        "cancelled",
      ],
      wall_report_reason: [
        "inappropriate",
        "harassment",
        "spam",
        "misinformation",
        "privacy",
        "other",
      ],
      wall_report_status: ["pending", "reviewing", "dismissed", "actioned"],
    },
  },
} as const
