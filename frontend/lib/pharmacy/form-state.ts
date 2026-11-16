/** Shared state shape for every pharmacy fulfilment form. */
export interface PharmacyFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export const INITIAL_PHARMACY_FORM_STATE: PharmacyFormState = {
  status: "idle",
};
