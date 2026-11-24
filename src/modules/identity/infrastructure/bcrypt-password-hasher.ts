import bcrypt from "bcryptjs";
import type { PasswordHasher } from "../application/authenticate-user";

export const bcryptPasswordHasher: PasswordHasher = {
  verify: (password, hash) => bcrypt.compare(password, hash),
};
