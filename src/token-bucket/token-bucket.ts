import { TokenBucketConfig } from "./config";
import { RateLimiter } from "../rate-limiter";

interface TokenBucket {
  token: number;
  lastRequestTime: number; // 마지막 요청 unix
}

export class TokenBucketRateLimiter implements RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();

  constructor(private config: TokenBucketConfig) {}

  tryConsume(key: string): void {
    if (!this.hasEnoughTokens(key)) {
      throw new Error("Rate Limit Exceed");
    }
    this.consumeTokens(key);
  }

  private hasEnoughTokens(key: string): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      this.createBucket(key);
      bucket = this.buckets.get(key)!;
    }
    this.refillTokens(bucket);

    return bucket.token >= this.config.consumePerRequest;
  }

  private consumeTokens(key: string) {
    const bucket = this.buckets.get(key)!;
    bucket.token -= this.config.consumePerRequest;
    bucket.lastRequestTime = Date.now();
  }

  private refillTokens(bucket: TokenBucket) {
    const now = Date.now();
    const elapsedMs = now - bucket.lastRequestTime;
    const elapsedSeconds = elapsedMs / 1000;

    const tokensToAdd = elapsedSeconds * this.config.refillRate;
    bucket.token = Math.min(bucket.token + tokensToAdd, this.config.capacity);

    bucket.lastRequestTime = now;
  }

  private createBucket(key: string) {
    return this.buckets.set(key, {
      token: this.config.capacity,
      lastRequestTime: 0,
    });
  }
}
