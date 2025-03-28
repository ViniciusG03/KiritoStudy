// tests/integration/sessionFeatures.test.js
const mongoose = require("mongoose");
const pomodoroManager = require("../../utils/pomodoroManager");
const focusCommand = require("../../commands/focus");
const User = require("../../database/models/User");
const StudySession = require("../../database/models/StudySession");
const ActiveSession = require("../../database/models/ActiveSession");
const Goal = require("../../database/models/Goal");

// Mock for Discord client
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

// Mock channels
const mockDmChannel = {
  send: jest.fn().mockResolvedValue({}),
};

const mockServerChannel = {
  id: "server-channel-123",
  send: jest.fn().mockResolvedValue({}),
};

// Mock interaction for focus command
const createMockInteraction = (options = {}) => ({
  deferReply: jest.fn().mockResolvedValue({}),
  editReply: jest.fn().mockResolvedValue({}),
  channel: mockServerChannel,
  options: {
    getSubcommand: jest.fn().mockReturnValue(options.subcommand || "start"),
    getInteger: jest.fn().mockImplementation((name) => {
      if (name === "duration") return options.duration || 25;
      return null;
    }),
    getString: jest.fn().mockImplementation((name) => {
      if (name === "subject") return options.subject || "Test";
      if (name === "goal") return options.goalId || null;
      return null;
    }),
  },
  user: {
    id: options.userId || "123456789",
    username: options.username || "TestUser",
  },
});

