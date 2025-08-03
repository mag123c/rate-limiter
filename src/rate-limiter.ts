export interface RateLimiter {
  tryConsume(key: string): void;
}

export interface AsyncRateLimiter {
  enqueue(key: string, callback: () => void): Promise<void>;
}
