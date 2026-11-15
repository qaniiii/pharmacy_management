"use server";

/**
 * Server actions for the system-administration portal.
 *
 * Reads and tenant CRUD go straight to Supabase as the signed-in system
 * administrator (RLS applies). Account provisioning and activation require the
 * service role, so those two call FastAPI with the caller's access token.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { AdminFormState } from "@/lib/admin/form-state";
import {
  isUuid,
  parsePharmacyForm,
  parseProvisionForm,
  parseWelfareHomeForm,
} from "@/lib/admin/validation";
import { BackendError, callBackend } from "@/lib/api/backend";
import { requireRole } from "@/lib/auth/profile";
import type {
  ProvisionedUser,
  UserStatusPayload,
  UserStatusResponse,
} from "@/lib/types/api";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function backToTab(tab: string): never {
  const safeTab =
    tab === "pharmacies" || tab === "users" || tab === "welfare" ? tab : "welfare";
  redirect(`/admin?tab=${safeTab}`);
}

function notice(tab: string, message: string): never {
  const safeTab =
    tab === "pharmacies" || tab === "users" || tab === "welfare" ? tab : "welfare";
  redirect(`/admin?tab=${safeTab}&notice=${encodeURIComponent(message)}`);
}

/* -------------------------------------------------------------------------- */
/* Welfare homes                                                              */
/* -------------------------------------------------------------------------- */

export async function createWelfareHomeAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const { supabase } = await requireRole("system_admin");
  const { values, fieldErrors } = parseWelfareHomeForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors,
    };
  }

  const { error } = await supabase.from("welfare_homes").insert(values);

  if (error) {
    return {
      status: "error",
      message:
        error.code === "23505"
          ? "A welfare home with that registration number already exists."
          : `Could not create the welfare home: ${error.message}`,
    };
  }

  revalidatePath("/admin");
  notice("welfare", `${values.name} was registered.`);
}

export async function setWelfareHomeActiveAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const { supabase } = await requireRole("system_admin");
  const id = text(formData, "id");
  const isActive = text(formData, "is_active") === "true";

  if (!isUuid(id)) {
    return { status: "error", message: "Invalid welfare home." };
  }

  const { error } = await supabase
    .from("welfare_homes")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return {
      status: "error",
      message: `Could not update the welfare home: ${error.message}`,
    };
  }

  revalidatePath("/admin");
  backToTab("welfare");
}

/* -------------------------------------------------------------------------- */
/* Pharmacies                                                                 */
/* -------------------------------------------------------------------------- */

export async function createPharmacyAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const { supabase } = await requireRole("system_admin");
  const { values, fieldErrors } = parsePharmacyForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors,
    };
  }

  const { error } = await supabase.from("pharmacies").insert(values);

  if (error) {
    return {
      status: "error",
      message:
        error.code === "23505"
          ? "A pharmacy with that licence number already exists."
          : `Could not register the pharmacy: ${error.message}`,
    };
  }

  revalidatePath("/admin");
  notice("pharmacies", `${values.name} was registered.`);
}

export async function setPharmacyActiveAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const { supabase } = await requireRole("system_admin");
  const id = text(formData, "id");
  const isActive = text(formData, "is_active") === "true";

  if (!isUuid(id)) {
    return { status: "error", message: "Invalid pharmacy." };
  }

  const { error } = await supabase
    .from("pharmacies")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return {
      status: "error",
      message: `Could not update the pharmacy: ${error.message}`,
    };
  }

  revalidatePath("/admin");
  backToTab("pharmacies");
}

/* -------------------------------------------------------------------------- */
/* Administrator accounts (FastAPI + service role)                            */
/* -------------------------------------------------------------------------- */

export async function provisionUserAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const { supabase } = await requireRole("system_admin");
  const { payload, fieldErrors } = parseProvisionForm(formData);

  if (!payload) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors,
    };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      status: "error",
      message: "Your session has expired. Sign in again.",
    };
  }

  let provisioned: ProvisionedUser;

  try {
    provisioned = await callBackend<ProvisionedUser>("/api/v1/admin/users", {
      method: "POST",
      accessToken: session.access_token,
      body: payload,
    });
  } catch (error) {
    if (error instanceof BackendError) {
      return { status: "error", message: error.message };
    }
    console.error("Unexpected provisioning failure", error);
    return {
      status: "error",
      message: "Could not provision the account. Try again.",
    };
  }

  revalidatePath("/admin");
  notice(
    "users",
    provisioned.mode === "invite"
      ? `Invitation sent to ${provisioned.email}.`
      : `Account created for ${provisioned.email}.`,
  );
}

export async function setUserActiveAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const { supabase } = await requireRole("system_admin");
  const userId = text(formData, "user_id");
  const isActive = text(formData, "is_active") === "true";

  if (!isUuid(userId)) {
    return { status: "error", message: "Invalid administrator account." };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      status: "error",
      message: "Your session has expired. Sign in again.",
    };
  }

  try {
    await callBackend<UserStatusResponse>(
      `/api/v1/admin/users/${userId}/status`,
      {
        method: "PATCH",
        accessToken: session.access_token,
        body: { is_active: isActive } satisfies UserStatusPayload,
      },
    );
  } catch (error) {
    if (error instanceof BackendError) {
      return { status: "error", message: error.message };
    }
    console.error("Unexpected activation failure", error);
    return {
      status: "error",
      message: "Could not update the account. Try again.",
    };
  }

  revalidatePath("/admin");
  backToTab("users");
}
