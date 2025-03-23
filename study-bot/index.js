// index.js - Arquivo principal do bot
require('dotenv').config();

const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const config = require('./config/config');

// Verificar variáveis de ambiente obrigatórias
if (!config.token) {
  console.error('Erro: Variável de ambiente DISCORD_TOKEN não encontrada');
  process.exit(1);
}

if (!config.mongoURI) {
  console.error('Erro: Variável de ambiente MONGODB_URI não encontrada');
  process.exit(1);
}

// Inicializar o cliente do Discord com as permissões necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

// Coleção para comandos
client.commands = new Collection();

// Carregar comandos
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`Carregando ${commandFiles.length} comandos...`);

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`✓ Comando carregado: ${command.data.name}`);
    } else {
      console.log(`⚠️ O comando em ${filePath} está faltando uma propriedade "data" ou "execute" obrigatória.`);
    }
  } catch (error) {
    console.error(`❌ Erro ao carregar o comando ${file}:`, error);
  }
}

// Carregar eventos
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

console.log(`Carregando ${eventFiles.length} eventos...`);

for (const file of eventFiles) {
  try {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
      console.log(`✓ Evento único carregado: ${event.name}`);
    } else {
      client.on(event.name, (...args) => event.execute(...args));
      console.log(`✓ Evento carregado: ${event.name}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao carregar o evento ${file}:`, error);
  }
}

// Adicionar evento para comandos de slash
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`❌ Comando não encontrado ${interaction.commandName}`);
    return;
  }

  try {
    console.log(`Executando comando ${interaction.commandName} por ${interaction.user.tag}`);
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Erro executando o comando ${interaction.commandName}:`, error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Ocorreu um erro ao executar este comando.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Ocorreu um erro ao executar este comando.', ephemeral: true });
      }
    } catch (e) {
      console.error('❌ Não foi possível responder com mensagem de erro:', e);
    }
  }
});

// Conectar ao MongoDB
mongoose.connect(config.mongoURI)
  .then(() => console.log('✓ Conectado ao MongoDB'))
  .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

// Login do bot
client.login(config.token)
  .then(() => console.log('✓ Bot logado com sucesso!'))
  .catch(err => console.error('❌ Erro ao fazer login do bot:', err));