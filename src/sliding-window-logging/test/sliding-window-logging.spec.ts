import { SlidingWindowLoggingRateLimiter } from "../sliding-window-logging";
import { SlidingWindowLoggingConfig } from "../config";

describe("SlidingWindowLoggingRateLimiter", () => {
  let rateLimiter: SlidingWindowLoggingRateLimiter;
  let config: SlidingWindowLoggingConfig;

  beforeEach(() => {
    jest.useFakeTimers();
    config = {
      threshold: 5,
      windowSizeMs: 1000,
    };
    rateLimiter = new SlidingWindowLoggingRateLimiter(config);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("임계치까지 요청을 허용해야 한다", () => {
    const key = "user1";

    // 5개의 요청이 모두 성공해야 함
    for (let i = 0; i < 5; i++) {
      expect(() => rateLimiter.tryConsume(key)).not.toThrow();
    }
  });

  it("임계치를 초과하면 에러를 발생시켜야 한다", () => {
    const key = "user1";

    // 5개의 요청 성공
    for (let i = 0; i < 5; i++) {
      rateLimiter.tryConsume(key);
    }

    // 6번째 요청은 실패해야 함
    expect(() => rateLimiter.tryConsume(key)).toThrow("Rate limit exceeded");
  });

  it("서로 다른 키는 독립적으로 동작해야 한다", () => {
    const key1 = "user1";
    const key2 = "user2";

    // user1에 대해 5개 요청
    for (let i = 0; i < 5; i++) {
      rateLimiter.tryConsume(key1);
    }

    // user2는 여전히 요청 가능해야 함
    expect(() => rateLimiter.tryConsume(key2)).not.toThrow();

    // user1은 더 이상 요청 불가
    expect(() => rateLimiter.tryConsume(key1)).toThrow("Rate limit exceeded");
  });

  it("윈도우가 슬라이딩되면서 오래된 요청이 제거되어야 한다", () => {
    const key = "user1";

    // 5개의 요청
    for (let i = 0; i < 5; i++) {
      rateLimiter.tryConsume(key);
    }

    // 6번째 요청은 실패
    expect(() => rateLimiter.tryConsume(key)).toThrow("Rate limit exceeded");

    // 500ms 경과
    jest.advanceTimersByTime(500);

    // 여전히 실패해야 함 (아직 1초가 지나지 않음)
    expect(() => rateLimiter.tryConsume(key)).toThrow("Rate limit exceeded");

    // 추가로 600ms 경과 (총 1.1초)
    jest.advanceTimersByTime(600);

    // 이제 첫 번째 요청이 윈도우를 벗어났으므로 새 요청 가능
    expect(() => rateLimiter.tryConsume(key)).not.toThrow();
  });

  it("정확한 슬라이딩 윈도우 동작을 확인해야 한다", () => {
    const key = "user1";

    // 0ms: 2개 요청
    rateLimiter.tryConsume(key);
    rateLimiter.tryConsume(key);

    // 300ms: 2개 요청
    jest.advanceTimersByTime(300);
    rateLimiter.tryConsume(key);
    rateLimiter.tryConsume(key);

    // 700ms: 1개 요청 (총 5개)
    jest.advanceTimersByTime(400);
    rateLimiter.tryConsume(key);

    // 여전히 5개가 윈도우 내에 있으므로 실패
    expect(() => rateLimiter.tryConsume(key)).toThrow("Rate limit exceeded");

    // 1001ms: 처음 2개가 윈도우를 벗어남 (1000ms 윈도우이므로 1001ms가 되어야 벗어남)
    jest.advanceTimersByTime(301);

    // 이제 3개만 윈도우 내에 있으므로 2개 더 가능
    expect(() => rateLimiter.tryConsume(key)).not.toThrow();
    expect(() => rateLimiter.tryConsume(key)).not.toThrow();

    // 다시 5개가 되었으므로 실패
    expect(() => rateLimiter.tryConsume(key)).toThrow("Rate limit exceeded");
  });

  it("메모리 효율을 위해 오래된 타임스탬프가 정리되어야 한다", () => {
    const key = "user1";

    // 여러 요청 생성
    for (let i = 0; i < 3; i++) {
      rateLimiter.tryConsume(key);
    }

    // 2초 경과 (윈도우 크기의 2배)
    jest.advanceTimersByTime(2000);

    // 새로운 요청 시도 - 이전 타임스탬프들이 정리되어야 함
    expect(() => rateLimiter.tryConsume(key)).not.toThrow();

    // 내부적으로 오래된 타임스탬프들이 제거되었는지 확인
    // (이 부분은 private 필드이므로 간접적으로 확인)
    // 임계치까지 추가 요청이 가능해야 함
    for (let i = 0; i < 4; i++) {
      expect(() => rateLimiter.tryConsume(key)).not.toThrow();
    }

    // 임계치 도달
    expect(() => rateLimiter.tryConsume(key)).toThrow("Rate limit exceeded");
  });

  it("윈도우 크기가 0일 때도 정상 동작해야 한다", () => {
    const zeroWindowConfig: SlidingWindowLoggingConfig = {
      threshold: 3,
      windowSizeMs: 0,
    };
    const zeroWindowLimiter = new SlidingWindowLoggingRateLimiter(
      zeroWindowConfig
    );
    const key = "user1";

    // windowSizeMs가 0이면 현재 시점의 요청만 카운트됨
    // 따라서 threshold까지는 성공
    for (let i = 0; i < 3; i++) {
      expect(() => zeroWindowLimiter.tryConsume(key)).not.toThrow();
    }
    
    // threshold를 초과하면 실패
    expect(() => zeroWindowLimiter.tryConsume(key)).toThrow("Rate limit exceeded");
  });
});
