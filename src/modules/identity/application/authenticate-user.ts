import { z } from "zod";

export interface UserCredentialsRecord {
  id: string;
  email: string;
  name: string | null;
  role: string;
  passwordHash: string | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserCredentialsRecord | null>;
}

export interface PasswordHasher {
  verify(password: string, hash: string): Promise<boolean>;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/** Email + password sign-in. Any failure returns `null`, never a reason. */
export class AuthenticateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async execute(credentials: unknown): Promise<AuthenticatedUser | null> {
    const parsed = credentialsSchema.safeParse(credentials);
    if (!parsed.success) return null;
    const user = await this.users.findByEmail(parsed.data.email);
    if (!user?.passwordHash) return null;
    const ok = await this.passwords.verify(parsed.data.password, user.passwordHash);
    if (!ok) return null;
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
