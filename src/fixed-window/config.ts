import { WindowConfig } from "../config/window-config.js";

type FixedWindowClearConfig = {
  callCount: number;
  maxCount: number;
};

export interface FixedWindowConfig extends WindowConfig {
  clearConfig?: FixedWindowClearConfig;
}
