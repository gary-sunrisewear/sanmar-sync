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
      imported_products: {
        Row: {
          active: boolean
          created_at: string
          id: string
          imported_by: string | null
          last_inventory_sync_at: string | null
          last_price_sync_at: string | null
          meta: Json
          product_type: string | null
          shopify_handle: string | null
          shopify_product_id: string
          supplier: Database["public"]["Enums"]["supplier_code"]
          supplier_style_id: string
          supplier_style_name: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          imported_by?: string | null
          last_inventory_sync_at?: string | null
          last_price_sync_at?: string | null
          meta?: Json
          product_type?: string | null
          shopify_handle?: string | null
          shopify_product_id: string
          supplier: Database["public"]["Enums"]["supplier_code"]
          supplier_style_id: string
          supplier_style_name?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          imported_by?: string | null
          last_inventory_sync_at?: string | null
          last_price_sync_at?: string | null
          meta?: Json
          product_type?: string | null
          shopify_handle?: string | null
          shopify_product_id?: string
          supplier?: Database["public"]["Enums"]["supplier_code"]
          supplier_style_id?: string
          supplier_style_name?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      imported_variants: {
        Row: {
          color: string | null
          cost: number | null
          created_at: string
          id: string
          last_qty: number | null
          last_synced_at: string | null
          price: number | null
          product_id: string
          shopify_inventory_item_id: string | null
          shopify_variant_id: string
          size: string | null
          supplier_sku: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          last_qty?: number | null
          last_synced_at?: string | null
          price?: number | null
          product_id: string
          shopify_inventory_item_id?: string | null
          shopify_variant_id: string
          size?: string | null
          supplier_sku: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          last_qty?: number | null
          last_synced_at?: string | null
          price?: number | null
          product_id?: string
          shopify_inventory_item_id?: string | null
          shopify_variant_id?: string
          size?: string | null
          supplier_sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "imported_products"
            referencedColumns: ["id"]
          },
        ]
      }
      markup_rules: {
        Row: {
          charm_pricing: boolean
          created_at: string
          flat_add: number
          id: string
          match_field: string | null
          match_value: string | null
          multiplier: number
          priority: number
          round_to: number
          supplier: Database["public"]["Enums"]["supplier_code"] | null
          updated_at: string
        }
        Insert: {
          charm_pricing?: boolean
          created_at?: string
          flat_add?: number
          id?: string
          match_field?: string | null
          match_value?: string | null
          multiplier?: number
          priority?: number
          round_to?: number
          supplier?: Database["public"]["Enums"]["supplier_code"] | null
          updated_at?: string
        }
        Update: {
          charm_pricing?: boolean
          created_at?: string
          flat_add?: number
          id?: string
          match_field?: string | null
          match_value?: string | null
          multiplier?: number
          priority?: number
          round_to?: number
          supplier?: Database["public"]["Enums"]["supplier_code"] | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      supplier_credentials: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          last_test_at: string | null
          last_test_message: string | null
          last_test_ok: boolean | null
          supplier: Database["public"]["Enums"]["supplier_code"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          supplier: Database["public"]["Enums"]["supplier_code"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          supplier?: Database["public"]["Enums"]["supplier_code"]
          updated_at?: string
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          errors: Json | null
          finished_at: string | null
          id: string
          items_failed: number | null
          items_ok: number | null
          items_total: number | null
          kind: Database["public"]["Enums"]["sync_job_kind"]
          notes: string | null
          started_at: string
          status: Database["public"]["Enums"]["sync_job_status"]
          supplier: Database["public"]["Enums"]["supplier_code"] | null
          triggered_by: string | null
        }
        Insert: {
          errors?: Json | null
          finished_at?: string | null
          id?: string
          items_failed?: number | null
          items_ok?: number | null
          items_total?: number | null
          kind: Database["public"]["Enums"]["sync_job_kind"]
          notes?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_job_status"]
          supplier?: Database["public"]["Enums"]["supplier_code"] | null
          triggered_by?: string | null
        }
        Update: {
          errors?: Json | null
          finished_at?: string | null
          id?: string
          items_failed?: number | null
          items_ok?: number | null
          items_total?: number | null
          kind?: Database["public"]["Enums"]["sync_job_kind"]
          notes?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_job_status"]
          supplier?: Database["public"]["Enums"]["supplier_code"] | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator"
      supplier_code: "sanmar" | "ssactivewear" | "ascolour" | "ottocap"
      sync_job_kind: "import" | "inventory" | "price"
      sync_job_status: "running" | "success" | "partial" | "failed"
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
      app_role: ["admin", "operator"],
      supplier_code: ["sanmar", "ssactivewear", "ascolour", "ottocap"],
      sync_job_kind: ["import", "inventory", "price"],
      sync_job_status: ["running", "success", "partial", "failed"],
    },
  },
} as const
