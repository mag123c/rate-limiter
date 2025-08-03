export interface RateLimiter {
  tryConsume(key: string): void;
}
