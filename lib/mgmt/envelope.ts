// Standard response envelope for every /api/mgmt/v1/* route — defined by the
// cross-app management API contract. Every app on the central dashboard
// returns the same shape so the dashboard can speak to all of them
// generically. Don't get clever with this shape; additive fields only.

import { NextResponse } from "next/server";

export const APP_SLUG = "curatada";
export const MGMT_API_VERSION = "1.0";

export function envelope<T>(data: T) {
  return {
    app: APP_SLUG,
    version: MGMT_API_VERSION,
    as_of: new Date().toISOString(),
    data,
  };
}

export function envelopeResponse<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(envelope(data), init);
}

export function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
