import bcrypt from 'bcrypt';

export class Password {
  private static readonly SALT_ROUNDS = 10;

  /**
   * Encrypts a password using bcrypt
   * @param password - The plaintext password to encrypt
   * @returns The hashed password
   */
  static async encrypt(password: string): Promise<string> {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    const hash = await bcrypt.hash(password, this.SALT_ROUNDS);
    return hash;
  }

  /**
   * Compares a plaintext password with a hashed password
   * @param password - The plaintext password to verify
   * @param hash - The hashed password to compare against
   * @returns True if passwords match, false otherwise
   */
  static async compare(password: string, hash: string): Promise<boolean> {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    if (!hash || typeof hash !== 'string') {
      throw new Error('Hash must be a non-empty string');
    }

    const isMatch = await bcrypt.compare(password, hash);
    return isMatch;
  }
}
