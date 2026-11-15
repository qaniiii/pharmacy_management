export interface LoginState {
  status: "idle" | "error";
  message?: string;
}

export const INITIAL_LOGIN_STATE: LoginState = { status: "idle" };
