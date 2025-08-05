import { FixedWindowConfig } from "./config";
import {
  createRateLimiterMiddleware,
  RateLimiterMiddlewareOptions,
} from "../middleware/rate-limiter-factory";
import { FixedWindowRateLimiter } from "./fixed-window";

export function createFixedWindowMiddleware(
  config: FixedWindowConfig,
  options?: RateLimiterMiddlewareOptions
) {
  const limiter = new FixedWindowRateLimiter(config);
  return createRateLimiterMiddleware(limiter, options);
}
