// scripts/check-commands.js
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

// Função para verificar comandos
(async () => {
  try {
    console.log('Verificando comandos registrados...');

    let commands;
    
    if (guildId) {
      // Verificar comandos do servidor específico
      console.log(`Verificando comandos para o servidor: ${guildId}`);
      commands = await rest.get(
        Routes.applicationGuildCommands(clientId, guildId)
      );
      console.log(`${commands.length} comandos encontrados no servidor específico.`);
    } else {
      // Verificar comandos globais
      console.log('Verificando comandos globais...');
      commands = await rest.get(
        Routes.applicationCommands(clientId)
      );
      console.log(`${commands.length} comandos globais encontrados.`);
    }
    
    // Listar todos os comandos registrados
    if (commands.length > 0) {
      console.log('Comandos registrados:');
      commands.forEach(cmd => console.log(`- ${cmd.name} (ID: ${cmd.id})`));
    } else {
      console.log('Nenhum comando registrado encontrado.');
    }
    
  } catch (error) {
    console.error('Erro ao verificar comandos:');
    console.error(error);
  }
})();