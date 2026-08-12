import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the `middleware` convention to `proxy` (same purpose:
// runs before a request completes, here used for auth session refresh +
// route guarding). See node_modules/next/dist/docs/.../proxy.md.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Excludes /api: every API route already does its own auth check
  // server-side (requireProfile-equivalent getUser() calls), so this
  // middleware guard was redundant for them — and actively broke two
  // things that hit API routes without a session cookie: Vercel Cron's
  // /api/keepalive ping (silently redirected to /login instead of ever
  // reaching the DB) and the public /api/access-requests submit endpoint.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
