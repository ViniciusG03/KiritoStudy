// tests/commands/focus.test.js
const mongoose = require("mongoose");
const ActiveSession = require("../../database/models/ActiveSession");
const StudySession = require("../../database/models/StudySession");
const User = require("../../database/models/User");

// Mock para discord.js
jest.mock("discord.js", () => {
  return require("../mocks/discord");
});

// Importar depois dos mocks para que os mocks sejam aplicados
const focusCommand = require("../../commands/focus");

// Mock para interaction
const createMockInteraction = (options = {}) => ({
  deferReply: jest.fn().mockResolvedValue({}),
  editReply: jest.fn().mockResolvedValue({}),
  channel: {
    id: "channel-123",
    send: jest.fn().mockResolvedValue({}),
  },
  options: {
    getSubcommand: jest.fn().mockReturnValue(options.subcommand || "start"),
    getInteger: jest.fn().mockReturnValue(options.duration || 25),
    getString: jest.fn().mockImplementation((name) => {
      if (name === "subject") return options.subject || "Test";
      return null;
    }),
  },
  user: {
    id: options.userId || "123456789",
    username: options.username || "TestUser",
  },
});

describe("Focus Command", () => {
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
      if (typeof focusCommand.cleanupForTests === "function") {
        await focusCommand.cleanupForTests();
      } else {
        // Encerrar todas as sessões ativas manualmente
        const activeSessions = await ActiveSession.find({
          sessionType: "focus",
        });
        for (const session of activeSessions) {
          try {
            const mockChannel = { send: jest.fn() };
            await focusCommand._endFocusMode(session.userId, mockChannel);
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

  it("should start a focus session", async () => {
    const interaction = createMockInteraction({
      subcommand: "start",
      duration: 30,
      subject: "Test Focus",
    });

    await focusCommand.execute(interaction);

    // Verificar se a resposta foi enviada
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();

    // Verificar se a sessão foi criada
    const activeSession = await ActiveSession.findOne({
      userId: "123456789",
      sessionType: "focus",
    });

    expect(activeSession).toBeTruthy();
    expect(activeSession.subject).toBe("Test Focus");

    const studySession = await StudySession.findById(
      activeSession.studySessionId
    );
    expect(studySession).toBeTruthy();
    expect(studySession.type).toBe("focus");
  }, 30000);

  it("should not start a focus session with invalid duration", async () => {
    const interaction = createMockInteraction({
      subcommand: "start",
      duration: -5,
      subject: "Invalid Duration",
    });

    await focusCommand.execute(interaction);

    // Verificar mensagem de erro
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("duração deve estar entre")
    );

    // Verificar que não criou sessão
    const sessions = await ActiveSession.find({ userId: "123456789" });
    expect(sessions.length).toBe(0);
  }, 30000);

  // Adicione mais testes conforme necessário
});
