import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { env, isPlaceholder } from "@/lib/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  trustHost: true,
  secret: env().NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    // Never render Auth.js's built-in error page (it can 500 in some
    // environments): all provider failures land on /login?error=… where the
    // login form shows a friendly, actionable message.
    error: "/login",
  },
  providers: [
    ...(!isPlaceholder(env().GOOGLE_CLIENT_ID) && !isPlaceholder(env().GOOGLE_CLIENT_SECRET)
      ? [
          Google({
            clientId: env().GOOGLE_CLIENT_ID!,
            clientSecret: env().GOOGLE_CLIENT_SECRET!,
            // Allow one account to sign in with BOTH password and Google when
            // the email address matches. Google verifies email ownership, so
            // auto-linking the OAuth Account to the existing User row is safe
            // and fixes "OAuthAccountNotLinked" for password-registered users.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "").toLowerCase().trim();
        const password = String(credentials?.password || "");
        if (!email || !password) return null;
        try {
          const user = await db.user.findUnique({ where: { email } });
          if (!user?.passwordHash) return null;
          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return null;
          return { id: user.id, email: user.email, name: user.name, image: user.image };
        } catch {
          // Never leak DB outages as a 500 page — surface as failed credentials.
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Auto-verify the email for OAuth logins (Google verifies ownership).
      // This lets a password-registered user also use Google with the same
      // email, and vice versa, without hitting OAuthAccountNotLinked.
      try {
        const email = (user?.email || (profile as { email?: string } | null)?.email || "")
          .toLowerCase()
          .trim();
        if (email && account?.provider === "google" && user?.id) {
          const existing = await db.user.findUnique({
            where: { email },
            select: { id: true, emailVerified: true },
          });
          if (existing && !existing.emailVerified) {
            await db.user.update({
              where: { id: existing.id },
              data: { emailVerified: new Date() },
            });
          }
        }
      } catch {
        // Never block sign-in on a bookkeeping update.
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user?.id) token.sub = user.id;
      if (trigger === "update" && (session as { organizationId?: string } | null)?.organizationId) {
        // Workspace switch requested by the client: re-validate membership
        // from the database. Forged organizationIds are ignored.
        const requested = (session as { organizationId?: string }).organizationId!;
        if (token.sub) {
          const membership = await db.organizationMember.findFirst({
            where: { userId: token.sub, organizationId: requested },
            select: { organizationId: true, role: true },
          });
          if (membership) {
            token.organizationId = membership.organizationId;
            token.role = membership.role;
          }
        }
      }
      if (token.sub && (!token.organizationId || trigger === "signIn" || user)) {
        const membership = await db.organizationMember.findFirst({
          where: { userId: token.sub },
          orderBy: { createdAt: "asc" },
        });
        token.organizationId = membership?.organizationId;
        token.role = membership?.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.organizationId = token.organizationId as string | undefined;
        session.user.role = token.role as string | undefined;
      }
      return session;
    },
  },
});
