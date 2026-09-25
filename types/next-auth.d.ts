import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      organizationId?: string;
      role?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId?: string;
    role?: string;
  }
}
