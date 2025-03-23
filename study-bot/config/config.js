// config/config.js
module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,  // Opcional, para comandos específicos de servidor
    mongoURI: process.env.MONGODB_URI,
    
    // Configurações do Pomodoro
    pomodoro: {
      workTime: 25 * 60 * 1000,     // 25 minutos em milissegundos
      shortBreak: 5 * 60 * 1000,    // 5 minutos em milissegundos
      longBreak: 15 * 60 * 1000,    // 15 minutos em milissegundos
      longBreakInterval: 4          // A cada 4 pomodoros, fazer uma pausa longa
    },
    
    // Configurações do sistema de níveis
    levels: {
      baseXP: 100,                  // XP base para subir de nível
      growthFactor: 1.5,            // Fator de crescimento para o próximo nível
      studySessionXP: 50,           // XP ganho por sessão de estudo completa
      goalCompletionXP: 100         // XP ganho por completar uma meta
    },
    
    // Configurações de relatórios
    reports: {
      dailyTime: '20:00',           // Hora para enviar relatórios diários (UTC)
      weeklyDay: 0                  // Dia da semana para relatórios semanais (0 = Domingo)
    }
  };