const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { clientId, guildId, token } = require('./config/config');

const commands = [];
// Recuperar todos os arquivos de comando
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Recuperar os dados SlashCommandBuilder de cada comando
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[AVISO] O comando em ${filePath} está faltando a propriedade "data" ou "execute" obrigatória.`);
  }
}

// Construir a instância REST
const rest = new REST().setToken(token);

// Deploy dos comandos
(async () => {
  try {
    console.log(`Começando a registrar ${commands.length} comandos de aplicação.`);

    // Para registrar comandos globalmente:
    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    // Para registrar comandos em um servidor específico:
    // const data = await rest.put(
    //   Routes.applicationGuildCommands(clientId, guildId),
    //   { body: commands },
    // );

    console.log(`Registrado com sucesso ${data.length} comandos de aplicação.`);
  } catch (error) {
    console.error(error);
  }
})();