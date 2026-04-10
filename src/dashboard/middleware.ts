export { default } from "next-auth/middleware";

export const config = {
  // Protect everything except login, API auth routes, and static assets
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
