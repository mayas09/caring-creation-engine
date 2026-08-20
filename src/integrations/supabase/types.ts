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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: string
          lead_id: string | null
          metadata: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          kind: string
          lead_id?: string | null
          metadata?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: string
          lead_id?: string | null
          metadata?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          accent: string | null
          created_at: string
          duration_seconds: number | null
          evidence_codes: string[]
          id: string
          lead_id: string
          recording_enabled: boolean
          result: string | null
          script: string | null
          summary: Json | null
          transcript: string | null
          user_id: string
        }
        Insert: {
          accent?: string | null
          created_at?: string
          duration_seconds?: number | null
          evidence_codes?: string[]
          id?: string
          lead_id: string
          recording_enabled?: boolean
          result?: string | null
          script?: string | null
          summary?: Json | null
          transcript?: string | null
          user_id: string
        }
        Update: {
          accent?: string | null
          created_at?: string
          duration_seconds?: number | null
          evidence_codes?: string[]
          id?: string
          lead_id?: string
          recording_enabled?: boolean
          result?: string | null
          script?: string | null
          summary?: Json | null
          transcript?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channel: Database["public"]["Enums"]["outreach_channel"]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          steps: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["outreach_channel"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          steps?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["outreach_channel"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          steps?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          claims: Json
          content: string
          created_at: string
          id: string
          lead_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          claims?: Json
          content: string
          created_at?: string
          id?: string
          lead_id?: string | null
          role: string
          user_id: string
        }
        Update: {
          claims?: Json
          content?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_events: {
        Row: {
          created_at: string
          detail: string | null
          event: string
          id: string
          label: string
          lead_id: string | null
          message_id: string | null
          occurred_at: string
          payload: Json
          provider: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          label?: string
          lead_id?: string | null
          message_id?: string | null
          occurred_at?: string
          payload?: Json
          provider?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          label?: string
          lead_id?: string | null
          message_id?: string | null
          occurred_at?: string
          payload?: Json
          provider?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "outreach_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          industry: string
          location: string
          notes: string | null
          result_count: number
          sources: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          industry: string
          location: string
          notes?: string | null
          result_count?: number
          sources?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          industry?: string
          location?: string
          notes?: string | null
          result_count?: number
          sources?: string[]
          user_id?: string
        }
        Relationships: []
      }
      dnc_entries: {
        Row: {
          created_at: string
          id: string
          kind: string
          reason: string | null
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          reason?: string | null
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          reason?: string | null
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      evidence: {
        Row: {
          checked_at: string
          claim: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at: string
          evidence_code: string
          expires_at: string | null
          id: string
          lead_id: string | null
          method: string | null
          source: string | null
          type: Database["public"]["Enums"]["evidence_type"]
          user_id: string
        }
        Insert: {
          checked_at?: string
          claim: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          evidence_code: string
          expires_at?: string | null
          id?: string
          lead_id?: string | null
          method?: string | null
          source?: string | null
          type: Database["public"]["Enums"]["evidence_type"]
          user_id: string
        }
        Update: {
          checked_at?: string
          claim?: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          evidence_code?: string
          expires_at?: string | null
          id?: string
          lead_id?: string | null
          method?: string | null
          source?: string | null
          type?: Database["public"]["Enums"]["evidence_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      friction_points: {
        Row: {
          created_at: string
          evidence: string | null
          evidence_code: string | null
          id: string
          lead_id: string
          level: Database["public"]["Enums"]["friction_level"]
          point: string
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence?: string | null
          evidence_code?: string | null
          id?: string
          lead_id: string
          level?: Database["public"]["Enums"]["friction_level"]
          point: string
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          evidence?: string | null
          evidence_code?: string | null
          id?: string
          lead_id?: string
          level?: Database["public"]["Enums"]["friction_level"]
          point?: string
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friction_points_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          approval_status: string
          approved_at: string | null
          best_angle: string | null
          bump_count: number
          business_name: string
          city: string | null
          classification: Database["public"]["Enums"]["lead_classification"]
          contact_name: string | null
          country: string | null
          created_at: string
          discovery_search_id: string | null
          disqualify_reason: string | null
          do_not_contact: boolean
          email: string | null
          facebook: string | null
          ghosted_at: string | null
          google_maps_url: string | null
          id: string
          industry: string | null
          instagram: string | null
          is_chain: boolean
          last_contacted_at: string | null
          locations_count: number | null
          notes: string | null
          phone: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          rating: number | null
          rejection_reason: string | null
          review_count: number | null
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          tiktok: string | null
          updated_at: string
          user_id: string
          website: string | null
          why_this_lead: Json
        }
        Insert: {
          address?: string | null
          approval_status?: string
          approved_at?: string | null
          best_angle?: string | null
          bump_count?: number
          business_name: string
          city?: string | null
          classification?: Database["public"]["Enums"]["lead_classification"]
          contact_name?: string | null
          country?: string | null
          created_at?: string
          discovery_search_id?: string | null
          disqualify_reason?: string | null
          do_not_contact?: boolean
          email?: string | null
          facebook?: string | null
          ghosted_at?: string | null
          google_maps_url?: string | null
          id?: string
          industry?: string | null
          instagram?: string | null
          is_chain?: boolean
          last_contacted_at?: string | null
          locations_count?: number | null
          notes?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          rating?: number | null
          rejection_reason?: string | null
          review_count?: number | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          tiktok?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
          why_this_lead?: Json
        }
        Update: {
          address?: string | null
          approval_status?: string
          approved_at?: string | null
          best_angle?: string | null
          bump_count?: number
          business_name?: string
          city?: string | null
          classification?: Database["public"]["Enums"]["lead_classification"]
          contact_name?: string | null
          country?: string | null
          created_at?: string
          discovery_search_id?: string | null
          disqualify_reason?: string | null
          do_not_contact?: boolean
          email?: string | null
          facebook?: string | null
          ghosted_at?: string | null
          google_maps_url?: string | null
          id?: string
          industry?: string | null
          instagram?: string | null
          is_chain?: boolean
          last_contacted_at?: string | null
          locations_count?: number | null
          notes?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          rating?: number | null
          rejection_reason?: string | null
          review_count?: number | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          tiktok?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          why_this_lead?: Json
        }
        Relationships: [
          {
            foreignKeyName: "leads_discovery_search_id_fkey"
            columns: ["discovery_search_id"]
            isOneToOne: false
            referencedRelation: "discovery_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      ordering_gaps: {
        Row: {
          checked_at: string
          direct_ordering: Database["public"]["Enums"]["evidence_type"]
          evidence_codes: string[]
          gap_summary: string | null
          has_direct_ordering: boolean | null
          has_menu: boolean | null
          has_online_ordering: boolean | null
          has_website: boolean | null
          lead_id: string
          menu_found: Database["public"]["Enums"]["evidence_type"]
          online_ordering: Database["public"]["Enums"]["evidence_type"]
          order_button_destination: string | null
          ordering_type: string | null
          third_party_platforms: string[]
          updated_at: string
          user_id: string
          website_found: Database["public"]["Enums"]["evidence_type"]
        }
        Insert: {
          checked_at?: string
          direct_ordering?: Database["public"]["Enums"]["evidence_type"]
          evidence_codes?: string[]
          gap_summary?: string | null
          has_direct_ordering?: boolean | null
          has_menu?: boolean | null
          has_online_ordering?: boolean | null
          has_website?: boolean | null
          lead_id: string
          menu_found?: Database["public"]["Enums"]["evidence_type"]
          online_ordering?: Database["public"]["Enums"]["evidence_type"]
          order_button_destination?: string | null
          ordering_type?: string | null
          third_party_platforms?: string[]
          updated_at?: string
          user_id: string
          website_found?: Database["public"]["Enums"]["evidence_type"]
        }
        Update: {
          checked_at?: string
          direct_ordering?: Database["public"]["Enums"]["evidence_type"]
          evidence_codes?: string[]
          gap_summary?: string | null
          has_direct_ordering?: boolean | null
          has_menu?: boolean | null
          has_online_ordering?: boolean | null
          has_website?: boolean | null
          lead_id?: string
          menu_found?: Database["public"]["Enums"]["evidence_type"]
          online_ordering?: Database["public"]["Enums"]["evidence_type"]
          order_button_destination?: string | null
          ordering_type?: string | null
          third_party_platforms?: string[]
          updated_at?: string
          user_id?: string
          website_found?: Database["public"]["Enums"]["evidence_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ordering_gaps_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_messages: {
        Row: {
          body: string
          bounce_reason: string | null
          bounced_at: string | null
          campaign_id: string | null
          channel: Database["public"]["Enums"]["outreach_channel"]
          created_at: string
          delivered_at: string | null
          evidence_codes: string[]
          id: string
          is_bump: boolean
          lead_id: string
          open_count: number
          opened_at: string | null
          override_logged: boolean
          provider_message_id: string | null
          reasoning: Json
          replied_at: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["outreach_status"]
          step_index: number
          subject: string | null
          tracking_token: string
          updated_at: string
          user_id: string
          verification: Json | null
          verification_passed: boolean | null
          word_count: number | null
        }
        Insert: {
          body: string
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["outreach_channel"]
          created_at?: string
          delivered_at?: string | null
          evidence_codes?: string[]
          id?: string
          is_bump?: boolean
          lead_id: string
          open_count?: number
          opened_at?: string | null
          override_logged?: boolean
          provider_message_id?: string | null
          reasoning?: Json
          replied_at?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outreach_status"]
          step_index?: number
          subject?: string | null
          tracking_token?: string
          updated_at?: string
          user_id: string
          verification?: Json | null
          verification_passed?: boolean | null
          word_count?: number | null
        }
        Update: {
          body?: string
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["outreach_channel"]
          created_at?: string
          delivered_at?: string | null
          evidence_codes?: string[]
          id?: string
          is_bump?: boolean
          lead_id?: string
          open_count?: number
          opened_at?: string | null
          override_logged?: boolean
          provider_message_id?: string | null
          reasoning?: Json
          replied_at?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outreach_status"]
          step_index?: number
          subject?: string | null
          tracking_token?: string
          updated_at?: string
          user_id?: string
          verification?: Json | null
          verification_passed?: boolean | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          city: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at: string
          detail: string | null
          evidence_codes: string[]
          id: string
          lead_id: string
          note: string | null
          source: string | null
          strength: Database["public"]["Enums"]["signal_strength"]
          title: string
          user_id: string
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          detail?: string | null
          evidence_codes?: string[]
          id?: string
          lead_id: string
          note?: string | null
          source?: string | null
          strength?: Database["public"]["Enums"]["signal_strength"]
          title: string
          user_id: string
        }
        Update: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          detail?: string | null
          evidence_codes?: string[]
          id?: string
          lead_id?: string
          note?: string | null
          source?: string | null
          strength?: Database["public"]["Enums"]["signal_strength"]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          aggressiveness: string
          assistant_name: string
          call_recording_default: boolean
          can_spam_signature: string
          created_at: string
          cta_style: string
          daily_email_limit: number
          data_retention_days: number
          default_industry: string
          email_style: string
          gdpr_tracking: boolean
          ghost_threshold_days: number
          integrations: Json
          source_policies: Json
          updated_at: string
          user_id: string
          voice_accent: string
          voice_gender: string
          voice_provider: string
        }
        Insert: {
          aggressiveness?: string
          assistant_name?: string
          call_recording_default?: boolean
          can_spam_signature?: string
          created_at?: string
          cta_style?: string
          daily_email_limit?: number
          data_retention_days?: number
          default_industry?: string
          email_style?: string
          gdpr_tracking?: boolean
          ghost_threshold_days?: number
          integrations?: Json
          source_policies?: Json
          updated_at?: string
          user_id: string
          voice_accent?: string
          voice_gender?: string
          voice_provider?: string
        }
        Update: {
          aggressiveness?: string
          assistant_name?: string
          call_recording_default?: boolean
          can_spam_signature?: string
          created_at?: string
          cta_style?: string
          daily_email_limit?: number
          data_retention_days?: number
          default_industry?: string
          email_style?: string
          gdpr_tracking?: boolean
          ghost_threshold_days?: number
          integrations?: Json
          source_policies?: Json
          updated_at?: string
          user_id?: string
          voice_accent?: string
          voice_gender?: string
          voice_provider?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      confidence_level: "high" | "medium" | "low" | "none"
      evidence_type: "verified" | "calculated" | "inferred" | "unknown"
      friction_level: "high" | "medium" | "low"
      lead_classification:
        | "opportunity"
        | "strong_opportunity"
        | "medium_opportunity"
        | "low_priority"
        | "bad_fit"
      lead_stage:
        | "new"
        | "reviewed"
        | "contact_drafted"
        | "queued"
        | "sent"
        | "replied"
        | "demo_scheduled"
        | "proposal_sent"
        | "negotiating"
        | "closed_won"
        | "closed_lost"
        | "ghost"
      outreach_channel: "email" | "sms" | "call" | "dm"
      outreach_status:
        | "draft"
        | "verified"
        | "queued"
        | "sent"
        | "failed"
        | "replied"
        | "rejected"
      priority_level: "high" | "medium" | "low"
      signal_strength: "strong" | "medium" | "weak" | "unknown"
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
      confidence_level: ["high", "medium", "low", "none"],
      evidence_type: ["verified", "calculated", "inferred", "unknown"],
      friction_level: ["high", "medium", "low"],
      lead_classification: [
        "opportunity",
        "strong_opportunity",
        "medium_opportunity",
        "low_priority",
        "bad_fit",
      ],
      lead_stage: [
        "new",
        "reviewed",
        "contact_drafted",
        "queued",
        "sent",
        "replied",
        "demo_scheduled",
        "proposal_sent",
        "negotiating",
        "closed_won",
        "closed_lost",
        "ghost",
      ],
      outreach_channel: ["email", "sms", "call", "dm"],
      outreach_status: [
        "draft",
        "verified",
        "queued",
        "sent",
        "failed",
        "replied",
        "rejected",
      ],
      priority_level: ["high", "medium", "low"],
      signal_strength: ["strong", "medium", "weak", "unknown"],
    },
  },
} as const
