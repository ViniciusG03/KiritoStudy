// tests/commands/pomodoro.test.js
const mongoose = require("mongoose");
const ActiveSession = require("../../database/models/ActiveSession");
const StudySession = require("../../database/models/StudySession");
const User = require("../../database/models/User");
const Goal = require("../../database/models/Goal");
const pomodoroManager = require("../../utils/pomodoroManager");

// Mock for discord.js
jest.mock("discord.js", () => {
  return require("../mocks/discord");
});

// Import after mocks to ensure mocks are applied
const pomodoroCommand = require("../../commands/pomodoro");

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
    getString: jest.fn().mockImplementation((name) => {
      if (name === "subject") return options.subject || "Test Subject";
      if (name === "goal") return options.goalId || null;
      return null;
    }),
  },
  user: {
    id: options.userId || "123456789",
    username: options.username || "TestUser",
    createDM: jest.fn().mockResolvedValue({
      id: "dm-channel-123",
      send: jest.fn().mockResolvedValue({}),
    }),
  },
});

describe("Pomodoro Command", () => {
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
      // Clean up sessions
      if (typeof pomodoroManager.cleanupForTests === "function") {
        await pomodoroManager.cleanupForTests();
      } else {
        // Manually end all active sessions
        const activeSessions = await ActiveSession.find({
          sessionType: "pomodoro",
        });
        for (const session of activeSessions) {
          try {
            await pomodoroManager.stopPomodoro(session.userId);
          } catch (err) {
            // Ignore errors during cleanup
          }
        }
      }

      // Clear collections
      await User.deleteMany({});
      await StudySession.deleteMany({});
      await ActiveSession.deleteMany({});
      await Goal.deleteMany({});

      // Clear mocks
      jest.clearAllMocks();

      // Mock pomodoroManager method calls
      jest
        .spyOn(pomodoroManager, "startPomodoro")
        .mockImplementation(
          (userId, username, serverChannel, dmChannel, subject, goalId) => {
            return Promise.resolve({
              success: true,
              sessionId: "mock-session-id",
              message: "Session started successfully",
            });
          }
        );

      jest
        .spyOn(pomodoroManager, "pausePomodoro")
        .mockImplementation((userId) => {
          return Promise.resolve({
            success: true,
            message: "Session paused successfully",
          });
        });

      jest
        .spyOn(pomodoroManager, "resumePomodoro")
        .mockImplementation((userId) => {
          return Promise.resolve({
            success: true,
            message: "Session resumed successfully",
          });
        });

      jest
        .spyOn(pomodoroManager, "stopPomodoro")
        .mockImplementation((userId) => {
          return Promise.resolve({
            success: true,
            message: "Session stopped successfully",
          });
        });

      jest
        .spyOn(pomodoroManager, "getActiveSession")
        .mockImplementation((userId) => {
          if (userId === "123456789") {
            return {
              userId: "123456789",
              username: "TestUser",
              subject: "Test Subject",
              status: "work",
              pomodorosCompleted: 2,
              paused: false,
              startTime: new Date(),
              timeLeft: 15,
            };
          }
          return null;
        });

      jest
        .spyOn(pomodoroManager, "getAllActiveSessions")
        .mockImplementation(() => {
          return [
            {
              userId: "123456789",
              username: "TestUser",
              subject: "Test Subject",
              status: "work",
              pomodorosCompleted: 2,
              paused: false,
            },
            {
              userId: "987654321",
              username: "AnotherUser",
              subject: "Another Subject",
              status: "shortBreak",
              pomodorosCompleted: 3,
              paused: false,
            },
          ];
        });
    } catch (error) {
      console.error("Error cleaning up for test:", error);
    }
  });

  afterEach(() => {
    // Restore real timers after each test
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("start subcommand", () => {
    it("should start a pomodoro session", async () => {
      const interaction = createMockInteraction({
        subcommand: "start",
        subject: "Test Subject",
      });

      await pomodoroCommand.execute(interaction);

      // Verify pomodoroManager.startPomodoro was called
      expect(pomodoroManager.startPomodoro).toHaveBeenCalledWith(
        "123456789",
        "TestUser",
        expect.anything(),
        expect.anything(),
        "Test Subject",
        null
      );

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("✅")
      );
    });

    it("should start a pomodoro session with associated goal", async () => {
      // Create a goal
      const goal = new Goal({
        userId: "123456789",
        title: "Test Goal",
        targetTime: 60,
        completed: false,
      });
      await goal.save();
      const goalId = goal._id.toString();

      // Mock Goal.findById to simulate finding the goal
      jest.spyOn(Goal, "findById").mockResolvedValue(goal);

      const interaction = createMockInteraction({
        subcommand: "start",
        subject: "Goal Subject",
        goalId: goalId,
      });

      await pomodoroCommand.execute(interaction);

      // Verify pomodoroManager.startPomodoro was called with goal ID
      expect(pomodoroManager.startPomodoro).toHaveBeenCalledWith(
        "123456789",
        "TestUser",
        expect.anything(),
        expect.anything(),
        "Goal Subject",
        goalId
      );
    });

    it("should handle start failures", async () => {
      // Mock a failure response
      pomodoroManager.startPomodoro.mockResolvedValueOnce({
        success: false,
        message: "Session already active",
      });

      const interaction = createMockInteraction({
        subcommand: "start",
        subject: "Failure Test",
      });

      await pomodoroCommand.execute(interaction);

      // Verify error response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("❌")
      );
    });
  });

  describe("pause subcommand", () => {
    it("should pause an active pomodoro session", async () => {
      const interaction = createMockInteraction({
        subcommand: "pause",
      });

      await pomodoroCommand.execute(interaction);

      // Verify pomodoroManager.pausePomodoro was called
      expect(pomodoroManager.pausePomodoro).toHaveBeenCalledWith("123456789");

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("⏸️")
      );
    });

    it("should handle pause failures", async () => {
      // Mock a failure response
      pomodoroManager.pausePomodoro.mockResolvedValueOnce({
        success: false,
        message: "No active session",
      });

      const interaction = createMockInteraction({
        subcommand: "pause",
      });

      await pomodoroCommand.execute(interaction);

      // Verify error response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("❌")
      );
    });
  });

  describe("resume subcommand", () => {
    it("should resume a paused pomodoro session", async () => {
      const interaction = createMockInteraction({
        subcommand: "resume",
      });

      await pomodoroCommand.execute(interaction);

      // Verify pomodoroManager.resumePomodoro was called
      expect(pomodoroManager.resumePomodoro).toHaveBeenCalledWith("123456789");

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("▶️")
      );
    });

    it("should handle resume failures", async () => {
      // Mock a failure response
      pomodoroManager.resumePomodoro.mockResolvedValueOnce({
        success: false,
        message: "Session not paused",
      });

      const interaction = createMockInteraction({
        subcommand: "resume",
      });

      await pomodoroCommand.execute(interaction);

      // Verify error response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("❌")
      );
    });
  });

  describe("stop subcommand", () => {
    it("should stop an active pomodoro session", async () => {
      const interaction = createMockInteraction({
        subcommand: "stop",
      });

      await pomodoroCommand.execute(interaction);

      // Verify pomodoroManager.stopPomodoro was called
      expect(pomodoroManager.stopPomodoro).toHaveBeenCalledWith("123456789");

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("✅")
      );
    });

    it("should handle stop failures", async () => {
      // Mock a failure response
      pomodoroManager.stopPomodoro.mockResolvedValueOnce({
        success: false,
        message: "No active session",
      });

      const interaction = createMockInteraction({
        subcommand: "stop",
      });

      await pomodoroCommand.execute(interaction);

      // Verify error response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("❌")
      );
    });
  });

  describe("status subcommand", () => {
    it("should display the status of an active session", async () => {
      const interaction = createMockInteraction({
        subcommand: "status",
      });

      await pomodoroCommand.execute(interaction);

      // Verify pomodoroManager.getActiveSession was called
      expect(pomodoroManager.getActiveSession).toHaveBeenCalledWith(
        "123456789"
      );

      // Verify response contains session information
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Status do Pomodoro/),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringMatching(/Assunto/),
                  value: "Test Subject",
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it("should handle no active session", async () => {
      // Mock no active session
      pomodoroManager.getActiveSession.mockReturnValueOnce(null);

      const interaction = createMockInteraction({
        subcommand: "status",
      });

      await pomodoroCommand.execute(interaction);

      // Verify error response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("não tem uma sessão")
      );
    });
  });

  describe("active subcommand", () => {
    it("should list all active pomodoro sessions", async () => {
      const interaction = createMockInteraction({
        subcommand: "active",
      });

      await pomodoroCommand.execute(interaction);

      // Verify pomodoroManager.getAllActiveSessions was called
      expect(pomodoroManager.getAllActiveSessions).toHaveBeenCalled();

      // Verify response contains all sessions
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Sessões de Pomodoro Ativas/),
              description: expect.stringContaining("2 sessões"),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringContaining("TestUser"),
                }),
                expect.objectContaining({
                  name: expect.stringContaining("AnotherUser"),
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it("should handle no active sessions", async () => {
      // Mock empty sessions list
      pomodoroManager.getAllActiveSessions.mockReturnValueOnce([]);

      const interaction = createMockInteraction({
        subcommand: "active",
      });

      await pomodoroCommand.execute(interaction);

      // Verify appropriate response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("Não há sessões")
      );
    });
  });

  describe("Error handling", () => {
    it("should handle unexpected errors gracefully", async () => {
      // Mock a crash
      pomodoroManager.startPomodoro.mockRejectedValueOnce(
        new Error("Unexpected crash")
      );

      const interaction = createMockInteraction({
        subcommand: "start",
        subject: "Crash Test",
      });

      await pomodoroCommand.execute(interaction);

      // Verify error response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining("Ocorreu um erro")
      );
    });
  });
});
