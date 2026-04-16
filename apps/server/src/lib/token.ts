import jwt from 'jsonwebtoken';

/**
 * Interface for token payload
 * Extend this interface in your application for specific payload structures
 */
export interface TokenPayload {
  user: {
    id: string;
    name: string;
    email: string;
  }
}

/**
 * Token class for generating and verifying JWT tokens
 */
export class Token {
  private static readonly SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  private static readonly EXPIRATION = process.env.JWT_EXPIRATION || '24h';

  /**
   * Generates a token with the given payload
   * @param payload - The data to encode in the token (must implement TokenPayload interface)
   * @param expiresIn - Optional custom expiration time (e.g., '7d', '24h', 3600)
   * @returns The generated JWT token string
   */
  static generate(payload: TokenPayload, expiresIn?: string | number): string {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload must be a non-empty object');
    }

    if (!this.SECRET_KEY || this.SECRET_KEY === 'your-secret-key-change-in-production') {
      console.warn('⚠️  JWT_SECRET is not set or using default value. Please set JWT_SECRET environment variable in production.');
    }

    try {
      const token = jwt.sign(payload, this.SECRET_KEY, {
        expiresIn: expiresIn || this.EXPIRATION,
        algorithm: 'HS256',
      });

      return token;
    } catch (error) {
      throw new Error(`Failed to generate token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verifies and decodes a token, returning the payload if valid
   * @param token - The JWT token string to verify
   * @returns The decoded payload if valid
   * @throws Error if token is invalid or expired
   */
  static verify(token: string): TokenPayload {
    if (!token || typeof token !== 'string') {
      throw new Error('Token must be a non-empty string');
    }

    if (!this.SECRET_KEY) {
      throw new Error('JWT_SECRET is not configured');
    }

    try {
      const decoded = jwt.verify(token, this.SECRET_KEY, {
        algorithms: ['HS256'],
      }) as TokenPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid or malformed token');
      } else {
        throw new Error(`Failed to verify token: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Checks if a token is valid without throwing an error
   * @param token - The JWT token string to check
   * @returns True if token is valid, false otherwise
   */
  static isValid(token: string): boolean {
    try {
      this.verify(token);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely decodes a token without verification (useful for reading claims before verification)
   * @param token - The JWT token string to decode
   * @returns The decoded payload if token is valid base64, null otherwise
   */
  static decode(token: string): TokenPayload | null {
    try {
      const decoded = jwt.decode(token) as TokenPayload | null;
      return decoded;
    } catch {
      return null;
    }
  }
}
