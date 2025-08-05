export interface WindowConfig {
  threshold: number; // 윈도우 내 허용되는 최대 요청 수
  windowSizeMs: number; // 윈도우 크기 (밀리초)
}
