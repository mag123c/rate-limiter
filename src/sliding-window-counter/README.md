# Sliding Window Counter Rate Limiter

## 개요

슬라이딩 윈도우 카운터는 이전 윈도우와 현재 윈도우의 카운터를 가중 평균으로 계산하여 Rate Limit을 적용하는 알고리즘입니다.

## 알고리즘 동작 방식

1. **두 개의 윈도우 유지**
   - 이전 윈도우: 직전 시간 윈도우의 요청 카운트
   - 현재 윈도우: 현재 시간 윈도우의 요청 카운트

2. **가중 평균 계산**
   ```
   현재 시간의 위치 = (현재 시간 - 현재 윈도우 시작) / 윈도우 크기
   이전 윈도우 가중치 = 1 - 현재 시간의 위치
   예상 요청 수 = (이전 윈도우 카운트 × 가중치) + 현재 윈도우 카운트
   ```

3. **예시**
   - 윈도우 크기: 1초, Threshold: 10
   - 이전 윈도우 (0-1초): 8개 요청
   - 현재 윈도우 (1-2초): 1.5초 시점에서 3개 요청
   - 계산: `8 × 0.5 + 3 = 7` (3개 더 허용)

## 특징

### 장점
- **메모리 효율적**: O(1) 공간 복잡도 (키당 2개 윈도우만 저장)
- **부드러운 전환**: Fixed Window의 경계 문제 완화
- **합리적인 정확도**: 실제 슬라이딩 윈도우에 근사한 결과

### 단점
- **근사치 계산**: 100% 정확하지 않음 (가중 평균 기반)
- **과거 패턴 가정**: 이전 윈도우의 요청이 균등하게 분포되었다고 가정

## 사용 예제

```typescript
import { createSlidingWindowCounterMiddleware } from './sliding-window-counter/middleware';

const app = express();

// 기본 사용
app.use(createSlidingWindowCounterMiddleware({
  threshold: 100,        // 윈도우당 최대 100개 요청
  windowSizeMs: 60000,   // 1분 윈도우
}));

// 고급 옵션
app.use(createSlidingWindowCounterMiddleware(
  {
    threshold: 100,
    windowSizeMs: 60000,
  },
  {
    keyGenerator: (req) => req.headers['api-key'] || req.ip,
    skip: (req) => req.path === '/health',
    onLimitReached: (req, res) => {
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: 60,
      });
    },
  }
));
```

## 설정 옵션

| 옵션 | 타입 | 설명 |
|------|------|------|
| `threshold` | number | 윈도우 내 허용되는 최대 요청 수 |
| `windowSizeMs` | number | 윈도우 크기 (밀리초) |

## 메모리 관리

```typescript
const limiter = new SlidingWindowCounterRateLimiter(config);

// 주기적으로 오래된 윈도우 정리
setInterval(() => {
  limiter.cleanup();
}, 300000); // 5분마다
```

## Fixed Window vs Sliding Window Counter

### Fixed Window
- 윈도우 경계에서 burst 가능
- 예: 59초에 100개, 1분 1초에 100개 = 2초간 200개

### Sliding Window Counter
- 가중 평균으로 burst 완화
- 예: 같은 상황에서 약 150개로 제한 (이전 윈도우 가중치 적용)

## 적합한 사용 사례

- **API Rate Limiting**: 메모리 효율성과 정확도의 균형이 필요한 경우
- **중간 규모 시스템**: Sliding Window Log보다 가볍고 Fixed Window보다 정확한 방식이 필요한 경우
- **실시간성이 중요하지 않은 경우**: 근사치로도 충분한 경우

## 부적합한 사용 사례

- **100% 정확도 필요**: 과금, 법적 규제 등
- **매우 짧은 윈도우**: 가중 평균의 오차가 커질 수 있음
- **불규칙한 트래픽 패턴**: 가중 평균 가정이 맞지 않는 경우