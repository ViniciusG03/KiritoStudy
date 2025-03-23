// config/config.js
module.exports = {
    token:"MTM1MzE3ODg3OTU3NzE2MTczNg.GRm9dk.kU34qahkMGu_PkqhpkWlASS0wXHS671_tESrEw",
    clientId:"1353178879577161736",
    guildId:"",
    mongoURI:"https://discord.com/oauth2/authorize?client_id=1353178879577161736&permissions=8&integration_type=0&scope=applications.commands+bot",
    
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