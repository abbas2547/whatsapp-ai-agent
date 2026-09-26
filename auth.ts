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
