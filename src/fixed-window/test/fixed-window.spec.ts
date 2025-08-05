import { FixedWindowRateLimiter } from "../fixed-window";

describe("Fixed Window", () => {
  it("임계치에 도달하면, 에러가 발생한다.", () => {
    const rateLimiter = new FixedWindowRateLimiter({
      threshold: 3,
      windowSizeMs: 5000,
    });

    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();

    expect(() => rateLimiter.tryConsume("user1")).toThrow();
  });

  it("다음 윈도우로 넘어가면(?), 임계치만큼 재요청이 가능하다.", () => {
    const rateLimiter = new FixedWindowRateLimiter({
      threshold: 3,
      windowSizeMs: 5000,
    });

    jest.useFakeTimers();

    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();

    jest.advanceTimersByTime(6000);

    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();

    expect(() => rateLimiter.tryConsume("user1")).toThrow();

    jest.useRealTimers();
  });

  it("서로 다른 키는 독립적인 윈도우를 가진다", () => {
    const rateLimiter = new FixedWindowRateLimiter({
      threshold: 2,
      windowSizeMs: 5000,
    });

    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user2")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user2")).not.toThrow();

    expect(() => rateLimiter.tryConsume("user1")).toThrow();
    expect(() => rateLimiter.tryConsume("user2")).toThrow();
  });
});