describe("Session Features Integration", () => {
  // Increase timeout for integration tests
  jest.setTimeout(40000);

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
    // Use fake timers
    jest.useFakeTimers();

    try {
      // Clean up sessions
      if (typeof pomodoroManager.cleanupForTests === "function") {
        await pomodoroManager.cleanupForTests();
      }

      if (typeof focusCommand.cleanupForTests === "function") {
        await focusCommand.cleanupForTests();
      }

      // Clean up collections
      await User.deleteMany({});
      await StudySession.deleteMany({});
      await ActiveSession.deleteMany({});
      await Goal.deleteMany({});

      // Clear mocks
      jest.clearAllMocks();
    } catch (error) {
      console.error("Error cleaning up for tests:", error);
    }
  });

  afterEach(() => {
    // Restore real timers
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("Focus session persistence", () => {
    it("should create and restore a focus session", async () => {
      // 1. Create a focus session
      const interaction = createMockInteraction({
        subcommand: "start",
        duration: 30,
        subject: "Test Focus",
      });

      await focusCommand.execute(interaction);

      // Verify session was created
      let activeSession = await ActiveSession.findOne({
        userId: "123456789",
        sessionType: "focus",
      });
      expect(activeSession).toBeTruthy();

      // 2. Simulate bot restart by clearing cache
      await focusCommand.cleanupForTests(true); // true = only clear cache, not database

      // 3. Load session from database
      await focusCommand.loadActiveSessions();

      // 4. Complete restoration with client
      await focusCommand.completeSessionsRestore(mockClient);

      // 5. Verify session status
      const statusInteraction = createMockInteraction({
        subcommand: "status",
      });

      await focusCommand.execute(statusInteraction);

      // Should find the session in status check
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
  });

  describe("Session interaction with goals", () => {
    let goalId;

    beforeEach(async () => {
      // Create a user
      const user = new User({
        discordId: "123456789",
        username: "TestUser",
      });
      await user.save();

      // Create a goal
      const goal = new Goal({
        userId: "123456789",
        title: "Study Goal",
        description: "Goal for testing",
        targetTime: 60, // 60 minutes target
        subject: "Integration",
        completed: false,
      });
      await goal.save();
      goalId = goal._id.toString();
    });

    it("should update goal progress when pomodoro session is completed", async () => {
      // Start a pomodoro session linked to the goal
      await pomodoroManager.startPomodoro(
        "123456789",
        "TestUser",
        mockServerChannel,
        mockDmChannel,
        "Integration Test",
        goalId
      );

      // Get the session to verify it's created
      const activeSession = await ActiveSession.findOne({
        userId: "123456789",
        sessionType: "pomodoro",
      });
      expect(activeSession).toBeTruthy();
      expect(activeSession.goalId.toString()).toBe(goalId);

      // Complete one pomodoro cycle (25 minutes)
      const session = pomodoroManager.getActiveSession("123456789");
      expect(session).toBeTruthy();

      // Simulate time passing for one work period
      jest.advanceTimersByTime(25 * 60 * 1000 + 1000); // 25 minutes + 1 second

      // Wait for async operations to complete
      await new Promise(process.nextTick);

      // Stop the pomodoro session
      await pomodoroManager.stopPomodoro("123456789");

      // Check if goal was updated
      const updatedGoal = await Goal.findById(goalId);
      expect(updatedGoal).toBeTruthy();
      expect(updatedGoal.currentTime).toBe(25); // 25 minutes added
      expect(updatedGoal.progress).toBe(41); // (25/60) * 100 ≈ 41%
    });

    it("should update goal progress when focus session is completed", async () => {
      // Add goal ID support to the focus command mock
      const interaction = createMockInteraction({
        subcommand: "start",
        duration: 30,
        subject: "Focus with Goal",
        goalId: goalId,
      });

      // Execute the focus command
      await focusCommand.execute(interaction);

      // Get the session
      const activeSession = await ActiveSession.findOne({
        userId: "123456789",
        sessionType: "focus",
      });
      expect(activeSession).toBeTruthy();

      // Stop the focus session
      const stopInteraction = createMockInteraction({
        subcommand: "stop",
      });
      await focusCommand.execute(stopInteraction);

      // Check if goal was updated
      const updatedGoal = await Goal.findById(goalId);
      expect(updatedGoal).toBeTruthy();
      expect(updatedGoal.currentTime).toBeGreaterThan(0); // Some time should be added
    });

    it("should mark goal as completed when target is reached", async () => {
      // Create a goal with a small target time
      const smallGoal = new Goal({
        userId: "123456789",
        title: "Quick Goal",
        description: "Should complete quickly",
        targetTime: 20, // Only 20 minutes needed
        subject: "Quick Test",
        completed: false,
      });
      await smallGoal.save();
      const smallGoalId = smallGoal._id.toString();

      // Start a pomodoro session linked to the goal
      await pomodoroManager.startPomodoro(
        "123456789",
        "TestUser",
        mockServerChannel,
        mockDmChannel,
        "Quick Integration Test",
        smallGoalId
      );

      // Complete one pomodoro cycle (25 minutes)
      jest.advanceTimersByTime(25 * 60 * 1000 + 1000); // 25 minutes + 1 second

      // Wait for async operations to complete
      await new Promise(process.nextTick);

      // Stop the pomodoro session
      await pomodoroManager.stopPomodoro("123456789");

      // Check if goal was marked as completed
      const completedGoal = await Goal.findById(smallGoalId);
      expect(completedGoal).toBeTruthy();
      expect(completedGoal.currentTime).toBeGreaterThanOrEqual(20);
      expect(completedGoal.progress).toBe(100);
      expect(completedGoal.completed).toBe(true);
    });
  });

  describe("User statistics update", () => {
    beforeEach(async () => {
      // Create a user
      const user = new User({
        discordId: "123456789",
        username: "TestUser",
      });
      await user.save();
    });

    it("should update user statistics after completing a pomodoro session", async () => {
      // Start a pomodoro session
      await pomodoroManager.startPomodoro(
        "123456789",
        "TestUser",
        mockServerChannel,
        mockDmChannel,
        "Stats Test"
      );

      // Complete one pomodoro
      jest.advanceTimersByTime(25 * 60 * 1000 + 1000); // 25 minutes + 1 second

      // Wait for async operations
      await new Promise(process.nextTick);

      // Stop the session
      await pomodoroManager.stopPomodoro("123456789");

      // Check user statistics
      const user = await User.findOne({ discordId: "123456789" });
      expect(user).toBeTruthy();
      expect(user.totalStudyTime).toBeGreaterThan(0);
      expect(user.totalSessions).toBe(1);
      expect(user.completedPomodoros).toBeGreaterThan(0);
      expect(user.currentStreak).toBe(1);
    });

    it("should update user statistics after completing a focus session", async () => {
      // Start a focus session
      const interaction = createMockInteraction({
        subcommand: "start",
        duration: 10,
        subject: "Focus Stats Test",
      });

      await focusCommand.execute(interaction);

      // Let some time pass
      jest.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      // Stop the session
      const stopInteraction = createMockInteraction({
        subcommand: "stop",
      });

      await focusCommand.execute(stopInteraction);

      // Check user statistics
      const user = await User.findOne({ discordId: "123456789" });
      expect(user).toBeTruthy();
      expect(user.totalStudyTime).toBeGreaterThan(0);
      expect(user.totalSessions).toBe(1);
      expect(user.focusSessions).toBe(1);
      expect(user.currentStreak).toBe(1);
    });

    it("should award XP for completed study sessions", async () => {
      // User starts with 0 XP at level 1
      let user = await User.findOne({ discordId: "123456789" });
      expect(user.xp).toBe(0);
      expect(user.level).toBe(1);

      // Start and complete a focus session
      const startInteraction = createMockInteraction({
        subcommand: "start",
        duration: 30,
        subject: "XP Test",
      });

      await focusCommand.execute(startInteraction);

      // Wait a bit and stop
      jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes

      const stopInteraction = createMockInteraction({
        subcommand: "stop",
      });

      await focusCommand.execute(stopInteraction);

      // Check XP gain
      user = await User.findOne({ discordId: "123456789" });
      expect(user.xp).toBeGreaterThan(0);
    });
  });
});
