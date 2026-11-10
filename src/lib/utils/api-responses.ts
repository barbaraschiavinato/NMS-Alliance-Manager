import { NextResponse } from "next/server";

// JSON error responses shared by the route handlers. `error` is a translation key: the client shows it with `t()`.

export function apiError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/** 401: no session, or a member that may not use the app (pending, blocked). */
export function unauthorized() {
  return apiError("errors.sign_in_required", 401);
}

/** 403 for members below the moderator role. */
export function moderatorRequired() {
  return apiError("errors.moderator_permission_required", 403);
}

/** 403 for members below the admin role. */
export function adminRequired() {
  return apiError("errors.administrator_permission_required", 403);
}

export function forbidden(error: string) {
  return apiError(error, 403);
}

export function badRequest(error: string) {
  return apiError(error, 400);
}

export function notFound(error: string) {
  return apiError(error, 404);
}

export function conflict(error: string) {
  return apiError(error, 409);
}
