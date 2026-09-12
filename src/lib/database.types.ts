// Mirrors supabase/migrations/001_initial_schema.sql. Can be regenerated with
// supabase gen types typescript --project-id uncspldfjqqaaszlglkp.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Actor = { firebase_uid: string; user_name: string; user_email: string; created_at: string; updated_at: string };
export type UserRow = { id: string; username: string; email: string; is_admin: boolean; is_approved: boolean; allowed_groups: string[]; created_at: string; updated_at: string };
export type ListaRow = Actor & { id: string; data: Json; revision: number };
export type ItemRow = Actor & { lista_id: string; id: string; codigo: string; payload: Json; revision: number };
export type BaseRow = Actor & { kind: 'coletor' | 'refugo'; raw_text: string; total_rows: number; file_name: string; revision: number };
export type RefugoScanRow = Actor & { id: string; payload: Json; generation: string | null };
export type IndividualRow = Actor & { session: string; id: string; codigo: string; payload: Json; revision: number };
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
export type Database = { public: {
  Tables: {
    users: Table<UserRow>;
    coleta_listas: Table<ListaRow>;
    coleta_itens: Table<ItemRow>;
    bases_operacionais: Table<BaseRow>;
    refugo_state: Table<{ id: string; generation: string | null; updated_at: string }>;
    refugo_scans: Table<RefugoScanRow>;
    individual_items: Table<IndividualRow>;
    operational_history: Table<Actor & { id: number; entity_id: string; action: string; payload: Json }>;
  };
  Views: Record<string, never>;
  Functions: {
    list_visible_users: { Args: Record<string, never>; Returns: UserRow[] };
    update_user_permissions: { Args: { p_user_id: string; p_is_admin: boolean | null; p_is_approved: boolean | null; p_allowed_groups: string[] | null }; Returns: boolean };
    mutate_lista: { Args: { p_mutation: Json }; Returns: boolean };
    upsert_operational_base: { Args: { p_kind: string; p_raw_text: string; p_total_rows: number; p_file_name: string; p_expected_revision?: number | null }; Returns: boolean };
    clear_operational_base: { Args: { p_kind: string; p_expected_revision?: number | null }; Returns: boolean };
    mutate_refugo_scans: { Args: { p_scans: Json; p_generation: string | null }; Returns: boolean };
    reset_refugo_scans: { Args: Record<string, never>; Returns: boolean };
    mutate_individual_items: { Args: { p_session: string; p_items: Json; p_removed_ids: string[]; p_clear?: boolean }; Returns: boolean };
    promote_individual_session: { Args: { p_session: string; p_lista_id: string; p_expected_items?: Json }; Returns: Json };
  };
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
} };

export function asJson(value: unknown): Json { return JSON.parse(JSON.stringify(value)) as Json; }
