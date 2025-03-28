// tests/commands/focus.test.js
const mongoose = require("mongoose");
const ActiveSession = require("../../database/models/ActiveSession");
const StudySession = require("../../database/models/StudySession");
const User = require("../../database/models/User");

// Mock for discord.js
jest.mock("discord.js", () => {
  return require("../mocks/discord");
});

// Import after mocks to ensure mocks are applied
const focusCommand = require("../../commands/focus");

// Mock for interaction
const createMockInteraction = (options = {}) => ({
  deferReply: jest.fn().mockResolvedValue({}),
  editReply: jest.fn().mockResolvedValue({}),
  channel: {
    id: options.channelId || "channel-123",
    send: jest.fn().mockResolvedValue({}),
  },
  options: {
    getSubcommand: jest.fn().mockReturnValue(options.subcommand || "start"),
    getInteger: jest.fn().mockImplementation((name) => {
      if (name === "duration") return options.duration || 25;
      return null;
    }),
    getString: jest.fn().mockImplementation((name) => {
      if (name === "subject") return options.subject || "Test";
      return null;
    }),
  },
  user: {
    id: options.userId || "123456789",
    username: options.username || "TestUser",
  },
  memberPermissions: {
    has: jest.fn().mockReturnValue(true),
  },
});

describe("Focus Command", () => {
  // Increase timeout for these specific tests
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Check if already connected
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
      console.error("Error closing MongoDB connection:", error);
    }
  });

  beforeEach(async () => {
    // Use fake timers for time control in tests
    jest.useFakeTimers();

    try {
      // Clear existing sessions
      if (typeof focusCommand.cleanupForTests === "function") {
        await focusCommand.cleanupForTests();
      } else {
        // Manually end all active sessions
        const activeSessions = await ActiveSession.find({
          sessionType: "focus",
        });
        for (const session of activeSessions) {
          try {
            const mockChannel = { send: jest.fn() };
            await focusCommand._endFocusMode(session.userId, mockChannel);
          } catch (err) {
            // Ignore errors during cleanup
          }
        }
      }

      // Clear collections
      await User.deleteMany({});
      await StudySession.deleteMany({});
      await ActiveSession.deleteMany({});

      // Clear mocks
      jest.clearAllMocks();
    } catch (error) {
      console.error("Error clearing data for test:", error);
    }
  });

  afterEach(() => {
    // Restore real timers after each test
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("start subcommand", () => {
    it("should start a focus session", async () => {
      const interaction = createMockInteraction({
        subcommand: "start",
        duration: 30,
        subject: "Test Focus",
      });

      await focusCommand.execute(interaction);

      // Verify response was sent
      expect(interaction.deferReply).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalled();

      // Verify session was created
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
    });

    it("should not start a focus session with invalid duration", async () => {
      const interaction = createMockInteraction({
        subcommand: "start",
        duration: -5,
        subject: "Invalid Duration",
      });

      await focusCommand.execute(interaction);

      // Verify error message
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("duração deve estar entre")
      );

      // Verify no session was created
      const sessions = await ActiveSession.find({ userId: "123456789" });
      expect(sessions.length).toBe(0);
    });

    it("should not start a focus session if one is already active", async () => {
      // Start first session
      const interaction1 = createMockInteraction({
        subcommand: "start",
        duration: 30,
        subject: "First Session",
      });
      await focusCommand.execute(interaction1);

      jest.clearAllMocks();

      // Try to start second session
      const interaction2 = createMockInteraction({
        subcommand: "start",
        duration: 30,
        subject: "Second Session",
      });
      await focusCommand.execute(interaction2);

      // Verify error message
      expect(interaction2.editReply).toHaveBeenCalledWith(
        expect.stringContaining("Você já está em modo de foco")
      );

      // Verify only one session exists
      const sessions = await ActiveSession.find({ userId: "123456789" });
      expect(sessions.length).toBe(1);
      expect(sessions[0].subject).toBe("First Session");
    });
  });

  describe("stop subcommand", () => {
    it("should stop an active focus session", async () => {
      // First start a session
      const startInteraction = createMockInteraction({
        subcommand: "start",
        duration: 30,
        subject: "Test Focus",
      });

      await focusCommand.execute(startInteraction);
      jest.clearAllMocks();

      // Then stop it
      const stopInteraction = createMockInteraction({
        subcommand: "stop",
      });

      await focusCommand.execute(stopInteraction);

      // Verify response was sent
      expect(stopInteraction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("seu modo de foco foi encerrado")
      );

      // Verify session was removed
      const activeSession = await ActiveSession.findOne({
        userId: "123456789",
        sessionType: "focus",
      });

      expect(activeSession).toBeNull();

      // Verify study session was completed
      const studySession = await StudySession.findOne({
        userId: "123456789",
        type: "focus",
      });

      expect(studySession).toBeTruthy();
      expect(studySession.completed).toBe(true);
      expect(studySession.endTime).toBeTruthy();
    });

    it("should handle stopping when no session is active", async () => {
      const interaction = createMockInteraction({
        subcommand: "stop",
      });

      await focusCommand.execute(interaction);

      // Verify error message
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("Você não está em modo de foco")
      );
    });
  });

  describe("status subcommand", () => {
    it("should display status of an active focus session", async () => {
      // First start a session
      const startInteraction = createMockInteraction({
        subcommand: "start",
        duration: 30,
        subject: "Test Focus",
      });

      await focusCommand.execute(startInteraction);
      jest.clearAllMocks();

      // Then check status
      const statusInteraction = createMockInteraction({
        subcommand: "status",
      });

      await focusCommand.execute(statusInteraction);

      // Verify response contains status info
      expect(statusInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining("Status do Modo Foco"),
            }),
          ]),
        })
      );
    });

    it("should handle status check when no session is active", async () => {
      const interaction = createMockInteraction({
        subcommand: "status",
      });

      await focusCommand.execute(interaction);

      // Verify error message
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("Você não está em modo de foco")
      );
    });
  });

  describe("list subcommand", () => {
    it("should list all active focus sessions", async () => {
      // Start a session for first user
      const user1Interaction = createMockInteraction({
        userId: "user1",
        username: "User One",
        subcommand: "start",
        duration: 30,
        subject: "User 1 Focus",
      });

      await focusCommand.execute(user1Interaction);

      // Start a session for second user
      const user2Interaction = createMockInteraction({
        userId: "user2",
        username: "User Two",
        subcommand: "start",
        duration: 45,
        subject: "User 2 Focus",
      });

      await focusCommand.execute(user2Interaction);
      jest.clearAllMocks();

      // Then list sessions
      const listInteraction = createMockInteraction({
        subcommand: "list",
      });

      await focusCommand.execute(listInteraction);

      // Verify response lists sessions
      expect(listInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining("Usuários em Modo Foco"),
              description: expect.stringContaining("2"),
            }),
          ]),
        })
      );
    });

    it("should handle listing when no sessions are active", async () => {
      const interaction = createMockInteraction({
        subcommand: "list",
      });

      await focusCommand.execute(interaction);

      // Verify message about no active sessions
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("Não há usuários em modo de foco")
      );
    });
  });

  describe("Timer functionality", () => {
    it("should automatically end focus session when timer expires", async () => {
      // Start a focus session
      const interaction = createMockInteraction({
        subcommand: "start",
        duration: 1, // 1 minute
        subject: "Quick Focus",
      });

      await focusCommand.execute(interaction);

      // Get the session
      const activeSession = await ActiveSession.findOne({
        userId: "123456789",
        sessionType: "focus",
      });

      expect(activeSession).toBeTruthy();

      // Fast forward time by more than the duration
      jest.advanceTimersByTime(70 * 1000); // 70 seconds

      // Wait for the cleanup to run asynchronously
      await new Promise(process.nextTick);

      // Wait for promise resolution (timeout may be needed in real tests)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify session was ended
      const endedSession = await ActiveSession.findOne({
        userId: "123456789",
        sessionType: "focus",
      });

      expect(endedSession).toBeNull();

      // Check that the study session was completed
      const studySession = await StudySession.findById(
        activeSession.studySessionId
      );
      expect(studySession.completed).toBe(true);
    });
  });
});
