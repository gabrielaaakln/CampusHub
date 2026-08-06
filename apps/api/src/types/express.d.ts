declare global {
  namespace Express {
    interface Request {
      /** set by the validate middleware */
      valid: Record<string, unknown>;
    }
  }
}

export {};
