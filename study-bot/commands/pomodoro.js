// commands/pomodoro.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pomodoroManager = require('../utils/pomodoroManager');
const Goal = require('../database/models/Goal');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pomodoro')
    .setDescription('Comandos relacionados ao sistema Pomodoro')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Inicia uma sessão de Pomodoro')
        .addStringOption(option =>
          option.setName('subject')
            .setDescription('Assunto que você vai estudar')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('goal')
            .setDescription('Associar a uma meta existente (ID ou nome da meta)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('pause')
        .setDescription('Pausa a sessão de Pomodoro atual'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('resume')
        .setDescription('Retoma uma sessão de Pomodoro pausada'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('stop')
        .setDescription('Encerra a sessão de Pomodoro atual'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Mostra o status da sua sessão de Pomodoro atual'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('active')
        .setDescription('Lista todas as sessões de Pomodoro ativas no servidor')),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
    switch (subcommand) {
      case 'start':
        const subject = interaction.options.getString('subject');
        const goalOption = interaction.options.getString('goal');
        
        let goalId = null;
        
        // Se uma meta foi especificada, encontre-a
        if (goalOption) {
          try {
            // Tentar encontrar pelo ID primeiro
            let goal = await Goal.findById(goalOption);
            
            // Se não encontrar pelo ID, tenta pelo título
            if (!goal) {
              goal = await Goal.findOne({ 
                userId: userId, 
                title: { $regex: new RegExp(goalOption, 'i') },
                completed: false
              });
            }
            
            if (goal) {
              goalId = goal._id;
            } else {
              await interaction.editReply(`⚠️ Meta não encontrada. Criando sessão sem meta associada.`);
            }
          } catch (error) {
            console.error('Erro ao buscar meta:', error);
          }
        }
        
        const result = await pomodoroManager.startPomodoro(
          userId,
          username,
          interaction.channel,
          subject,
          goalId
        );
        
        if (result.success) {
          await interaction.editReply(`✅ ${result.message}`);
        } else {
          await interaction.editReply(`❌ ${result.message}`);
        }
        break;
        
      case 'pause':
        const pauseResult = await pomodoroManager.pausePomodoro(userId);
        await interaction.editReply(pauseResult.success ? `⏸️ ${pauseResult.message}` : `❌ ${pauseResult.message}`);
        break;
        
      case 'resume':
        const resumeResult = await pomodoroManager.resumePomodoro(userId);
        await interaction.editReply(resumeResult.success ? `▶️ ${resumeResult.message}` : `❌ ${resumeResult.message}`);
        break;
        
      case 'stop':
        const stopResult = await pomodoroManager.stopPomodoro(userId);
        await interaction.editReply(stopResult.success ? `✅ ${stopResult.message}` : `❌ ${stopResult.message}`);
        break;
        
      case 'status':
        const session = pomodoroManager.getActiveSession(userId);
        
        if (!session) {
          await interaction.editReply('❌ Você não tem uma sessão de Pomodoro ativa!');
          return;
        }
        
        const statusEmbed = new EmbedBuilder()
          .setTitle('🍅 Status do Pomodoro')
          .setDescription(`Informações sobre sua sessão atual:`)
          .setColor('#3498db')
          .addFields(
            { name: 'Assunto', value: session.subject, inline: true },
            { name: 'Status', value: session.paused ? 'Pausado ⏸️' : (session.status === 'work' ? 'Trabalhando 💪' : 'Em Pausa 🧘'), inline: true },
            { name: 'Pomodoros Completos', value: `${session.pomodorosCompleted}`, inline: true },
            { name: 'Tempo Restante', value: `${session.timeLeft} minutos`, inline: true },
            { name: 'Iniciado em', value: `<t:${Math.floor(session.startTime.getTime() / 1000)}:R>`, inline: true }
          );
        
        await interaction.editReply({ embeds: [statusEmbed] });
        break;
        
      case 'active':
        const activeSessions = pomodoroManager.getAllActiveSessions();
        
        if (activeSessions.length === 0) {
          await interaction.editReply('📊 Não há sessões de Pomodoro ativas no momento.');
          return;
        }
        
        const activeEmbed = new EmbedBuilder()
          .setTitle('📊 Sessões de Pomodoro Ativas')
          .setDescription(`Há ${activeSessions.length} sessões ativas no momento:`)
          .setColor('#9b59b6');
        
        activeSessions.forEach((session, index) => {
          activeEmbed.addFields({
            name: `${index + 1}. ${session.username}`,
            value: `📚 **Assunto:** ${session.subject}\n🔄 **Status:** ${session.status === 'work' ? 'Trabalhando' : 'Em Pausa'}\n🍅 **Pomodoros:** ${session.pomodorosCompleted}`
          });
        });
        
        await interaction.editReply({ embeds: [activeEmbed] });
        break;
    }
  },
};