import { TokenBucketRateLimiter } from "./token-bucket";

describe("Token Bucket", () => {
  it("토큰이 충분하면 에러가 발생하지 않음.", () => {
    const rateLimiter = new TokenBucketRateLimiter({
      capacity: 1,
      consumePerRequest: 1,
      refillRate: 1,
    });

    expect(() => rateLimiter.tryConsume("enough tokens")).not.toThrow();
  });

  it("토큰이 충분하지 않으면 에러를 발생시킴", () => {
    const rateLimiter = new TokenBucketRateLimiter({
      capacity: 0,
      consumePerRequest: 1,
      refillRate: 1,
    });

    expect(() => rateLimiter.tryConsume("not enough tokens")).toThrow();
  });

  it("연속 요청으로 토큰이 소진되어도 Rate Limit Exceed 에러를 발생시킴", () => {
    const rateLimiter = new TokenBucketRateLimiter({
      capacity: 2,
      consumePerRequest: 1,
      refillRate: 1,
    });

    rateLimiter.tryConsume("user1");
    rateLimiter.tryConsume("user1");
    expect(() => rateLimiter.tryConsume("user1")).toThrow();
  });

  it("서로 다른 key는 독립적으로 동작", () => {
    const rateLimiter = new TokenBucketRateLimiter({
      capacity: 1,
      consumePerRequest: 1,
      refillRate: 1,
    });

    rateLimiter.tryConsume("user1");
    expect(() => rateLimiter.tryConsume("user1")).toThrow();
    expect(() => rateLimiter.tryConsume("user2")).not.toThrow();
  });

  it("시간 경과 후 토큰이 재충전됨", () => {
    const rateLimiter = new TokenBucketRateLimiter({
      capacity: 100,
      consumePerRequest: 100,
      refillRate: 10,
    });

    rateLimiter.tryConsume("user1");
    jest.useFakeTimers();
    jest.advanceTimersByTime(10000);

    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();

    jest.useRealTimers();
  });
});
