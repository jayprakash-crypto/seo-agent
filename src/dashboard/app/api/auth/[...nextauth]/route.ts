import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyTotp } from "@/lib/auth";

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Life Circle",
      credentials: {
        password: { label: "Password", type: "password" },
        totp: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.password || !credentials?.totp) return null;

        const masterPassword = process.env.DASHBOARD_PASSWORD;
        if (!masterPassword) {
          console.error("[auth] DASHBOARD_PASSWORD env var not set");
          return null;
        }

        // Check password
        if (credentials.password !== masterPassword) return null;

        // Check TOTP
        if (!verifyTotp(credentials.totp)) return null;

        return { id: "1", name: "Life Circle", email: "operator@seoagent.local" };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = "operator";
      return token;
    },
    async session({ session, token }) {
      if (token) (session.user as { role?: string }).role = token.role as string;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
