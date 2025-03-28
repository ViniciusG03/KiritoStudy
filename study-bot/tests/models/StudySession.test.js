// tests/models/StudySession.test.js
const mongoose = require("mongoose");
const StudySession = require("../../database/models/StudySession");
const User = require("../../database/models/User");

describe("StudySession Model", () => {
  // Increase timeout for DB operations
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
    try {
      // Clear collections before each test
      await StudySession.deleteMany({});
      await User.deleteMany({});
    } catch (error) {
      console.error("Error clearing collections:", error);
    }
  });

  describe("Basic CRUD operations", () => {
    it("should create a study session successfully", async () => {
      const sessionData = {
        userId: "123456789",
        startTime: new Date(),
        type: "pomodoro",
        subject: "Test Subject",
      };

      const session = new StudySession(sessionData);
      const savedSession = await session.save();

      expect(savedSession).toBeTruthy();
      expect(savedSession.userId).toBe(sessionData.userId);
      expect(savedSession.type).toBe("pomodoro");
      expect(savedSession.subject).toBe("Test Subject");
      expect(savedSession.completed).toBe(false);
    });

    it("should validate required fields", async () => {
      const session = new StudySession({
        // Missing required userId and startTime
        type: "focus",
      });

      let error;
      try {
        await session.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeTruthy();
      expect(error.errors.userId).toBeTruthy();
      expect(error.errors.startTime).toBeTruthy();
    });

    it("should validate enum values for type", async () => {
      const session = new StudySession({
        userId: "123456789",
        startTime: new Date(),
        type: "invalid-type", // Invalid type
      });

      let error;
      try {
        await session.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeTruthy();
      expect(error.errors.type).toBeTruthy();
    });
  });

  describe("Statistics methods", () => {
    beforeEach(async () => {
      // Create test user
      await User.create({
        discordId: "test-user",
        username: "TestUser",
      });

      // Create some sample sessions for testing
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);

      const twoDaysAgo = new Date(now);
      twoDaysAgo.setDate(now.getDate() - 2);

      // Today's sessions
      await StudySession.create([
        {
          userId: "test-user",
          startTime: new Date(now.setHours(10, 0, 0, 0)),
          endTime: new Date(now.setHours(11, 0, 0, 0)),
          duration: 60,
          type: "pomodoro",
          completed: true,
          subject: "Math",
          pomodorosCompleted: 2,
        },
        {
          userId: "test-user",
          startTime: new Date(now.setHours(14, 0, 0, 0)),
          endTime: new Date(now.setHours(15, 30, 0, 0)),
          duration: 90,
          type: "focus",
          completed: true,
          subject: "Science",
        },
      ]);

      // Yesterday's sessions
      await StudySession.create([
        {
          userId: "test-user",
          startTime: new Date(yesterday.setHours(9, 0, 0, 0)),
          endTime: new Date(yesterday.setHours(10, 0, 0, 0)),
          duration: 60,
          type: "pomodoro",
          completed: true,
          subject: "Math",
          pomodorosCompleted: 2,
        },
        {
          userId: "test-user",
          startTime: new Date(yesterday.setHours(16, 0, 0, 0)),
          endTime: new Date(yesterday.setHours(17, 0, 0, 0)),
          duration: 60,
          type: "focus",
          completed: true,
          subject: "History",
        },
      ]);

      // Two days ago sessions
      await StudySession.create([
        {
          userId: "test-user",
          startTime: new Date(twoDaysAgo.setHours(10, 0, 0, 0)),
          endTime: new Date(twoDaysAgo.setHours(11, 0, 0, 0)),
          duration: 60,
          type: "regular",
          completed: true,
          subject: "English",
        },
      ]);
    });

    it("should get daily statistics", async () => {
      const today = new Date();
      const stats = await StudySession.getDailyStats("test-user", today);

      expect(stats).toBeTruthy();
      expect(stats.length).toBe(1);
      expect(stats[0].totalDuration).toBe(150); // 60 + 90 minutes
      expect(stats[0].sessionsCount).toBe(2);
      expect(stats[0].pomodorosCount).toBe(2);
    });

    it("should get weekly statistics", async () => {
      const today = new Date();
      const stats = await StudySession.getWeeklyStats("test-user", today);

      expect(stats).toBeTruthy();
      expect(stats.length).toBeGreaterThan(0);

      // Add up all durations from weeklyStats
      const totalDuration = stats.reduce(
        (total, day) => total + day.totalDuration,
        0
      );

      // Should include all 5 sessions (total duration: 60+90+60+60+60 = 330)
      expect(totalDuration).toBe(330);
    });

    it("should get statistics by subject", async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date();
      endOfMonth.setHours(23, 59, 59, 999);

      const subjectStats = await StudySession.getStatsBySubject(
        "test-user",
        startOfMonth,
        endOfMonth
      );

      expect(subjectStats).toBeTruthy();
      expect(subjectStats.length).toBeGreaterThanOrEqual(3); // Math, Science, History

      // Find Math stats (should have 2 sessions for 120 minutes total)
      const mathStats = subjectStats.find((s) => s._id === "Math");
      expect(mathStats).toBeTruthy();
      expect(mathStats.totalDuration).toBe(120);
      expect(mathStats.sessionsCount).toBe(2);

      // Find Science stats (should have 1 session for 90 minutes)
      const scienceStats = subjectStats.find((s) => s._id === "Science");
      expect(scienceStats).toBeTruthy();
      expect(scienceStats.totalDuration).toBe(90);
      expect(scienceStats.sessionsCount).toBe(1);
    });
  });
});

