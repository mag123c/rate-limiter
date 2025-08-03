import { Request, Response, NextFunction } from "express";
import { RateLimiter, AsyncRateLimiter } from "../rate-limiter";

export interface RateLimiterMiddlewareOptions {
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  onLimitReached?: (req: Request, res: Response) => void;
}

const defaultKeyGenerator = (req: Request): string => {
  return req.ip || "unknown";
};

const defaultLimitHandler = (_req: Request, res: Response): void => {
  res.status(429).json({
    error: "Too Many Requests",
    message: "Rate limit exceeded. Please try again later.",
  });
};

export function createRateLimiterMiddleware(
  limiter: RateLimiter | AsyncRateLimiter,
  options: RateLimiterMiddlewareOptions = {}
) {
  const {
    keyGenerator = defaultKeyGenerator,
    skip,
    onLimitReached = defaultLimitHandler,
  } = options;

  if ("tryConsume" in limiter) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (skip && skip(req)) {
        return next();
      }

      const key = keyGenerator(req);

      try {
        limiter.tryConsume(key);
        next();
      } catch (error) {
        onLimitReached(req, res);
      }
    };
  }

  return (req: Request, res: Response, next: NextFunction) => {
    if (skip && skip(req)) {
      return next();
    }

    const key = keyGenerator(req);

    limiter
      .enqueue(key, () => {
        next();
      })
      .catch(() => {
        onLimitReached(req, res);
      });
  };
}
