// jest.config.js
module.exports = {
  preset: "@shelf/jest-mongodb",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  testPathIgnorePatterns: ["/node_modules/"],
  collectCoverageFrom: [
    "**/*.js",
    "!**/node_modules/**",
    "!**/coverage/**",
    "!**/jest.config.js",
    "!**/.github/**",
  ],
  verbose: true,
  testTimeout: 30000,
  // Remova a opção mongodbMemoryServerOptions daqui
};
