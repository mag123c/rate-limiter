import { LeakyBucketRateLimiter } from "./leaky-bucket";
import { LeakyBucketConfig } from "./config";
import { createRateLimiterMiddleware, RateLimiterMiddlewareOptions } from "../middleware/rate-limiter-factory";

export function createLeakyBucketMiddleware(
  config: LeakyBucketConfig,
  options?: RateLimiterMiddlewareOptions
) {
  const limiter = new LeakyBucketRateLimiter(config);
  return createRateLimiterMiddleware(limiter, options);
}