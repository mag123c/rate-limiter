import { TokenBucketRateLimiter } from "./token-bucket";
import { TokenBucketConfig } from "./config";
import { createRateLimiterMiddleware, RateLimiterMiddlewareOptions } from "../middleware/rate-limiter-factory";

export function createTokenBucketMiddleware(
  config: TokenBucketConfig,
  options?: RateLimiterMiddlewareOptions
) {
  const limiter = new TokenBucketRateLimiter(config);
  return createRateLimiterMiddleware(limiter, options);
}