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
      activities: {
        Row: {
          actor_id: string | null
          client_id: string | null
          contact_id: string | null
          created_at: string
          created_by_ai: boolean
          document_id: string | null
          grant_project_id: string | null
          id: string
          metadata: Json
          organization_id: string
          summary: string
          task_id: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by_ai?: boolean
          document_id?: string | null
          grant_project_id?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          summary: string
          task_id?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by_ai?: boolean
          document_id?: string | null
          grant_project_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          summary?: string
          task_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audit_logs: {
        Row: {
          created_at: string
          id: string
          input_summary: string | null
          latency_ms: number | null
          model: string | null
          organization_id: string
          output: Json | null
          sources: Json | null
          use_case: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_summary?: string | null
          latency_ms?: number | null
          model?: string | null
          organization_id: string
          output?: Json | null
          sources?: Json | null
          use_case: string
        }
        Update: {
          created_at?: string
          id?: string
          input_summary?: string | null
          latency_ms?: number | null
          model?: string | null
          organization_id?: string
          output?: Json | null
          sources?: Json | null
          use_case?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      application_answers: {
        Row: {
          ai_draft: string | null
          final_text: string | null
          id: string
          organization_id: string
          question_id: string
          updated_at: string
          user_draft: string | null
        }
        Insert: {
          ai_draft?: string | null
          final_text?: string | null
          id?: string
          organization_id: string
          question_id: string
          updated_at?: string
          user_draft?: string | null
        }
        Update: {
          ai_draft?: string | null
          final_text?: string | null
          id?: string
          organization_id?: string
          question_id?: string
          updated_at?: string
          user_draft?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_answers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "application_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      application_questions: {
        Row: {
          id: string
          order_index: number
          organization_id: string
          prompt: string
          section_id: string
        }
        Insert: {
          id?: string
          order_index: number
          organization_id: string
          prompt: string
          section_id: string
        }
        Update: {
          id?: string
          order_index?: number
          organization_id?: string
          prompt?: string
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "application_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      application_sections: {
        Row: {
          application_id: string
          id: string
          order_index: number
          organization_id: string
          title: string
        }
        Insert: {
          application_id: string
          id?: string
          order_index: number
          organization_id: string
          title: string
        }
        Update: {
          application_id?: string
          id?: string
          order_index?: number
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_sections_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "grant_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_sections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          approved_amount: number
          category: string
          grant_project_id: string
          id: string
          organization_id: string
          supplier_id: string | null
        }
        Insert: {
          approved_amount?: number
          category: string
          grant_project_id: string
          id?: string
          organization_id: string
          supplier_id?: string | null
        }
        Update: {
          approved_amount?: number
          category?: string
          grant_project_id?: string
          id?: string
          organization_id?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "project_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_expenses: {
        Row: {
          claim_id: string
          claimed_amount: number
          created_at: string
          expense_id: string
          organization_id: string
        }
        Insert: {
          claim_id: string
          claimed_amount: number
          created_at?: string
          expense_id: string
          organization_id: string
        }
        Update: {
          claim_id?: string
          claimed_amount?: number
          created_at?: string
          expense_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_expenses_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_expenses_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_requirements: {
        Row: {
          claim_id: string
          id: string
          label: string
          organization_id: string
          status: string
        }
        Insert: {
          claim_id: string
          id?: string
          label: string
          organization_id: string
          status?: string
        }
        Update: {
          claim_id?: string
          id?: string
          label?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_requirements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_requirements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          ai_version: string | null
          approved_amount: number | null
          claim_number: string | null
          claimed_amount: number | null
          created_at: string
          due_date: string | null
          edited_version: string | null
          eligible_expenses: number | null
          final_version: string | null
          grant_project_id: string
          id: string
          is_template: boolean
          organization_id: string
          paid_amount: number | null
          period_end: string | null
          period_start: string | null
          progress_report: string | null
          status: string
          submission_date: string | null
        }
        Insert: {
          ai_version?: string | null
          approved_amount?: number | null
          claim_number?: string | null
          claimed_amount?: number | null
          created_at?: string
          due_date?: string | null
          edited_version?: string | null
          eligible_expenses?: number | null
          final_version?: string | null
          grant_project_id: string
          id?: string
          is_template?: boolean
          organization_id: string
          paid_amount?: number | null
          period_end?: string | null
          period_start?: string | null
          progress_report?: string | null
          status?: string
          submission_date?: string | null
        }
        Update: {
          ai_version?: string | null
          approved_amount?: number | null
          claim_number?: string | null
          claimed_amount?: number | null
          created_at?: string
          due_date?: string | null
          edited_version?: string | null
          eligible_expenses?: number | null
          final_version?: string | null
          grant_project_id?: string
          id?: string
          is_template?: boolean
          organization_id?: string
          paid_amount?: number | null
          period_end?: string | null
          period_start?: string | null
          progress_report?: string | null
          status?: string
          submission_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_access: {
        Row: {
          client_id: string
          granted_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          client_id: string
          granted_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          client_id?: string
          granted_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_users: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          current_needs: string | null
          id: string
          last_activity_at: string | null
          name: string
          needs_updated_at: string | null
          needs_updated_by: string | null
          notes: string | null
          organization_id: string
          owner_id: string | null
          parent_client_id: string | null
          sector: string | null
          status: string
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          current_needs?: string | null
          id?: string
          last_activity_at?: string | null
          name: string
          needs_updated_at?: string | null
          needs_updated_by?: string | null
          notes?: string | null
          organization_id: string
          owner_id?: string | null
          parent_client_id?: string | null
          sector?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          current_needs?: string | null
          id?: string
          last_activity_at?: string | null
          name?: string
          needs_updated_at?: string | null
          needs_updated_by?: string | null
          notes?: string | null
          organization_id?: string
          owner_id?: string | null
          parent_client_id?: string | null
          sector?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_needs_updated_by_fkey"
            columns: ["needs_updated_by"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          organization_id: string
          phone: string | null
          role: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          organization_id: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_links: {
        Row: {
          created_at: string
          document_id: string
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          relation_type: string | null
        }
        Insert: {
          created_at?: string
          document_id: string
          entity_id: string
          entity_type: string
          id?: string
          organization_id: string
          relation_type?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
          relation_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          claim_id: string | null
          client_id: string
          created_at: string
          document_type: string
          due_date: string | null
          grant_project_id: string | null
          id: string
          instructions: string | null
          organization_id: string
          received_at: string | null
          requested_at: string | null
          requested_from_contact_id: string | null
          status: string
          title: string
          updated_at: string
          validated_at: string | null
          visible_in_client_portal: boolean
        }
        Insert: {
          claim_id?: string | null
          client_id: string
          created_at?: string
          document_type: string
          due_date?: string | null
          grant_project_id?: string | null
          id?: string
          instructions?: string | null
          organization_id: string
          received_at?: string | null
          requested_at?: string | null
          requested_from_contact_id?: string | null
          status?: string
          title: string
          updated_at?: string
          validated_at?: string | null
          visible_in_client_portal?: boolean
        }
        Update: {
          claim_id?: string | null
          client_id?: string
          created_at?: string
          document_type?: string
          due_date?: string | null
          grant_project_id?: string | null
          id?: string
          instructions?: string | null
          organization_id?: string
          received_at?: string | null
          requested_at?: string | null
          requested_from_contact_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          validated_at?: string | null
          visible_in_client_portal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_requested_from_contact_id_fkey"
            columns: ["requested_from_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          document_id: string
          id: string
          organization_id: string
          storage_path: string
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          organization_id: string
          storage_path: string
          uploaded_by?: string | null
          version_number: number
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          organization_id?: string
          storage_path?: string
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          client_id: string | null
          created_at: string
          filename: string
          grant_project_id: string | null
          id: string
          mime_type: string | null
          organization_id: string
          size: number | null
          source: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          category: string
          client_id?: string | null
          created_at?: string
          filename: string
          grant_project_id?: string | null
          id?: string
          mime_type?: string | null
          organization_id: string
          size?: number | null
          source?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          client_id?: string | null
          created_at?: string
          filename?: string
          grant_project_id?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string
          size?: number | null
          source?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          body: string | null
          cc_emails: string[] | null
          classification: string | null
          client_id: string | null
          contact_id: string | null
          created_at: string
          from_email: string | null
          gmail_connection_id: string
          gmail_message_id: string
          gmail_thread_id: string | null
          grant_project_id: string | null
          id: string
          organization_id: string
          received_at: string | null
          requires_action: boolean
          snippet: string | null
          subject: string | null
          to_emails: string[] | null
        }
        Insert: {
          body?: string | null
          cc_emails?: string[] | null
          classification?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          from_email?: string | null
          gmail_connection_id: string
          gmail_message_id: string
          gmail_thread_id?: string | null
          grant_project_id?: string | null
          id?: string
          organization_id: string
          received_at?: string | null
          requires_action?: boolean
          snippet?: string | null
          subject?: string | null
          to_emails?: string[] | null
        }
        Update: {
          body?: string | null
          cc_emails?: string[] | null
          classification?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          from_email?: string | null
          gmail_connection_id?: string
          gmail_message_id?: string
          gmail_thread_id?: string | null
          grant_project_id?: string | null
          id?: string
          organization_id?: string
          received_at?: string | null
          requires_action?: boolean
          snippet?: string | null
          subject?: string | null
          to_emails?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_gmail_connection_id_fkey"
            columns: ["gmail_connection_id"]
            isOneToOne: false
            referencedRelation: "gmail_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expected_invoices: {
        Row: {
          expected_date: string
          id: string
          linked_expense_id: string | null
          organization_id: string
          status: string
          supplier_id: string
        }
        Insert: {
          expected_date: string
          id?: string
          linked_expense_id?: string | null
          organization_id: string
          status?: string
          supplier_id: string
        }
        Update: {
          expected_date?: string
          id?: string
          linked_expense_id?: string | null
          organization_id?: string
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expected_invoices_linked_expense_id_fkey"
            columns: ["linked_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expected_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expected_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "project_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          budget_line_id: string | null
          created_at: string
          eligible_amount: number | null
          grant_project_id: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          organization_id: string
          status: string
          subtotal: number | null
          supplier_id: string | null
          tax: number | null
          total: number | null
        }
        Insert: {
          budget_line_id?: string | null
          created_at?: string
          eligible_amount?: number | null
          grant_project_id: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          organization_id: string
          status?: string
          subtotal?: number | null
          supplier_id?: string | null
          tax?: number | null
          total?: number | null
        }
        Update: {
          budget_line_id?: string | null
          created_at?: string
          eligible_amount?: number | null
          grant_project_id?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          organization_id?: string
          status?: string
          subtotal?: number | null
          supplier_id?: string | null
          tax?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_line_actuals"
            referencedColumns: ["budget_line_id"]
          },
          {
            foreignKeyName: "expenses_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "project_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_awards: {
        Row: {
          agreement_end_date: string | null
          agreement_number: string | null
          agreement_start_date: string | null
          amount: number | null
          created_at: string
          description: string | null
          detected_at: string
          federal_organization: string | null
          id: string
          location: string | null
          opportunity_id: string | null
          organization_id: string
          program_name: string | null
          project_title: string | null
          raw_content: string | null
          recipient_name: string | null
          recipient_type: string | null
          source_system: string
          source_url: string
        }
        Insert: {
          agreement_end_date?: string | null
          agreement_number?: string | null
          agreement_start_date?: string | null
          amount?: number | null
          created_at?: string
          description?: string | null
          detected_at?: string
          federal_organization?: string | null
          id?: string
          location?: string | null
          opportunity_id?: string | null
          organization_id: string
          program_name?: string | null
          project_title?: string | null
          raw_content?: string | null
          recipient_name?: string | null
          recipient_type?: string | null
          source_system?: string
          source_url: string
        }
        Update: {
          agreement_end_date?: string | null
          agreement_number?: string | null
          agreement_start_date?: string | null
          amount?: number | null
          created_at?: string
          description?: string | null
          detected_at?: string
          federal_organization?: string | null
          id?: string
          location?: string | null
          opportunity_id?: string | null
          organization_id?: string
          program_name?: string | null
          project_title?: string | null
          raw_content?: string | null
          recipient_name?: string | null
          recipient_type?: string | null
          source_system?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_awards_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "funding_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_awards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_collection_runs: {
        Row: {
          created_at: string
          created_count: number
          discovered_count: number
          error_message: string | null
          finished_at: string | null
          id: string
          metadata: Json | null
          organization_id: string
          source_id: string
          started_at: string
          status: string
          updated_count: number
        }
        Insert: {
          created_at?: string
          created_count?: number
          discovered_count?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          source_id: string
          started_at?: string
          status?: string
          updated_count?: number
        }
        Update: {
          created_at?: string
          created_count?: number
          discovered_count?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          source_id?: string
          started_at?: string
          status?: string
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "funding_collection_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_collection_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "funding_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_opportunities: {
        Row: {
          assessment_criteria: string | null
          audience_classified_at: string | null
          availability_status: string
          business_relevance_reason: string | null
          business_relevance_score: number
          canonical_key: string | null
          categories: string[] | null
          deadline: string | null
          deep_read_at: string | null
          discovered_at: string
          eligibility: string | null
          eligibility_criteria: string | null
          eligible_expenses: string[]
          eligible_sectors: string[]
          expected_open_date: string | null
          external_url: string | null
          funding_formula: string | null
          funding_rate: number | null
          funding_rate_max: number | null
          funding_type: string | null
          government_priorities: string[]
          id: string
          intake_end_at: string | null
          intake_start_at: string | null
          last_checked_at: string | null
          last_verified_at: string | null
          max_amount: number | null
          min_amount: number | null
          min_eligible_spend: number | null
          notes: string | null
          official_page_updated_at: string | null
          official_source_id: string | null
          official_url: string | null
          open_date: string | null
          organization: string | null
          organization_id: string
          preparation_documents: string[]
          preparation_notes: string | null
          preparation_source_url: string | null
          private_contribution_min_rate: number | null
          raw_content: string | null
          relevance_score: number | null
          search_aliases: string[]
          source: string | null
          source_updated_at: string | null
          stacking_limit_rate: number | null
          status: string
          summary: string | null
          target_audience: string
          territory: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          assessment_criteria?: string | null
          audience_classified_at?: string | null
          availability_status?: string
          business_relevance_reason?: string | null
          business_relevance_score?: number
          canonical_key?: string | null
          categories?: string[] | null
          deadline?: string | null
          deep_read_at?: string | null
          discovered_at?: string
          eligibility?: string | null
          eligibility_criteria?: string | null
          eligible_expenses?: string[]
          eligible_sectors?: string[]
          expected_open_date?: string | null
          external_url?: string | null
          funding_formula?: string | null
          funding_rate?: number | null
          funding_rate_max?: number | null
          funding_type?: string | null
          government_priorities?: string[]
          id?: string
          intake_end_at?: string | null
          intake_start_at?: string | null
          last_checked_at?: string | null
          last_verified_at?: string | null
          max_amount?: number | null
          min_amount?: number | null
          min_eligible_spend?: number | null
          notes?: string | null
          official_page_updated_at?: string | null
          official_source_id?: string | null
          official_url?: string | null
          open_date?: string | null
          organization?: string | null
          organization_id: string
          preparation_documents?: string[]
          preparation_notes?: string | null
          preparation_source_url?: string | null
          private_contribution_min_rate?: number | null
          raw_content?: string | null
          relevance_score?: number | null
          search_aliases?: string[]
          source?: string | null
          source_updated_at?: string | null
          stacking_limit_rate?: number | null
          status?: string
          summary?: string | null
          target_audience?: string
          territory?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          assessment_criteria?: string | null
          audience_classified_at?: string | null
          availability_status?: string
          business_relevance_reason?: string | null
          business_relevance_score?: number
          canonical_key?: string | null
          categories?: string[] | null
          deadline?: string | null
          deep_read_at?: string | null
          discovered_at?: string
          eligibility?: string | null
          eligibility_criteria?: string | null
          eligible_expenses?: string[]
          eligible_sectors?: string[]
          expected_open_date?: string | null
          external_url?: string | null
          funding_formula?: string | null
          funding_rate?: number | null
          funding_rate_max?: number | null
          funding_type?: string | null
          government_priorities?: string[]
          id?: string
          intake_end_at?: string | null
          intake_start_at?: string | null
          last_checked_at?: string | null
          last_verified_at?: string | null
          max_amount?: number | null
          min_amount?: number | null
          min_eligible_spend?: number | null
          notes?: string | null
          official_page_updated_at?: string | null
          official_source_id?: string | null
          official_url?: string | null
          open_date?: string | null
          organization?: string | null
          organization_id?: string
          preparation_documents?: string[]
          preparation_notes?: string | null
          preparation_source_url?: string | null
          private_contribution_min_rate?: number | null
          raw_content?: string | null
          relevance_score?: number | null
          search_aliases?: string[]
          source?: string | null
          source_updated_at?: string | null
          stacking_limit_rate?: number | null
          status?: string
          summary?: string | null
          target_audience?: string
          territory?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_opportunities_official_source_id_fkey"
            columns: ["official_source_id"]
            isOneToOne: false
            referencedRelation: "funding_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_opportunity_changes: {
        Row: {
          change_type: string
          created_at: string
          detected_at: string
          field_name: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          opportunity_id: string
          organization_id: string
          source_id: string | null
          summary: string | null
        }
        Insert: {
          change_type: string
          created_at?: string
          detected_at?: string
          field_name?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          opportunity_id: string
          organization_id: string
          source_id?: string | null
          summary?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          detected_at?: string
          field_name?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          opportunity_id?: string
          organization_id?: string
          source_id?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_opportunity_changes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "funding_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_opportunity_changes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_opportunity_changes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "funding_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_opportunity_sources: {
        Row: {
          created_at: string
          first_detected_at: string
          id: string
          last_detected_at: string
          match_status: string
          opportunity_id: string
          organization_id: string
          raw_metadata: Json | null
          source_id: string
          source_url: string
        }
        Insert: {
          created_at?: string
          first_detected_at?: string
          id?: string
          last_detected_at?: string
          match_status?: string
          opportunity_id: string
          organization_id: string
          raw_metadata?: Json | null
          source_id: string
          source_url: string
        }
        Update: {
          created_at?: string
          first_detected_at?: string
          id?: string
          last_detected_at?: string
          match_status?: string
          opportunity_id?: string
          organization_id?: string
          raw_metadata?: Json | null
          source_id?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_opportunity_sources_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "funding_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_opportunity_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_opportunity_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "funding_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_opportunity_territories: {
        Row: {
          country_code: string
          created_at: string
          id: string
          mrc_equivalent: string | null
          municipality: string | null
          opportunity_id: string
          organization_id: string
          province_territory: string | null
          region: string | null
          scope_level: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          id?: string
          mrc_equivalent?: string | null
          municipality?: string | null
          opportunity_id: string
          organization_id: string
          province_territory?: string | null
          region?: string | null
          scope_level: string
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          mrc_equivalent?: string | null
          municipality?: string | null
          opportunity_id?: string
          organization_id?: string
          province_territory?: string | null
          region?: string | null
          scope_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_opportunity_territories_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "funding_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_opportunity_territories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_sources: {
        Row: {
          active: boolean
          base_url: string
          collection_method: string
          created_at: string
          geographic_level: string
          health_status: string
          id: string
          is_official: boolean
          last_checked_at: string | null
          last_error: string | null
          last_success_at: string | null
          name: string
          notes: string | null
          organization_id: string
          priority: number
          source_family: string
          territory_label: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_url: string
          collection_method?: string
          created_at?: string
          geographic_level?: string
          health_status?: string
          id?: string
          is_official?: boolean
          last_checked_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          name: string
          notes?: string | null
          organization_id: string
          priority?: number
          source_family?: string
          territory_label?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_url?: string
          collection_method?: string
          created_at?: string
          geographic_level?: string
          health_status?: string
          id?: string
          is_official?: boolean
          last_checked_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          priority?: number
          source_family?: string
          territory_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_connections: {
        Row: {
          access_token_ref: string | null
          connected_user_id: string | null
          created_at: string
          gmail_email: string
          id: string
          organization_id: string
          refresh_token_ref: string | null
          status: string
        }
        Insert: {
          access_token_ref?: string | null
          connected_user_id?: string | null
          created_at?: string
          gmail_email: string
          id?: string
          organization_id: string
          refresh_token_ref?: string | null
          status?: string
        }
        Update: {
          access_token_ref?: string | null
          connected_user_id?: string | null
          created_at?: string
          gmail_email?: string
          id?: string
          organization_id?: string
          refresh_token_ref?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_connections_connected_user_id_fkey"
            columns: ["connected_user_id"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_agreements: {
        Row: {
          budget_constraints: string | null
          claim_frequency: string | null
          created_at: string
          eligible_expense_period_end: string | null
          eligible_expense_period_start: string | null
          grant_amount: number | null
          grant_project_id: string
          grant_rate: number | null
          id: string
          organization_id: string
          project_end: string | null
          project_start: string | null
          raw_ai_output: Json | null
          reporting_requirements: string | null
          required_documents: string[] | null
          special_conditions: string | null
          supplier_rules: string | null
          validated_data: Json | null
          validation_date: string | null
          validation_user_id: string | null
        }
        Insert: {
          budget_constraints?: string | null
          claim_frequency?: string | null
          created_at?: string
          eligible_expense_period_end?: string | null
          eligible_expense_period_start?: string | null
          grant_amount?: number | null
          grant_project_id: string
          grant_rate?: number | null
          id?: string
          organization_id: string
          project_end?: string | null
          project_start?: string | null
          raw_ai_output?: Json | null
          reporting_requirements?: string | null
          required_documents?: string[] | null
          special_conditions?: string | null
          supplier_rules?: string | null
          validated_data?: Json | null
          validation_date?: string | null
          validation_user_id?: string | null
        }
        Update: {
          budget_constraints?: string | null
          claim_frequency?: string | null
          created_at?: string
          eligible_expense_period_end?: string | null
          eligible_expense_period_start?: string | null
          grant_amount?: number | null
          grant_project_id?: string
          grant_rate?: number | null
          id?: string
          organization_id?: string
          project_end?: string | null
          project_start?: string | null
          raw_ai_output?: Json | null
          reporting_requirements?: string | null
          required_documents?: string[] | null
          special_conditions?: string | null
          supplier_rules?: string | null
          validated_data?: Json | null
          validation_date?: string | null
          validation_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grant_agreements_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_agreements_validation_user_id_fkey"
            columns: ["validation_user_id"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_applications: {
        Row: {
          accepted_reference: boolean
          created_at: string
          grant_project_id: string
          id: string
          organization_id: string
          status: string
        }
        Insert: {
          accepted_reference?: boolean
          created_at?: string
          grant_project_id: string
          id?: string
          organization_id: string
          status?: string
        }
        Update: {
          accepted_reference?: boolean
          created_at?: string
          grant_project_id?: string
          id?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_applications_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_programs: {
        Row: {
          agency: string | null
          application_process: string | null
          claim_process: string | null
          created_at: string
          description: string | null
          eligible_expenses: string | null
          id: string
          ineligible_expenses: string | null
          internal_notes: string | null
          max_aid_amount: number | null
          name: string
          organization_id: string
          program_type: string | null
          required_documents: string[] | null
          territory: string | null
          typical_aid_rate: number | null
          typical_frequency: string | null
        }
        Insert: {
          agency?: string | null
          application_process?: string | null
          claim_process?: string | null
          created_at?: string
          description?: string | null
          eligible_expenses?: string | null
          id?: string
          ineligible_expenses?: string | null
          internal_notes?: string | null
          max_aid_amount?: number | null
          name: string
          organization_id: string
          program_type?: string | null
          required_documents?: string[] | null
          territory?: string | null
          typical_aid_rate?: number | null
          typical_frequency?: string | null
        }
        Update: {
          agency?: string | null
          application_process?: string | null
          claim_process?: string | null
          created_at?: string
          description?: string | null
          eligible_expenses?: string | null
          id?: string
          ineligible_expenses?: string | null
          internal_notes?: string | null
          max_aid_amount?: number | null
          name?: string
          organization_id?: string
          program_type?: string | null
          required_documents?: string[] | null
          territory?: string | null
          typical_aid_rate?: number | null
          typical_frequency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grant_programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_projects: {
        Row: {
          approved_grant_amount: number | null
          claim_frequency: string | null
          client_id: string
          created_at: string
          description: string | null
          grant_rate: number | null
          health_score: number | null
          id: string
          internal_target_end_date: string | null
          name: string
          official_end_date: string | null
          official_start_date: string | null
          organization_id: string
          owner_id: string | null
          program_id: string
          status: string
          total_project_cost: number | null
          updated_at: string
        }
        Insert: {
          approved_grant_amount?: number | null
          claim_frequency?: string | null
          client_id: string
          created_at?: string
          description?: string | null
          grant_rate?: number | null
          health_score?: number | null
          id?: string
          internal_target_end_date?: string | null
          name: string
          official_end_date?: string | null
          official_start_date?: string | null
          organization_id: string
          owner_id?: string | null
          program_id: string
          status?: string
          total_project_cost?: number | null
          updated_at?: string
        }
        Update: {
          approved_grant_amount?: number | null
          claim_frequency?: string | null
          client_id?: string
          created_at?: string
          description?: string | null
          grant_rate?: number | null
          health_score?: number | null
          id?: string
          internal_target_end_date?: string | null
          name?: string
          official_end_date?: string | null
          official_start_date?: string | null
          organization_id?: string
          owner_id?: string | null
          program_id?: string
          status?: string
          total_project_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_projects_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "grant_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_insights: {
        Row: {
          content: string
          id: string
          linked_task_id: string | null
          meeting_id: string
          organization_id: string
          status: string
          type: string
        }
        Insert: {
          content: string
          id?: string
          linked_task_id?: string | null
          meeting_id: string
          organization_id: string
          status?: string
          type: string
        }
        Update: {
          content?: string
          id?: string
          linked_task_id?: string | null
          meeting_id?: string
          organization_id?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_insights_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_insights_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          audio_retention: string
          audio_storage_path: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          ended_at: string | null
          grant_project_id: string | null
          id: string
          opportunity_id: string | null
          organization_id: string
          started_at: string | null
          title: string | null
          transcript: string | null
        }
        Insert: {
          audio_retention?: string
          audio_storage_path?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          grant_project_id?: string | null
          id?: string
          opportunity_id?: string | null
          organization_id: string
          started_at?: string | null
          title?: string | null
          transcript?: string | null
        }
        Update: {
          audio_retention?: string
          audio_storage_path?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          grant_project_id?: string | null
          id?: string
          opportunity_id?: string | null
          organization_id?: string
          started_at?: string | null
          title?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          created_at: string
          grant_project_id: string
          id: string
          internal_due_date: string | null
          official_due_date: string | null
          organization_id: string
          owner_id: string | null
          priority: string
          source: string
          status: string
          title: string
          type: string
          visible_in_client_portal: boolean
        }
        Insert: {
          created_at?: string
          grant_project_id: string
          id?: string
          internal_due_date?: string | null
          official_due_date?: string | null
          organization_id: string
          owner_id?: string | null
          priority?: string
          source?: string
          status?: string
          title: string
          type: string
          visible_in_client_portal?: boolean
        }
        Update: {
          created_at?: string
          grant_project_id?: string
          id?: string
          internal_due_date?: string | null
          official_due_date?: string | null
          organization_id?: string
          owner_id?: string | null
          priority?: string
          source?: string
          status?: string
          title?: string
          type?: string
          visible_in_client_portal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "milestones_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string | null
          organization_id: string
          read: boolean
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string | null
          organization_id: string
          read?: boolean
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string | null
          organization_id?: string
          read?: boolean
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          client_id: string
          contact_id: string | null
          created_at: string
          estimated_value: number | null
          id: string
          next_action: string | null
          organization_id: string
          owner_id: string | null
          potential_program: string | null
          probability: number | null
          stage: string
        }
        Insert: {
          client_id: string
          contact_id?: string | null
          created_at?: string
          estimated_value?: number | null
          id?: string
          next_action?: string | null
          organization_id: string
          owner_id?: string | null
          potential_program?: string | null
          probability?: number | null
          stage?: string
        }
        Update: {
          client_id?: string
          contact_id?: string | null
          created_at?: string
          estimated_value?: number | null
          id?: string
          next_action?: string | null
          organization_id?: string
          owner_id?: string | null
          potential_program?: string | null
          probability?: number | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_potential_program_fkey"
            columns: ["potential_program"]
            isOneToOne: false
            referencedRelation: "grant_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      program_knowledge_items: {
        Row: {
          confidence: number | null
          content: string
          created_at: string
          id: string
          organization_id: string
          program_id: string
          source: string | null
          type: string
          validated_by: string | null
          validated_by_user: boolean
        }
        Insert: {
          confidence?: number | null
          content: string
          created_at?: string
          id?: string
          organization_id: string
          program_id: string
          source?: string | null
          type: string
          validated_by?: string | null
          validated_by_user?: boolean
        }
        Update: {
          confidence?: number | null
          content?: string
          created_at?: string
          id?: string
          organization_id?: string
          program_id?: string
          source?: string | null
          type?: string
          validated_by?: string | null
          validated_by_user?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "program_knowledge_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_knowledge_items_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "grant_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_knowledge_items_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_suppliers: {
        Row: {
          billing_frequency: string | null
          budget_amount: number | null
          contact: string | null
          expected_invoice_day: number | null
          grant_project_id: string
          id: string
          invoice_description_requirements: string | null
          name: string
          notes: string | null
          organization_id: string
        }
        Insert: {
          billing_frequency?: string | null
          budget_amount?: number | null
          contact?: string | null
          expected_invoice_day?: number | null
          grant_project_id: string
          id?: string
          invoice_description_requirements?: string | null
          name: string
          notes?: string | null
          organization_id: string
        }
        Update: {
          billing_frequency?: string | null
          budget_amount?: number | null
          contact?: string | null
          expected_invoice_day?: number | null
          grant_project_id?: string
          id?: string
          invoice_description_requirements?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_suppliers_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_rules: {
        Row: {
          applies_to: string
          days_before: number
          id: string
          organization_id: string
        }
        Insert: {
          applies_to: string
          days_before: number
          id?: string
          organization_id: string
        }
        Update: {
          applies_to?: string
          days_before?: number
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          created_at: string
          created_by_ai: boolean
          description: string | null
          due_date: string | null
          grant_project_id: string | null
          id: string
          organization_id: string
          priority: string
          source: string
          source_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by_ai?: boolean
          description?: string | null
          due_date?: string | null
          grant_project_id?: string | null
          id?: string
          organization_id: string
          priority?: string
          source?: string
          source_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by_ai?: boolean
          description?: string | null
          due_date?: string | null
          grant_project_id?: string | null
          id?: string
          organization_id?: string
          priority?: string
          source?: string
          source_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      budget_line_actuals: {
        Row: {
          approved_amount: number | null
          budget_line_id: string | null
          claimed_amount: number | null
          grant_project_id: string | null
          paid_amount: number | null
          spent_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_grant_project_id_fkey"
            columns: ["grant_project_id"]
            isOneToOne: false
            referencedRelation: "grant_projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_client: { Args: { p_client_id: string }; Returns: boolean }
      can_access_grant_project: {
        Args: { p_grant_project_id: string }
        Returns: boolean
      }
      current_org_user_id: {
        Args: { p_organization_id: string }
        Returns: string
      }
      has_org_role: {
        Args: {
          p_organization_id: string
          p_role: Database["public"]["Enums"]["org_role"]
        }
        Returns: boolean
      }
      is_client_portal_user: { Args: { p_client_id: string }; Returns: boolean }
      is_org_member: { Args: { p_organization_id: string }; Returns: boolean }
    }
    Enums: {
      org_role: "admin" | "employee" | "client"
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
  public: {
    Enums: {
      org_role: ["admin", "employee", "client"],
    },
  },
} as const
