const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

// Carregar variáveis de ambiente
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('Erro: Variáveis de ambiente DISCORD_TOKEN e CLIENT_ID são obrigatórias');
  process.exit(1);
}

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
    console.log(`Comando carregado: ${command.data.name}`);
  } else {
    console.log(`[AVISO] O comando em ${filePath} está faltando a propriedade "data" ou "execute" obrigatória.`);
  }
}

// Construir a instância REST
const rest = new REST({ version: '10' }).setToken(token);

// Deploy dos comandos
(async () => {
  try {
    console.log(`Começando a registrar ${commands.length} comandos de aplicação.`);

    let data;
    
    if (guildId) {
      // Registrar comandos em um servidor específico (desenvolvimento)
      console.log(`Registrando comandos para o servidor: ${guildId}`);
      data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands },
      );
      console.log(`Registrado com sucesso ${data.length} comandos para o servidor específico.`);
    } else {
      // Registrar comandos globalmente (produção)
      console.log('Registrando comandos globalmente...');
      data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      );
      console.log(`Registrado com sucesso ${data.length} comandos globalmente.`);
    }
    
    // Listar todos os comandos registrados
    console.log('Comandos registrados:');
    data.forEach(cmd => console.log(`- ${cmd.name} (ID: ${cmd.id})`));
    
  } catch (error) {
    console.error('Erro ao registrar comandos:');
    console.error(error);
  }
})();