// tests/integration/persistenceSessions.test.js
const mongoose = require("mongoose");
const pomodoroManager = require("../../utils/pomodoroManager");
const User = require("../../database/models/User");
const StudySession = require("../../database/models/StudySession");
const ActiveSession = require("../../database/models/ActiveSession");

// Mock para cliente Discord
const mockClient = {
  users: {
    fetch: jest.fn().mockImplementation((userId) => {
      return Promise.resolve({
        id: userId,
        username: "MockUser",
        createDM: jest.fn().mockResolvedValue({
          id: "dm-channel-" + userId,
          send: jest.fn().mockResolvedValue({}),
        }),
      });
    }),
  },
  channels: {
    fetch: jest.fn().mockImplementation((channelId) => {
      return Promise.resolve({
        id: channelId,
        send: jest.fn().mockResolvedValue({}),
      });
    }),
  },
};

// Mock para os canais
const mockDmChannel = {
  send: jest.fn().mockResolvedValue({}),
};

const mockServerChannel = {
  id: "server-channel-123",
  send: jest.fn().mockResolvedValue({}),
};

// Função auxiliar para acessar o cache interno do PomodoroManager
// Isso é necessário apenas para testes
const simulateRestart = async () => {
  // Esta é uma abordagem simplificada - na realidade, precisaríamos acessar
  // a referência interna do cache no pomodoroManager

  // Na versão real do teste, se pudermos expor o cache interno via uma função como:
  // pomodoroManager.clearCacheForTesting()

  // Ou podemos criar um método limpo específico para testes:
  if (typeof pomodoroManager.cleanupForTests === "function") {
    await pomodoroManager.cleanupForTests(true); // true = apenas limpa o cache, não o banco
  }
};

describe("Session Persistence Integration", () => {
  // Aumentar timeout para estes testes específicos
  jest.setTimeout(40000);

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
        const activeSessions = await ActiveSession.find({});
        for (const session of activeSessions) {
          try {
            if (session.sessionType === "pomodoro") {
              await pomodoroManager.stopPomodoro(session.userId);
            }
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

  it("should create and restore a pomodoro session", async () => {
    // 1. Criar uma sessão
    const userId = "123456789";
    const username = "TestUser";

    await pomodoroManager.startPomodoro(
      userId,
      username,
      mockServerChannel,
      mockDmChannel,
      "Test Subject"
    );

    // Verificar se foi criada
    let activeSession = await ActiveSession.findOne({ userId });
    expect(activeSession).toBeTruthy();

    // 2. Simular reinicialização limpando o cache interno
    await simulateRestart();

    // 3. Carregar sessão do banco
    await pomodoroManager.loadActiveSessions();

    // 4. Completar restauração com cliente
    await pomodoroManager.completeSessionsRestore(mockClient);

    // 5. Verificar se a sessão está ativa novamente
    const activeSessions = pomodoroManager.getAllActiveSessions();
    expect(activeSessions.length).toBeGreaterThan(0);

    // Encontrar a sessão do usuário específico
    const userSession = activeSessions.find((s) => s.userId === userId);
    expect(userSession).toBeTruthy();
    expect(userSession.subject).toBe("Test Subject");
  }, 40000);

  it("should clean up orphaned sessions", async () => {
    // 1. Criar uma sessão muito antiga
    const oldSession = new ActiveSession({
      userId: "987654321",
      sessionType: "pomodoro",
      studySessionId: new mongoose.Types.ObjectId(),
      subject: "Old Subject",
      startTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 horas atrás
      status: "work",
      timeLeft: 25 * 60 * 1000,
      lastUpdated: new Date(Date.now() - 13 * 60 * 60 * 1000), // 13 horas atrás (além do limite de 12h)
    });

    await oldSession.save();

    // 2. Executar limpeza
    await pomodoroManager.cleanOrphanedSessions();

    // 3. Verificar se a sessão foi removida
    const oldSessionCheck = await ActiveSession.findById(oldSession._id);
    expect(oldSessionCheck).toBeNull();
  }, 30000);
});
