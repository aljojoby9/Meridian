/**
 * Auth.js wiring: JWT sessions, the credentials provider, and the role claim.
 * Password checking itself is the identity module's AuthenticateUser use case.
 *
 * Middleware imports this file, so it wires only identity. Importing the full
 * container here would pull Stripe, QR, and Node crypto into the Edge bundle.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/shared/server/db";
import { DEFAULT_ROLE } from "@/modules/identity/domain/roles";
import { AuthenticateUser } from "@/modules/identity/application/authenticate-user";
import { PrismaUserRepository } from "@/modules/identity/infrastructure/prisma-user.repository";
import { bcryptPasswordHasher } from "@/modules/identity/infrastructure/bcrypt-password-hasher";

const authenticateUser = new AuthenticateUser(new PrismaUserRepository(prisma), bcryptPasswordHasher);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: (raw) => authenticateUser.execute(raw),
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = (user as { role?: string }).role ?? DEFAULT_ROLE;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as string) ?? DEFAULT_ROLE;
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    role?: string;
  }
}