// tests/models/Goal.test.js
describe("Goal Model", () => {
  // Increase timeout for DB operations
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
    const Goal = require("../../database/models/Goal");
    try {
      // Clear collections
      await Goal.deleteMany({});
    } catch (error) {
      console.error("Error clearing Goal collection:", error);
    }
  });

  describe("Goal methods", () => {
    it("should update progress correctly", async () => {
      const Goal = require("../../database/models/Goal");

      const goal = new Goal({
        userId: "test-user",
        title: "Test Goal",
        description: "Testing progress updates",
        targetTime: 100, // 100 minutes target
        currentTime: 0,
        progress: 0,
      });

      // Add 30 minutes
      goal.currentTime = 30;
      const wasCompleted = goal.updateProgress();

      expect(wasCompleted).toBe(false);
      expect(goal.progress).toBe(30); // 30%
      expect(goal.completed).toBe(false);

      // Add 70 more minutes (total: 100)
      goal.currentTime = 100;
      const nowCompleted = goal.updateProgress();

      expect(nowCompleted).toBe(true);
      expect(goal.progress).toBe(100); // 100%
      expect(goal.completed).toBe(true);

      // Add more time beyond target
      goal.currentTime = 120;
      const stillCompleted = goal.updateProgress();

      expect(stillCompleted).toBe(false); // Already completed
      expect(goal.progress).toBe(100); // Still 100%
      expect(goal.completed).toBe(true);
    });

    it("should add time and update progress", async () => {
      const Goal = require("../../database/models/Goal");

      const goal = new Goal({
        userId: "test-user",
        title: "Test Goal",
        description: "Testing addTime method",
        targetTime: 60, // 60 minutes target
        currentTime: 0,
        progress: 0,
      });

      // Add 30 minutes
      const result1 = goal.addTime(30);

      expect(result1).toBe(false);
      expect(goal.currentTime).toBe(30);
      expect(goal.progress).toBe(50); // 50%

      // Add 30 more minutes to complete
      const result2 = goal.addTime(30);

      expect(result2).toBe(true);
      expect(goal.currentTime).toBe(60);
      expect(goal.progress).toBe(100); // 100%
      expect(goal.completed).toBe(true);
    });

    it("should find active goals for a user", async () => {
      const Goal = require("../../database/models/Goal");

      // Create some test goals
      await Goal.create([
        {
          userId: "test-user",
          title: "Active Goal 1",
          completed: false,
        },
        {
          userId: "test-user",
          title: "Active Goal 2",
          completed: false,
        },
        {
          userId: "test-user",
          title: "Completed Goal",
          completed: true,
        },
        {
          userId: "other-user",
          title: "Other User Goal",
          completed: false,
        },
      ]);

      const activeGoals = await Goal.findActiveGoals("test-user");

      expect(activeGoals).toBeTruthy();
      expect(activeGoals.length).toBe(2);
      expect(activeGoals[0].title).toBe("Active Goal 1");
      expect(activeGoals[1].title).toBe("Active Goal 2");
    });

    it("should find overdue goals", async () => {
      const Goal = require("../../database/models/Goal");

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Create some test goals
      await Goal.create([
        {
          userId: "test-user",
          title: "Overdue Goal",
          deadline: yesterday,
          completed: false,
        },
        {
          userId: "test-user",
          title: "Future Goal",
          deadline: tomorrow,
          completed: false,
        },
        {
          userId: "test-user",
          title: "Completed Overdue Goal",
          deadline: yesterday,
          completed: true,
        },
        {
          userId: "test-user",
          title: "No Deadline Goal",
          deadline: null,
          completed: false,
        },
      ]);

      const overdueGoals = await Goal.findOverdueGoals("test-user");

      expect(overdueGoals).toBeTruthy();
      expect(overdueGoals.length).toBe(1);
      expect(overdueGoals[0].title).toBe("Overdue Goal");
    });
  });
});
