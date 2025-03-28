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
            return subcommandMock; // Retorna subcommand para encadeamento
          }),
          addStringOption: jest.fn().mockImplementation((fn) => {
            const optionMock = {
              setName: jest.fn().mockReturnThis(),
              setDescription: jest.fn().mockReturnThis(),
              setRequired: jest.fn().mockReturnThis(),
              addChoices: jest.fn().mockReturnThis(),
            };
            fn(optionMock);
            return subcommandMock; // Retorna subcommand para encadeamento
          }),
          addBooleanOption: jest.fn().mockImplementation((fn) => {
            const optionMock = {
              setName: jest.fn().mockReturnThis(),
              setDescription: jest.fn().mockReturnThis(),
              setRequired: jest.fn().mockReturnThis(),
            };
            fn(optionMock);
            return subcommandMock; // Retorna subcommand para encadeamento
          }),
          addChannelOption: jest.fn().mockImplementation((fn) => {
            const optionMock = {
              setName: jest.fn().mockReturnThis(),
              setDescription: jest.fn().mockReturnThis(),
              setRequired: jest.fn().mockReturnThis(),
            };
            fn(optionMock);
            return subcommandMock; // Retorna subcommand para encadeamento
          }),
        };
        fn(subcommandMock);
        return builderMock; // Retorna builder para encadeamento
      }),
    };
    return builderMock;
  }),

  EmbedBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
  })),

  PermissionFlagsBits: {
    ManageGuild: 0x20,
  },
};

module.exports = discordMocks;
