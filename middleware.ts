import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes: landing page, health check, Clerk's own sign-in/up routes.
// Everything else requires authentication.
const isPublicRoute = createRouteMatcher([
  "/",
  "/api/health",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
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
