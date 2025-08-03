export const preset = "ts-jest";
export const testEnvironment = "node";
export const roots = ["<rootDir>"];
export const testMatch = ["**/*.spec.ts"];
export const transform = {
  "^.+\\.ts$": [
    "ts-jest",
    {
      tsconfig: {
        module: "ES2022",
      },
    },
  ],
};
export const moduleFileExtensions = ["ts", "js"];
