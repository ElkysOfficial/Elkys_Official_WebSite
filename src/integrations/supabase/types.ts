export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          action_url: string | null;
          body: string;
          created_at: string;
          created_by: string | null;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          read_by: string[];
          severity: string;
          target_roles: Database["public"]["Enums"]["app_role"][];
          title: string;
          type: string;
        };
        Insert: {
          action_url?: string | null;
          body: string;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          read_by?: string[];
          severity?: string;
          target_roles?: Database["public"]["Enums"]["app_role"][];
          title: string;
          type: string;
        };
        Update: {
          action_url?: string | null;
          body?: string;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          read_by?: string[];
          severity?: string;
          target_roles?: Database["public"]["Enums"]["app_role"][];
          title?: string;
          type?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_user_id: string | null;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          reason: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          reason?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          reason?: string | null;
        };
        Relationships: [];
      };
      billing_actions_log: {
        Row: {
          action_type: string;
          charge_id: string;
          error_message: string | null;
          id: string;
          rule_id: string | null;
          sent_at: string;
          sent_date: string | null;
          status: string;
          template_id: string | null;
          triggered_by: string;
        };
        Insert: {
          action_type: string;
          charge_id: string;
          error_message?: string | null;
          id?: string;
          rule_id?: string | null;
          sent_at?: string;
          sent_date?: string | null;
          status?: string;
          template_id?: string | null;
          triggered_by?: string;
        };
        Update: {
          action_type?: string;
          charge_id?: string;
          error_message?: string | null;
          id?: string;
          rule_id?: string | null;
          sent_at?: string;
          sent_date?: string | null;
          status?: string;
          template_id?: string | null;
          triggered_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_actions_log_charge_id_fkey";
            columns: ["charge_id"];
            isOneToOne: false;
            referencedRelation: "charges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_actions_log_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "billing_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_actions_log_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "billing_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_rules: {
        Row: {
          action_type: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          template_id: string | null;
          trigger_days: number;
          updated_at: string;
        };
        Insert: {
          action_type: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          template_id?: string | null;
          trigger_days: number;
          updated_at?: string;
        };
        Update: {
          action_type?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          template_id?: string | null;
          trigger_days?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_rules_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "billing_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_templates: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          subject: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          subject: string;
          type?: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          subject?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      charges: {
        Row: {
          amount: number;
          client_id: string;
          contract_id: string | null;
          created_at: string;
          description: string;
          due_date: string;
          id: string;
          installment_id: string | null;
          is_blocking: boolean;
          is_historical: boolean;
          origin_type: string;
          paid_at: string | null;
          payment_link: string | null;
          payment_reference: string | null;
          project_id: string | null;
          status: Database["public"]["Enums"]["invoice_status"];
          subscription_id: string | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          client_id: string;
          contract_id?: string | null;
          created_at?: string;
          description: string;
          due_date: string;
          id?: string;
          installment_id?: string | null;
          is_blocking?: boolean;
          is_historical?: boolean;
          origin_type: string;
          paid_at?: string | null;
          payment_link?: string | null;
          payment_reference?: string | null;
          project_id?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          subscription_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          client_id?: string;
          contract_id?: string | null;
          created_at?: string;
          description?: string;
          due_date?: string;
          id?: string;
          installment_id?: string | null;
          is_blocking?: boolean;
          is_historical?: boolean;
          origin_type?: string;
          paid_at?: string | null;
          payment_link?: string | null;
          payment_reference?: string | null;
          project_id?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          subscription_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "charges_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "charges_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "project_contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_installment_id_fkey";
            columns: ["installment_id"];
            isOneToOne: false;
            referencedRelation: "project_installments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "project_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      client_contacts: {
        Row: {
          auth_user_id: string | null;
          client_id: string;
          cpf: string | null;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_legal_representative: boolean;
          is_primary: boolean;
          phone: string | null;
          receives_finance: boolean;
          role_label: string | null;
          updated_at: string;
        };
        Insert: {
          auth_user_id?: string | null;
          client_id: string;
          cpf?: string | null;
          created_at?: string;
          email: string;
          full_name: string;
          id?: string;
          is_legal_representative?: boolean;
          is_primary?: boolean;
          phone?: string | null;
          receives_finance?: boolean;
          role_label?: string | null;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string | null;
          client_id?: string;
          cpf?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          is_legal_representative?: boolean;
          is_primary?: boolean;
          phone?: string | null;
          receives_finance?: boolean;
          role_label?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      client_inadimplencia_warnings: {
        Row: {
          client_id: string;
          created_at: string;
          entered_at: string;
          exited_at: string | null;
          id: string;
          warning_error: string | null;
          warning_sent_at: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          entered_at?: string;
          exited_at?: string | null;
          id?: string;
          warning_error?: string | null;
          warning_sent_at?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          entered_at?: string;
          exited_at?: string | null;
          id?: string;
          warning_error?: string | null;
          warning_sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "client_inadimplencia_warnings_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "client_inadimplencia_warnings_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          aceite_termos: boolean;
          aceite_termos_at: string | null;
          bairro: string | null;
          birth_date: string | null;
          canal_assinatura: Database["public"]["Enums"]["canal_assinatura_type"] | null;
          cargo_representante: string | null;
          cep: string | null;
          city: string | null;
          client_origin: Database["public"]["Enums"]["client_origin"] | null;
          client_since: string;
          client_type: string;
          cnae: string | null;
          cnpj: string | null;
          complemento: string | null;
          contato_secundario: string | null;
          contract_end: string | null;
          contract_start: string | null;
          contract_status: Database["public"]["Enums"]["contract_status"] | null;
          contract_type: Database["public"]["Enums"]["contract_type"] | null;
          country: string;
          cpf: string | null;
          created_at: string;
          email: string;
          email_financeiro: string | null;
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento_type"] | null;
          full_name: string;
          gender: Database["public"]["Enums"]["gender_type"] | null;
          id: string;
          inscricao_estadual: string | null;
          inscricao_municipal: string | null;
          is_active: boolean;
          limite_credito: number | null;
          logradouro: string | null;
          monthly_value: number;
          must_change_password: boolean;
          nome_fantasia: string | null;
          notes_internal: string | null;
          numero: string | null;
          owner_id: string | null;
          payment_due_day: number | null;
          phone: string | null;
          project_total_value: number;
          razao_social: string | null;
          regime_tributario: Database["public"]["Enums"]["regime_tributario_type"] | null;
          responsavel_financeiro: string | null;
          responsavel_financeiro_phone: string | null;
          rg: string | null;
          scope_summary: string | null;
          sla_hours: number | null;
          state: string | null;
          tags: string[];
          updated_at: string;
          user_id: string | null;
          whatsapp: string | null;
        };
        Insert: {
          aceite_termos?: boolean;
          aceite_termos_at?: string | null;
          bairro?: string | null;
          birth_date?: string | null;
          canal_assinatura?: Database["public"]["Enums"]["canal_assinatura_type"] | null;
          cargo_representante?: string | null;
          cep?: string | null;
          city?: string | null;
          client_origin?: Database["public"]["Enums"]["client_origin"] | null;
          client_since?: string;
          client_type?: string;
          cnae?: string | null;
          cnpj?: string | null;
          complemento?: string | null;
          contato_secundario?: string | null;
          contract_end?: string | null;
          contract_start?: string | null;
          contract_status?: Database["public"]["Enums"]["contract_status"] | null;
          contract_type?: Database["public"]["Enums"]["contract_type"] | null;
          country?: string;
          cpf?: string | null;
          created_at?: string;
          email: string;
          email_financeiro?: string | null;
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento_type"] | null;
          full_name: string;
          gender?: Database["public"]["Enums"]["gender_type"] | null;
          id?: string;
          inscricao_estadual?: string | null;
          inscricao_municipal?: string | null;
          is_active?: boolean;
          limite_credito?: number | null;
          logradouro?: string | null;
          monthly_value?: number;
          must_change_password?: boolean;
          nome_fantasia?: string | null;
          notes_internal?: string | null;
          numero?: string | null;
          owner_id?: string | null;
          payment_due_day?: number | null;
          phone?: string | null;
          project_total_value?: number;
          razao_social?: string | null;
          regime_tributario?: Database["public"]["Enums"]["regime_tributario_type"] | null;
          responsavel_financeiro?: string | null;
          responsavel_financeiro_phone?: string | null;
          rg?: string | null;
          scope_summary?: string | null;
          sla_hours?: number | null;
          state?: string | null;
          tags?: string[];
          updated_at?: string;
          user_id?: string | null;
          whatsapp?: string | null;
        };
        Update: {
          aceite_termos?: boolean;
          aceite_termos_at?: string | null;
          bairro?: string | null;
          birth_date?: string | null;
          canal_assinatura?: Database["public"]["Enums"]["canal_assinatura_type"] | null;
          cargo_representante?: string | null;
          cep?: string | null;
          city?: string | null;
          client_origin?: Database["public"]["Enums"]["client_origin"] | null;
          client_since?: string;
          client_type?: string;
          cnae?: string | null;
          cnpj?: string | null;
          complemento?: string | null;
          contato_secundario?: string | null;
          contract_end?: string | null;
          contract_start?: string | null;
          contract_status?: Database["public"]["Enums"]["contract_status"] | null;
          contract_type?: Database["public"]["Enums"]["contract_type"] | null;
          country?: string;
          cpf?: string | null;
          created_at?: string;
          email?: string;
          email_financeiro?: string | null;
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento_type"] | null;
          full_name?: string;
          gender?: Database["public"]["Enums"]["gender_type"] | null;
          id?: string;
          inscricao_estadual?: string | null;
          inscricao_municipal?: string | null;
          is_active?: boolean;
          limite_credito?: number | null;
          logradouro?: string | null;
          monthly_value?: number;
          must_change_password?: boolean;
          nome_fantasia?: string | null;
          notes_internal?: string | null;
          numero?: string | null;
          owner_id?: string | null;
          payment_due_day?: number | null;
          phone?: string | null;
          project_total_value?: number;
          razao_social?: string | null;
          regime_tributario?: Database["public"]["Enums"]["regime_tributario_type"] | null;
          responsavel_financeiro?: string | null;
          responsavel_financeiro_phone?: string | null;
          rg?: string | null;
          scope_summary?: string | null;
          sla_hours?: number | null;
          state?: string | null;
          tags?: string[];
          updated_at?: string;
          user_id?: string | null;
          whatsapp?: string | null;
        };
        Relationships: [];
      };
      communications: {
        Row: {
          client_id: string | null;
          created_at: string;
          email_status: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          kind: string;
          recipient_email: string | null;
          recipient_phone: string | null;
          whatsapp_status: string | null;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          email_status?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          kind: string;
          recipient_email?: string | null;
          recipient_phone?: string | null;
          whatsapp_status?: string | null;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          email_status?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          kind?: string;
          recipient_email?: string | null;
          recipient_phone?: string | null;
          whatsapp_status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "communications_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          archived_at: string | null;
          client_id: string;
          contract_id: string | null;
          created_at: string;
          description: string | null;
          external_url: string | null;
          id: string;
          label: string;
          project_id: string | null;
          storage_path: string | null;
          type: Database["public"]["Enums"]["document_type"];
          uploaded_by: string | null;
          url: string;
          visibility: Database["public"]["Enums"]["document_visibility"];
        };
        Insert: {
          archived_at?: string | null;
          client_id: string;
          contract_id?: string | null;
          created_at?: string;
          description?: string | null;
          external_url?: string | null;
          id?: string;
          label: string;
          project_id?: string | null;
          storage_path?: string | null;
          type: Database["public"]["Enums"]["document_type"];
          uploaded_by?: string | null;
          url: string;
          visibility?: Database["public"]["Enums"]["document_visibility"];
        };
        Update: {
          archived_at?: string | null;
          client_id?: string;
          contract_id?: string | null;
          created_at?: string;
          description?: string | null;
          external_url?: string | null;
          id?: string;
          label?: string;
          project_id?: string | null;
          storage_path?: string | null;
          type?: Database["public"]["Enums"]["document_type"];
          uploaded_by?: string | null;
          url?: string;
          visibility?: Database["public"]["Enums"]["document_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "documents_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "project_contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          category: string;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          expense_date: string;
          id: string;
          is_fixed: boolean;
          notes: string | null;
          project_id: string | null;
        };
        Insert: {
          amount: number;
          category?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description: string;
          expense_date?: string;
          id?: string;
          is_fixed?: boolean;
          notes?: string | null;
          project_id?: string | null;
        };
        Update: {
          amount?: number;
          category?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          expense_date?: string;
          id?: string;
          is_fixed?: boolean;
          notes?: string | null;
          project_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "expenses_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_goals: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          period_end: string;
          period_start: string;
          period_type: string;
          target_amount: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          period_end: string;
          period_start: string;
          period_type: string;
          target_amount: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          period_end?: string;
          period_start?: string;
          period_type?: string;
          target_amount?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      internal_team_documents: {
        Row: {
          audience: string;
          created_at: string;
          created_by: string | null;
          id: string;
          label: string;
          type_label: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          audience: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label: string;
          type_label: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          audience?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string;
          type_label?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      lead_interactions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          lead_id: string;
          notes: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          lead_id: string;
          notes: string;
          type: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          lead_id?: string;
          notes?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_interactions_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          assigned_to: string | null;
          company: string | null;
          converted_client_id: string | null;
          created_at: string;
          created_by: string | null;
          diagnosis: Json | null;
          email: string | null;
          estimated_value: number | null;
          id: string;
          lost_reason: string | null;
          name: string;
          notes: string | null;
          phone: string | null;
          probability: number | null;
          source: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          company?: string | null;
          converted_client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          diagnosis?: Json | null;
          email?: string | null;
          estimated_value?: number | null;
          id?: string;
          lost_reason?: string | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          probability?: number | null;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          company?: string | null;
          converted_client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          diagnosis?: Json | null;
          email?: string | null;
          estimated_value?: number | null;
          id?: string;
          lost_reason?: string | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          probability?: number | null;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_converted_client_id_fkey";
            columns: ["converted_client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "leads_converted_client_id_fkey";
            columns: ["converted_client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_calendar_events: {
        Row: {
          all_day: boolean;
          channel: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string;
          event_type: string;
          id: string;
          project_id: string | null;
          starts_at: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          all_day?: boolean;
          channel?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at: string;
          event_type?: string;
          id?: string;
          project_id?: string | null;
          starts_at: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          all_day?: boolean;
          channel?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string;
          event_type?: string;
          id?: string;
          project_id?: string | null;
          starts_at?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_calendar_events_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "marketing_calendar_events_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_calendar_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_recipients: {
        Row: {
          client_id: string;
          created_at: string;
          email_error: string | null;
          email_sent: boolean;
          id: string;
          notification_id: string;
          read_at: string | null;
          user_id: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          email_error?: string | null;
          email_sent?: boolean;
          id?: string;
          notification_id: string;
          read_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          email_error?: string | null;
          email_sent?: boolean;
          id?: string;
          notification_id?: string;
          read_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notification_recipients_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "notification_recipients_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_recipients_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          error_count: number | null;
          filter_client_ids: string[] | null;
          filter_contract_status: string | null;
          filter_mode: string;
          filter_tags: string[] | null;
          id: string;
          recipient_count: number | null;
          send_at: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: string | null;
          error_count?: number | null;
          filter_client_ids?: string[] | null;
          filter_contract_status?: string | null;
          filter_mode?: string;
          filter_tags?: string[] | null;
          id?: string;
          recipient_count?: number | null;
          send_at?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          title: string;
          type?: Database["public"]["Enums"]["notification_type"];
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          error_count?: number | null;
          filter_client_ids?: string[] | null;
          filter_contract_status?: string | null;
          filter_mode?: string;
          filter_tags?: string[] | null;
          id?: string;
          recipient_count?: number | null;
          send_at?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          title?: string;
          type?: Database["public"]["Enums"]["notification_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_position_x: number;
          avatar_position_y: number;
          avatar_url: string | null;
          avatar_zoom: number;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_active: boolean;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_position_x?: number;
          avatar_position_y?: number;
          avatar_url?: string | null;
          avatar_zoom?: number;
          created_at?: string;
          email?: string;
          full_name?: string;
          id: string;
          is_active?: boolean;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_position_x?: number;
          avatar_position_y?: number;
          avatar_url?: string | null;
          avatar_zoom?: number;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_contract_versions: {
        Row: {
          change_reason: string | null;
          changed_by: string | null;
          contract_id: string;
          created_at: string;
          ends_at: string | null;
          id: string;
          payment_model: Database["public"]["Enums"]["payment_model"] | null;
          scope_summary: string | null;
          signed_at: string | null;
          starts_at: string | null;
          status: Database["public"]["Enums"]["contract_record_status"] | null;
          total_amount: number | null;
          valid_from: string;
          valid_to: string;
          version_no: number;
        };
        Insert: {
          change_reason?: string | null;
          changed_by?: string | null;
          contract_id: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          payment_model?: Database["public"]["Enums"]["payment_model"] | null;
          scope_summary?: string | null;
          signed_at?: string | null;
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["contract_record_status"] | null;
          total_amount?: number | null;
          valid_from: string;
          valid_to?: string;
          version_no: number;
        };
        Update: {
          change_reason?: string | null;
          changed_by?: string | null;
          contract_id?: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          payment_model?: Database["public"]["Enums"]["payment_model"] | null;
          scope_summary?: string | null;
          signed_at?: string | null;
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["contract_record_status"] | null;
          total_amount?: number | null;
          valid_from?: string;
          valid_to?: string;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_contract_versions_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "project_contracts";
            referencedColumns: ["id"];
          },
        ];
      };
      project_contracts: {
        Row: {
          acceptance_ip: string | null;
          accepted_at: string | null;
          accepted_by_user_id: string | null;
          client_id: string;
          created_at: string;
          created_by: string | null;
          ends_at: string | null;
          id: string;
          payment_model: Database["public"]["Enums"]["payment_model"];
          project_id: string | null;
          scope_summary: string | null;
          signed_at: string | null;
          starts_at: string | null;
          status: Database["public"]["Enums"]["contract_record_status"];
          total_amount: number;
          updated_at: string;
          version_no: number;
        };
        Insert: {
          acceptance_ip?: string | null;
          accepted_at?: string | null;
          accepted_by_user_id?: string | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          id?: string;
          payment_model?: Database["public"]["Enums"]["payment_model"];
          project_id?: string | null;
          scope_summary?: string | null;
          signed_at?: string | null;
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["contract_record_status"];
          total_amount?: number;
          updated_at?: string;
          version_no?: number;
        };
        Update: {
          acceptance_ip?: string | null;
          accepted_at?: string | null;
          accepted_by_user_id?: string | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          id?: string;
          payment_model?: Database["public"]["Enums"]["payment_model"];
          project_id?: string | null;
          scope_summary?: string | null;
          signed_at?: string | null;
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["contract_record_status"];
          total_amount?: number;
          updated_at?: string;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_contracts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "project_contracts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_contracts_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_installments: {
        Row: {
          amount: number;
          client_id: string;
          contract_id: string;
          created_at: string;
          effective_due_date: string | null;
          expected_due_date: string | null;
          id: string;
          installment_type: Database["public"]["Enums"]["project_installment_type"];
          is_blocking: boolean;
          paid_at: string | null;
          percentage: number;
          project_id: string;
          status: Database["public"]["Enums"]["project_installment_status"];
          trigger_type: Database["public"]["Enums"]["project_installment_trigger"];
          updated_at: string;
        };
        Insert: {
          amount: number;
          client_id: string;
          contract_id: string;
          created_at?: string;
          effective_due_date?: string | null;
          expected_due_date?: string | null;
          id?: string;
          installment_type: Database["public"]["Enums"]["project_installment_type"];
          is_blocking?: boolean;
          paid_at?: string | null;
          percentage: number;
          project_id: string;
          status?: Database["public"]["Enums"]["project_installment_status"];
          trigger_type?: Database["public"]["Enums"]["project_installment_trigger"];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          client_id?: string;
          contract_id?: string;
          created_at?: string;
          effective_due_date?: string | null;
          expected_due_date?: string | null;
          id?: string;
          installment_type?: Database["public"]["Enums"]["project_installment_type"];
          is_blocking?: boolean;
          paid_at?: string | null;
          percentage?: number;
          project_id?: string;
          status?: Database["public"]["Enums"]["project_installment_status"];
          trigger_type?: Database["public"]["Enums"]["project_installment_trigger"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_installments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "project_installments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_installments_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "project_contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_installments_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_next_steps: {
        Row: {
          action_type: Database["public"]["Enums"]["next_step_action_type"];
          assigned_to: string | null;
          client_id: string;
          client_responded_at: string | null;
          client_response: string | null;
          client_visible: boolean;
          created_at: string;
          description: string | null;
          due_date: string | null;
          id: string;
          meeting_link: string | null;
          owner: Database["public"]["Enums"]["next_step_owner"];
          project_id: string;
          requires_client_action: boolean;
          sort_order: number;
          status: Database["public"]["Enums"]["next_step_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          action_type?: Database["public"]["Enums"]["next_step_action_type"];
          assigned_to?: string | null;
          client_id: string;
          client_responded_at?: string | null;
          client_response?: string | null;
          client_visible?: boolean;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          meeting_link?: string | null;
          owner?: Database["public"]["Enums"]["next_step_owner"];
          project_id: string;
          requires_client_action?: boolean;
          sort_order?: number;
          status?: Database["public"]["Enums"]["next_step_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          action_type?: Database["public"]["Enums"]["next_step_action_type"];
          assigned_to?: string | null;
          client_id?: string;
          client_responded_at?: string | null;
          client_response?: string | null;
          client_visible?: boolean;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          meeting_link?: string | null;
          owner?: Database["public"]["Enums"]["next_step_owner"];
          project_id?: string;
          requires_client_action?: boolean;
          sort_order?: number;
          status?: Database["public"]["Enums"]["next_step_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_next_steps_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "project_next_steps_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_next_steps_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_subscriptions: {
        Row: {
          amount: number;
          client_id: string;
          created_at: string;
          due_day: number;
          ends_on: string | null;
          grace_days: number;
          id: string;
          is_blocking: boolean;
          label: string;
          project_id: string;
          starts_on: string;
          status: Database["public"]["Enums"]["subscription_status"];
          updated_at: string;
        };
        Insert: {
          amount: number;
          client_id: string;
          created_at?: string;
          due_day: number;
          ends_on?: string | null;
          grace_days?: number;
          id?: string;
          is_blocking?: boolean;
          label: string;
          project_id: string;
          starts_on?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          client_id?: string;
          created_at?: string;
          due_day?: number;
          ends_on?: string | null;
          grace_days?: number;
          id?: string;
          is_blocking?: boolean;
          label?: string;
          project_id?: string;
          starts_on?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_subscriptions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "project_subscriptions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_subscriptions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_validation_rounds: {
        Row: {
          client_id: string;
          client_validated_at: string | null;
          closed_at: string | null;
          created_at: string;
          created_by: string | null;
          feedback: string | null;
          id: string;
          internal_validated_at: string | null;
          project_id: string;
          round_no: number;
          scope_summary: string | null;
          started_at: string;
          status: string;
          updated_at: string;
          validated_by_client: string | null;
          validated_by_internal: string | null;
        };
        Insert: {
          client_id: string;
          client_validated_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          feedback?: string | null;
          id?: string;
          internal_validated_at?: string | null;
          project_id: string;
          round_no: number;
          scope_summary?: string | null;
          started_at?: string;
          status?: string;
          updated_at?: string;
          validated_by_client?: string | null;
          validated_by_internal?: string | null;
        };
        Update: {
          client_id?: string;
          client_validated_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          feedback?: string | null;
          id?: string;
          internal_validated_at?: string | null;
          project_id?: string;
          round_no?: number;
          scope_summary?: string | null;
          started_at?: string;
          status?: string;
          updated_at?: string;
          validated_by_client?: string | null;
          validated_by_internal?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_validation_rounds_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "project_validation_rounds_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_validation_rounds_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          acceptance_notes: string | null;
          accepted_at: string | null;
          accepted_by: string | null;
          archived_at: string | null;
          billing_type: Database["public"]["Enums"]["billing_type"];
          client_id: string;
          client_visible_summary: string | null;
          created_at: string;
          current_stage: string;
          delivered_at: string | null;
          description: string | null;
          expected_delivery_date: string | null;
          id: string;
          internal_notes: string | null;
          manual_status_override: boolean;
          name: string;
          onboarding_checklist: Json;
          onboarding_completed_at: string | null;
          pause_reason: Database["public"]["Enums"]["project_pause_reason"] | null;
          pause_source: Database["public"]["Enums"]["pause_source"] | null;
          production_url: string | null;
          proposal_id: string | null;
          solution_type: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["project_status"];
          tags: string[];
          updated_at: string;
          warranty_period_days: number;
        };
        Insert: {
          acceptance_notes?: string | null;
          accepted_at?: string | null;
          accepted_by?: string | null;
          archived_at?: string | null;
          billing_type?: Database["public"]["Enums"]["billing_type"];
          client_id: string;
          client_visible_summary?: string | null;
          created_at?: string;
          current_stage?: string;
          delivered_at?: string | null;
          description?: string | null;
          expected_delivery_date?: string | null;
          id?: string;
          internal_notes?: string | null;
          manual_status_override?: boolean;
          name: string;
          onboarding_checklist?: Json;
          onboarding_completed_at?: string | null;
          pause_reason?: Database["public"]["Enums"]["project_pause_reason"] | null;
          pause_source?: Database["public"]["Enums"]["pause_source"] | null;
          production_url?: string | null;
          proposal_id?: string | null;
          solution_type?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["project_status"];
          tags?: string[];
          updated_at?: string;
          warranty_period_days?: number;
        };
        Update: {
          acceptance_notes?: string | null;
          accepted_at?: string | null;
          accepted_by?: string | null;
          archived_at?: string | null;
          billing_type?: Database["public"]["Enums"]["billing_type"];
          client_id?: string;
          client_visible_summary?: string | null;
          created_at?: string;
          current_stage?: string;
          delivered_at?: string | null;
          description?: string | null;
          expected_delivery_date?: string | null;
          id?: string;
          internal_notes?: string | null;
          manual_status_override?: boolean;
          name?: string;
          onboarding_checklist?: Json;
          onboarding_completed_at?: string | null;
          pause_reason?: Database["public"]["Enums"]["project_pause_reason"] | null;
          pause_source?: Database["public"]["Enums"]["pause_source"] | null;
          production_url?: string | null;
          proposal_id?: string | null;
          solution_type?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["project_status"];
          tags?: string[];
          updated_at?: string;
          warranty_period_days?: number;
        };
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "projects_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      proposals: {
        Row: {
          approved_at: string | null;
          billing_config: Json;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          document_url: string | null;
          id: string;
          is_expansion: boolean;
          lead_id: string | null;
          observations: string | null;
          payment_conditions: string | null;
          rejected_at: string | null;
          rejection_reason: string | null;
          scope_summary: string | null;
          sent_at: string | null;
          solution_type: string | null;
          status: string;
          technical_document_url: string | null;
          title: string;
          total_amount: number;
          updated_at: string;
          valid_until: string | null;
          viewed_at: string | null;
        };
        Insert: {
          approved_at?: string | null;
          billing_config?: Json;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          document_url?: string | null;
          id?: string;
          is_expansion?: boolean;
          lead_id?: string | null;
          observations?: string | null;
          payment_conditions?: string | null;
          rejected_at?: string | null;
          rejection_reason?: string | null;
          scope_summary?: string | null;
          sent_at?: string | null;
          solution_type?: string | null;
          status?: string;
          technical_document_url?: string | null;
          title: string;
          total_amount?: number;
          updated_at?: string;
          valid_until?: string | null;
          viewed_at?: string | null;
        };
        Update: {
          approved_at?: string | null;
          billing_config?: Json;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          document_url?: string | null;
          id?: string;
          is_expansion?: boolean;
          lead_id?: string | null;
          observations?: string | null;
          payment_conditions?: string | null;
          rejected_at?: string | null;
          rejection_reason?: string | null;
          scope_summary?: string | null;
          sent_at?: string | null;
          solution_type?: string | null;
          status?: string;
          technical_document_url?: string | null;
          title?: string;
          total_amount?: number;
          updated_at?: string;
          valid_until?: string | null;
          viewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "proposals_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposals_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      support_tickets: {
        Row: {
          body: string;
          category: string;
          client_id: string;
          created_at: string;
          first_response_at: string | null;
          id: string;
          in_warranty: boolean;
          internal_notes: string | null;
          priority: string;
          project_id: string | null;
          rated_at: string | null;
          rating: number | null;
          rating_feedback: string | null;
          resolved_at: string | null;
          sla_deadline: string | null;
          status: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          category?: string;
          client_id: string;
          created_at?: string;
          first_response_at?: string | null;
          id?: string;
          in_warranty?: boolean;
          internal_notes?: string | null;
          priority?: string;
          project_id?: string | null;
          rated_at?: string | null;
          rating?: number | null;
          rating_feedback?: string | null;
          resolved_at?: string | null;
          sla_deadline?: string | null;
          status?: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          category?: string;
          client_id?: string;
          created_at?: string;
          first_response_at?: string | null;
          id?: string;
          in_warranty?: boolean;
          internal_notes?: string | null;
          priority?: string;
          project_id?: string | null;
          rated_at?: string | null;
          rating?: number | null;
          rating_feedback?: string | null;
          resolved_at?: string | null;
          sla_deadline?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_tickets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "support_tickets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_tickets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          birth_date: string | null;
          cpf: string | null;
          created_at: string;
          email: string;
          full_name: string;
          gender: Database["public"]["Enums"]["gender_type"] | null;
          id: string;
          is_active: boolean;
          last_login_at: string | null;
          manager_id: string | null;
          must_change_password: boolean;
          phone: string | null;
          role_title: string;
          senioridade: Database["public"]["Enums"]["senioridade_type"] | null;
          system_role: Database["public"]["Enums"]["app_role"] | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          birth_date?: string | null;
          cpf?: string | null;
          created_at?: string;
          email: string;
          full_name: string;
          gender?: Database["public"]["Enums"]["gender_type"] | null;
          id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          manager_id?: string | null;
          must_change_password?: boolean;
          phone?: string | null;
          role_title?: string;
          senioridade?: Database["public"]["Enums"]["senioridade_type"] | null;
          system_role?: Database["public"]["Enums"]["app_role"] | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          birth_date?: string | null;
          cpf?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string;
          gender?: Database["public"]["Enums"]["gender_type"] | null;
          id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          manager_id?: string | null;
          must_change_password?: boolean;
          phone?: string | null;
          role_title?: string;
          senioridade?: Database["public"]["Enums"]["senioridade_type"] | null;
          system_role?: Database["public"]["Enums"]["app_role"] | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      team_tasks: {
        Row: {
          assigned_to: string | null;
          category: string;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          due_date: string | null;
          ends_at: string | null;
          google_event_id: string | null;
          google_meet_link: string | null;
          id: string;
          marketing_event_id: string | null;
          next_step_id: string | null;
          priority: string;
          project_id: string | null;
          role_visibility: string[];
          starts_at: string | null;
          status: string;
          ticket_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          category?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          ends_at?: string | null;
          google_event_id?: string | null;
          google_meet_link?: string | null;
          id?: string;
          marketing_event_id?: string | null;
          next_step_id?: string | null;
          priority?: string;
          project_id?: string | null;
          role_visibility?: string[];
          starts_at?: string | null;
          status?: string;
          ticket_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          category?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          ends_at?: string | null;
          google_event_id?: string | null;
          google_meet_link?: string | null;
          id?: string;
          marketing_event_id?: string | null;
          next_step_id?: string | null;
          priority?: string;
          project_id?: string | null;
          role_visibility?: string[];
          starts_at?: string | null;
          status?: string;
          ticket_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_tasks_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "team_tasks_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_tasks_marketing_event_id_fkey";
            columns: ["marketing_event_id"];
            isOneToOne: false;
            referencedRelation: "marketing_calendar_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_tasks_next_step_id_fkey";
            columns: ["next_step_id"];
            isOneToOne: false;
            referencedRelation: "project_next_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_tasks_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_messages: {
        Row: {
          author_name: string;
          body: string;
          created_at: string;
          id: string;
          sender_role: string;
          ticket_id: string;
        };
        Insert: {
          author_name: string;
          body: string;
          created_at?: string;
          id?: string;
          sender_role: string;
          ticket_id: string;
        };
        Update: {
          author_name?: string;
          body?: string;
          created_at?: string;
          id?: string;
          sender_role?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      timeline_events: {
        Row: {
          actor_user_id: string | null;
          client_id: string;
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json;
          occurred_at: string;
          project_id: string | null;
          source_id: string | null;
          source_table: string | null;
          summary: string;
          title: string;
          visibility: Database["public"]["Enums"]["document_visibility"];
        };
        Insert: {
          actor_user_id?: string | null;
          client_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          project_id?: string | null;
          source_id?: string | null;
          source_table?: string | null;
          summary: string;
          title: string;
          visibility?: Database["public"]["Enums"]["document_visibility"];
        };
        Update: {
          actor_user_id?: string | null;
          client_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          project_id?: string | null;
          source_id?: string | null;
          source_table?: string | null;
          summary?: string;
          title?: string;
          visibility?: Database["public"]["Enums"]["document_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "timeline_events_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "client_financial_summary";
            referencedColumns: ["client_id"];
          },
          {
            foreignKeyName: "timeline_events_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timeline_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      tracked_links: {
        Row: {
          channel: string;
          communication_id: string;
          created_at: string;
          id: string;
          slug: string;
          target_url: string;
        };
        Insert: {
          channel?: string;
          communication_id: string;
          created_at?: string;
          id?: string;
          slug: string;
          target_url: string;
        };
        Update: {
          channel?: string;
          communication_id?: string;
          created_at?: string;
          id?: string;
          slug?: string;
          target_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tracked_links_communication_id_fkey";
            columns: ["communication_id"];
            isOneToOne: false;
            referencedRelation: "communications";
            referencedColumns: ["id"];
          },
        ];
      };
      tracking_events: {
        Row: {
          channel: string;
          communication_id: string;
          created_at: string;
          event_type: string;
          id: string;
          ip: string | null;
          tracked_link_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          channel?: string;
          communication_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          ip?: string | null;
          tracked_link_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          channel?: string;
          communication_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          ip?: string | null;
          tracked_link_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tracking_events_communication_id_fkey";
            columns: ["communication_id"];
            isOneToOne: false;
            referencedRelation: "communications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tracking_events_tracked_link_id_fkey";
            columns: ["tracked_link_id"];
            isOneToOne: false;
            referencedRelation: "tracked_links";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      client_financial_summary: {
        Row: {
          active_contracts: number | null;
          active_subscriptions: number | null;
          client_id: string | null;
          contract_end_calculated: string | null;
          contract_start_calculated: string | null;
          contract_status_calculated: Database["public"]["Enums"]["contract_status"] | null;
          contract_type_calculated: Database["public"]["Enums"]["contract_type"] | null;
          monthly_value: number | null;
          payment_due_day_calculated: number | null;
          project_total_value: number | null;
          scope_summary_calculated: string | null;
        };
        Insert: {
          active_contracts?: never;
          active_subscriptions?: never;
          client_id?: string | null;
          contract_end_calculated?: never;
          contract_start_calculated?: never;
          contract_status_calculated?: never;
          contract_type_calculated?: never;
          monthly_value?: never;
          payment_due_day_calculated?: never;
          project_total_value?: never;
          scope_summary_calculated?: never;
        };
        Update: {
          active_contracts?: never;
          active_subscriptions?: never;
          client_id?: string | null;
          contract_end_calculated?: never;
          contract_start_calculated?: never;
          contract_status_calculated?: never;
          contract_type_calculated?: never;
          monthly_value?: never;
          payment_due_day_calculated?: never;
          project_total_value?: never;
          scope_summary_calculated?: never;
        };
        Relationships: [];
      };
      crm_deals_view: {
        Row: {
          client_id: string | null;
          created_at: string | null;
          deal_id: string | null;
          expected_value: number | null;
          last_activity_at: string | null;
          lead_id: string | null;
          owner_id: string | null;
          project_id: string | null;
          proposal_id: string | null;
          source_id: string | null;
          source_kind: string | null;
          stage: string | null;
          title: string | null;
        };
        Relationships: [];
      };
      project_contract_history: {
        Row: {
          change_reason: string | null;
          changed_by: string | null;
          contract_id: string | null;
          ends_at: string | null;
          is_current: boolean | null;
          payment_model: Database["public"]["Enums"]["payment_model"] | null;
          scope_summary: string | null;
          signed_at: string | null;
          starts_at: string | null;
          status: Database["public"]["Enums"]["contract_record_status"] | null;
          total_amount: number | null;
          valid_from: string | null;
          valid_to: string | null;
          version_no: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      activate_contract_to_project: {
        Args: { p_contract_id: string };
        Returns: Json;
      };
      approve_proposal_to_project: {
        Args: { p_proposal_id: string };
        Returns: Json;
      };
      close_validation_round: {
        Args: { p_feedback?: string; p_round_id: string; p_status: string };
        Returns: Json;
      };
      convert_lead_to_client: {
        Args: { p_lead_id: string; p_overrides?: Json };
        Returns: string;
      };
      create_project_with_billing: { Args: { p_input: Json }; Returns: string };
      get_client_for_portal_user: {
        Args: { _user_id: string };
        Returns: {
          aceite_termos: boolean;
          aceite_termos_at: string | null;
          bairro: string | null;
          birth_date: string | null;
          canal_assinatura: Database["public"]["Enums"]["canal_assinatura_type"] | null;
          cargo_representante: string | null;
          cep: string | null;
          city: string | null;
          client_origin: Database["public"]["Enums"]["client_origin"] | null;
          client_since: string;
          client_type: string;
          cnae: string | null;
          cnpj: string | null;
          complemento: string | null;
          contato_secundario: string | null;
          contract_end: string | null;
          contract_start: string | null;
          contract_status: Database["public"]["Enums"]["contract_status"] | null;
          contract_type: Database["public"]["Enums"]["contract_type"] | null;
          country: string;
          cpf: string | null;
          created_at: string;
          email: string;
          email_financeiro: string | null;
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento_type"] | null;
          full_name: string;
          gender: Database["public"]["Enums"]["gender_type"] | null;
          id: string;
          inscricao_estadual: string | null;
          inscricao_municipal: string | null;
          is_active: boolean;
          limite_credito: number | null;
          logradouro: string | null;
          monthly_value: number;
          must_change_password: boolean;
          nome_fantasia: string | null;
          notes_internal: string | null;
          numero: string | null;
          owner_id: string | null;
          payment_due_day: number | null;
          phone: string | null;
          project_total_value: number;
          razao_social: string | null;
          regime_tributario: Database["public"]["Enums"]["regime_tributario_type"] | null;
          responsavel_financeiro: string | null;
          responsavel_financeiro_phone: string | null;
          rg: string | null;
          scope_summary: string | null;
          sla_hours: number | null;
          state: string | null;
          tags: string[];
          updated_at: string;
          user_id: string | null;
          whatsapp: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "clients";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_client_id_for_portal_user: {
        Args: { _user_id: string };
        Returns: string;
      };
      get_client_id_for_user: { Args: { _user_id: string }; Returns: string };
      has_any_team_role: { Args: { _user_id: string }; Returns: boolean };
      has_comercial_access: { Args: { _user_id: string }; Returns: boolean };
      has_dev_access: { Args: { _user_id: string }; Returns: boolean };
      has_finance_access: { Args: { _user_id: string }; Returns: boolean };
      has_juridico_access: { Args: { _user_id: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_role_in: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      is_admin_or_juridico: { Args: { _user_id: string }; Returns: boolean };
      mark_overdue_charges: { Args: never; Returns: undefined };
      mark_overdue_clients_inadimplente: { Args: never; Returns: undefined };
      mark_validation_client: {
        Args: { p_client_name?: string; p_round_id: string };
        Returns: undefined;
      };
      mark_validation_internal: {
        Args: { p_round_id: string };
        Returns: undefined;
      };
      open_project_support_ticket: {
        Args: {
          p_body: string;
          p_category?: string;
          p_priority?: string;
          p_project_id: string;
          p_subject: string;
        };
        Returns: Json;
      };
      reconcile_inadimplencia_warnings: {
        Args: never;
        Returns: {
          closed: number;
          opened: number;
        }[];
      };
      register_contract_acceptance: {
        Args: { p_contract_id: string; p_ip?: string };
        Returns: Json;
      };
      register_project_acceptance: {
        Args: { p_notes?: string; p_project_id: string };
        Returns: Json;
      };
      start_validation_round: {
        Args: { p_project_id: string; p_scope_summary?: string };
        Returns: string;
      };
      sync_financial_blocks: { Args: never; Returns: undefined };
      sync_projects_from_blocking_charges: { Args: never; Returns: undefined };
      transition_project_contract: {
        Args: {
          p_contract_id: string;
          p_ends_at?: string;
          p_reason?: string;
          p_signed_at?: string;
          p_to_status: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      app_role:
        | "admin_super"
        | "admin"
        | "cliente"
        | "marketing"
        | "developer"
        | "support"
        | "financeiro"
        | "comercial"
        | "juridico"
        | "designer"
        | "po";
      billing_type: "mensal" | "projeto";
      canal_assinatura_type: "manual" | "govbr" | "clicksign" | "docusign" | "eletronico";
      client_origin: "lead" | "indicacao" | "inbound";
      contract_record_status: "rascunho" | "em_validacao" | "ativo" | "encerrado" | "cancelado";
      contract_status: "ativo" | "inadimplente" | "cancelado" | "encerrado";
      contract_type: "projeto" | "recorrente" | "hibrido";
      document_type: "contrato" | "aditivo" | "nota_fiscal" | "codigo_fonte" | "outro";
      document_visibility: "cliente" | "interno" | "ambos";
      forma_pagamento_type: "pix" | "boleto" | "cartao" | "transferencia" | "dinheiro";
      gender_type: "masculino" | "feminino";
      invoice_status: "pendente" | "pago" | "atrasado" | "cancelado" | "agendada";
      next_step_action_type:
        | "geral"
        | "reuniao"
        | "documento"
        | "aprovacao"
        | "informacao"
        | "feedback"
        | "acesso"
        | "conteudo";
      next_step_owner: "elkys" | "cliente" | "compartilhado";
      next_step_status: "pendente" | "em_andamento" | "concluido" | "cancelado";
      notification_status: "rascunho" | "agendada" | "enviando" | "enviada" | "falha";
      notification_type: "manutencao" | "atualizacao" | "otimizacao" | "alerta" | "personalizado";
      pause_source: "automatico" | "manual";
      payment_model: "50_50" | "a_vista" | "personalizado";
      project_installment_status: "agendada" | "pendente" | "paga" | "atrasada" | "cancelada";
      project_installment_trigger: "assinatura" | "conclusao" | "data_fixa";
      project_installment_type: "entrada" | "entrega";
      project_pause_reason: "financeiro" | "dependencia_cliente" | "interno" | "escopo" | "outro";
      project_status: "em_andamento" | "concluido" | "pausado" | "cancelado" | "negociacao";
      regime_tributario_type: "mei" | "simples" | "lucro_presumido" | "lucro_real";
      senioridade_type: "estagiario" | "junior" | "pleno" | "senior" | "lead" | "gerente";
      subscription_status: "agendada" | "ativa" | "pausada" | "encerrada";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "admin_super",
        "admin",
        "cliente",
        "marketing",
        "developer",
        "support",
        "financeiro",
        "comercial",
        "juridico",
        "designer",
        "po",
      ],
      billing_type: ["mensal", "projeto"],
      canal_assinatura_type: ["manual", "govbr", "clicksign", "docusign", "eletronico"],
      client_origin: ["lead", "indicacao", "inbound"],
      contract_record_status: ["rascunho", "em_validacao", "ativo", "encerrado", "cancelado"],
      contract_status: ["ativo", "inadimplente", "cancelado", "encerrado"],
      contract_type: ["projeto", "recorrente", "hibrido"],
      document_type: ["contrato", "aditivo", "nota_fiscal", "codigo_fonte", "outro"],
      document_visibility: ["cliente", "interno", "ambos"],
      forma_pagamento_type: ["pix", "boleto", "cartao", "transferencia", "dinheiro"],
      gender_type: ["masculino", "feminino"],
      invoice_status: ["pendente", "pago", "atrasado", "cancelado", "agendada"],
      next_step_action_type: [
        "geral",
        "reuniao",
        "documento",
        "aprovacao",
        "informacao",
        "feedback",
        "acesso",
        "conteudo",
      ],
      next_step_owner: ["elkys", "cliente", "compartilhado"],
      next_step_status: ["pendente", "em_andamento", "concluido", "cancelado"],
      notification_status: ["rascunho", "agendada", "enviando", "enviada", "falha"],
      notification_type: ["manutencao", "atualizacao", "otimizacao", "alerta", "personalizado"],
      pause_source: ["automatico", "manual"],
      payment_model: ["50_50", "a_vista", "personalizado"],
      project_installment_status: ["agendada", "pendente", "paga", "atrasada", "cancelada"],
      project_installment_trigger: ["assinatura", "conclusao", "data_fixa"],
      project_installment_type: ["entrada", "entrega"],
      project_pause_reason: ["financeiro", "dependencia_cliente", "interno", "escopo", "outro"],
      project_status: ["em_andamento", "concluido", "pausado", "cancelado", "negociacao"],
      regime_tributario_type: ["mei", "simples", "lucro_presumido", "lucro_real"],
      senioridade_type: ["estagiario", "junior", "pleno", "senior", "lead", "gerente"],
      subscription_status: ["agendada", "ativa", "pausada", "encerrada"],
    },
  },
} as const;
