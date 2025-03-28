// index.js - Arquivo principal do bot
require("dotenv").config();

const { Client, GatewayIntentBits, Collection, Events } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const config = require("./config/config");
const pomodoroManager = require("./utils/pomodoroManager");
const focusCommand = require("./commands/focus");

// Verificar variáveis de ambiente obrigatórias
if (!config.token) {
  console.error("Erro: Variável de ambiente DISCORD_TOKEN não encontrada");
  process.exit(1);
}

if (!config.mongoURI) {
  console.error("Erro: Variável de ambiente MONGODB_URI não encontrada");
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
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

console.log(`Carregando ${commandFiles.length} comandos...`);

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);

    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
      console.log(`✓ Comando carregado: ${command.data.name}`);
    } else {
      console.log(
        `⚠️ O comando em ${filePath} está faltando uma propriedade "data" ou "execute" obrigatória.`
      );
    }
  } catch (error) {
    console.error(`❌ Erro ao carregar o comando ${file}:`, error);
  }
}

// Carregar eventos
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));

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
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`❌ Comando não encontrado ${interaction.commandName}`);
    return;
  }

  try {
    console.log(
      `Executando comando ${interaction.commandName} por ${interaction.user.tag}`
    );
    await command.execute(interaction);
  } catch (error) {
    console.error(
      `❌ Erro executando o comando ${interaction.commandName}:`,
      error
    );
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "Ocorreu um erro ao executar este comando.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "Ocorreu um erro ao executar este comando.",
          ephemeral: true,
        });
      }
    } catch (e) {
      console.error("❌ Não foi possível responder com mensagem de erro:", e);
    }
  }
});

// Adicionar evento de Ready para restaurar sessões
client.once(Events.ClientReady, async () => {
  console.log(`Bot online! Logado como ${client.user.tag}`);

  try {
    // Completar restauração das sessões com informações do cliente
    await pomodoroManager.completeSessionsRestore(client);

    if (focusCommand.completeSessionsRestore) {
      await focusCommand.completeSessionsRestore(client);
    }

    // Limpar sessões órfãs
    const removedSessions = await pomodoroManager.cleanOrphanedSessions();
    console.log(`Limpeza de sessões: ${removedSessions} sessões removidas`);

    if (focusCommand.cleanOrphanedSessions) {
      const removedFocusSessions = await focusCommand.cleanOrphanedSessions();
      console.log(
        `Limpeza de sessões de foco: ${removedFocusSessions} sessões removidas`
      );
    }

    // Definir status de atividade
    client.user.setActivity("estudando 📚", {
      type: GatewayIntentBits.Playing,
    });
  } catch (error) {
    console.error("Erro ao restaurar sessões ativas:", error);
  }

  // Configurar limpeza periódica de sessões (a cada 3 horas)
  setInterval(async () => {
    try {
      await pomodoroManager.cleanOrphanedSessions();
    } catch (error) {
      console.error("Erro na limpeza periódica de sessões:", error);
    }
  }, 3 * 60 * 60 * 1000);

  // Verificar conexão com o MongoDB a cada 30 minutos
  setInterval(() => {
    if (mongoose.connection.readyState !== 1) {
      console.log("MongoDB desconectado. Tentando reconectar...");
      mongoose
        .connect(config.mongoURI)
        .then(() => console.log("Reconectado ao MongoDB"))
        .catch((err) => console.error("Falha ao reconectar com MongoDB:", err));
    }
  }, 30 * 60 * 1000);
});

// Conectar ao MongoDB e carregar sessões ativas
mongoose
  .connect(config.mongoURI)
  .then(async () => {
    console.log("✓ Conectado ao MongoDB");

    // Carregar sessões ativas após conexão
    try {
      await pomodoroManager.loadActiveSessions();
      console.log("✓ Sessões ativas carregadas do banco de dados");
    } catch (error) {
      console.error("❌ Erro ao carregar sessões ativas:", error);
    }

    if (focusCommand.loadActiveSessions) {
      await focusCommand.loadActiveSessions();
      console.log("✓ Sessões de foco ativas carregadas do banco de dados");
    }

    // Login do bot após carregar as sessões
    try {
      await client.login(config.token);
      console.log("✓ Bot logado com sucesso!");
    } catch (loginError) {
      console.error("❌ Erro ao fazer login do bot:", loginError);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("❌ Erro ao conectar ao MongoDB:", err);
    process.exit(1);
  });

// Tratamento de erros não capturados
process.on("unhandledRejection", (reason, promise) => {
  console.error("Promessa não tratada:", promise, "razão:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Erro não capturado:", err);
  // Em produção, você pode querer enviar uma notificação e/ou reiniciar o bot
});
