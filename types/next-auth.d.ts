import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      organizationId?: string;
      role?: string;
      /** JWT issue time (seconds). Used by app-layer session revocation gates. */
      iat?: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId?: string;
    role?: string;
  }
}
