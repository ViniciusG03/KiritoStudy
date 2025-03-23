// commands/rewards.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../database/models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rewards')
    .setDescription('Comandos relacionados ao sistema de recompensas')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Listar todas as recompensas disponíveis'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('claim')
        .setDescription('Resgatar uma recompensa')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID da recompensa a ser resgatada')
            .setRequired(true))),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    
    // Buscar o usuário
    let user = await User.findOne({ discordId: userId });
    if (!user) {
      user = new User({
        discordId: userId,
        username: interaction.user.username
      });
      await user.save();
    }
    
    // Lista de recompensas disponíveis (você pode mover isso para um modelo de banco de dados depois)
    const availableRewards = [
      {
        id: 'badge_focus_master',
        name: '🎯 Mestre do Foco',
        description: 'Complete 10 sessões de foco',
        requirement: user => user.focusSessions >= 10,
        unlocked: false
      },
      {
        id: 'badge_pomodoro_king',
        name: '🍅 Rei do Pomodoro',
        description: 'Complete 50 pomodoros',
        requirement: user => user.completedPomodoros >= 50,
        unlocked: false
      },
      {
        id: 'badge_streak_warrior',
        name: '🔥 Guerreiro da Constância',
        description: 'Mantenha um streak de 7 dias',
        requirement: user => user.currentStreak >= 7,
        unlocked: false
      },
      {
        id: 'badge_goal_achiever',
        name: '🎯 Realizador de Metas',
        description: 'Complete 5 metas de estudo',
        requirement: async (user) => {
          const Goal = require('../database/models/Goal');
          const completedGoals = await Goal.countDocuments({ 
            userId: user.discordId,
            completed: true
          });
          return completedGoals >= 5;
        },
        unlocked: false
      },
      {
        id: 'badge_time_lord',
        name: '⏱️ Senhor do Tempo',
        description: 'Acumule 24 horas de estudo',
        requirement: user => user.totalStudyTime >= 1440, // 24 horas em minutos
        unlocked: false
      }
    ];
    
    switch (subcommand) {
      case 'list':
        // Verificar quais recompensas o usuário já desbloqueou
        const userRewards = user.rewards || [];
        const unlockedIds = userRewards.map(r => r.name);
        
        // Verificar quais recompensas o usuário pode desbloquear agora
        const rewardsWithStatus = await Promise.all(availableRewards.map(async (reward) => {
          const alreadyUnlocked = userRewards.some(r => r.name === reward.id);
          const canUnlock = alreadyUnlocked ? false : await reward.requirement(user);
          
          return {
            ...reward,
            status: alreadyUnlocked ? 'unlocked' : (canUnlock ? 'available' : 'locked')
          };
        }));
        
        // Criar embed com as recompensas
        const rewardsEmbed = new EmbedBuilder()
          .setTitle('🏆 Sistema de Recompensas')
          .setDescription('Complete objetivos para desbloquear recompensas especiais!')
          .setColor('#f1c40f');
        
        // Adicionar recompensas agrupadas por status
        const unlocked = rewardsWithStatus.filter(r => r.status === 'unlocked');
        const available = rewardsWithStatus.filter(r => r.status === 'available');
        const locked = rewardsWithStatus.filter(r => r.status === 'locked');
        
        if (unlocked.length > 0) {
          rewardsEmbed.addFields({
            name: '✅ Recompensas Desbloqueadas',
            value: unlocked.map(r => `**${r.name}**: ${r.description}`).join('\n')
          });
        }
        
        if (available.length > 0) {
          rewardsEmbed.addFields({
            name: '🔓 Disponíveis para Resgatar',
            value: available.map(r => `**${r.name}** (ID: \`${r.id}\`): ${r.description}`).join('\n')
          });
        }
        
        if (locked.length > 0) {
          rewardsEmbed.addFields({
            name: '🔒 Ainda Bloqueadas',
            value: locked.map(r => `**${r.name}**: ${r.description}`).join('\n')
          });
        }
        
        rewardsEmbed.setFooter({ text: 'Use /rewards claim [ID] para resgatar uma recompensa disponível' });
        
        await interaction.editReply({ embeds: [rewardsEmbed] });
        break;
        
      case 'claim':
        const rewardId = interaction.options.getString('id');
        
        // Verificar se a recompensa existe
        const reward = availableRewards.find(r => r.id === rewardId);
        if (!reward) {
          await interaction.editReply('❌ Recompensa não encontrada. Use /rewards list para ver as recompensas disponíveis.');
          return;
        }
        
        // Verificar se o usuário já tem essa recompensa
        const userRewardsClaim = user.rewards || [];
        if (userRewardsClaim.some(r => r.name === reward.id)) {
          await interaction.editReply('❌ Você já desbloqueou essa recompensa!');
          return;
        }
        
        // Verificar se o usuário atende aos requisitos
        const meetsRequirements = await reward.requirement(user);
        if (!meetsRequirements) {
          await interaction.editReply(`❌ Você ainda não atende aos requisitos para desbloquear: **${reward.name}**`);
          return;
        }
        
        // Adicionar a recompensa ao usuário
        user.rewards.push({
          name: reward.id,
          description: reward.description,
          unlocked: true,
          unlockedAt: new Date()
        });
        
        await user.save();
        
        // Enviar mensagem de confirmação
        const claimEmbed = new EmbedBuilder()
          .setTitle('🎉 Recompensa Desbloqueada!')
          .setDescription(`Parabéns! Você desbloqueou a recompensa: **${reward.name}**`)
          .setColor('#2ecc71')
          .addFields({
            name: 'Descrição',
            value: reward.description
          });
        
        await interaction.editReply({ embeds: [claimEmbed] });
        break;
    }
  },
};