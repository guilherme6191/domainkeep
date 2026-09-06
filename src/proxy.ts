import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Auth is enforced by each route from the session, not by path matching here.
 * The middleware still has to run: `auth()` only works behind `clerkMiddleware`.
 */
export default clerkMiddleware();

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
