import request from "supertest";
import { createApp } from "../../app";
import { createSlidingWindowLoggingMiddleware } from "../middleware";
import { SlidingWindowLoggingConfig } from "../config";
import type { Express } from "express";

describe("SlidingWindowLogging Integration", () => {
  let app: Express;
  let config: SlidingWindowLoggingConfig;

  beforeEach(() => {
    jest.useFakeTimers();
    config = {
      threshold: 5,
      windowSizeMs: 1000, // 1초 윈도우
    };
    const middleware = createSlidingWindowLoggingMiddleware(config);
    app = createApp({ middlewares: [middleware] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("임계치까지 요청을 허용해야 한다", async () => {
    const responses = [];

    // 5개의 요청 모두 성공해야 함
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .get("/api/test")
        .set("X-Forwarded-For", "192.168.1.100");
      responses.push(response);
    }

    responses.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Test endpoint");
    });
  });

  it("임계치 초과 시 429 응답을 반환해야 한다", async () => {
    // 5개의 요청 성공
    for (let i = 0; i < 5; i++) {
      await request(app)
        .get("/api/test")
        .set("X-Forwarded-For", "192.168.1.100");
    }

    // 6번째 요청은 429 응답
    const response = await request(app)
      .get("/api/test")
      .set("X-Forwarded-For", "192.168.1.100");

    expect(response.status).toBe(429);
    expect(response.body.error).toBe("Too Many Requests");
  });

  it("다른 IP 주소는 독립적인 rate limit을 가져야 한다", async () => {
    // IP1에 대해 5개 요청
    for (let i = 0; i < 5; i++) {
      await request(app)
        .get("/api/test")
        .set("X-Forwarded-For", "192.168.1.100");
    }

    // IP2는 여전히 요청 가능
    const response = await request(app)
      .get("/api/test")
      .set("X-Forwarded-For", "192.168.1.200");

    expect(response.status).toBe(200);

    // IP1은 더 이상 요청 불가
    const blockedResponse = await request(app)
      .get("/api/test")
      .set("X-Forwarded-For", "192.168.1.100");

    expect(blockedResponse.status).toBe(429);
  });

  it("슬라이딩 윈도우가 정확하게 동작해야 한다", async () => {
    const ip = "192.168.1.100";

    // 0ms: 2개 요청
    await request(app).get("/api/test").set("X-Forwarded-For", ip);
    await request(app).get("/api/test").set("X-Forwarded-For", ip);

    // 300ms: 2개 요청
    jest.advanceTimersByTime(300);
    await request(app).get("/api/test").set("X-Forwarded-For", ip);
    await request(app).get("/api/test").set("X-Forwarded-For", ip);

    // 700ms: 1개 요청 (총 5개)
    jest.advanceTimersByTime(400);
    await request(app).get("/api/test").set("X-Forwarded-For", ip);

    // 6번째 요청은 실패
    const blockedResponse = await request(app)
      .get("/api/test")
      .set("X-Forwarded-For", ip);
    expect(blockedResponse.status).toBe(429);

    // 1001ms: 처음 2개가 윈도우를 벗어남
    jest.advanceTimersByTime(301);

    // 이제 2개 더 요청 가능
    const response1 = await request(app)
      .get("/api/test")
      .set("X-Forwarded-For", ip);
    const response2 = await request(app)
      .get("/api/test")
      .set("X-Forwarded-For", ip);

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    // 다시 임계치에 도달
    const finalBlockedResponse = await request(app)
      .get("/api/test")
      .set("X-Forwarded-For", ip);
    expect(finalBlockedResponse.status).toBe(429);
  });

  it("동시 요청을 정확히 처리해야 한다", async () => {
    const ip = "192.168.1.100";

    // 6개의 동시 요청
    const promises = Array(6)
      .fill(null)
      .map(() =>
        request(app)
          .get("/api/test")
          .set("X-Forwarded-For", ip)
          .catch((err) => err.response)
      );

    const responses = await Promise.all(promises);

    // 5개는 성공, 1개는 실패
    const successCount = responses.filter((r) => r.status === 200).length;
    const failCount = responses.filter((r) => r.status === 429).length;

    expect(successCount).toBe(5);
    expect(failCount).toBe(1);
  });

  it("커스텀 키 생성기를 사용할 수 있어야 한다", async () => {
    const customMiddleware = createSlidingWindowLoggingMiddleware(
      config,
      {
        keyGenerator: (req: any) => req.headers["api-key"] || "anonymous",
      }
    );
    const customApp = createApp({ middlewares: [customMiddleware] });

    // 같은 API 키로 5개 요청
    for (let i = 0; i < 5; i++) {
      await request(customApp).get("/api/test").set("api-key", "user-123");
    }

    // 6번째 요청은 실패
    const blockedResponse = await request(customApp)
      .get("/api/test")
      .set("api-key", "user-123");

    expect(blockedResponse.status).toBe(429);

    // 다른 API 키는 성공
    const differentKeyResponse = await request(customApp)
      .get("/api/test")
      .set("api-key", "user-456");

    expect(differentKeyResponse.status).toBe(200);
  });

  it("skip 옵션으로 특정 요청을 제외할 수 있어야 한다", async () => {
    const skipMiddleware = createSlidingWindowLoggingMiddleware(
      config,
      {
        skip: (req: any) => req.headers["skip-rate-limit"] === "true",
      }
    );
    const skipApp = createApp({ middlewares: [skipMiddleware] });

    const ip = "192.168.1.100";

    // 5개의 일반 요청
    for (let i = 0; i < 5; i++) {
      await request(skipApp).get("/api/test").set("X-Forwarded-For", ip);
    }

    // skip 헤더가 있는 요청은 rate limit 무시
    const skipResponse = await request(skipApp)
      .get("/api/test")
      .set("X-Forwarded-For", ip)
      .set("skip-rate-limit", "true");

    expect(skipResponse.status).toBe(200);

    // skip 헤더가 없는 요청은 여전히 차단
    const blockedResponse = await request(skipApp)
      .get("/api/test")
      .set("X-Forwarded-For", ip);

    expect(blockedResponse.status).toBe(429);
  });

  it("onLimitReached 콜백이 호출되어야 한다", async () => {
    const onLimitReached = jest.fn((_req, res) => {
      res.status(429).json({ error: "Too Many Requests" });
    });
    const callbackMiddleware = createSlidingWindowLoggingMiddleware(
      config,
      {
        onLimitReached,
      }
    );
    const callbackApp = createApp({ middlewares: [callbackMiddleware] });

    const ip = "192.168.1.100";

    // 5개의 요청
    for (let i = 0; i < 5; i++) {
      await request(callbackApp).get("/api/test").set("X-Forwarded-For", ip);
    }

    expect(onLimitReached).not.toHaveBeenCalled();

    // 6번째 요청 시 콜백 호출
    await request(callbackApp).get("/api/test").set("X-Forwarded-For", ip);

    expect(onLimitReached).toHaveBeenCalledTimes(1);
    expect(onLimitReached).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: ip,
      }),
      expect.any(Object)
    );
  });

  it("다양한 HTTP 메서드를 지원해야 한다", async () => {
    const ip = "192.168.1.100";

    // 다양한 메서드로 요청
    await request(app).get("/api/test").set("X-Forwarded-For", ip);
    await request(app).post("/api/test").set("X-Forwarded-For", ip);
    await request(app).put("/api/test").set("X-Forwarded-For", ip);
    await request(app).delete("/api/test").set("X-Forwarded-For", ip);
    await request(app).patch("/api/test").set("X-Forwarded-For", ip);

    // 6번째 요청은 메서드와 관계없이 차단
    const response = await request(app)
      .get("/api/test")
      .set("X-Forwarded-For", ip);

    expect(response.status).toBe(429);
  });

  it("Fixed Window와 달리 윈도우 경계에서 버스트가 발생하지 않아야 한다", async () => {
    const ip = "192.168.1.100";

    // 윈도우 끝 부분에서 5개 요청
    jest.advanceTimersByTime(900); // 900ms 시점
    for (let i = 0; i < 5; i++) {
      await request(app).get("/api/test").set("X-Forwarded-For", ip);
    }

    // 100ms 후 (새 윈도우 시작)
    jest.advanceTimersByTime(100);

    // Fixed Window와 달리 여전히 5개가 윈도우 내에 있음
    const response = await request(app)
      .get("/api/test")
      .set("X-Forwarded-For", ip);

    expect(response.status).toBe(429); // 여전히 차단됨

    // 901ms 더 지나야 첫 요청이 윈도우를 벗어남 (총 1001ms)
    jest.advanceTimersByTime(901);

    // 이제 요청 가능
    const allowedResponse = await request(app)
      .get("/api/test")
      .set("X-Forwarded-For", ip);

    expect(allowedResponse.status).toBe(200);
  });
});
