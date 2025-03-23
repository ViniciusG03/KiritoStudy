// events/interactionCreate.js
const { Events, InteractionType } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Verificar se é um comando de slash
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`❌ Nenhum comando encontrado com o nome ${interaction.commandName}.`);
      return;
    }

    try {
      console.log(`Executando comando ${interaction.commandName} solicitado por ${interaction.user.tag} (${interaction.user.id})`);
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Erro ao executar o comando ${interaction.commandName}:`, error);
      
      // Responder ao usuário, considerando o estado da interação
      try {
        const errorMessage = 'Ocorreu um erro ao executar este comando.';
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (e) {
        console.error('Não foi possível responder com mensagem de erro:', e);
      }
    }
  },
};