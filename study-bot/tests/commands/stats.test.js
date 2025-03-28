// tests/commands/stats.test.js
const mongoose = require("mongoose");
const User = require("../../database/models/User");
const StudySession = require("../../database/models/StudySession");
const Goal = require("../../database/models/Goal");

// Mock for discord.js
jest.mock("discord.js", () => {
  return require("../mocks/discord");
});

// Import after mocks to ensure mocks are applied
const statsCommand = require("../../commands/stats");

// Mock for interaction
const createMockInteraction = (options = {}) => ({
  deferReply: jest.fn().mockResolvedValue({}),
  editReply: jest.fn().mockResolvedValue({}),
  channel: {
    id: options.channelId || "channel-123",
    send: jest.fn().mockResolvedValue({}),
  },
  options: {
    getSubcommand: jest.fn().mockReturnValue(options.subcommand || "overview"),
    getString: jest.fn().mockImplementation((name) => {
      if (name === "date") return options.date || null;
      if (name === "period") return options.period || "week";
      return null;
    }),
  },
  user: {
    id: options.userId || "123456789",
    username: options.username || "TestUser",
  },
});

describe("Stats Command", () => {
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
    try {
      // Clear collections before each test
      await User.deleteMany({});
      await StudySession.deleteMany({});
      await Goal.deleteMany({});

      // Mock static methods
      jest.spyOn(StudySession, "getDailyStats");
      jest.spyOn(StudySession, "getWeeklyStats");
      jest.spyOn(StudySession, "getStatsBySubject");

      // Clear mocks
      jest.clearAllMocks();
    } catch (error) {
      console.error("Error clearing collections:", error);
    }
  });

  // Helper to create test data
  const setupTestData = async () => {
    // Create a user
    const user = new User({
      discordId: "123456789",
      username: "TestUser",
      level: 3,
      xp: 50,
      xpToNextLevel: 150,
      totalStudyTime: 360, // 6 hours
      totalSessions: 12,
      completedPomodoros: 24,
      currentStreak: 5,
      longestStreak: 7,
      lastSessionDate: new Date(),
    });
    await user.save();

    // Create study sessions
    const now = new Date();

    // Today's sessions
    await StudySession.create([
      {
        userId: "123456789",
        startTime: new Date(now.setHours(9, 0, 0, 0)),
        endTime: new Date(now.setHours(10, 0, 0, 0)),
        duration: 60,
        type: "pomodoro",
        completed: true,
        subject: "Math",
        pomodorosCompleted: 2,
      },
      {
        userId: "123456789",
        startTime: new Date(now.setHours(14, 0, 0, 0)),
        endTime: new Date(now.setHours(15, 30, 0, 0)),
        duration: 90,
        type: "focus",
        completed: true,
        subject: "Science",
      },
    ]);

    // Yesterday's session
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    await StudySession.create({
      userId: "123456789",
      startTime: new Date(yesterday.setHours(10, 0, 0, 0)),
      endTime: new Date(yesterday.setHours(11, 0, 0, 0)),
      duration: 60,
      type: "focus",
      completed: true,
      subject: "History",
    });

    // Create goals
    await Goal.create([
      {
        userId: "123456789",
        title: "Active Goal",
        targetTime: 120,
        currentTime: 60,
        progress: 50,
        completed: false,
      },
      {
        userId: "123456789",
        title: "Completed Goal",
        targetTime: 60,
        currentTime: 60,
        progress: 100,
        completed: true,
      },
    ]);

    // Mock getDailyStats response
    StudySession.getDailyStats.mockResolvedValue([
      {
        _id: null,
        totalDuration: 150,
        sessionsCount: 2,
        pomodorosCount: 2,
      },
    ]);

    // Mock getWeeklyStats response
    StudySession.getWeeklyStats.mockResolvedValue([
      {
        _id: 1, // Sunday
        totalDuration: 60,
        sessionsCount: 1,
      },
      {
        _id: 2, // Monday
        totalDuration: 150,
        sessionsCount: 2,
      },
    ]);

    // Mock getStatsBySubject response
    StudySession.getStatsBySubject.mockResolvedValue([
      {
        _id: "Math",
        totalDuration: 120,
        sessionsCount: 2,
      },
      {
        _id: "Science",
        totalDuration: 90,
        sessionsCount: 1,
      },
      {
        _id: "History",
        totalDuration: 60,
        sessionsCount: 1,
      },
    ]);
  };

  describe("overview subcommand", () => {
    it("should display user study statistics overview", async () => {
      await setupTestData();

      const interaction = createMockInteraction({
        subcommand: "overview",
      });

      await statsCommand.execute(interaction);

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Estatísticas de Estudo/),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringMatching(/Tempo Total/),
                  value: expect.stringMatching(/6h 0min/),
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Sessões Totais/),
                  value: "12",
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Pomodoros Completos/),
                  value: "24",
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Streak Atual/),
                  value: expect.stringMatching(/5 dias/),
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Maior Streak/),
                  value: expect.stringMatching(/7 dias/),
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Nível/),
                  value: expect.stringMatching(/3/),
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it("should create a new user if not found", async () => {
      const interaction = createMockInteraction({
        subcommand: "overview",
        userId: "new-user-123",
        username: "NewUser",
      });

      await statsCommand.execute(interaction);

      // Verify user was created
      const user = await User.findOne({ discordId: "new-user-123" });
      expect(user).toBeTruthy();
      expect(user.username).toBe("NewUser");

      // Verify response (with default values)
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Estatísticas de Estudo/),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringMatching(/Tempo Total/),
                  value: expect.stringMatching(/0h 0min/),
                }),
              ]),
            }),
          ]),
        })
      );
    });
  });

  describe("daily subcommand", () => {
    it("should display daily statistics for the current day", async () => {
      await setupTestData();

      const interaction = createMockInteraction({
        subcommand: "daily",
      });

      await statsCommand.execute(interaction);

      // Verify StudySession.getDailyStats was called
      expect(StudySession.getDailyStats).toHaveBeenCalledWith(
        "123456789",
        expect.any(Date)
      );

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Estatísticas de/),
              description: expect.stringContaining("150"),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringMatching(/Sessões/),
                  value: "2",
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Pomodoros/),
                  value: "2",
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it("should display daily statistics for a specific date", async () => {
      await setupTestData();

      const dateString = "15/06/2023"; // Format: DD/MM/YYYY

      const interaction = createMockInteraction({
        subcommand: "daily",
        date: dateString,
      });

      await statsCommand.execute(interaction);

      // Verify appropriate date parsing
      const dateParts = dateString.split("/");
      const expectedDate = new Date(
        parseInt(dateParts[2], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[0], 10)
      );

      // Verify StudySession.getDailyStats was called with correct date
      expect(StudySession.getDailyStats).toHaveBeenCalledWith(
        "123456789",
        expect.any(Date)
      );

      // Verify response includes date
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining(dateString),
            }),
          ]),
        })
      );
    });

    it("should handle invalid date format", async () => {
      await setupTestData();

      const interaction = createMockInteraction({
        subcommand: "daily",
        date: "invalid-date",
      });

      await statsCommand.execute(interaction);

      // Verify error response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(/formato de data inválido/i)
      );
    });

    it("should handle days with no study sessions", async () => {
      await setupTestData();

      // Mock empty results for this specific test
      StudySession.getDailyStats.mockResolvedValueOnce([]);

      const interaction = createMockInteraction({
        subcommand: "daily",
      });

      await statsCommand.execute(interaction);

      // Verify appropriate response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              description: expect.stringContaining("Nenhuma sessão"),
            }),
          ]),
        })
      );
    });
  });

  describe("weekly subcommand", () => {
    it("should display weekly statistics", async () => {
      await setupTestData();

      const interaction = createMockInteraction({
        subcommand: "weekly",
      });

      await statsCommand.execute(interaction);

      // Verify StudySession.getWeeklyStats was called
      expect(StudySession.getWeeklyStats).toHaveBeenCalledWith(
        "123456789",
        expect.any(Date)
      );

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Estatísticas Semanais/),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringMatching(/Tempo Total/),
                  value: expect.stringContaining("210"),
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Sessões/),
                  value: "3",
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Dias da Semana/),
                  value:
                    expect.stringContaining("Domingo") &&
                    expect.stringContaining("Segunda"),
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it("should handle weeks with no study sessions", async () => {
      await setupTestData();

      // Mock empty results for this specific test
      StudySession.getWeeklyStats.mockResolvedValueOnce([]);

      const interaction = createMockInteraction({
        subcommand: "weekly",
      });

      await statsCommand.execute(interaction);

      // Verify appropriate response with zeros
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringMatching(/Tempo Total/),
                  value: expect.stringMatching(/0h 0min/),
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Sessões/),
                  value: "0",
                }),
              ]),
            }),
          ]),
        })
      );
    });
  });

  describe("subjects subcommand", () => {
    it("should display statistics by subject for the default period", async () => {
      await setupTestData();

      const interaction = createMockInteraction({
        subcommand: "subjects",
        period: "month", // Default
      });

      await statsCommand.execute(interaction);

      // Verify StudySession.getStatsBySubject was called with appropriate date range
      expect(StudySession.getStatsBySubject).toHaveBeenCalledWith(
        "123456789",
        expect.any(Date), // Start of month
        expect.any(Date) // Current date/time
      );

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(
                /Estatísticas por Assunto - Este Mês/
              ),
              description: expect.stringContaining("270"), // Total minutes (120+90+60)
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringMatching(/Assuntos/),
                  value:
                    expect.stringContaining("Math") &&
                    expect.stringContaining("Science") &&
                    expect.stringContaining("History"),
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it("should display statistics by subject for a different period", async () => {
      await setupTestData();

      const interaction = createMockInteraction({
        subcommand: "subjects",
        period: "all", // All time
      });

      await statsCommand.execute(interaction);

      // Verify StudySession.getStatsBySubject was called with appropriate date range
      expect(StudySession.getStatsBySubject).toHaveBeenCalledWith(
        "123456789",
        expect.any(Date), // Jan 1, 1970
        expect.any(Date) // Current date/time
      );

      // Verify title includes correct period
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Todo o Período/),
            }),
          ]),
        })
      );
    });

    it("should handle no data for subjects", async () => {
      await setupTestData();

      // Mock empty results for this specific test
      StudySession.getStatsBySubject.mockResolvedValueOnce([]);

      const interaction = createMockInteraction({
        subcommand: "subjects",
      });

      await statsCommand.execute(interaction);

      // Verify appropriate response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(/não tem sessões de estudo/i)
      );
    });
  });

  describe("streak subcommand", () => {
    it("should display streak statistics", async () => {
      await setupTestData();

      const interaction = createMockInteraction({
        subcommand: "streak",
      });

      await statsCommand.execute(interaction);

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Streak de Estudos/),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringMatching(/Streak Atual/),
                  value: expect.stringMatching(/5 dias/),
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Maior Streak/),
                  value: expect.stringMatching(/7 dias/),
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Última Sessão/),
                  value: expect.stringContaining("<t:"),
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it("should handle users with no streak", async () => {
      // Create user with no streak
      const user = new User({
        discordId: "123456789",
        username: "TestUser",
        currentStreak: 0,
        longestStreak: 0,
        lastSessionDate: null,
      });
      await user.save();

      const interaction = createMockInteraction({
        subcommand: "streak",
      });

      await statsCommand.execute(interaction);

      // Verify response has zeros
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringMatching(/Streak Atual/),
                  value: expect.stringMatching(/0 dias/),
                }),
                expect.objectContaining({
                  name: expect.stringMatching(/Maior Streak/),
                  value: expect.stringMatching(/0 dias/),
                }),
              ]),
            }),
          ]),
        })
      );

      // Verify no "Última Sessão" field
      expect(interaction.editReply).not.toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringMatching(/Última Sessão/),
                }),
              ]),
            }),
          ]),
        })
      );
    });
  });

  describe("Error handling", () => {
    it("should handle unexpected errors gracefully", async () => {
      // Mock a crash by making the method throw an error
      jest.spyOn(User, "findOne").mockImplementationOnce(() => {
        throw new Error("Database connection failed");
      });

      const interaction = createMockInteraction({
        subcommand: "overview",
      });

      await statsCommand.execute(interaction);

      // Verify error response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(/ocorreu um erro/i)
      );
    });
  });
});
