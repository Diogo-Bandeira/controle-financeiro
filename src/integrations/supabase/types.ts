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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      aportes: {
        Row: {
          created_at: string
          data: string
          household_id: string
          id: string
          lancamento_id: string | null
          meta_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          data?: string
          household_id: string
          id?: string
          lancamento_id?: string | null
          meta_id: string
          updated_at?: string
          valor: number
        }
        Update: {
          created_at?: string
          data?: string
          household_id?: string
          id?: string
          lancamento_id?: string | null
          meta_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "aportes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aportes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aportes_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "metas"
            referencedColumns: ["id"]
          },
        ]
      }
      cartoes: {
        Row: {
          ativo: boolean
          banco: string | null
          cor: string | null
          created_at: string
          dia_fechamento: number | null
          dia_vencimento: number | null
          household_id: string
          id: string
          limite: number | null
          nome: string
          titular: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          banco?: string | null
          cor?: string | null
          created_at?: string
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          household_id: string
          id?: string
          limite?: number | null
          nome: string
          titular?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          banco?: string | null
          cor?: string | null
          created_at?: string
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          household_id?: string
          id?: string
          limite?: number | null
          nome?: string
          titular?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartoes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas_chat: {
        Row: {
          created_at: string
          household_id: string
          id: string
          titulo: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          titulo?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversas_chat_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      faturas_pagas: {
        Row: {
          ano: number
          cartao_id: string
          created_at: string
          household_id: string
          id: string
          mes: number
          pago_em: string
          updated_at: string
        }
        Insert: {
          ano: number
          cartao_id: string
          created_at?: string
          household_id: string
          id?: string
          mes: number
          pago_em?: string
          updated_at?: string
        }
        Update: {
          ano?: number
          cartao_id?: string
          created_at?: string
          household_id?: string
          id?: string
          mes?: number
          pago_em?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faturas_pagas_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_pagas_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          codigo_convite: string | null
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          codigo_convite?: string | null
          created_at?: string
          id?: string
          nome?: string
        }
        Update: {
          codigo_convite?: string | null
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      lancamentos: {
        Row: {
          ano: number
          cartao_id: string | null
          cartao_nome: string | null
          categoria: string
          created_at: string
          created_by: string | null
          data: string
          descricao: string
          household_id: string
          id: string
          mes: number
          observacao: string | null
          origem: string
          parcela_num: number | null
          parcelamento_id: string | null
          recorrencia_id: string | null
          reembolso: boolean
          responsavel: string | null
          status: string
          subcategoria: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ano?: number
          cartao_id?: string | null
          cartao_nome?: string | null
          categoria: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao: string
          household_id: string
          id?: string
          mes: number
          observacao?: string | null
          origem?: string
          parcela_num?: number | null
          parcelamento_id?: string | null
          recorrencia_id?: string | null
          reembolso?: boolean
          responsavel?: string | null
          status?: string
          subcategoria?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          ano?: number
          cartao_id?: string | null
          cartao_nome?: string | null
          categoria?: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          household_id?: string
          id?: string
          mes?: number
          observacao?: string | null
          origem?: string
          parcela_num?: number | null
          parcelamento_id?: string | null
          recorrencia_id?: string | null
          reembolso?: boolean
          responsavel?: string | null
          status?: string
          subcategoria?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_parcelamento_id_fkey"
            columns: ["parcelamento_id"]
            isOneToOne: false
            referencedRelation: "parcelamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "recorrencias"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_chat: {
        Row: {
          content: string
          conversa_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversa_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversa_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_chat_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas_chat"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          created_at: string
          household_id: string
          id: string
          nome: string
          prazo: string | null
          rendimento: number
          taxa_rendimento_mensal: number | null
          updated_at: string
          valor_atual: number
          valor_meta: number
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          nome: string
          prazo?: string | null
          rendimento?: number
          taxa_rendimento_mensal?: number | null
          updated_at?: string
          valor_atual?: number
          valor_meta?: number
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          nome?: string
          prazo?: string | null
          rendimento?: number
          taxa_rendimento_mensal?: number | null
          updated_at?: string
          valor_atual?: number
          valor_meta?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          ano: number
          created_at: string
          household_id: string
          id: string
          limite: number
          mes: number
          subcategoria_slug: string
          updated_at: string
        }
        Insert: {
          ano: number
          created_at?: string
          household_id: string
          id?: string
          limite: number
          mes: number
          subcategoria_slug: string
          updated_at?: string
        }
        Update: {
          ano?: number
          created_at?: string
          household_id?: string
          id?: string
          limite?: number
          mes?: number
          subcategoria_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelamentos: {
        Row: {
          cartao_id: string | null
          created_at: string
          created_by: string | null
          data_compra: string | null
          descricao: string
          household_id: string
          id: string
          observacao: string | null
          parcelas: number
          parcelas_pagas: number
          primeira_fatura_ano: number | null
          primeira_fatura_mes: number | null
          quitado: boolean
          subcategoria: string | null
          updated_at: string
          valor_parcela: number
          valor_total: number
        }
        Insert: {
          cartao_id?: string | null
          created_at?: string
          created_by?: string | null
          data_compra?: string | null
          descricao: string
          household_id: string
          id?: string
          observacao?: string | null
          parcelas?: number
          parcelas_pagas?: number
          primeira_fatura_ano?: number | null
          primeira_fatura_mes?: number | null
          quitado?: boolean
          subcategoria?: string | null
          updated_at?: string
          valor_parcela?: number
          valor_total?: number
        }
        Update: {
          cartao_id?: string | null
          created_at?: string
          created_by?: string | null
          data_compra?: string | null
          descricao?: string
          household_id?: string
          id?: string
          observacao?: string | null
          parcelas?: number
          parcelas_pagas?: number
          primeira_fatura_ano?: number | null
          primeira_fatura_mes?: number | null
          quitado?: boolean
          subcategoria?: string | null
          updated_at?: string
          valor_parcela?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "parcelamentos_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelamentos_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      prioridades: {
        Row: {
          ano_planejado: number | null
          cartao_id: string | null
          concluida: boolean
          created_at: string
          descricao: string
          household_id: string
          id: string
          lancamento_id: string | null
          link: string | null
          mes_planejado: number | null
          observacao: string | null
          ordem: number | null
          parcelamento_id: string | null
          parcelas_previstas: number
          prioridade: string
          subcategoria: string | null
          updated_at: string
          valor: number
          valor_pago: number | null
        }
        Insert: {
          ano_planejado?: number | null
          cartao_id?: string | null
          concluida?: boolean
          created_at?: string
          descricao: string
          household_id: string
          id?: string
          lancamento_id?: string | null
          link?: string | null
          mes_planejado?: number | null
          observacao?: string | null
          ordem?: number | null
          parcelamento_id?: string | null
          parcelas_previstas?: number
          prioridade: string
          subcategoria?: string | null
          updated_at?: string
          valor?: number
          valor_pago?: number | null
        }
        Update: {
          ano_planejado?: number | null
          cartao_id?: string | null
          concluida?: boolean
          created_at?: string
          descricao?: string
          household_id?: string
          id?: string
          lancamento_id?: string | null
          link?: string | null
          mes_planejado?: number | null
          observacao?: string | null
          ordem?: number | null
          parcelamento_id?: string | null
          parcelas_previstas?: number
          prioridade?: string
          subcategoria?: string | null
          updated_at?: string
          valor?: number
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prioridades_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prioridades_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prioridades_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prioridades_parcelamento_id_fkey"
            columns: ["parcelamento_id"]
            isOneToOne: false
            referencedRelation: "parcelamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          household_id: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          household_id?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          household_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recorrencias: {
        Row: {
          ativo: boolean
          cartao_id: string | null
          categoria: string
          created_at: string
          descricao: string
          dia: number
          fim_ano: number | null
          fim_mes: number | null
          household_id: string
          id: string
          inicio_ano: number
          inicio_mes: number
          reembolso: boolean
          responsavel: string | null
          subcategoria: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          cartao_id?: string | null
          categoria: string
          created_at?: string
          descricao: string
          dia?: number
          fim_ano?: number | null
          fim_mes?: number | null
          household_id: string
          id?: string
          inicio_ano: number
          inicio_mes: number
          reembolso?: boolean
          responsavel?: string | null
          subcategoria?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          ativo?: boolean
          cartao_id?: string | null
          categoria?: string
          created_at?: string
          descricao?: string
          dia?: number
          fim_ano?: number | null
          fim_mes?: number | null
          household_id?: string
          id?: string
          inicio_ano?: number
          inicio_mes?: number
          reembolso?: boolean
          responsavel?: string | null
          subcategoria?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "recorrencias_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategorias: {
        Row: {
          ativa: boolean
          conta_no_orcamento: boolean
          cor: string
          created_at: string
          household_id: string
          id: string
          label: string
          limite_padrao: number
          ordem: number | null
          slug: string
          tipo: string | null
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          conta_no_orcamento?: boolean
          cor: string
          created_at?: string
          household_id: string
          id?: string
          label: string
          limite_padrao?: number
          ordem?: number | null
          slug: string
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          conta_no_orcamento?: boolean
          cor?: string
          created_at?: string
          household_id?: string
          id?: string
          label?: string
          limite_padrao?: number
          ordem?: number | null
          slug?: string
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      entrar_household: { Args: { _codigo: string }; Returns: string }
      excluir_parcelamento: {
        Args: { p_id: string; p_manter_ids?: string[] }
        Returns: undefined
      }
      get_user_household_id: { Args: { _user_id: string }; Returns: string }
      inserir_lancamentos: {
        Args: { p_lancamentos: Json }
        Returns: {
          ano: number
          cartao_id: string | null
          cartao_nome: string | null
          categoria: string
          created_at: string
          created_by: string | null
          data: string
          descricao: string
          household_id: string
          id: string
          mes: number
          observacao: string | null
          origem: string
          parcela_num: number | null
          parcelamento_id: string | null
          recorrencia_id: string | null
          reembolso: boolean
          responsavel: string | null
          status: string
          subcategoria: string | null
          updated_at: string
          valor: number
        }[]
        SetofOptions: {
          from: "*"
          to: "lancamentos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      normalizar_nome_cartao: { Args: { _nome: string }; Returns: string }
      salvar_parcelamento: {
        Args: {
          p_apagar_ids?: string[]
          p_lancamentos?: Json
          p_parcelamento: Json
        }
        Returns: Json
      }
      seed_subcategorias: {
        Args: { _household_id: string }
        Returns: undefined
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
