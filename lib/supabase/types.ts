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
      bank_connections: {
        Row: {
          account_type: string | null
          connected_at: string
          disconnected_at: string | null
          id: string
          institution_name: string | null
          plaid_access_token_encrypted: string
          plaid_item_id: string
          profile_id: string
          status: string
          vendor_terms_version_id: string
        }
        Insert: {
          account_type?: string | null
          connected_at?: string
          disconnected_at?: string | null
          id?: string
          institution_name?: string | null
          plaid_access_token_encrypted: string
          plaid_item_id: string
          profile_id: string
          status?: string
          vendor_terms_version_id: string
        }
        Update: {
          account_type?: string | null
          connected_at?: string
          disconnected_at?: string | null
          id?: string
          institution_name?: string | null
          plaid_access_token_encrypted?: string
          plaid_item_id?: string
          profile_id?: string
          status?: string
          vendor_terms_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_vendor_terms_version_id_fkey"
            columns: ["vendor_terms_version_id"]
            isOneToOne: false
            referencedRelation: "vendor_terms_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_categories: {
        Row: {
          description: string
          display_name: string
          id: string
          introduced_in_version: string
          is_sensitive: boolean
          retired_in_version: string | null
        }
        Insert: {
          description: string
          display_name: string
          id: string
          introduced_in_version: string
          is_sensitive?: boolean
          retired_in_version?: string | null
        }
        Update: {
          description?: string
          display_name?: string
          id?: string
          introduced_in_version?: string
          is_sensitive?: boolean
          retired_in_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_categories_introduced_in_version_fkey"
            columns: ["introduced_in_version"]
            isOneToOne: false
            referencedRelation: "notice_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "consent_categories_retired_in_version_fkey"
            columns: ["retired_in_version"]
            isOneToOne: false
            referencedRelation: "notice_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      consents: {
        Row: {
          action: string
          category_id: string
          consent_text_sha256: string
          created_at: string
          gpc_signal_present: boolean
          id: string
          ip_address: unknown
          notice_version: string
          profile_id: string
          ui_surface: string
          user_agent: string | null
        }
        Insert: {
          action: string
          category_id: string
          consent_text_sha256: string
          created_at?: string
          gpc_signal_present?: boolean
          id?: string
          ip_address?: unknown
          notice_version: string
          profile_id: string
          ui_surface: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          category_id?: string
          consent_text_sha256?: string
          created_at?: string
          gpc_signal_present?: boolean
          id?: string
          ip_address?: unknown
          notice_version?: string
          profile_id?: string
          ui_surface?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "consent_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_notice_version_fkey"
            columns: ["notice_version"]
            isOneToOne: false
            referencedRelation: "notice_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "consents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gpc_signals: {
        Row: {
          gpc_header_value: string
          id: string
          ip_address: unknown
          observed_at: string
          profile_id: string | null
          request_path: string
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          gpc_header_value: string
          id?: string
          ip_address?: unknown
          observed_at?: string
          profile_id?: string | null
          request_path: string
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          gpc_header_value?: string
          id?: string
          ip_address?: unknown
          observed_at?: string
          profile_id?: string | null
          request_path?: string
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gpc_signals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      income_outputs: {
        Row: {
          applied_addbacks: Json
          applied_haircuts: Json
          created_at: string
          display_surface: string
          displayed_to_user_at: string
          engine_version: string
          id: string
          input_bank_connection_ids: string[]
          input_snapshot_sha256: string
          input_tax_document_ids: string[]
          output_explanation: string | null
          profile_id: string
          qualifying_income_annual: number
          qualifying_income_monthly: number
          rules_version: string
        }
        Insert: {
          applied_addbacks?: Json
          applied_haircuts?: Json
          created_at?: string
          display_surface: string
          displayed_to_user_at?: string
          engine_version: string
          id?: string
          input_bank_connection_ids?: string[]
          input_snapshot_sha256: string
          input_tax_document_ids?: string[]
          output_explanation?: string | null
          profile_id: string
          qualifying_income_annual: number
          qualifying_income_monthly: number
          rules_version: string
        }
        Update: {
          applied_addbacks?: Json
          applied_haircuts?: Json
          created_at?: string
          display_surface?: string
          displayed_to_user_at?: string
          engine_version?: string
          id?: string
          input_bank_connection_ids?: string[]
          input_snapshot_sha256?: string
          input_tax_document_ids?: string[]
          output_explanation?: string | null
          profile_id?: string
          qualifying_income_annual?: number
          qualifying_income_monthly?: number
          rules_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_outputs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_versions: {
        Row: {
          created_at: string
          effective_at: string
          id: string
          notice_sha256: string
          notice_url: string | null
          superseded_at: string | null
          version: string
        }
        Insert: {
          created_at?: string
          effective_at: string
          id?: string
          notice_sha256: string
          notice_url?: string | null
          superseded_at?: string | null
          version: string
        }
        Update: {
          created_at?: string
          effective_at?: string
          id?: string
          notice_sha256?: string
          notice_url?: string | null
          superseded_at?: string | null
          version?: string
        }
        Relationships: []
      }
      parsed_tax_fields: {
        Row: {
          created_at: string
          extracted_fields: Json
          extraction_confidence_overall: number | null
          extraction_model: string | null
          filing_status: string | null
          id: string
          profile_id: string
          tax_document_id: string
          tax_year: number
          updated_at: string
          user_confirmation_status: string
          user_confirmed_at: string | null
        }
        Insert: {
          created_at?: string
          extracted_fields?: Json
          extraction_confidence_overall?: number | null
          extraction_model?: string | null
          filing_status?: string | null
          id?: string
          profile_id: string
          tax_document_id: string
          tax_year: number
          updated_at?: string
          user_confirmation_status?: string
          user_confirmed_at?: string | null
        }
        Update: {
          created_at?: string
          extracted_fields?: Json
          extraction_confidence_overall?: number | null
          extraction_model?: string | null
          filing_status?: string | null
          id?: string
          profile_id?: string
          tax_document_id?: string
          tax_year?: number
          updated_at?: string
          user_confirmation_status?: string
          user_confirmed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parsed_tax_fields_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parsed_tax_fields_tax_document_id_fkey"
            columns: ["tax_document_id"]
            isOneToOne: false
            referencedRelation: "tax_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          clerk_user_id: string
          closed_at: string | null
          created_at: string
          deletion_requested_at: string | null
          email: string | null
          employment_type: string | null
          id: string
          state_residence: string | null
          status: string
          updated_at: string
        }
        Insert: {
          clerk_user_id: string
          closed_at?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          email?: string | null
          employment_type?: string | null
          id?: string
          state_residence?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          clerk_user_id?: string
          closed_at?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          email?: string | null
          employment_type?: string | null
          id?: string
          state_residence?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_documents: {
        Row: {
          delete_after: string
          deleted_at: string | null
          filename: string
          id: string
          mime_type: string
          parse_completed_at: string | null
          parse_status: string
          profile_id: string
          size_bytes: number
          storage_path: string
          tax_year: number
          uploaded_at: string
          vendor_terms_version_id: string
        }
        Insert: {
          delete_after?: string
          deleted_at?: string | null
          filename: string
          id?: string
          mime_type: string
          parse_completed_at?: string | null
          parse_status?: string
          profile_id: string
          size_bytes: number
          storage_path: string
          tax_year: number
          uploaded_at?: string
          vendor_terms_version_id: string
        }
        Update: {
          delete_after?: string
          deleted_at?: string | null
          filename?: string
          id?: string
          mime_type?: string
          parse_completed_at?: string | null
          parse_status?: string
          profile_id?: string
          size_bytes?: number
          storage_path?: string
          tax_year?: number
          uploaded_at?: string
          vendor_terms_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_documents_vendor_terms_version_id_fkey"
            columns: ["vendor_terms_version_id"]
            isOneToOne: false
            referencedRelation: "vendor_terms_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_terms_versions: {
        Row: {
          created_at: string
          effective_at: string
          id: string
          reuse_posture: string
          superseded_at: string | null
          terms_doc_url: string | null
          terms_version: string
          vendor: string
        }
        Insert: {
          created_at?: string
          effective_at: string
          id?: string
          reuse_posture: string
          superseded_at?: string | null
          terms_doc_url?: string | null
          terms_version: string
          vendor: string
        }
        Update: {
          created_at?: string
          effective_at?: string
          id?: string
          reuse_posture?: string
          superseded_at?: string | null
          terms_doc_url?: string | null
          terms_version?: string
          vendor?: string
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
