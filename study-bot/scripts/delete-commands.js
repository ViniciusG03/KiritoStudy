// scripts/delete-commands.js
const { REST, Routes } = require('discord.js');
require('dotenv').config();

// Carregar variáveis de ambiente
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('Erro: Variáveis de ambiente DISCORD_TOKEN e CLIENT_ID são obrigatórias');
  process.exit(1);
}

// Construir a instância REST
const rest = new REST({ version: '10' }).setToken(token);

// Função para excluir todos os comandos
(async () => {
  try {
    console.log('Iniciando remoção de comandos...');

    if (guildId) {
      // Remover comandos de um servidor específico
      console.log(`Removendo todos os comandos do servidor: ${guildId}`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [] }
      );
      console.log('Comandos do servidor removidos com sucesso.');
    } else {
      // Remover comandos globais
      console.log('Removendo todos os comandos globais...');
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: [] }
      );
      console.log('Comandos globais removidos com sucesso.');
    }
    
  } catch (error) {
    console.error('Erro ao remover comandos:');
    console.error(error);
  }
})();