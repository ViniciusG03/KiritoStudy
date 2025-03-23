// events/ready.js
const { ActivityType } = require('discord.js');
const mongoose = require('mongoose');
const Goal = require('../database/models/Goal');
const User = require('../database/models/User');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Bot online! Logado como ${client.user.tag}`);
    
    // Definir status de atividade
    client.user.setActivity('estudando 📚', { type: ActivityType.Playing });
    
    // Verificar metas vencidas diariamente
    setInterval(async () => {
      try {
        // Encontrar todas as metas vencidas não completadas
        const overdueGoals = await Goal.find({
          completed: false,
          deadline: { $lt: new Date(), $ne: null }
        });
        
        // Notificar usuários via DM
        for (const goal of overdueGoals) {
          // Marcar como notificada (você pode adicionar um campo para controlar isso)
          goal.notified = true;
          await goal.save();
          
          // Encontrar o usuário
          const user = await User.findOne({ discordId: goal.userId });
          if (!user) continue;
          
          // Tentar enviar DM para o usuário
          try {
            const member = await client.users.fetch(goal.userId);
            await member.send({
              content: `⚠️ **Lembrete:** Sua meta "${goal.title}" está vencida! Venceu em ${goal.deadline.toLocaleDateString('pt-BR')}.`,
            });
          } catch (error) {
            console.error(`Não foi possível enviar DM para o usuário ${goal.userId}:`, error);
          }
        }
      } catch (error) {
        console.error('Erro ao verificar metas vencidas:', error);
      }
    }, 86400000); // 24 horas
    
    // Verificar conexão com o MongoDB a cada 30 minutos
    setInterval(() => {
      if (mongoose.connection.readyState !== 1) {
        console.log('MongoDB desconectado. Tentando reconectar...');
        mongoose.connect(process.env.MONGODB_URI)
          .then(() => console.log('Reconectado ao MongoDB'))
          .catch(err => console.error('Falha ao reconectar com MongoDB:', err));
      }
    }, 1800000); // 30 minutos
  },
};