/** Shared state shape for every admin form and toggle. */
export interface AdminFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export const INITIAL_ADMIN_FORM_STATE: AdminFormState = { status: "idle" };
