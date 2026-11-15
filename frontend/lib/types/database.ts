/**
 * Hand-maintained mirror of `supabase/migrations/*.sql`.
 *
 * Keep this file in sync with the migrations:
 *   - platform entities: welfare_homes, pharmacies, profiles
 *   - tenant data:       residents, inventory_items
 *   - ordering:          orders, order_items
 *   - tenant-private:    order_residents, order_item_inventory
 *   - audit:             order_audit_logs
 *
 * Conventions:
 *   - `timestamptz` / `date` arrive from PostgREST as ISO strings.
 *   - `numeric` arrives as a JSON number.
 *   - Columns with a database default are optional on INSERT.
 *   - Generated / trigger-derived columns (`line_total`, the derived
 *     `welfare_home_id` values, audit rows, timestamp stamps) are not writable.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "system_admin" | "welfare_admin" | "pharmacy_admin";

export type OrderStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "prepared"
  | "completed"
  | "cancelled";

/* -------------------------------------------------------------------------- */
/* welfare_homes                                                              */
/* -------------------------------------------------------------------------- */

export type WelfareHomeRow = {
  id: string;
  name: string;
  registration_number: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type WelfareHomeInsert = {
  id?: string;
  name: string;
  registration_number: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  region?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
};

export type WelfareHomeUpdate = Partial<WelfareHomeInsert>;

/* -------------------------------------------------------------------------- */
/* pharmacies                                                                 */
/* -------------------------------------------------------------------------- */

export type PharmacyRow = {
  id: string;
  name: string;
  license_number: string;
  contact_person: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PharmacyInsert = {
  id?: string;
  name: string;
  license_number: string;
  contact_person?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  region?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
};

export type PharmacyUpdate = Partial<PharmacyInsert>;

/* -------------------------------------------------------------------------- */
/* profiles                                                                   */
/* -------------------------------------------------------------------------- */

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  welfare_home_id: string | null;
  pharmacy_id: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Rows are provisioned by the `handle_new_user` trigger or the service role,
 * never by a tenant client, which is why this type is only used server-side.
 */
export type ProfileInsert = {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: UserRole;
  welfare_home_id?: string | null;
  pharmacy_id?: string | null;
  is_active?: boolean;
  last_seen_at?: string | null;
};

export type ProfileUpdate = {
  email?: string;
  full_name?: string;
  phone?: string | null;
  role?: UserRole;
  welfare_home_id?: string | null;
  pharmacy_id?: string | null;
  is_active?: boolean;
  last_seen_at?: string | null;
};

/* -------------------------------------------------------------------------- */
/* residents                                                                  */
/* -------------------------------------------------------------------------- */

export type ResidentRow = {
  id: string;
  welfare_home_id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  room_number: string | null;
  medical_record_number: string | null;
  allergies: string[];
  care_notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ResidentInsert = {
  id?: string;
  welfare_home_id: string;
  full_name: string;
  date_of_birth?: string | null;
  gender?: string | null;
  room_number?: string | null;
  medical_record_number?: string | null;
  allergies?: string[];
  care_notes?: string | null;
  is_active?: boolean;
};

export type ResidentUpdate = Partial<ResidentInsert>;

/* -------------------------------------------------------------------------- */
/* inventory_items                                                            */
/* -------------------------------------------------------------------------- */

export type InventoryItemRow = {
  id: string;
  welfare_home_id: string;
  /** NULL = pooled facility stock; set = stock allocated to that resident. */
  resident_id: string | null;
  medication_name: string;
  generic_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  batch_number: string | null;
  expiry_date: string | null;
  storage_location: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InventoryItemInsert = {
  id?: string;
  welfare_home_id: string;
  resident_id?: string | null;
  medication_name: string;
  generic_name?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  unit?: string;
  quantity_on_hand?: number;
  reorder_level?: number;
  batch_number?: string | null;
  expiry_date?: string | null;
  storage_location?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export type InventoryItemUpdate = Partial<InventoryItemInsert>;

/* -------------------------------------------------------------------------- */
/* orders                                                                     */
/* -------------------------------------------------------------------------- */

export type OrderRow = {
  id: string;
  order_number: string;
  welfare_home_id: string;
  pharmacy_id: string;
  /** Non-identifying bag label. Never contains names, DOB or MRNs. */
  resident_reference: string | null;
  status: OrderStatus;
  requested_by: string | null;
  decided_by: string | null;
  notes: string | null;
  rejection_reason: string | null;
  total_amount: number;
  submitted_at: string;
  accepted_at: string | null;
  prepared_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
};

/**
 * `total_amount` and every timestamp are derived by triggers, so they are not
 * part of the payload. `requested_by` defaults to `auth.uid()`.
 */
export type OrderInsert = {
  id?: string;
  order_number?: string;
  welfare_home_id: string;
  pharmacy_id: string;
  resident_reference?: string | null;
  status?: "pending";
  requested_by?: string | null;
  notes?: string | null;
};

/** Only the fields a client may drive; status edges are enforced by trigger. */
export type OrderUpdate = {
  resident_reference?: string | null;
  status?: OrderStatus;
  notes?: string | null;
  rejection_reason?: string | null;
};

/* -------------------------------------------------------------------------- */
/* order_items                                                                */
/* -------------------------------------------------------------------------- */

export type OrderItemRow = {
  id: string;
  order_id: string;
  /** Derived from the parent order by trigger. */
  welfare_home_id: string;
  medication_name: string;
  strength: string | null;
  dosage_form: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  /** Generated column: quantity * unit_price. */
  line_total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItemInsert = {
  id?: string;
  order_id: string;
  /** Optional: the trigger always overwrites it with the order's home. */
  welfare_home_id?: string;
  medication_name: string;
  strength?: string | null;
  dosage_form?: string | null;
  unit?: string;
  quantity: number;
  unit_price?: number;
  notes?: string | null;
};

export type OrderItemUpdate = {
  medication_name?: string;
  strength?: string | null;
  dosage_form?: string | null;
  unit?: string;
  quantity?: number;
  unit_price?: number;
  notes?: string | null;
};

/* -------------------------------------------------------------------------- */
/* order_residents — tenant-private patient link                              */
/* -------------------------------------------------------------------------- */

export type OrderResidentRow = {
  order_id: string;
  welfare_home_id: string;
  resident_id: string;
  created_at: string;
};

export type OrderResidentInsert = {
  order_id: string;
  /** Optional: derived from the order by trigger. */
  welfare_home_id?: string;
  resident_id: string;
};

/* -------------------------------------------------------------------------- */
/* order_item_inventory — tenant-private stock link                           */
/* -------------------------------------------------------------------------- */

export type OrderItemInventoryRow = {
  order_item_id: string;
  welfare_home_id: string;
  inventory_item_id: string;
  created_at: string;
};

export type OrderItemInventoryInsert = {
  order_item_id: string;
  /** Optional: derived from the line item by trigger. */
  welfare_home_id?: string;
  inventory_item_id: string;
};

/* -------------------------------------------------------------------------- */
/* order_audit_logs — append-only, written by trigger only                    */
/* -------------------------------------------------------------------------- */

export type OrderAuditLogRow = {
  /** bigint identity, serialised as a number. */
  id: number;
  order_id: string;
  /** NULL marks order creation. */
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  changed_at: string;
  metadata: Json;
};

/* -------------------------------------------------------------------------- */
/* Supabase client schema                                                     */
/* -------------------------------------------------------------------------- */

type ReadOnlyTable<Row> = {
  Row: Row;
  Insert: Record<string, never>;
  Update: Record<string, never>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      welfare_homes: {
        Row: WelfareHomeRow;
        Insert: WelfareHomeInsert;
        Update: WelfareHomeUpdate;
        Relationships: [];
      };
      pharmacies: {
        Row: PharmacyRow;
        Insert: PharmacyInsert;
        Update: PharmacyUpdate;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      residents: {
        Row: ResidentRow;
        Insert: ResidentInsert;
        Update: ResidentUpdate;
        Relationships: [];
      };
      inventory_items: {
        Row: InventoryItemRow;
        Insert: InventoryItemInsert;
        Update: InventoryItemUpdate;
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: OrderInsert;
        Update: OrderUpdate;
        Relationships: [];
      };
      order_items: {
        Row: OrderItemRow;
        Insert: OrderItemInsert;
        Update: OrderItemUpdate;
        Relationships: [];
      };
      order_residents: ReadOnlyTable<OrderResidentRow> & {
        Insert: OrderResidentInsert;
      };
      order_item_inventory: ReadOnlyTable<OrderItemInventoryRow> & {
        Insert: OrderItemInventoryInsert;
      };
      order_audit_logs: ReadOnlyTable<OrderAuditLogRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      current_profile_role: {
        Args: Record<string, never>;
        Returns: UserRole;
      };
      current_welfare_home_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      current_pharmacy_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      is_system_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      welfare_home_has_ordered_with: {
        Args: { p_pharmacy_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      order_status: OrderStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

export type TableRow<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TableInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TableUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
