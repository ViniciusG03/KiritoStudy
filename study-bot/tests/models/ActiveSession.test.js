// tests/models/ActiveSession.test.js
const mongoose = require("mongoose");
const ActiveSession = require("../../database/models/ActiveSession");

describe("ActiveSession Model", () => {
  // Aumentar timeout para estes testes específicos
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Conexão já configurada pelo preset jest-mongodb
    try {
      // Verificar se já está conectado
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(
          process.env.MONGO_URL || "mongodb://localhost:27017/test",
          {
            useNewUrlParser: true,
            useUnifiedTopology: true,
          }
        );
      }
    } catch (error) {
      console.error("Falha ao conectar com MongoDB:", error);
    }
  });

  afterAll(async () => {
    try {
      await mongoose.connection.close();
    } catch (error) {
      console.error("Erro ao fechar conexão MongoDB:", error);
    }
  });

  beforeEach(async () => {
    try {
      await ActiveSession.deleteMany({});
    } catch (error) {
      console.error("Erro ao limpar coleção ActiveSession:", error);
    }
  });

  it("should create an active session successfully", async () => {
    const sessionData = {
      userId: "123456789",
      sessionType: "pomodoro",
      studySessionId: new mongoose.Types.ObjectId(),
      subject: "Test Subject",
      startTime: new Date(),
      status: "work",
      timeLeft: 25 * 60 * 1000, // 25 minutes in ms
    };

    const session = new ActiveSession(sessionData);
    const savedSession = await session.save();

    expect(savedSession).toBeTruthy();
    expect(savedSession.userId).toBe(sessionData.userId);
    expect(savedSession.sessionType).toBe(sessionData.sessionType);
    expect(savedSession.subject).toBe(sessionData.subject);
    expect(savedSession.status).toBe("work");
    expect(savedSession.paused).toBe(false);
  }, 30000); // Timeout específico para este teste

  it("should require userId and sessionType", async () => {
    const invalidSession = new ActiveSession({
      studySessionId: new mongoose.Types.ObjectId(),
      subject: "Test Subject",
      startTime: new Date(),
      timeLeft: 25 * 60 * 1000,
    });

    let error;
    try {
      await invalidSession.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeTruthy();
    expect(error.errors.userId).toBeTruthy();
  }, 30000);

  it("should only accept valid sessionType values", async () => {
    const invalidSession = new ActiveSession({
      userId: "123456789",
      sessionType: "invalid-type",
      studySessionId: new mongoose.Types.ObjectId(),
      startTime: new Date(),
      timeLeft: 25 * 60 * 1000,
    });

    let error;
    try {
      await invalidSession.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeTruthy();
    expect(error.errors.sessionType).toBeTruthy();
  }, 30000);
});
