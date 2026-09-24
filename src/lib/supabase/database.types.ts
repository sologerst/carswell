export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          target: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          target?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          cost_usd: number
          created_at: string
          feature: string
          id: number
          input_tokens: number
          model: string
          output_tokens: number
          user_id: string | null
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          feature: string
          id?: never
          input_tokens?: number
          model: string
          output_tokens?: number
          user_id?: string | null
        }
        Update: {
          cost_usd?: number
          created_at?: string
          feature?: string
          id?: never
          input_tokens?: number
          model?: string
          output_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_dealership_id: string | null
          blocked_user_id: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          blocked_dealership_id?: string | null
          blocked_user_id?: string | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          blocked_dealership_id?: string | null
          blocked_user_id?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_dealership_id_fkey"
            columns: ["blocked_dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_preferences: {
        Row: {
          confidence: number | null
          key: string
          source: string
          tier: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          confidence?: number | null
          key: string
          source?: string
          tier?: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          confidence?: number | null
          key?: string
          source?: string
          tier?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "buyer_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_briefs: {
        Row: {
          brief: Json
          created_at: string
          id: string
          listing_id: string
          model: string | null
          price_at: number
          profile_hash: string
          source: string
          user_id: string
        }
        Insert: {
          brief: Json
          created_at?: string
          id?: string
          listing_id: string
          model?: string | null
          price_at: number
          profile_hash: string
          source: string
          user_id: string
        }
        Update: {
          brief?: Json
          created_at?: string
          id?: string
          listing_id?: string
          model?: string | null
          price_at?: number
          profile_hash?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_briefs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          buyer_id: string
          buyer_phone_shared_at: string | null
          created_at: string
          dealership_id: string
          id: string
          interest_id: string
          last_message_at: string | null
        }
        Insert: {
          buyer_id: string
          buyer_phone_shared_at?: string | null
          created_at?: string
          dealership_id: string
          id?: string
          interest_id: string
          last_message_at?: string | null
        }
        Update: {
          buyer_id?: string
          buyer_phone_shared_at?: string | null
          created_at?: string
          dealership_id?: string
          id?: string
          interest_id?: string
          last_message_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: true
            referencedRelation: "interests"
            referencedColumns: ["id"]
          },
        ]
      }
      dealership_claim_tokens: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          dealership_id: string
          expires_at: string
          id: string
          interest_id: string | null
          token_hash: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          dealership_id: string
          expires_at?: string
          id?: string
          interest_id?: string | null
          token_hash: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          dealership_id?: string
          expires_at?: string
          id?: string
          interest_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealership_claim_tokens_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealership_claim_tokens_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      dealership_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          dealership_id: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          dealership_id: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          dealership_id?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealership_invites_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealership_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dealership_members: {
        Row: {
          created_at: string
          dealership_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dealership_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dealership_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealership_members_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealership_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dealership_private: {
        Row: {
          dealership_id: string
          lead_email: string | null
          lead_email_verified_at: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          dealership_id: string
          lead_email?: string | null
          lead_email_verified_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          dealership_id?: string
          lead_email?: string | null
          lead_email_verified_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealership_private_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: true
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      dealerships: {
        Row: {
          accepts_trade_ins: boolean
          address: string | null
          at_home_test_drive: boolean
          buy_online: boolean
          city: string | null
          claimed_at: string | null
          created_at: string
          doc_fee: number | null
          geog: unknown
          home_delivery: boolean
          id: string
          lat: number | null
          lead_channel: string
          lng: number | null
          market_id: string | null
          name: string
          no_haggle: boolean
          phone: string | null
          rating: number | null
          response_time_minutes: number | null
          review_count: number
          slug: string
          state: string
          updated_at: string
          verified_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          accepts_trade_ins?: boolean
          address?: string | null
          at_home_test_drive?: boolean
          buy_online?: boolean
          city?: string | null
          claimed_at?: string | null
          created_at?: string
          doc_fee?: number | null
          geog?: unknown
          home_delivery?: boolean
          id?: string
          lat?: number | null
          lead_channel?: string
          lng?: number | null
          market_id?: string | null
          name: string
          no_haggle?: boolean
          phone?: string | null
          rating?: number | null
          response_time_minutes?: number | null
          review_count?: number
          slug: string
          state?: string
          updated_at?: string
          verified_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          accepts_trade_ins?: boolean
          address?: string | null
          at_home_test_drive?: boolean
          buy_online?: boolean
          city?: string | null
          claimed_at?: string | null
          created_at?: string
          doc_fee?: number | null
          geog?: unknown
          home_delivery?: boolean
          id?: string
          lat?: number | null
          lead_channel?: string
          lng?: number | null
          market_id?: string | null
          name?: string
          no_haggle?: boolean
          phone?: string | null
          rating?: number | null
          response_time_minutes?: number | null
          review_count?: number
          slug?: string
          state?: string
          updated_at?: string
          verified_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealerships_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_insights: {
        Row: {
          created_at: string
          dealership_id: string | null
          id: string
          kind: string
          market_id: string | null
          payload: Json
          period_end: string
          period_start: string
        }
        Insert: {
          created_at?: string
          dealership_id?: string | null
          id?: string
          kind: string
          market_id?: string | null
          payload: Json
          period_end: string
          period_start: string
        }
        Update: {
          created_at?: string
          dealership_id?: string | null
          id?: string
          kind?: string
          market_id?: string | null
          payload?: Json
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_insights_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_insights_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_outbox: {
        Row: {
          attachments: Json
          created_at: string
          from_address: string
          html_body: string | null
          id: string
          kind: string
          meta: Json
          reply_to: string | null
          subject: string
          text_body: string | null
          to_address: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          from_address: string
          html_body?: string | null
          id?: string
          kind: string
          meta?: Json
          reply_to?: string | null
          subject: string
          text_body?: string | null
          to_address: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          from_address?: string
          html_body?: string | null
          id?: string
          kind?: string
          meta?: Json
          reply_to?: string | null
          subject?: string
          text_body?: string | null
          to_address?: string
        }
        Relationships: []
      }
      ingest_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          market_id: string | null
          source: string
          started_at: string
          stats: Json
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          market_id?: string | null
          source: string
          started_at?: string
          stats?: Json
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          market_id?: string | null
          source?: string
          started_at?: string
          stats?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_runs_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      interests: {
        Row: {
          buyer_notes: Json
          created_at: string
          dealership_id: string | null
          dossier: Json
          id: string
          kind: string
          lead_summary: string | null
          listing_id: string
          matched_at: string | null
          sla_expires_at: string | null
          status: string
          swipe_client_id: string | null
          test_drive_windows: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_notes?: Json
          created_at?: string
          dealership_id?: string | null
          dossier?: Json
          id?: string
          kind?: string
          lead_summary?: string | null
          listing_id: string
          matched_at?: string | null
          sla_expires_at?: string | null
          status?: string
          swipe_client_id?: string | null
          test_drive_windows?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_notes?: Json
          created_at?: string
          dealership_id?: string | null
          dossier?: Json
          id?: string
          kind?: string
          lead_summary?: string | null
          listing_id?: string
          matched_at?: string | null
          sla_expires_at?: string | null
          status?: string
          swipe_client_id?: string | null
          test_drive_windows?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interests_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_deliveries: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          dealership_id: string | null
          id: string
          interest_id: string
          last_error: string | null
          next_attempt_at: string
          relay_address: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          dealership_id?: string | null
          id?: string
          interest_id: string
          last_error?: string | null
          next_attempt_at?: string
          relay_address?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          dealership_id?: string | null
          id?: string
          interest_id?: string
          last_error?: string | null
          next_attempt_at?: string
          relay_address?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_deliveries_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_deliveries_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_embeddings: {
        Row: {
          created_at: string
          embedding: string
          listing_id: string
          model: string
        }
        Insert: {
          created_at?: string
          embedding: string
          listing_id: string
          model: string
        }
        Update: {
          created_at?: string
          embedding?: string
          listing_id?: string
          model?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_embeddings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_enrichment: {
        Row: {
          color_family: string | null
          condition_notes: string | null
          confidence: number | null
          created_at: string
          features: string[]
          listing_id: string
          model: string | null
          raw: Json | null
        }
        Insert: {
          color_family?: string | null
          condition_notes?: string | null
          confidence?: number | null
          created_at?: string
          features?: string[]
          listing_id: string
          model?: string | null
          raw?: Json | null
        }
        Update: {
          color_family?: string | null
          condition_notes?: string | null
          confidence?: number | null
          created_at?: string
          features?: string[]
          listing_id?: string
          model?: string | null
          raw?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_enrichment_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_events: {
        Row: {
          created_at: string
          id: number
          kind: string
          listing_id: string | null
          meta: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          listing_id?: string | null
          meta?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          listing_id?: string | null
          meta?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_photos: {
        Row: {
          created_at: string
          height: number | null
          id: string
          listing_id: string
          position: number
          url: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          listing_id: string
          position?: number
          url: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          listing_id?: string
          position?: number
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_price_changes: {
        Row: {
          changed_at: string
          id: number
          listing_id: string
          new_price: number
          old_price: number
        }
        Insert: {
          changed_at?: string
          id?: never
          listing_id: string
          new_price: number
          old_price: number
        }
        Update: {
          changed_at?: string
          id?: never
          listing_id?: string
          new_price?: number
          old_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_price_changes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_stats_daily: {
        Row: {
          day: string
          detail_opens: number
          impressions: number
          likes: number
          listing_id: string
          passes: number
          superlikes: number
        }
        Insert: {
          day: string
          detail_opens?: number
          impressions?: number
          likes?: number
          listing_id: string
          passes?: number
          superlikes?: number
        }
        Update: {
          day?: string
          detail_opens?: number
          impressions?: number
          likes?: number
          listing_id?: string
          passes?: number
          superlikes?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_stats_daily_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          accident_count: number | null
          body_style: string
          condition: string
          created_at: string
          cylinders: number | null
          deal_rating: string | null
          dealership_id: string | null
          description: string | null
          doors: number | null
          drivetrain: string | null
          engine: string | null
          ev_range_mi: number | null
          expected_price: number | null
          exterior_color: string | null
          exterior_color_family: string | null
          features: string[]
          features_verified: boolean
          first_seen_at: string
          fuel_type: string
          geog: unknown
          horsepower: number | null
          id: string
          interior_color: string | null
          interior_material: string | null
          is_active: boolean
          is_canonical: boolean
          last_seen_at: string
          lat: number
          length_in: number | null
          lng: number
          make: string
          market_id: string | null
          miles: number
          missed_sweeps: number
          model: string
          mpg_city: number | null
          mpg_hwy: number | null
          msrp: number | null
          open_recalls: number | null
          owner_count: number | null
          personal_use: boolean | null
          photo_count: number
          price: number
          private_seller_id: string | null
          quality_score: number | null
          seats: number | null
          seller_type: string
          service_records: boolean | null
          sold_at: string | null
          source: string
          source_id: string | null
          source_url: string | null
          third_row: boolean | null
          title_status: string | null
          towing_lbs: number | null
          transmission: string | null
          trim_level: string | null
          updated_at: string
          vin: string
          year: number
          zip: string | null
        }
        Insert: {
          accident_count?: number | null
          body_style: string
          condition?: string
          created_at?: string
          cylinders?: number | null
          deal_rating?: string | null
          dealership_id?: string | null
          description?: string | null
          doors?: number | null
          drivetrain?: string | null
          engine?: string | null
          ev_range_mi?: number | null
          expected_price?: number | null
          exterior_color?: string | null
          exterior_color_family?: string | null
          features?: string[]
          features_verified?: boolean
          first_seen_at?: string
          fuel_type?: string
          geog?: unknown
          horsepower?: number | null
          id?: string
          interior_color?: string | null
          interior_material?: string | null
          is_active?: boolean
          is_canonical?: boolean
          last_seen_at?: string
          lat: number
          length_in?: number | null
          lng: number
          make: string
          market_id?: string | null
          miles?: number
          missed_sweeps?: number
          model: string
          mpg_city?: number | null
          mpg_hwy?: number | null
          msrp?: number | null
          open_recalls?: number | null
          owner_count?: number | null
          personal_use?: boolean | null
          photo_count?: number
          price: number
          private_seller_id?: string | null
          quality_score?: number | null
          seats?: number | null
          seller_type?: string
          service_records?: boolean | null
          sold_at?: string | null
          source: string
          source_id?: string | null
          source_url?: string | null
          third_row?: boolean | null
          title_status?: string | null
          towing_lbs?: number | null
          transmission?: string | null
          trim_level?: string | null
          updated_at?: string
          vin: string
          year: number
          zip?: string | null
        }
        Update: {
          accident_count?: number | null
          body_style?: string
          condition?: string
          created_at?: string
          cylinders?: number | null
          deal_rating?: string | null
          dealership_id?: string | null
          description?: string | null
          doors?: number | null
          drivetrain?: string | null
          engine?: string | null
          ev_range_mi?: number | null
          expected_price?: number | null
          exterior_color?: string | null
          exterior_color_family?: string | null
          features?: string[]
          features_verified?: boolean
          first_seen_at?: string
          fuel_type?: string
          geog?: unknown
          horsepower?: number | null
          id?: string
          interior_color?: string | null
          interior_material?: string | null
          is_active?: boolean
          is_canonical?: boolean
          last_seen_at?: string
          lat?: number
          length_in?: number | null
          lng?: number
          make?: string
          market_id?: string | null
          miles?: number
          missed_sweeps?: number
          model?: string
          mpg_city?: number | null
          mpg_hwy?: number | null
          msrp?: number | null
          open_recalls?: number | null
          owner_count?: number | null
          personal_use?: boolean | null
          photo_count?: number
          price?: number
          private_seller_id?: string | null
          quality_score?: number | null
          seats?: number | null
          seller_type?: string
          service_records?: boolean | null
          sold_at?: string | null
          source?: string
          source_id?: string | null
          source_url?: string | null
          third_row?: boolean | null
          title_status?: string | null
          towing_lbs?: number | null
          transmission?: string | null
          trim_level?: string | null
          updated_at?: string
          vin?: string
          year?: number
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_private_seller_id_fkey"
            columns: ["private_seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_price_stats: {
        Row: {
          computed_at: string
          id: number
          intercept: number | null
          make: string
          market_id: string | null
          median_price: number | null
          model: string
          n: number
          slope_per_mile: number | null
          trim_level: string
          year: number
        }
        Insert: {
          computed_at?: string
          id?: never
          intercept?: number | null
          make: string
          market_id?: string | null
          median_price?: number | null
          model: string
          n: number
          slope_per_mile?: number | null
          trim_level?: string
          year: number
        }
        Update: {
          computed_at?: string
          id?: never
          intercept?: number | null
          make?: string
          market_id?: string | null
          median_price?: number | null
          model?: string
          n?: number
          slope_per_mile?: number | null
          trim_level?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_price_stats_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          center_zip: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          priority: number
          radius_mi: number
        }
        Insert: {
          center_zip: string
          created_at?: string
          id: string
          is_active?: boolean
          name: string
          priority?: number
          radius_mi?: number
        }
        Update: {
          center_zip?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          radius_mi?: number
        }
        Relationships: [
          {
            foreignKeyName: "markets_center_zip_fkey"
            columns: ["center_zip"]
            isOneToOne: false
            referencedRelation: "zip_codes"
            referencedColumns: ["zip"]
          },
        ]
      }
      message_drafts: {
        Row: {
          body: string
          conversation_id: string | null
          created_at: string
          id: string
          intent: string | null
          interest_id: string | null
          source: string
          status: string
          user_id: string
        }
        Insert: {
          body: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          intent?: string | null
          interest_id?: string | null
          source?: string
          status?: string
          user_id: string
        }
        Update: {
          body?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          intent?: string | null
          interest_id?: string | null
          source?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_drafts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_drafts_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          flagged: boolean
          id: string
          kind: string
          meta: Json
          scam_score: number | null
          sender_id: string | null
          sender_role: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          flagged?: boolean
          id?: string
          kind?: string
          meta?: Json
          scam_score?: number | null
          sender_id?: string | null
          sender_role: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          flagged?: boolean
          id?: string
          kind?: string
          meta?: Json
          scam_score?: number | null
          sender_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          pushed_at: string | null
          read_at: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          pushed_at?: string | null
          read_at?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          pushed_at?: string | null
          read_at?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          apr: number | null
          created_at: string
          created_by: string | null
          dealer_fees: number
          dealership_id: string
          doc_fee: number
          expires_at: string
          id: string
          interest_id: string
          monthly_estimate: number | null
          notes: string | null
          otd_total: number
          picked_at: string | null
          source: string
          status: string
          tax: number
          term_months: number | null
          title_fees: number
          trade_credit: number
          vehicle_price: number
        }
        Insert: {
          apr?: number | null
          created_at?: string
          created_by?: string | null
          dealer_fees?: number
          dealership_id: string
          doc_fee?: number
          expires_at?: string
          id?: string
          interest_id: string
          monthly_estimate?: number | null
          notes?: string | null
          otd_total: number
          picked_at?: string | null
          source?: string
          status?: string
          tax?: number
          term_months?: number | null
          title_fees?: number
          trade_credit?: number
          vehicle_price: number
        }
        Update: {
          apr?: number | null
          created_at?: string
          created_by?: string | null
          dealer_fees?: number
          dealership_id?: string
          doc_fee?: number
          expires_at?: string
          id?: string
          interest_id?: string
          monthly_estimate?: number | null
          notes?: string | null
          otd_total?: number
          picked_at?: string | null
          source?: string
          status?: string
          tax?: number
          term_months?: number | null
          title_fees?: number
          trade_credit?: number
          vehicle_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_summary: string | null
          created_at: string
          dismissed_questions: string[]
          email: string | null
          first_name: string | null
          id: string
          is_admin: boolean
          last_question_swipe: number
          onboarding_completed_at: string | null
          onboarding_method: string | null
          paused_at: string | null
          phone: string | null
          profile_hash: string | null
          radius_mi: number
          swipe_count: number
          updated_at: string
          zip: string | null
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          dismissed_questions?: string[]
          email?: string | null
          first_name?: string | null
          id: string
          is_admin?: boolean
          last_question_swipe?: number
          onboarding_completed_at?: string | null
          onboarding_method?: string | null
          paused_at?: string | null
          phone?: string | null
          profile_hash?: string | null
          radius_mi?: number
          swipe_count?: number
          updated_at?: string
          zip?: string | null
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          dismissed_questions?: string[]
          email?: string | null
          first_name?: string | null
          id?: string
          is_admin?: boolean
          last_question_swipe?: number
          onboarding_completed_at?: string | null
          onboarding_method?: string | null
          paused_at?: string | null
          phone?: string | null
          profile_hash?: string | null
          radius_mi?: number
          swipe_count?: number
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      purchases: {
        Row: {
          dealership_id: string | null
          id: string
          interest_id: string | null
          listing_id: string | null
          price: number | null
          reported_at: string
          user_id: string
        }
        Insert: {
          dealership_id?: string | null
          id?: string
          interest_id?: string | null
          listing_id?: string | null
          price?: number | null
          reported_at?: string
          user_id: string
        }
        Update: {
          dealership_id?: string | null
          id?: string
          interest_id?: string | null
          listing_id?: string | null
          price?: number | null
          reported_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_reviews: {
        Row: {
          comment: string | null
          created_at: string
          dealership_id: string
          id: string
          interest_id: string | null
          stars: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          dealership_id: string
          id?: string
          interest_id?: string | null
          stars: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          dealership_id?: string
          id?: string
          interest_id?: string | null
          stars?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_reviews_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reviews_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      swipes: {
        Row: {
          action: string
          client_id: string
          id: number
          listing_id: string | null
          position: number | null
          received_at: string
          score: number | null
          swiped_at: string
          undo_of: string | null
          undone_at: string | null
          user_id: string
          was_exploration: boolean
        }
        Insert: {
          action: string
          client_id: string
          id?: never
          listing_id?: string | null
          position?: number | null
          received_at?: string
          score?: number | null
          swiped_at?: string
          undo_of?: string | null
          undone_at?: string | null
          user_id: string
          was_exploration?: boolean
        }
        Update: {
          action?: string
          client_id?: string
          id?: never
          listing_id?: string | null
          position?: number | null
          received_at?: string
          score?: number | null
          swiped_at?: string
          undo_of?: string | null
          undone_at?: string | null
          user_id?: string
          was_exploration?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "swipes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      taste_vectors: {
        Row: {
          like_sum: string | null
          n_likes: number
          n_passes: number
          pass_sum: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          like_sum?: string | null
          n_likes?: number
          n_passes?: number
          pass_sum?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          like_sum?: string | null
          n_likes?: number
          n_passes?: number
          pass_sum?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taste_vectors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_affinities: {
        Row: {
          attribute: string
          likes: number
          passes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attribute: string
          likes?: number
          passes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attribute?: string
          likes?: number
          passes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_affinities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vin_decodes: {
        Row: {
          data: Json | null
          decoded_at: string | null
          recalls: Json | null
          recalls_checked_at: string | null
          vin: string
        }
        Insert: {
          data?: Json | null
          decoded_at?: string | null
          recalls?: Json | null
          recalls_checked_at?: string | null
          vin: string
        }
        Update: {
          data?: Json | null
          decoded_at?: string | null
          recalls?: Json | null
          recalls_checked_at?: string | null
          vin?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
          zip: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
          zip?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      zip_codes: {
        Row: {
          city: string
          geog: unknown
          lat: number
          lng: number
          state: string
          zip: string
        }
        Insert: {
          city: string
          geog?: unknown
          lat: number
          lng: number
          state: string
          zip: string
        }
        Update: {
          city?: string
          geog?: unknown
          lat?: number
          lng?: number
          state?: string
          zip?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_buyer_note: {
        Args: { p_body: string; p_interest_id: string }
        Returns: undefined
      }
      apply_affinity: {
        Args: {
          p_attrs: string[]
          p_like: number
          p_pass: number
          p_user: string
        }
        Returns: undefined
      }
      apply_taste: {
        Args: {
          p_is_like: boolean
          p_listing: string
          p_user: string
          p_weight: number
        }
        Returns: undefined
      }
      build_dossier: { Args: { p_user: string }; Returns: Json }
      bump_listing_stat: {
        Args: { p_action: string; p_delta: number; p_listing: string }
        Returns: undefined
      }
      claim_dealership: { Args: { p_token: string }; Returns: string }
      config_number: {
        Args: { p_default: number; p_key: string; p_path: string }
        Returns: number
      }
      dealer_leads: {
        Args: { p_dealership_id: string }
        Returns: {
          best_offer_otd: number
          buyer_email: string
          buyer_notes: Json
          buyer_phone: string
          conversation_id: string
          created_at: string
          distance_mi: number
          dossier: Json
          interest_id: string
          kind: string
          lead_summary: string
          listing_id: string
          listing_miles: number
          listing_photo: string
          listing_price: number
          listing_title: string
          listing_vin: string
          matched_at: string
          offer_count: number
          sla_expires_at: string
          status: string
          test_drive_windows: Json
        }[]
      }
      deck_candidates: {
        Args: {
          p_anchor?: string
          p_explore?: number
          p_filters: Json
          p_limit?: number
        }
        Returns: {
          accident_count: number
          body_style: string
          condition: string
          days_on_market: number
          deal_rating: string
          dealer_doc_fee: number
          dealer_lead_channel: string
          dealer_name: string
          dealer_response_minutes: number
          dealership_id: string
          distance_mi: number
          drivetrain: string
          engine: string
          ev_range_mi: number
          expected_price: number
          exterior_color: string
          exterior_color_family: string
          features: string[]
          features_verified: boolean
          fuel_type: string
          horsepower: number
          id: string
          interior_color: string
          interior_material: string
          is_exploration: boolean
          last_price_drop: number
          make: string
          miles: number
          model: string
          mpg_city: number
          mpg_hwy: number
          msrp: number
          open_recalls: number
          owner_count: number
          personal_use: boolean
          photo_count: number
          photos: string[]
          price: number
          quality_score: number
          seats: number
          seller_type: string
          source: string
          source_url: string
          third_row: boolean
          title_status: string
          towing_lbs: number
          transmission: string
          trim_level: string
          vin: string
          visual_sim: number
          year: number
          zip: string
        }[]
      }
      deck_count: { Args: { p_filters: Json }; Returns: number }
      deck_eligible: {
        Args: { p_filters: Json }
        Returns: {
          distance_mi: number
          listing_id: string
        }[]
      }
      decline_offer: { Args: { p_offer_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_dealer_member: { Args: { p_dealership_id: string }; Returns: boolean }
      jtext: { Args: { j: Json }; Returns: string[] }
      listing_attributes: {
        Args: { l: Database["public"]["Tables"]["listings"]["Row"] }
        Returns: string[]
      }
      listing_cards: {
        Args: { p_ids: string[]; p_lat: number; p_lng: number }
        Returns: {
          accident_count: number
          body_style: string
          condition: string
          days_on_market: number
          deal_rating: string
          dealer_doc_fee: number
          dealer_lead_channel: string
          dealer_name: string
          dealer_response_minutes: number
          dealership_id: string
          description: string
          distance_mi: number
          drivetrain: string
          engine: string
          ev_range_mi: number
          expected_price: number
          exterior_color: string
          exterior_color_family: string
          features: string[]
          features_verified: boolean
          fuel_type: string
          horsepower: number
          id: string
          interior_color: string
          interior_material: string
          is_active: boolean
          is_exploration: boolean
          last_price_drop: number
          lat: number
          lng: number
          make: string
          miles: number
          model: string
          mpg_city: number
          mpg_hwy: number
          msrp: number
          open_recalls: number
          owner_count: number
          personal_use: boolean
          photo_count: number
          photos: string[]
          price: number
          quality_score: number
          seats: number
          seller_type: string
          source: string
          source_url: string
          third_row: boolean
          title_status: string
          towing_lbs: number
          transmission: string
          trim_level: string
          vin: string
          visual_sim: number
          year: number
          zip: string
        }[]
      }
      mark_purchased: {
        Args: { p_interest_id: string; p_price?: number }
        Returns: undefined
      }
      pick_offer: { Args: { p_offer_id: string }; Returns: string }
      record_swipes: { Args: { p_swipes: Json }; Returns: Json }
      refresh_market_stats: { Args: never; Returns: number }
      review_seller: {
        Args: { p_comment: string; p_interest_id: string; p_stars: number }
        Returns: undefined
      }
      run_maintenance: { Args: never; Returns: Json }
      seed_taste: {
        Args: { p_chosen: string[]; p_rejected: string[] }
        Returns: undefined
      }
      send_offer: {
        Args: { p_interest_id: string; p_offer: Json }
        Returns: string
      }
      share_phone: { Args: { p_conversation_id: string }; Returns: undefined }
      vec_scale: { Args: { s: number; v: string }; Returns: string }
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
  public: {
    Enums: {},
  },
} as const

