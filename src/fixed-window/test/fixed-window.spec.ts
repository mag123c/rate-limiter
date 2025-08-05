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

    // 첫 번째 윈도우
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();

    jest.advanceTimersByTime(6000);

    // 두 번째 윈도우
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

  it("윈도우 경계 부근에서 예상치 못하게 많은 양의 트래픽이 처리될 수 있다.", () => {
    // Fixed Window 알고리즘의 핵심 단점을 보여주는 테스트
    // 윈도우 전환 시점에 burst traffic 발생 가능
    const rateLimiter = new FixedWindowRateLimiter({
      threshold: 100,
      windowSizeMs: 60000, // 1min
    });

    jest.useFakeTimers();

    // 첫 번째 윈도우
    for (let i = 0; i < 100; i++) {
      expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    }
    jest.advanceTimersByTime(59000);
    expect(() => rateLimiter.tryConsume("user1")).toThrow();

    jest.advanceTimersByTime(1000);

    // 두 번째 윈도우
    for (let i = 0; i < 100; i++) {
      expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    }
    expect(() => rateLimiter.tryConsume("user1")).toThrow();

    jest.useRealTimers();
  });
});
