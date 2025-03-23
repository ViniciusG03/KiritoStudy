// commands/focus.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const User = require('../database/models/User');
const StudySession = require('../database/models/StudySession');

// Armazenar usuários em modo de foco
const focusUsers = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('focus')
    .setDescription('Comandos do sistema de foco para estudos')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Inicia um modo de foco')
        .addIntegerOption(option =>
          option.setName('duration')
            .setDescription('Duração em minutos')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('subject')
            .setDescription('Assunto que você vai estudar')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('stop')
        .setDescription('Encerra o modo de foco'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Verifica seu status de foco'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lista todos os usuários em modo de foco')),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
    try {
      // Buscar usuário ou criar um novo
      let user = await User.findOne({ discordId: userId });
      if (!user) {
        user = new User({
          discordId: userId,
          username: username
        });
        await user.save();
      }
      
      switch (subcommand) {
        case 'start':
          // Verificar se já está em foco
          if (focusUsers.has(userId)) {
            await interaction.editReply('❌ Você já está em modo de foco! Use `/focus stop` para encerrar o modo atual.');
            return;
          }
          
          const duration = interaction.options.getInteger('duration');
          const subject = interaction.options.getString('subject') || 'Geral';
          
          // Validar duração
          if (duration <= 0 || duration > 480) { // Máximo de 8 horas
            await interaction.editReply('❌ A duração deve estar entre 1 e 480 minutos (8 horas).');
            return;
          }
          
          // Criar nova sessão de estudo
          const session = new StudySession({
            userId: userId,
            startTime: new Date(),
            type: 'focus',
            subject: subject
          });
          await session.save();
          
          // Calcular tempo de término
          const endTime = new Date();
          endTime.setMinutes(endTime.getMinutes() + duration);
          
          // Adicionar aos usuários em foco
          focusUsers.set(userId, {
            sessionId: session._id,
            username: username,
            subject: subject,
            startTime: new Date(),
            endTime: endTime,
            duration: duration,
            timer: null
          });
          
          // Configurar timer para finalizar automaticamente
          const timer = setTimeout(async () => {
            await this._endFocusMode(userId, interaction.channel);
          }, duration * 60 * 1000);
          
          // Armazenar o timer
          focusUsers.get(userId).timer = timer;
          
          // Enviar mensagem de confirmação
          const startEmbed = new EmbedBuilder()
            .setTitle('🎯 Modo Foco Iniciado')
            .setDescription(`${username} entrou em modo de foco por ${duration} minutos!`)
            .setColor('#27ae60')
            .addFields(
              { name: 'Assunto', value: subject, inline: true },
              { name: 'Término', value: `<t:${Math.floor(endTime.getTime() / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Durante o modo foco, tente evitar distrações! 🧠' });
          
          await interaction.editReply({ embeds: [startEmbed] });
          break;
          
        case 'stop':
          if (!focusUsers.has(userId)) {
            await interaction.editReply('❌ Você não está em modo de foco no momento.');
            return;
          }
          
          // Encerrar o modo de foco
          const stopResult = await this._endFocusMode(userId, interaction.channel);
          
          if (stopResult && stopResult.success) {
            await interaction.editReply('✅ Seu modo de foco foi encerrado com sucesso!');
          } else {
            await interaction.editReply('❌ Ocorreu um erro ao encerrar seu modo de foco. Tente novamente.');
          }
          break;
          
        case 'status':
          if (!focusUsers.has(userId)) {
            await interaction.editReply('❓ Você não está em modo de foco no momento.');
            return;
          }
          
          const focusData = focusUsers.get(userId);
          const now = new Date();
          const timeElapsed = Math.floor((now - focusData.startTime) / 60000); // em minutos
          const timeRemaining = Math.max(0, focusData.duration - timeElapsed);
          
          const statusEmbed = new EmbedBuilder()
            .setTitle('🧠 Status do Modo Foco')
            .setDescription(`${username} está em modo de foco!`)
            .setColor('#3498db')
            .addFields(
              { name: 'Assunto', value: focusData.subject, inline: true },
              { name: 'Tempo Decorrido', value: `${timeElapsed} minutos`, inline: true },
              { name: 'Tempo Restante', value: `${timeRemaining} minutos`, inline: true },
              { name: 'Término', value: `<t:${Math.floor(focusData.endTime.getTime() / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Mantenha o foco! 💪' });
          
          await interaction.editReply({ embeds: [statusEmbed] });
          break;
          
        case 'list':
          if (focusUsers.size === 0) {
            await interaction.editReply('📝 Não há usuários em modo de foco no momento.');
            return;
          }
          
          const listEmbed = new EmbedBuilder()
            .setTitle('📋 Usuários em Modo Foco')
            .setDescription(`Há ${focusUsers.size} usuário(s) em modo de foco:`)
            .setColor('#9b59b6');
          
          // Adicionar cada usuário em foco
          Array.from(focusUsers.entries()).forEach(([userId, data]) => {
            const remaining = Math.max(0, Math.floor((data.endTime - new Date()) / 60000));
            
            listEmbed.addFields({
              name: data.username,
              value: `📚 **Assunto:** ${data.subject}\n⏱️ **Tempo Restante:** ${remaining} minutos\n🏁 **Término:** <t:${Math.floor(data.endTime.getTime() / 1000)}:R>`
            });
          });
          
          await interaction.editReply({ embeds: [listEmbed] });
          break;
      }
    } catch (error) {
      console.error(`Erro ao executar comando de foco:`, error);
      await interaction.editReply('❌ Ocorreu um erro ao processar seu comando. Por favor, tente novamente mais tarde.');
    }
  },
  
  /**
   * Método para encerrar o modo de foco
   * @param {string} userId - ID do usuário
   * @param {object} channel - Canal para enviar notificações
   */
  async _endFocusMode(userId, channel) {
    try {
      const focusData = focusUsers.get(userId);
      if (!focusData) return { success: false, message: "Sessão de foco não encontrada" };
      
      // Limpar o timer se existir
      if (focusData.timer) {
        clearTimeout(focusData.timer);
      }
      
      // Calcular a duração real
      const now = new Date();
      const actualDuration = Math.floor((now - focusData.startTime) / 60000); // em minutos
      
      // Atualizar a sessão de estudo
      try {
        await StudySession.findByIdAndUpdate(focusData.sessionId, {
          endTime: now,
          duration: actualDuration,
          completed: true
        });
      } catch (err) {
        console.error("Erro ao atualizar sessão de estudo:", err);
        // Continuar mesmo com erro para não travar o usuário
      }
      
      // Atualizar usuário
      try {
        const user = await User.findOne({ discordId: userId });
        if (user) {
          user.totalStudyTime += actualDuration;
          user.totalSessions += 1;
          user.focusSessions += 1;
          
          // Atualizar streak
          user.updateStreak();
          
          // Dar XP pela sessão de foco
          const xpGained = Math.min(100, actualDuration); // Limite de 100 XP
          let leveledUp = false;
          
          if (user.addXP) {
            leveledUp = await user.addXP(xpGained, { baseXP: 100, growthFactor: 1.5 });
          } else {
            // Método alternativo caso o método addXP não exista
            user.xp += xpGained;
            if (user.xp >= user.xpToNextLevel) {
              user.level += 1;
              user.xp -= user.xpToNextLevel;
              user.xpToNextLevel = Math.floor(100 * Math.pow(1.5, user.level - 1));
              leveledUp = true;
            }
          }
          
          await user.save();
          
          // Remover dos usuários em foco
          focusUsers.delete(userId);
          
          // Enviar notificação de conclusão
          if (channel) {
            const completionEmbed = new EmbedBuilder()
              .setTitle('✅ Modo Foco Concluído')
              .setDescription(`${focusData.username} completou uma sessão de foco!`)
              .setColor('#2ecc71')
              .addFields(
                { name: 'Assunto', value: focusData.subject, inline: true },
                { name: 'Duração', value: `${actualDuration} minutos`, inline: true },
                { name: 'XP Ganho', value: `${xpGained}`, inline: true }
              );
            
            if (leveledUp) {
              completionEmbed.addFields({
                name: '🎉 Subiu de Nível!',
                value: `${focusData.username} alcançou o nível ${user.level}!`
              });
            }
            
            await channel.send({ embeds: [completionEmbed] });
          }
          
          return { success: true, duration: actualDuration };
        } else {
          console.error("Usuário não encontrado ao encerrar modo de foco");
          return { success: false, message: "Usuário não encontrado" };
        }
      } catch (err) {
        console.error("Erro ao atualizar dados do usuário:", err);
        return { success: false, message: "Erro ao atualizar dados do usuário" };
      }
    } catch (error) {
      console.error("Erro ao encerrar modo de foco:", error);
      return { success: false, message: "Erro interno ao encerrar modo de foco" };
    } finally {
      // Garantir que o usuário seja removido da lista mesmo se houver erros
      if (focusUsers.has(userId)) {
        focusUsers.delete(userId);
      }
    }
  }
};