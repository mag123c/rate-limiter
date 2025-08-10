import request from "supertest";
import { createApp } from "../../app";
import { createSlidingWindowCounterMiddleware } from "../middleware";

describe("Sliding Window Counter Middleware Integration", () => {
  it("rate limit 이하의 요청은 통과", async () => {
    const app = createApp({
      middlewares: [
        createSlidingWindowCounterMiddleware({
          threshold: 3,
          windowSizeMs: 1000,
        }),
      ],
    });

    const responses = await Promise.all([
      request(app).get("/"),
      request(app).get("/"),
      request(app).get("/"),
    ]);

    responses.forEach((response) => {
      expect(response.status).toBe(200);
    });
  });

  it("rate limit 초과 시 429 응답", async () => {
    const app = createApp({
      middlewares: [
        createSlidingWindowCounterMiddleware({
          threshold: 2,
          windowSizeMs: 1000,
        }),
      ],
    });

    await request(app).get("/").expect(200);
    await request(app).get("/").expect(200);
    await request(app).get("/").expect(429);
  });

  it("서로 다른 IP는 독립적으로 rate limit 적용", async () => {
    const app = createApp({
      middlewares: [
        createSlidingWindowCounterMiddleware({
          threshold: 1,
          windowSizeMs: 1000,
        }),
      ],
    });

    await request(app).get("/").set("X-Forwarded-For", "1.1.1.1").expect(200);
    await request(app).get("/").set("X-Forwarded-For", "1.1.1.1").expect(429);
    await request(app).get("/").set("X-Forwarded-For", "2.2.2.2").expect(200);
  });

  it("커스텀 키 생성기 사용", async () => {
    const app = createApp({
      middlewares: [
        createSlidingWindowCounterMiddleware(
          {
            threshold: 2,
            windowSizeMs: 1000,
          },
          {
            keyGenerator: (req) => req.headers["api-key"] as string || "anonymous",
          }
        ),
      ],
    });

    await request(app).get("/").set("api-key", "user1").expect(200);
    await request(app).get("/").set("api-key", "user1").expect(200);
    await request(app).get("/").set("api-key", "user1").expect(429);
    await request(app).get("/").set("api-key", "user2").expect(200);
  });

  it("skip 옵션으로 특정 요청 제외", async () => {
    const app = createApp({
      middlewares: [
        createSlidingWindowCounterMiddleware(
          {
            threshold: 1,
            windowSizeMs: 1000,
          },
          {
            skip: (req) => req.path === "/health",
          }
        ),
      ],
    });

    await request(app).get("/").expect(200);
    await request(app).get("/").expect(429);
    
    // health 엔드포인트는 rate limit 무시
    await request(app).get("/health").expect(404); // 라우트가 없어서 404지만 429는 아님
  });

  it("커스텀 에러 핸들러 사용", async () => {
    const app = createApp({
      middlewares: [
        createSlidingWindowCounterMiddleware(
          {
            threshold: 1,
            windowSizeMs: 1000,
          },
          {
            onLimitReached: (_req, res) => {
              res.status(503).json({
                error: "Custom Error",
                message: "Please slow down",
              });
            },
          }
        ),
      ],
    });

    await request(app).get("/").expect(200);
    
    const response = await request(app).get("/").expect(503);
    expect(response.body).toEqual({
      error: "Custom Error",
      message: "Please slow down",
    });
  });

  it("다양한 HTTP 메서드 지원", async () => {
    const app = createApp({
      middlewares: [
        createSlidingWindowCounterMiddleware({
          threshold: 5,
          windowSizeMs: 1000,
        }),
      ],
    });

    await request(app).get("/").expect(200);
    await request(app).post("/").expect(200);
    await request(app).put("/").expect(200);
    await request(app).delete("/").expect(200);
    await request(app).patch("/").expect(200);
    await request(app).get("/").expect(429);
  });

});