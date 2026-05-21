import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { logGpcSignal } from "@/lib/gpc/log";

// Public routes: landing page, health check, Clerk's own sign-in/up routes.
// Everything else requires authentication.
const isPublicRoute = createRouteMatcher([
  "/",
  "/api/health",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req, event) => {
  // GPC detection on every matched request — non-blocking, best-effort.
  // Sec-GPC is the standard request header browsers/extensions set when the
  // user has Global Privacy Control enabled. Per privacy-notice-work-list-v1.md
  // §1 we log every observation; the consent-logging surface honors it too.
  const gpc = req.headers.get("sec-gpc");
  if (gpc) {
    const { userId } = await auth();
    event.waitUntil(
      logGpcSignal({
        requestPath: req.nextUrl.pathname,
        gpcHeaderValue: gpc,
        clerkUserId: userId ?? null,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent"),
      })
    );
  }

  if (!isPublicRoute(req)) {
    await auth().protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Clerk-internal routes (current Clerk middleware guidance)
    "/__clerk/(.*)",
  ],
};
