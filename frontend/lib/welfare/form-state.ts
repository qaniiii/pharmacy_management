/** Shared state shape for every welfare-home form. */
export interface WelfareFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export const INITIAL_WELFARE_FORM_STATE: WelfareFormState = { status: "idle" };
