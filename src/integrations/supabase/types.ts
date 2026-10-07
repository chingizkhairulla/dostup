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
      announcements: {
        Row: {
          content_html: string
          created_at: string
          creator_id: string
          id: string
          order_index: number
          product_id: string
          updated_at: string
        }
        Insert: {
          content_html?: string
          created_at?: string
          creator_id: string
          id?: string
          order_index?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          content_html?: string
          created_at?: string
          creator_id?: string
          id?: string
          order_index?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      auth_attempts: {
        Row: {
          created_at: string
          id: string
          identifier: string
          ip: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          ip?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          ip?: string | null
        }
        Relationships: []
      }
      booking_cancellations: {
        Row: {
          booking_id: string
          cancellation_comment: string | null
          cancellation_reasons: string[] | null
          cancelled_at: string
          cancelled_by: string
          id: string
          product_id: string
          product_title: string
          schedule_id: string | null
          schedule_title: string | null
          simple_user_id: string | null
          slot_date: string
          slot_time: string
          user_name: string
          user_phone: string | null
        }
        Insert: {
          booking_id: string
          cancellation_comment?: string | null
          cancellation_reasons?: string[] | null
          cancelled_at?: string
          cancelled_by?: string
          id?: string
          product_id: string
          product_title: string
          schedule_id?: string | null
          schedule_title?: string | null
          simple_user_id?: string | null
          slot_date: string
          slot_time: string
          user_name: string
          user_phone?: string | null
        }
        Update: {
          booking_id?: string
          cancellation_comment?: string | null
          cancellation_reasons?: string[] | null
          cancelled_at?: string
          cancelled_by?: string
          id?: string
          product_id?: string
          product_title?: string
          schedule_id?: string | null
          schedule_title?: string | null
          simple_user_id?: string | null
          slot_date?: string
          slot_time?: string
          user_name?: string
          user_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_cancellations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reminders: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          product_title: string | null
          reminder_type: string
          scheduled_at: string
          sent_at: string | null
          simple_user_id: string | null
          slot_date: string | null
          slot_time: string | null
          target_role: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          product_title?: string | null
          reminder_type: string
          scheduled_at: string
          sent_at?: string | null
          simple_user_id?: string | null
          slot_date?: string | null
          slot_time?: string | null
          target_role?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          product_title?: string | null
          reminder_type?: string
          scheduled_at?: string
          sent_at?: string | null
          simple_user_id?: string | null
          slot_date?: string | null
          slot_time?: string | null
          target_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reminders_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "simple_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reschedules: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          new_date: string
          new_time: string
          old_date: string
          old_time: string
          product_id: string
          product_title: string
          reasons: string[] | null
          rescheduled_by: string
          schedule_id: string | null
          simple_user_id: string | null
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          new_date: string
          new_time: string
          old_date: string
          old_time: string
          product_id: string
          product_title: string
          reasons?: string[] | null
          rescheduled_by?: string
          schedule_id?: string | null
          simple_user_id?: string | null
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          new_date?: string
          new_time?: string
          old_date?: string
          old_time?: string
          product_id?: string
          product_title?: string
          reasons?: string[] | null
          rescheduled_by?: string
          schedule_id?: string | null
          simple_user_id?: string | null
        }
        Relationships: []
      }
      creator_accounts: {
        Row: {
          account_type: string
          auth_user_id: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          is_blocked: boolean
          login: string
          password_hash: string | null
          profile_id: string | null
          recovery_phone: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          is_blocked?: boolean
          login: string
          password_hash?: string | null
          profile_id?: string | null
          recovery_phone?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          is_blocked?: boolean
          login?: string
          password_hash?: string | null
          profile_id?: string | null
          recovery_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_sessions: {
        Row: {
          created_at: string | null
          creator_name: string
          expires_at: string
          id: string
          profile_id: string | null
          token: string
        }
        Insert: {
          created_at?: string | null
          creator_name: string
          expires_at: string
          id?: string
          profile_id?: string | null
          token: string
        }
        Update: {
          created_at?: string | null
          creator_name?: string
          expires_at?: string
          id?: string
          profile_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_access_tokens: {
        Row: {
          created_at: string
          expires_at: string
          file_path: string
          id: string
          token: string
          used: boolean
        }
        Insert: {
          created_at?: string
          expires_at: string
          file_path: string
          id?: string
          token: string
          used?: boolean
        }
        Update: {
          created_at?: string
          expires_at?: string
          file_path?: string
          id?: string
          token?: string
          used?: boolean
        }
        Relationships: []
      }
      material_bookmarks: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          material_id: string
          user_ref: string
          user_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          material_id: string
          user_ref: string
          user_type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          material_id?: string
          user_ref?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_bookmarks_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      material_unlocks: {
        Row: {
          id: string
          material_id: string | null
          material_title: string
          product_id: string | null
          product_title: string
          unlocked_at: string | null
        }
        Insert: {
          id?: string
          material_id?: string | null
          material_title: string
          product_id?: string | null
          product_title: string
          unlocked_at?: string | null
        }
        Update: {
          id?: string
          material_id?: string | null
          material_title?: string
          product_id?: string | null
          product_title?: string
          unlocked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_unlocks_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_unlocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_unlocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_unlocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          allow_download: boolean
          allow_view: boolean
          available_at: string | null
          content: string | null
          created_at: string
          deleted_at: string | null
          file_size: number | null
          file_url: string | null
          id: string
          order_index: number
          original_parent_id: string | null
          parent_id: string | null
          product_id: string
          teacher_allow_download: boolean
          teacher_id: string | null
          title: string
          type: Database["public"]["Enums"]["material_type"]
        }
        Insert: {
          allow_download?: boolean
          allow_view?: boolean
          available_at?: string | null
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          order_index?: number
          original_parent_id?: string | null
          parent_id?: string | null
          product_id: string
          teacher_allow_download?: boolean
          teacher_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["material_type"]
        }
        Update: {
          allow_download?: boolean
          allow_view?: boolean
          available_at?: string | null
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          order_index?: number
          original_parent_id?: string | null
          parent_id?: string | null
          product_id?: string
          teacher_allow_download?: boolean
          teacher_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["material_type"]
        }
        Relationships: [
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "simple_users"
            referencedColumns: ["id"]
          },
        ]
      }
      moderator_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          id: string
          morning_time: string
          reminder_24h: boolean
          reminder_2h: boolean
          reminder_morning: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          morning_time?: string
          reminder_24h?: boolean
          reminder_2h?: boolean
          reminder_morning?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          morning_time?: string
          reminder_24h?: boolean
          reminder_2h?: boolean
          reminder_morning?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_submissions: {
        Row: {
          buyer_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          detected_amount: number | null
          detected_currency: string | null
          fingerprint: string
          id: string
          parsed_metadata: Json
          purchase_id: string
          receipt_mime_type: string
          receipt_path: string
          receipt_sha256: string
          receipt_type: string
          rejection_reason: string | null
          transaction_id: string | null
          updated_at: string
          verification_status: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detected_amount?: number | null
          detected_currency?: string | null
          fingerprint: string
          id?: string
          parsed_metadata?: Json
          purchase_id: string
          receipt_mime_type: string
          receipt_path: string
          receipt_sha256: string
          receipt_type?: string
          rejection_reason?: string | null
          transaction_id?: string | null
          updated_at?: string
          verification_status?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          detected_amount?: number | null
          detected_currency?: string | null
          fingerprint?: string
          id?: string
          parsed_metadata?: Json
          purchase_id?: string
          receipt_mime_type?: string
          receipt_path?: string
          receipt_sha256?: string
          receipt_type?: string
          rejection_reason?: string | null
          transaction_id?: string | null
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_submissions_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "simple_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_verification_events: {
        Row: {
          actor: string
          checks: Json
          created_at: string
          decision: string
          id: string
          notes: string | null
          purchase_id: string
          submission_id: string
        }
        Insert: {
          actor: string
          checks?: Json
          created_at?: string
          decision: string
          id?: string
          notes?: string | null
          purchase_id: string
          submission_id: string
        }
        Update: {
          actor?: string
          checks?: Json
          created_at?: string
          decision?: string
          id?: string
          notes?: string | null
          purchase_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_verification_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "simple_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_verification_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "payment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_teachers: {
        Row: {
          created_at: string
          id: string
          product_id: string
          teacher_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          teacher_name: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          teacher_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_teachers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_teachers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_teachers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          access_duration_days: number | null
          billing_period: string | null
          capacity: number | null
          category_id: string
          created_at: string
          creator_account_id: string | null
          creator_id: string | null
          description: string | null
          event_starts_at: string | null
          faq: Json
          group_link_label: string | null
          has_schedule: boolean
          headline: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_demo: boolean
          is_paused: boolean
          kaspi_link: string | null
          kaspi_phone: string | null
          lesson_format: string | null
          paused_message: string | null
          price: number
          slug: string | null
          subcategory_id: string
          telegram_link: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          access_duration_days?: number | null
          billing_period?: string | null
          capacity?: number | null
          category_id: string
          created_at?: string
          creator_account_id?: string | null
          creator_id?: string | null
          description?: string | null
          event_starts_at?: string | null
          faq?: Json
          group_link_label?: string | null
          has_schedule?: boolean
          headline?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_demo?: boolean
          is_paused?: boolean
          kaspi_link?: string | null
          kaspi_phone?: string | null
          lesson_format?: string | null
          paused_message?: string | null
          price?: number
          slug?: string | null
          subcategory_id: string
          telegram_link?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          access_duration_days?: number | null
          billing_period?: string | null
          capacity?: number | null
          category_id?: string
          created_at?: string
          creator_account_id?: string | null
          creator_id?: string | null
          description?: string | null
          event_starts_at?: string | null
          faq?: Json
          group_link_label?: string | null
          has_schedule?: boolean
          headline?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_demo?: boolean
          is_paused?: boolean
          kaspi_link?: string | null
          kaspi_phone?: string | null
          lesson_format?: string | null
          paused_message?: string | null
          price?: number
          slug?: string | null
          subcategory_id?: string
          telegram_link?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_creator_account_id_fkey"
            columns: ["creator_account_id"]
            isOneToOne: false
            referencedRelation: "creator_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          handle: string | null
          id: string
          is_demo: boolean
          last_used_at: string | null
          type: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          is_demo?: boolean
          last_used_at?: string | null
          type: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          is_demo?: boolean
          last_used_at?: string | null
          type?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_info: string | null
          fcm_token: string
          id: string
          updated_at: string
          user_id: string | null
          user_role: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          fcm_token: string
          id?: string
          updated_at?: string
          user_id?: string | null
          user_role?: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          fcm_token?: string
          id?: string
          updated_at?: string
          user_id?: string | null
          user_role?: string
        }
        Relationships: []
      }
      reschedule_requests: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string | null
          id: string
          new_date: string
          new_time: string
          old_date: string
          old_time: string
          product_id: string
          product_title: string
          reasons: string[] | null
          requested_by: string
          responded_at: string | null
          response_comment: string | null
          schedule_id: string | null
          simple_user_id: string | null
          status: string
          teacher_id: string | null
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string | null
          id?: string
          new_date: string
          new_time: string
          old_date: string
          old_time: string
          product_id: string
          product_title: string
          reasons?: string[] | null
          requested_by?: string
          responded_at?: string | null
          response_comment?: string | null
          schedule_id?: string | null
          simple_user_id?: string | null
          status?: string
          teacher_id?: string | null
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string | null
          id?: string
          new_date?: string
          new_time?: string
          old_date?: string
          old_time?: string
          product_id?: string
          product_title?: string
          reasons?: string[] | null
          requested_by?: string
          responded_at?: string | null
          response_comment?: string | null
          schedule_id?: string | null
          simple_user_id?: string | null
          status?: string
          teacher_id?: string | null
        }
        Relationships: []
      }
      schedules: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          max_participants: number | null
          product_id: string
          teacher_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          max_participants?: number | null
          product_id: string
          teacher_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          max_participants?: number | null
          product_id?: string
          teacher_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "simple_users"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          name: string
          product_id: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          name: string
          product_id?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          name?: string
          product_id?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signup_tokens_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_tokens_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_tokens_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
        ]
      }
      simple_bookings: {
        Row: {
          buyer_profile_id: string | null
          created_at: string
          id: string
          schedule_id: string
          simple_user_id: string | null
          status: string
          time_slot_id: string
        }
        Insert: {
          buyer_profile_id?: string | null
          created_at?: string
          id?: string
          schedule_id: string
          simple_user_id?: string | null
          status?: string
          time_slot_id: string
        }
        Update: {
          buyer_profile_id?: string | null
          created_at?: string
          id?: string
          schedule_id?: string
          simple_user_id?: string | null
          status?: string
          time_slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simple_bookings_buyer_profile_id_fkey"
            columns: ["buyer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_bookings_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_bookings_simple_user_id_fkey"
            columns: ["simple_user_id"]
            isOneToOne: false
            referencedRelation: "simple_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_bookings_time_slot_id_fkey"
            columns: ["time_slot_id"]
            isOneToOne: false
            referencedRelation: "time_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      simple_purchases: {
        Row: {
          amount: number
          assigned_teacher_id: string | null
          buyer_profile_id: string | null
          can_choose_teacher: boolean | null
          confirmed_at: string | null
          created_at: string
          id: string
          product_id: string
          simple_user_id: string | null
          status: string
        }
        Insert: {
          amount: number
          assigned_teacher_id?: string | null
          buyer_profile_id?: string | null
          can_choose_teacher?: boolean | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          product_id: string
          simple_user_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          assigned_teacher_id?: string | null
          buyer_profile_id?: string | null
          can_choose_teacher?: boolean | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          product_id?: string
          simple_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "simple_purchases_assigned_teacher_id_fkey"
            columns: ["assigned_teacher_id"]
            isOneToOne: false
            referencedRelation: "simple_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_purchases_buyer_profile_id_fkey"
            columns: ["buyer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_purchases_simple_user_id_fkey"
            columns: ["simple_user_id"]
            isOneToOne: false
            referencedRelation: "simple_users"
            referencedColumns: ["id"]
          },
        ]
      }
      simple_users: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          created_at: string
          id: string
          read_at: string | null
          sender: string
          text: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          read_at?: string | null
          sender: string
          text: string
          thread_id: string
        }
        Update: {
          created_at?: string
          id?: string
          read_at?: string | null
          sender?: string
          text?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          created_at: string
          display_name: string
          id: string
          last_message_at: string
          last_message_preview: string | null
          unread_for_moderator: number
          unread_for_user: number
          updated_at: string
          user_ref: string
          user_type: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          unread_for_moderator?: number
          unread_for_user?: number
          updated_at?: string
          user_ref: string
          user_type: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          unread_for_moderator?: number
          unread_for_user?: number
          updated_at?: string
          user_ref?: string
          user_type?: string
        }
        Relationships: []
      }
      time_slots: {
        Row: {
          created_at: string
          date: string
          end_time: string
          id: string
          is_available: boolean
          lesson_link: string | null
          max_participants: number | null
          schedule_id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          date: string
          end_time: string
          id?: string
          is_available?: boolean
          lesson_link?: string | null
          max_participants?: number | null
          schedule_id: string
          start_time: string
        }
        Update: {
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          is_available?: boolean
          lesson_link?: string | null
          max_participants?: number | null
          schedule_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_slots_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      products_catalog: {
        Row: {
          access_duration_days: number | null
          billing_period: string | null
          capacity: number | null
          category_id: string | null
          created_at: string | null
          creator_account_id: string | null
          creator_id: string | null
          description: string | null
          event_starts_at: string | null
          faq: Json | null
          group_link_label: string | null
          has_schedule: boolean | null
          headline: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          is_paused: boolean | null
          lesson_format: string | null
          paused_message: string | null
          price: number | null
          slug: string | null
          subcategory_id: string | null
          telegram_link: string | null
          title: string | null
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          access_duration_days?: number | null
          billing_period?: string | null
          capacity?: number | null
          category_id?: string | null
          created_at?: string | null
          creator_account_id?: string | null
          creator_id?: string | null
          description?: string | null
          event_starts_at?: string | null
          faq?: Json | null
          group_link_label?: string | null
          has_schedule?: boolean | null
          headline?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_paused?: boolean | null
          lesson_format?: string | null
          paused_message?: string | null
          price?: number | null
          slug?: string | null
          subcategory_id?: string | null
          telegram_link?: string | null
          title?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          access_duration_days?: number | null
          billing_period?: string | null
          capacity?: number | null
          category_id?: string | null
          created_at?: string | null
          creator_account_id?: string | null
          creator_id?: string | null
          description?: string | null
          event_starts_at?: string | null
          faq?: Json | null
          group_link_label?: string | null
          has_schedule?: boolean | null
          headline?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_paused?: boolean | null
          lesson_format?: string | null
          paused_message?: string | null
          price?: number | null
          slug?: string | null
          subcategory_id?: string | null
          telegram_link?: string | null
          title?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_creator_account_id_fkey"
            columns: ["creator_account_id"]
            isOneToOne: false
            referencedRelation: "creator_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      public_products: {
        Row: {
          billing_period: string | null
          capacity: number | null
          category_emoji: string | null
          category_id: string | null
          category_name_kk: string | null
          category_name_ru: string | null
          category_slug: string | null
          created_at: string | null
          event_starts_at: string | null
          has_schedule: boolean | null
          headline: string | null
          id: string | null
          image_url: string | null
          lesson_format: string | null
          price: number | null
          seller_avatar_url: string | null
          seller_display_name: string | null
          seller_handle: string | null
          seller_type: string | null
          slug: string | null
          subcategory_id: string | null
          subcategory_name_kk: string | null
          subcategory_name_ru: string | null
          subcategory_slug: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      allocate_profile_handle: {
        Args: { p_display_name: string; p_id: string }
        Returns: string
      }
      call_edge_function: {
        Args: { _name: string; _payload: Json }
        Returns: undefined
      }
      claim_moderator_session: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_catalog_taxonomy: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_seller_storefront: {
        Args: {
          p_billing_period?: string
          p_category_slug?: string
          p_handle: string
          p_lesson_format?: string
          p_subcategory_slug?: string
        }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          handle: string
          products: Json
          type: string
        }[]
      }
      handle_is_available: {
        Args: { p_except_id?: string; p_handle: string }
        Returns: boolean
      }
      immutable_unaccent: { Args: { txt: string }; Returns: string }
      is_reserved_handle: { Args: { p_handle: string }; Returns: boolean }
      search_catalog: {
        Args: {
          p_billing_period?: string
          p_category_slug?: string
          p_lesson_format?: string
          p_limit?: number
          p_max?: number
          p_min?: number
          p_offset?: number
          p_sort?: string
          p_subcategory_slug?: string
          q?: string
        }
        Returns: {
          billing_period: string
          capacity: number
          category_emoji: string
          category_id: string
          category_name_kk: string
          category_name_ru: string
          category_slug: string
          created_at: string
          event_starts_at: string
          has_schedule: boolean
          headline: string
          id: string
          image_url: string
          lesson_format: string
          price: number
          seller_avatar_url: string
          seller_display_name: string
          seller_handle: string
          seller_type: string
          slug: string
          subcategory_id: string
          subcategory_name_kk: string
          subcategory_name_ru: string
          subcategory_slug: string
          title: string
        }[]
      }
      slugify_handle_source: { Args: { src: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "creator" | "user"
      event_type: "group" | "individual"
      material_type: "file" | "video" | "text" | "link" | "folder"
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
      app_role: ["admin", "creator", "user"],
      event_type: ["group", "individual"],
      material_type: ["file", "video", "text", "link", "folder"],
    },
  },
} as const
