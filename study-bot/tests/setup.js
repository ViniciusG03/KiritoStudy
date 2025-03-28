// tests/setup.js
process.env.NODE_ENV = "test";

// Aumentar timeout global para 60 segundos
jest.setTimeout(60000);

// Resolver aviso de depreciação do Mongoose
const mongoose = require("mongoose");
mongoose.set("strictQuery", false);

// Mock para config.js para usar configurações de teste
jest.mock("../config/config", () => ({
  pomodoro: {
    workTime: 25 * 60 * 1000, // 25 minutos em milissegundos
    shortBreak: 5 * 60 * 1000, // 5 minutos em milissegundos
    longBreak: 15 * 60 * 1000, // 15 minutos em milissegundos
    longBreakInterval: 4, // A cada 4 pomodoros, fazer uma pausa longa
  },
  levels: {
    baseXP: 100,
    growthFactor: 1.5,
    studySessionXP: 50,
    goalCompletionXP: 100,
  },
}));

// Silence console logs during tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Definir fake timers globalmente para evitar problemas
jest.useFakeTimers({ legacyFakeTimers: true });
