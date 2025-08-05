type FixedWindowClearConfig = {
  callCount: number;
  maxCount: number;
};

export interface FixedWindowConfig {
  threshold: number; // 윈도우 임계치
  windowSizeMs: number; // 윈도우 크기
  clearConfig?: FixedWindowClearConfig;
}
