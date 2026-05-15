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
      account_deletion_requests: {
        Row: {
          id: string
          processed_at: string | null
          reason: string | null
          requested_at: string
          scheduled_for: string
          status: Database["public"]["Enums"]["privacy_request_status"]
          user_id: string
        }
        Insert: {
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["privacy_request_status"]
          user_id: string
        }
        Update: {
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["privacy_request_status"]
          user_id?: string
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
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
      clubs: {
        Row: {
          convocation_channels: Json
          created_at: string
          created_by: string
          default_channels: Json
          event_chat_enabled: boolean
          event_chat_parents_enabled: boolean
          event_chat_players_enabled: boolean
          id: string
          logo_url: string | null
          name: string
          wall_comments_enabled: boolean
        }
        Insert: {
          convocation_channels?: Json
          created_at?: string
          created_by: string
          default_channels?: Json
          event_chat_enabled?: boolean
          event_chat_parents_enabled?: boolean
          event_chat_players_enabled?: boolean
          id?: string
          logo_url?: string | null
          name: string
          wall_comments_enabled?: boolean
        }
        Update: {
          convocation_channels?: Json
          created_at?: string
          created_by?: string
          default_channels?: Json
          event_chat_enabled?: boolean
          event_chat_parents_enabled?: boolean
          event_chat_players_enabled?: boolean
          id?: string
          logo_url?: string | null
          name?: string
          wall_comments_enabled?: boolean
        }
        Relationships: []
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
          file_url: string | null
          id: string
          requested_at: string
          status: Database["public"]["Enums"]["privacy_request_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          file_url?: string | null
          id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["privacy_request_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          file_url?: string | null
          id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["privacy_request_status"]
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
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
      events: {
        Row: {
          attachments: Json
          competition_name: string | null
          competition_type: string | null
          convocation_time: string | null
          convocations_sent: boolean
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          is_home: boolean | null
          location: string | null
          location_url: string | null
          meeting_point: string | null
          opponent: string | null
          responses_locked: boolean
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          team_id: string
          title: string
          type: Database["public"]["Enums"]["event_type"]
        }
        Insert: {
          attachments?: Json
          competition_name?: string | null
          competition_type?: string | null
          convocation_time?: string | null
          convocations_sent?: boolean
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_home?: boolean | null
          location?: string | null
          location_url?: string | null
          meeting_point?: string | null
          opponent?: string | null
          responses_locked?: boolean
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          team_id: string
          title: string
          type?: Database["public"]["Enums"]["event_type"]
        }
        Update: {
          attachments?: Json
          competition_name?: string | null
          competition_type?: string | null
          convocation_time?: string | null
          convocations_sent?: boolean
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_home?: boolean | null
          location?: string | null
          location_url?: string | null
          meeting_point?: string | null
          opponent?: string | null
          responses_locked?: boolean
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          team_id?: string
          title?: string
          type?: Database["public"]["Enums"]["event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
      member_invites: {
        Row: {
          club_id: string
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
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
          expires_at?: string
          id?: string
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
          expires_at?: string
          id?: string
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
      players: {
        Row: {
          birth_date: string | null
          can_respond: boolean
          child_platform_access: boolean
          club_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          jersey_number: number | null
          last_name: string
          media_consent_status: Database["public"]["Enums"]["media_consent_status"]
          phone: string | null
          photo_url: string | null
          position: string | null
          preferred_position: string | null
          user_id: string | null
        }
        Insert: {
          birth_date?: string | null
          can_respond?: boolean
          child_platform_access?: boolean
          club_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          jersey_number?: number | null
          last_name: string
          media_consent_status?: Database["public"]["Enums"]["media_consent_status"]
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          preferred_position?: string | null
          user_id?: string | null
        }
        Update: {
          birth_date?: string | null
          can_respond?: boolean
          child_platform_access?: boolean
          club_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          jersey_number?: number | null
          last_name?: string
          media_consent_status?: Database["public"]["Enums"]["media_consent_status"]
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          preferred_position?: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          notifications_email: boolean
          notifications_push: boolean
          phone: string | null
          phone_verified_at: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          notifications_email?: boolean
          notifications_push?: boolean
          phone?: string | null
          phone_verified_at?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          notifications_email?: boolean
          notifications_push?: boolean
          phone?: string | null
          phone_verified_at?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          channel: Database["public"]["Enums"]["reminder_channel"]
          convocation_id: string
          id: string
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["reminder_channel"]
          convocation_id: string
          id?: string
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["reminder_channel"]
          convocation_id?: string
          id?: string
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
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          club_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: Database["public"]["Enums"]["subscription_plan"] | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          club_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"] | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          club_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"] | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
          championship: string | null
          club_id: string
          competitions: string[]
          created_at: string
          deleted_at: string | null
          id: string
          image_url: string | null
          name: string
          season: string | null
          sport: string | null
        }
        Insert: {
          age_group?: string | null
          championship?: string | null
          club_id: string
          competitions?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          season?: string | null
          sport?: string | null
        }
        Update: {
          age_group?: string | null
          championship?: string | null
          club_id?: string
          competitions?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          season?: string | null
          sport?: string | null
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
      wall_comments: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          post_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
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
          author_user_id: string
          body: string
          club_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_pinned: boolean
        }
        Insert: {
          attachments?: Json
          author_user_id: string
          body: string
          club_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_pinned?: boolean
        }
        Update: {
          attachments?: Json
          author_user_id?: string
          body?: string
          club_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_pinned?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_event_chat: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      can_respond_for_player: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_player_media: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_exists: { Args: { _email: string }; Returns: boolean }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
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
      get_member_invite_info: {
        Args: { _token: string }
        Returns: {
          email: string
          expired: boolean
          kind: string
          role: Database["public"]["Enums"]["app_role"]
          used: boolean
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
      has_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_club_member: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_parent_of_player: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_coach: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
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
      player_is_minor: { Args: { _player_id: string }; Returns: boolean }
      purge_soft_deleted: { Args: never; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      redeem_club_invite: { Args: { _token: string }; Returns: string }
      redeem_member_invite: { Args: { _token: string }; Returns: string }
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
      soft_delete_entity: {
        Args: { _id: string; _kind: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "coach" | "parent" | "player" | "dirigeant"
      attendance_status: "present" | "absent" | "uncertain" | "pending"
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
      media_consent_status: "pending" | "granted" | "denied"
      privacy_request_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
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
      app_role: ["admin", "coach", "parent", "player", "dirigeant"],
      attendance_status: ["present", "absent", "uncertain", "pending"],
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
      media_consent_status: ["pending", "granted", "denied"],
      privacy_request_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
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
    },
  },
} as const
