// tests/commands/goals.test.js
const mongoose = require("mongoose");
const Goal = require("../../database/models/Goal");
const User = require("../../database/models/User");

// Mock for discord.js
jest.mock("discord.js", () => {
  return require("../mocks/discord");
});

// Import after mocks to ensure mocks are applied
const goalsCommand = require("../../commands/goals");

// Mock for interaction
const createMockInteraction = (options = {}) => ({
  deferReply: jest.fn().mockResolvedValue({}),
  editReply: jest.fn().mockResolvedValue({}),
  channel: {
    id: options.channelId || "channel-123",
    send: jest.fn().mockResolvedValue({}),
  },
  options: {
    getSubcommand: jest.fn().mockReturnValue(options.subcommand || "create"),
    getString: jest.fn().mockImplementation((name) => {
      if (name === "title") return options.title || "Test Goal";
      if (name === "description")
        return options.description || "Test Description";
      if (name === "subject") return options.subject || "Test Subject";
      if (name === "deadline") return options.deadline || null;
      if (name === "type") return options.type || "custom";
      if (name === "id") return options.id || null;
      if (name === "filter") return options.filter || "active";
      return null;
    }),
    getInteger: jest.fn().mockImplementation((name) => {
      if (name === "target") return options.target || 60;
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

describe("Goals Command", () => {
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
      await Goal.deleteMany({});
      await User.deleteMany({});

      // Clear mocks
      jest.clearAllMocks();
    } catch (error) {
      console.error("Error clearing collections:", error);
    }
  });

  describe("create subcommand", () => {
    it("should create a new goal", async () => {
      const interaction = createMockInteraction({
        subcommand: "create",
        title: "Study JavaScript",
        description: "Learn promises and async/await",
        target: 120,
        subject: "Programming",
        type: "weekly",
      });

      await goalsCommand.execute(interaction);

      // Verify response
      expect(interaction.deferReply).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining("Meta Criada"),
              description: expect.stringContaining("Study JavaScript"),
            }),
          ]),
        })
      );

      // Verify goal was created in database
      const goals = await Goal.find({ userId: "123456789" });
      expect(goals.length).toBe(1);
      expect(goals[0].title).toBe("Study JavaScript");
      expect(goals[0].description).toBe("Learn promises and async/await");
      expect(goals[0].targetTime).toBe(120);
      expect(goals[0].subject).toBe("Programming");
      expect(goals[0].type).toBe("weekly");
    });

    it("should create a user if one doesn't exist", async () => {
      const interaction = createMockInteraction({
        subcommand: "create",
        userId: "new-user-123",
        username: "NewUser",
      });

      await goalsCommand.execute(interaction);

      // Verify user was created
      const user = await User.findOne({ discordId: "new-user-123" });
      expect(user).toBeTruthy();
      expect(user.username).toBe("NewUser");
    });

    it("should handle invalid date format", async () => {
      const interaction = createMockInteraction({
        subcommand: "create",
        deadline: "invalid-date", // Invalid date format
      });

      await goalsCommand.execute(interaction);

      // Verify error response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(/formato de data inválido/i)
      );

      // Verify no goal was created
      const goals = await Goal.find({ userId: "123456789" });
      expect(goals.length).toBe(0);
    });
  });

  describe("list subcommand", () => {
    beforeEach(async () => {
      // Create some test goals
      await Goal.create([
        {
          userId: "123456789",
          title: "Active Goal 1",
          description: "This is active",
          targetTime: 60,
          subject: "Math",
          completed: false,
        },
        {
          userId: "123456789",
          title: "Active Goal 2",
          description: "This is also active",
          targetTime: 120,
          subject: "Science",
          completed: false,
        },
        {
          userId: "123456789",
          title: "Completed Goal",
          description: "This is completed",
          targetTime: 30,
          subject: "History",
          completed: true,
        },
      ]);
    });

    it("should list active goals by default", async () => {
      const interaction = createMockInteraction({
        subcommand: "list",
        filter: "active",
      });

      await goalsCommand.execute(interaction);

      // Verify response contains active goals
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining("Metas Ativas"),
              description: expect.stringContaining("2 meta(s)"),
            }),
          ]),
        })
      );
    });

    it("should list completed goals", async () => {
      const interaction = createMockInteraction({
        subcommand: "list",
        filter: "completed",
      });

      await goalsCommand.execute(interaction);

      // Verify response contains completed goals
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining("Metas Concluídas"),
              description: expect.stringContaining("1 meta(s)"),
            }),
          ]),
        })
      );
    });

    it("should list all goals", async () => {
      const interaction = createMockInteraction({
        subcommand: "list",
        filter: "all",
      });

      await goalsCommand.execute(interaction);

      // Verify response contains all goals
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining("Todas as Metas"),
              description: expect.stringContaining("3 meta(s)"),
            }),
          ]),
        })
      );
    });

    it("should handle case with no goals", async () => {
      // Clear all goals
      await Goal.deleteMany({});

      const interaction = createMockInteraction({
        subcommand: "list",
      });

      await goalsCommand.execute(interaction);

      // Verify appropriate response when no goals exist
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(/não tem metas/i)
      );
    });
  });

  describe("view subcommand", () => {
    let goalId;

    beforeEach(async () => {
      // Create a test goal
      const goal = await Goal.create({
        userId: "123456789",
        title: "Goal to View",
        description: "This is a goal to view",
        targetTime: 60,
        subject: "ViewTest",
        completed: false,
      });
      goalId = goal._id.toString();
    });

    it("should view a goal by ID", async () => {
      const interaction = createMockInteraction({
        subcommand: "view",
        id: goalId,
      });

      await goalsCommand.execute(interaction);

      // Verify response contains goal details
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Goal to View/),
            }),
          ]),
        })
      );
    });

    it("should view a goal by partial title", async () => {
      const interaction = createMockInteraction({
        subcommand: "view",
        id: "View", // Partial title
      });

      await goalsCommand.execute(interaction);

      // Verify response contains goal details
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Goal to View/),
            }),
          ]),
        })
      );
    });

    it("should handle goal not found", async () => {
      const interaction = createMockInteraction({
        subcommand: "view",
        id: "non-existent-goal",
      });

      await goalsCommand.execute(interaction);

      // Verify error message
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(/meta não encontrada/i)
      );
    });
  });

  describe("update subcommand", () => {
    let goalId;

    beforeEach(async () => {
      // Create a test goal
      const goal = await Goal.create({
        userId: "123456789",
        title: "Original Title",
        description: "Original description",
        targetTime: 60,
        subject: "UpdateTest",
        deadline: null,
        completed: false,
      });
      goalId = goal._id.toString();
    });

    it("should update a goal's title", async () => {
      const interaction = createMockInteraction({
        subcommand: "update",
        id: goalId,
        title: "Updated Title",
      });

      await goalsCommand.execute(interaction);

      // Verify goal was updated
      const updatedGoal = await Goal.findById(goalId);
      expect(updatedGoal.title).toBe("Updated Title");

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Meta Atualizada/),
            }),
          ]),
        })
      );
    });

    it("should update multiple fields", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const formattedDate = `${String(tomorrow.getDate()).padStart(
        2,
        "0"
      )}/${String(tomorrow.getMonth() + 1).padStart(
        2,
        "0"
      )}/${tomorrow.getFullYear()}`;

      const interaction = createMockInteraction({
        subcommand: "update",
        id: goalId,
        title: "New Title",
        description: "New description",
        target: 120,
        deadline: formattedDate,
      });

      await goalsCommand.execute(interaction);

      // Verify goal was updated
      const updatedGoal = await Goal.findById(goalId);
      expect(updatedGoal.title).toBe("New Title");
      expect(updatedGoal.description).toBe("New description");
      expect(updatedGoal.targetTime).toBe(120);
      expect(updatedGoal.deadline).toBeTruthy();
    });

    it("should handle goal not found", async () => {
      const interaction = createMockInteraction({
        subcommand: "update",
        id: "non-existent-goal",
        title: "New Title",
      });

      await goalsCommand.execute(interaction);

      // Verify error message
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(/meta não encontrada/i)
      );
    });
  });

  describe("delete subcommand", () => {
    let goalId;

    beforeEach(async () => {
      // Create a test goal
      const goal = await Goal.create({
        userId: "123456789",
        title: "Goal to Delete",
        description: "This goal will be deleted",
        targetTime: 60,
        subject: "DeleteTest",
        completed: false,
      });
      goalId = goal._id.toString();
    });

    it("should delete a goal by ID", async () => {
      const interaction = createMockInteraction({
        subcommand: "delete",
        id: goalId,
      });

      await goalsCommand.execute(interaction);

      // Verify goal was deleted
      const deletedGoal = await Goal.findById(goalId);
      expect(deletedGoal).toBeNull();

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Meta Excluída/),
            }),
          ]),
        })
      );
    });

    it("should handle goal not found", async () => {
      const interaction = createMockInteraction({
        subcommand: "delete",
        id: "non-existent-goal",
      });

      await goalsCommand.execute(interaction);

      // Verify error message
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(/meta não encontrada/i)
      );
    });
  });

  describe("add-milestone subcommand", () => {
    let goalId;

    beforeEach(async () => {
      // Create a test goal
      const goal = await Goal.create({
        userId: "123456789",
        title: "Goal with Milestones",
        description: "This goal will have milestones added",
        targetTime: 60,
        subject: "MilestoneTest",
        completed: false,
        milestones: [],
      });
      goalId = goal._id.toString();
    });

    it("should add a milestone to a goal", async () => {
      const interaction = createMockInteraction({
        subcommand: "add-milestone",
        id: goalId,
        title: "First Milestone",
      });

      await goalsCommand.execute(interaction);

      // Verify milestone was added
      const updatedGoal = await Goal.findById(goalId);
      expect(updatedGoal.milestones.length).toBe(1);
      expect(updatedGoal.milestones[0].title).toBe("First Milestone");
      expect(updatedGoal.milestones[0].completed).toBe(false);

      // Verify response
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringMatching(/Marco Adicionado/),
            }),
          ]),
        })
      );
    });

    it("should add multiple milestones", async () => {
      // Add first milestone
      const interaction1 = createMockInteraction({
        subcommand: "add-milestone",
        id: goalId,
        title: "First Milestone",
      });
      await goalsCommand.execute(interaction1);

      // Add second milestone
      const interaction2 = createMockInteraction({
        subcommand: "add-milestone",
        id: goalId,
        title: "Second Milestone",
      });
      await goalsCommand.execute(interaction2);

      // Verify both milestones were added
      const updatedGoal = await Goal.findById(goalId);
      expect(updatedGoal.milestones.length).toBe(2);
      expect(updatedGoal.milestones[0].title).toBe("First Milestone");
      expect(updatedGoal.milestones[1].title).toBe("Second Milestone");
    });

    it("should handle goal not found", async () => {
      const interaction = createMockInteraction({
        subcommand: "add-milestone",
        id: "non-existent-goal",
        title: "Milestone Title",
      });

      await goalsCommand.execute(interaction);

      // Verify error message
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(/meta não encontrada/i)
      );
    });
  });
});
