// tests/mocks/discord.js
const discordMocks = {
  SlashCommandBuilder: jest.fn().mockImplementation(() => {
    const builderMock = {
      setName: jest.fn().mockReturnThis(),
      setDescription: jest.fn().mockReturnThis(),
      setDefaultMemberPermissions: jest.fn().mockReturnThis(),
      addSubcommand: jest.fn().mockImplementation((fn) => {
        const subcommandMock = {
          setName: jest.fn().mockReturnThis(),
          setDescription: jest.fn().mockReturnThis(),
          addIntegerOption: jest.fn().mockImplementation((fn) => {
            const optionMock = {
              setName: jest.fn().mockReturnThis(),
              setDescription: jest.fn().mockReturnThis(),
              setRequired: jest.fn().mockReturnThis(),
            };
            fn(optionMock);
            return subcommandMock; // Returns subcommand for chaining
          }),
          addStringOption: jest.fn().mockImplementation((fn) => {
            const optionMock = {
              setName: jest.fn().mockReturnThis(),
              setDescription: jest.fn().mockReturnThis(),
              setRequired: jest.fn().mockReturnThis(),
              addChoices: jest.fn().mockReturnThis(),
            };
            fn(optionMock);
            return subcommandMock; // Returns subcommand for chaining
          }),
          addBooleanOption: jest.fn().mockImplementation((fn) => {
            const optionMock = {
              setName: jest.fn().mockReturnThis(),
              setDescription: jest.fn().mockReturnThis(),
              setRequired: jest.fn().mockReturnThis(),
            };
            fn(optionMock);
            return subcommandMock; // Returns subcommand for chaining
          }),
          addChannelOption: jest.fn().mockImplementation((fn) => {
            const optionMock = {
              setName: jest.fn().mockReturnThis(),
              setDescription: jest.fn().mockReturnThis(),
              setRequired: jest.fn().mockReturnThis(),
            };
            fn(optionMock);
            return subcommandMock; // Returns subcommand for chaining
          }),
        };
        fn(subcommandMock);
        return builderMock; // Returns builder for chaining
      }),
    };
    return builderMock;
  }),

  // Enhanced EmbedBuilder mock that returns real data
  EmbedBuilder: jest.fn().mockImplementation(() => {
    const embedData = {
      title: "",
      description: "",
      color: "",
      fields: [],
      footer: null,
      timestamp: null,
    };

    return {
      setTitle: jest.fn((title) => {
        embedData.title = title;
        return this;
      }),
      setDescription: jest.fn((desc) => {
        embedData.description = desc;
        return this;
      }),
      setColor: jest.fn((color) => {
        embedData.color = color;
        return this;
      }),
      addFields: jest.fn((...fields) => {
        embedData.fields = embedData.fields.concat(fields.flat());
        return this;
      }),
      setFooter: jest.fn((footer) => {
        embedData.footer = footer;
        return this;
      }),
      setTimestamp: jest.fn(() => {
        embedData.timestamp = new Date();
        return this;
      }),
      // This method ensures the data is returned when the object is serialized
      toJSON: () => embedData,
    };
  }),

  PermissionFlagsBits: {
    ManageGuild: 0x20,
  },
};

module.exports = discordMocks;
