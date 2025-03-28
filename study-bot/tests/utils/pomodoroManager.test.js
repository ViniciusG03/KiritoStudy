// tests/utils/pomodoroManager.test.js
const mongoose = require("mongoose");
const pomodoroManager = require("../../utils/pomodoroManager");
const User = require("../../database/models/User");
const StudySession = require("../../database/models/StudySession");
const ActiveSession = require("../../database/models/ActiveSession");

// Mock para os canais do Discord
const mockDmChannel = {
  send: jest.fn().mockResolvedValue({}),
};

const mockServerChannel = {
  send: jest.fn().mockResolvedValue({}),
};

describe("PomodoroManager", () => {
  // Aumentar timeout para estes testes específicos
  jest.setTimeout(30000);

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    try {
      await mongoose.connection.close();
    } catch (error) {
      console.error("Erro ao fechar conexão MongoDB:", error);
    }
  });

  beforeEach(async () => {
    // Usar fake timers para controlar o tempo em testes
    jest.useFakeTimers();

    try {
      // Limpar sessões existentes
      if (typeof pomodoroManager.cleanupForTests === "function") {
        await pomodoroManager.cleanupForTests();
      } else {
        // Encerrar todas as sessões ativas manualmente
        const activeSessions = await ActiveSession.find({
          sessionType: "pomodoro",
        });
        for (const session of activeSessions) {
          try {
            await pomodoroManager.stopPomodoro(session.userId);
          } catch (err) {
            // Ignorar erros ao limpar
          }
        }
      }

      // Limpar coleções
      await User.deleteMany({});
      await StudySession.deleteMany({});
      await ActiveSession.deleteMany({});

      // Limpar mocks
      jest.clearAllMocks();
    } catch (error) {
      console.error("Erro ao limpar dados para teste:", error);
    }
  });

  afterEach(() => {
    // Restaurar timers reais após cada teste
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("should start a new pomodoro session", async () => {
    const result = await pomodoroManager.startPomodoro(
      "123456789",
      "TestUser",
      mockServerChannel,
      mockDmChannel,
      "Test Subject"
    );

    expect(result.success).toBe(true);

    // Verificar se a sessão foi salva no banco
    const activeSession = await ActiveSession.findOne({ userId: "123456789" });
    expect(activeSession).toBeTruthy();
    expect(activeSession.subject).toBe("Test Subject");
    expect(activeSession.sessionType).toBe("pomodoro");

    // Verificar se o estudo foi salvo
    const studySession = await StudySession.findOne({ userId: "123456789" });
    expect(studySession).toBeTruthy();

    // Verificar se o usuário foi criado
    const user = await User.findOne({ discordId: "123456789" });
    expect(user).toBeTruthy();

    // Verificar se a mensagem foi enviada
    expect(mockDmChannel.send).toHaveBeenCalled();
  }, 30000);

  it("should not start a second session for the same user", async () => {
    // Primeira sessão
    await pomodoroManager.startPomodoro(
      "123456789",
      "TestUser",
      mockServerChannel,
      mockDmChannel,
      "Test Subject"
    );

    // Limpar mocks
    jest.clearAllMocks();

    // Tentar iniciar segunda sessão
    const result = await pomodoroManager.startPomodoro(
      "123456789",
      "TestUser",
      mockServerChannel,
      mockDmChannel,
      "Another Subject"
    );

    expect(result.success).toBe(false);
    expect(mockDmChannel.send).not.toHaveBeenCalled();
  }, 30000);

  it("should pause and resume a pomodoro session", async () => {
    // Iniciar sessão
    await pomodoroManager.startPomodoro(
      "123456789",
      "TestUser",
      mockServerChannel,
      mockDmChannel,
      "Test Subject"
    );

    // Limpar mocks
    jest.clearAllMocks();

    // Pausar sessão
    const pauseResult = await pomodoroManager.pausePomodoro("123456789");
    expect(pauseResult.success).toBe(true);

    // Verificar se a sessão foi pausada no banco
    let activeSession = await ActiveSession.findOne({ userId: "123456789" });
    expect(activeSession.paused).toBe(true);

    // Verificar se a mensagem foi enviada
    expect(mockDmChannel.send).toHaveBeenCalled();

    // Limpar mocks
    jest.clearAllMocks();

    // Retomar sessão
    const resumeResult = await pomodoroManager.resumePomodoro("123456789");
    expect(resumeResult.success).toBe(true);

    // Verificar se a sessão foi retomada no banco
    activeSession = await ActiveSession.findOne({ userId: "123456789" });
    expect(activeSession.paused).toBe(false);

    // Verificar se a mensagem foi enviada
    expect(mockDmChannel.send).toHaveBeenCalled();
  }, 30000);

  it("should stop a pomodoro session", async () => {
    // Iniciar sessão
    const startResult = await pomodoroManager.startPomodoro(
      "123456789",
      "TestUser",
      mockServerChannel,
      mockDmChannel,
      "Test Subject"
    );

    // Capturar ID da sessão de estudo
    const studySessionId = startResult.sessionId;

    // Limpar mocks
    jest.clearAllMocks();

    // Parar sessão
    const stopResult = await pomodoroManager.stopPomodoro("123456789");
    expect(stopResult.success).toBe(true);

    // Verificar se a sessão ativa foi removida do banco
    const activeSession = await ActiveSession.findOne({ userId: "123456789" });
    expect(activeSession).toBeNull();

    // Verificar se a sessão de estudo foi completada
    const studySession = await StudySession.findById(studySessionId);
    expect(studySession.completed).toBe(true);
    expect(studySession.endTime).toBeTruthy();

    // Verificar se a mensagem foi enviada
    expect(mockDmChannel.send).toHaveBeenCalled();
  }, 30000);
});
