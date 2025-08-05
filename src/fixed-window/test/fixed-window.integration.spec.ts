import request from "supertest";
import { createApp } from "../../app";
import { createFixedWindowMiddleware } from "../middleware";

describe("Fixed Window Rate Limiter Integration", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("윈도우 내의 임계치에 도달하면 429 에러가 발생한다", async () => {
    const threshold = 10;
    const windowSizeMs = 5000;
    const rateLimiter = createFixedWindowMiddleware({
      threshold,
      windowSizeMs,
    });

    const app = createApp({
      middlewares: [rateLimiter],
    });

    for (let i = 0; i < threshold; i++) {
      const response = await request(app).get("/");
      expect(response.status).toBe(200);
    }

    const rejectedResponse = await request(app).get("/");
    expect(rejectedResponse.status).toBe(429);
    expect(rejectedResponse.body.error).toBe("Too Many Requests");
  });

  it("다른 IP 주소는 독립적인 rate limit을 가진다", async () => {
    const rateLimiter = createFixedWindowMiddleware({
      threshold: 2,
      windowSizeMs: 5000,
    });

    const app = createApp({ middlewares: [rateLimiter] });

    await request(app).get("/").set("X-Forwarded-For", "1.1.1.1");
    await request(app).get("/").set("X-Forwarded-For", "1.1.1.1");

    await request(app).get("/").set("X-Forwarded-For", "2.2.2.2");
    await request(app).get("/").set("X-Forwarded-For", "2.2.2.2");

    const response1 = await request(app)
      .get("/")
      .set("X-Forwarded-For", "1.1.1.1");
    const response2 = await request(app)
      .get("/")
      .set("X-Forwarded-For", "2.2.2.2");

    expect(response1.status).toBe(429);
    expect(response2.status).toBe(429);
  });

  it("동시 요청 처리 시 정확한 카운팅", async () => {
    const threshold = 50;
    const rateLimiter = createFixedWindowMiddleware({
      threshold,
      windowSizeMs: 5000,
    });

    const app = createApp({ middlewares: [rateLimiter] });

    // 50개 동시 요청
    const promises = Array(threshold)
      .fill(null)
      .map(() => request(app).get("/"));

    const responses = await Promise.all(promises);
    const successCount = responses.filter((r) => r.status === 200).length;
    const failCount = responses.filter((r) => r.status === 429).length;

    // 정확히 threshold만큼만 성공
    expect(successCount).toBe(threshold);
    expect(failCount).toBe(0);

    // 추가 요청은 실패
    const extraResponse = await request(app).get("/");
    expect(extraResponse.status).toBe(429);
  });

  it("커스텀 키 생성기 사용 시 올바르게 동작", async () => {
    const rateLimiter = createFixedWindowMiddleware(
      {
        threshold: 2,
        windowSizeMs: 5000,
      },
      {
        keyGenerator: (req) =>
          req.headers["api-key"]?.toString() || "anonymous",
      }
    );

    const app = createApp({ middlewares: [rateLimiter] });

    // API 키 "key1"로 2번 요청
    await request(app).get("/").set("api-key", "key1");
    await request(app).get("/").set("api-key", "key1");

    // API 키 "key2"로 2번 요청
    await request(app).get("/").set("api-key", "key2");
    await request(app).get("/").set("api-key", "key2");

    // 각 키별로 임계치 확인
    const response1 = await request(app).get("/").set("api-key", "key1");
    const response2 = await request(app).get("/").set("api-key", "key2");

    expect(response1.status).toBe(429);
    expect(response2.status).toBe(429);

    // anonymous 키는 별도 카운트
    const anonymousResponse = await request(app).get("/");
    expect(anonymousResponse.status).toBe(200);
  });

  it("윈도우 경계에서 burst traffic 발생 가능 (Fixed Window의 한계)", async () => {
    const threshold = 10;
    const windowSizeMs = 1000; // 1초
    const rateLimiter = createFixedWindowMiddleware({
      threshold,
      windowSizeMs,
    });

    const app = createApp({ middlewares: [rateLimiter] });

    // 실제 시간 기반 테스트
    const startTime = Date.now();

    // 첫 번째 윈도우에서 threshold만큼 요청
    for (let i = 0; i < threshold; i++) {
      const response = await request(app).get("/");
      expect(response.status).toBe(200);
    }

    // 윈도우가 끝날 때까지 대기
    const elapsedTime = Date.now() - startTime;
    const remainingTime = windowSizeMs - elapsedTime + 100; // 여유 시간 추가

    if (remainingTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingTime));
    }

    // 새 윈도우에서 다시 threshold만큼 요청 가능 (threshold * 2 BURST)
    for (let i = 0; i < threshold; i++) {
      const response = await request(app).get("/");
      expect(response.status).toBe(200);
    }
  });

  it("skip 옵션 사용 시 특정 요청은 rate limit 제외", async () => {
    const rateLimiter = createFixedWindowMiddleware(
      {
        threshold: 2,
        windowSizeMs: 5000,
      },
      {
        skip: (req) => req.path === "/health",
      }
    );

    const app = createApp({
      middlewares: [rateLimiter],
      setupRoutes: (app) => {
        app.get("/health", (_req, res) => res.json({ status: "ok" }));
        app.get("/api/users", (_req, res) => res.json({ users: [] }));
      },
    });

    // 일반 요청은 rate limit 적용
    await request(app).get("/api/users");
    await request(app).get("/api/users");
    const limitedResponse = await request(app).get("/api/users");
    expect(limitedResponse.status).toBe(429);

    // health check는 rate limit 제외
    for (let i = 0; i < 10; i++) {
      const response = await request(app).get("/health");
      expect(response.status).toBe(200);
    }
  });

  it("onLimitReached 콜백이 호출된다", async () => {
    let callbackCalled = false;
    let limitedPath = "";

    const rateLimiter = createFixedWindowMiddleware(
      {
        threshold: 1,
        windowSizeMs: 5000,
      },
      {
        onLimitReached: (req, res) => {
          callbackCalled = true;
          limitedPath = req.path;
          res.status(429).json({ error: "Custom limit message" });
        },
      }
    );

    const app = createApp({ middlewares: [rateLimiter] });

    await request(app).get("/test");
    const response = await request(app).get("/test");

    expect(callbackCalled).toBe(true);
    expect(limitedPath).toBe("/test");
    expect(response.status).toBe(429);
    expect(response.body.error).toBe("Custom limit message");
  });

  it("다양한 HTTP 메서드에 대해 동일하게 작동", async () => {
    const rateLimiter = createFixedWindowMiddleware({
      threshold: 5,
      windowSizeMs: 5000,
    });

    const app = createApp({ middlewares: [rateLimiter] });

    // 다양한 메서드로 요청
    await request(app).get("/");
    await request(app).post("/");
    await request(app).put("/");
    await request(app).delete("/");
    await request(app).patch("/");

    // 임계치 도달
    const response = await request(app).get("/");
    expect(response.status).toBe(429);
  });
});
