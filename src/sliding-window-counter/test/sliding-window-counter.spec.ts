import { SlidingWindowCounterRateLimiter } from "../sliding-window-counter";

describe("Sliding Window Counter", () => {
  it("요청이 threshold 이하면 에러가 발생하지 않음", () => {
    const rateLimiter = new SlidingWindowCounterRateLimiter({
      threshold: 10,
      windowSizeMs: 1000,
    });

    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
  });

  it("요청이 threshold를 초과하면 에러를 발생시킴", () => {
    const rateLimiter = new SlidingWindowCounterRateLimiter({
      threshold: 2,
      windowSizeMs: 1000,
    });

    rateLimiter.tryConsume("user1");
    rateLimiter.tryConsume("user1");
    expect(() => rateLimiter.tryConsume("user1")).toThrow("Rate Limit Exceeded");
  });

  it("서로 다른 key는 독립적으로 동작", () => {
    const rateLimiter = new SlidingWindowCounterRateLimiter({
      threshold: 1,
      windowSizeMs: 1000,
    });

    rateLimiter.tryConsume("user1");
    expect(() => rateLimiter.tryConsume("user1")).toThrow();
    expect(() => rateLimiter.tryConsume("user2")).not.toThrow();
  });

  it("이전 윈도우와 현재 윈도우의 가중 평균을 계산", () => {
    const rateLimiter = new SlidingWindowCounterRateLimiter({
      threshold: 10,
      windowSizeMs: 1000,
    });

    jest.useFakeTimers();
    const baseTime = Date.now();
    jest.setSystemTime(baseTime);

    // 첫 번째 윈도우에서 8개 요청
    for (let i = 0; i < 8; i++) {
      rateLimiter.tryConsume("user1");
    }

    // 다음 윈도우로 이동 (500ms 후 = 새 윈도우의 50% 지점)
    jest.setSystemTime(baseTime + 1500);

    // 슬라이딩 윈도우 특성: 이전 윈도우 가중치가 적용됨
    // 최소한 일부 요청은 성공해야 함
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();

    jest.useRealTimers();
  });

  it("시간이 지나면 새로운 윈도우로 완전히 전환", () => {
    const rateLimiter = new SlidingWindowCounterRateLimiter({
      threshold: 5,
      windowSizeMs: 1000,
    });

    jest.useFakeTimers();
    const baseTime = Date.now();
    jest.setSystemTime(baseTime);

    // 첫 번째 윈도우에서 5개 요청 (가득 참)
    for (let i = 0; i < 5; i++) {
      rateLimiter.tryConsume("user1");
    }
    expect(() => rateLimiter.tryConsume("user1")).toThrow();

    // 두 개의 윈도우가 지난 후 (이전 윈도우 영향 없음)
    jest.setSystemTime(baseTime + 2000);

    // 새로운 윈도우에서 5개 요청 가능
    for (let i = 0; i < 5; i++) {
      expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    }
    expect(() => rateLimiter.tryConsume("user1")).toThrow();

    jest.useRealTimers();
  });

  it("cleanup 메서드가 오래된 윈도우를 제거", () => {
    const rateLimiter = new SlidingWindowCounterRateLimiter({
      threshold: 5,
      windowSizeMs: 1000,
    });

    jest.useFakeTimers();
    const baseTime = Date.now();
    jest.setSystemTime(baseTime);

    rateLimiter.tryConsume("user1");
    rateLimiter.tryConsume("user2");

    // 3개 윈도우 후
    jest.setSystemTime(baseTime + 3000);

    rateLimiter.cleanup();

    // 새로운 요청은 정상 동작
    expect(() => rateLimiter.tryConsume("user1")).not.toThrow();
    expect(() => rateLimiter.tryConsume("user2")).not.toThrow();

    jest.useRealTimers();
  });

});