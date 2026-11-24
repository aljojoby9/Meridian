import type { PrismaClient } from "@prisma/client";
import type { UserCredentialsRecord, UserRepository } from "../application/authenticate-user";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  findByEmail(email: string): Promise<UserCredentialsRecord | null> {
    return this.db.user.findUnique({ where: { email } });
  }
}
