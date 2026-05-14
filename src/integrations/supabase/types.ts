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
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          changes: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
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
          created_at: string
          created_by: string
          id: string
          logo_url: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          logo_url?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          logo_url?: string | null
          name?: string
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
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          comment?: string | null
          created_at?: string
          event_id: string
          id?: string
          player_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          comment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          player_id?: string
          responded_at?: string | null
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
      events: {
        Row: {
          competition_name: string | null
          competition_type: string | null
          convocation_time: string | null
          convocations_sent: boolean
          created_at: string
          created_by: string
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
          competition_name?: string | null
          competition_type?: string | null
          convocation_time?: string | null
          convocations_sent?: boolean
          created_at?: string
          created_by: string
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
          competition_name?: string | null
          competition_type?: string | null
          convocation_time?: string | null
          convocations_sent?: boolean
          created_at?: string
          created_by?: string
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
          club_id: string
          created_at: string
          email: string | null
          first_name: string
          id: string
          jersey_number: number | null
          last_name: string
          phone: string | null
          photo_url: string | null
          position: string | null
          preferred_position: string | null
          user_id: string | null
        }
        Insert: {
          birth_date?: string | null
          can_respond?: boolean
          club_id: string
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          jersey_number?: number | null
          last_name: string
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          preferred_position?: string | null
          user_id?: string | null
        }
        Update: {
          birth_date?: string | null
          can_respond?: boolean
          club_id?: string
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          jersey_number?: number | null
          last_name?: string
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
          phone: string | null
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
          phone?: string | null
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
          phone?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_respond_for_player: {
        Args: { _player_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      has_club_role: {
        Args: {
          _club_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_club_member: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_coach: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "coach" | "parent" | "player"
      attendance_status: "present" | "absent" | "uncertain" | "pending"
      event_status: "draft" | "published" | "cancelled"
      event_type: "training" | "match" | "tournament" | "meeting" | "other"
      reminder_channel: "in_app" | "email" | "push"
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
      app_role: ["admin", "coach", "parent", "player"],
      attendance_status: ["present", "absent", "uncertain", "pending"],
      event_status: ["draft", "published", "cancelled"],
      event_type: ["training", "match", "tournament", "meeting", "other"],
      reminder_channel: ["in_app", "email", "push"],
    },
  },
} as const
