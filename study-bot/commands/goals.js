// commands/goals.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Goal = require('../database/models/Goal');
const User = require('../database/models/User');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('goals')
    .setDescription('Comandos relacionados às metas de estudo')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Cria uma nova meta de estudo')
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Título da meta')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Descrição da meta')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('target')
            .setDescription('Tempo alvo em minutos')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('subject')
            .setDescription('Assunto relacionado à meta')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('deadline')
            .setDescription('Data limite (formato: DD/MM/YYYY)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Tipo de meta')
            .setRequired(false)
            .addChoices(
              { name: 'Diária', value: 'daily' },
              { name: 'Semanal', value: 'weekly' },
              { name: 'Mensal', value: 'monthly' },
              { name: 'Personalizada', value: 'custom' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lista suas metas de estudo')
        .addStringOption(option =>
          option.setName('filter')
            .setDescription('Filtrar metas')
            .setRequired(false)
            .addChoices(
              { name: 'Todas', value: 'all' },
              { name: 'Ativas', value: 'active' },
              { name: 'Concluídas', value: 'completed' },
              { name: 'Vencidas', value: 'overdue' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('Visualiza detalhes de uma meta específica')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID da meta ou parte do título')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Atualiza uma meta existente')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID da meta ou parte do título')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Novo título')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Nova descrição')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('target')
            .setDescription('Novo tempo alvo em minutos')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('deadline')
            .setDescription('Nova data limite (formato: DD/MM/YYYY)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Exclui uma meta')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID da meta ou parte do título')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add-milestone')
        .setDescription('Adiciona um marco à meta')
        .addStringOption(option =>
          option.setName('id')
            .setDescription('ID da meta ou parte do título')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Título do marco')
            .setRequired(true))),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
    // Verificar se o usuário existe ou criar um novo
    let user = await User.findOne({ discordId: userId });
    if (!user) {
      user = new User({
        discordId: userId,
        username: username
      });
      await user.save();
    }
    
    try {
      switch (subcommand) {
        case 'create':
          // Extrair dados do comando
          const title = interaction.options.getString('title');
          const description = interaction.options.getString('description') || '';
          const targetTime = interaction.options.getInteger('target');
          const subject = interaction.options.getString('subject') || 'Geral';
          const deadlineStr = interaction.options.getString('deadline');
          const type = interaction.options.getString('type') || 'custom';
          
          // Processar a data limite se fornecida
          let deadline = null;
          if (deadlineStr) {
            const [day, month, year] = deadlineStr.split('/').map(num => parseInt(num, 10));
            if (!isNaN(day) && !isNaN(month) && !isNaN(year) && day > 0 && day <= 31 && month > 0 && month <= 12) {
              deadline = new Date(year, month - 1, day);
            } else {
              await interaction.editReply('❌ Formato de data inválido. Use DD/MM/YYYY.');
              return;
            }
          }
          
          // Criar nova meta
          const goal = new Goal({
            userId: userId,
            title: title,
            description: description,
            targetTime: targetTime,
            deadline: deadline,
            type: type,
            subject: subject
          });
          
          await goal.save();
          
          const embed = new EmbedBuilder()
            .setTitle('🎯 Meta Criada')
            .setDescription(`Sua meta "${title}" foi criada com sucesso!`)
            .setColor('#32CD32')
            .addFields(
              { name: 'Assunto', value: subject, inline: true },
              { name: 'Tempo Alvo', value: `${targetTime} minutos`, inline: true },
              { name: 'Tipo', value: type.charAt(0).toUpperCase() + type.slice(1), inline: true }
            );
          
          if (deadline) {
            embed.addFields({
              name: 'Prazo',
              value: `<t:${Math.floor(deadline.getTime() / 1000)}:D>`,
              inline: true
            });
          }
          
          await interaction.editReply({ embeds: [embed] });
          break;
          
        case 'list':
          const filter = interaction.options.getString('filter') || 'active';
          
          let query = { userId: userId };
          let title = '';
          
          switch (filter) {
            case 'all':
              title = '📋 Todas as Metas';
              break;
            case 'active':
              query.completed = false;
              title = '🔄 Metas Ativas';
              break;
            case 'completed':
              query.completed = true;
              title = '✅ Metas Concluídas';
              break;
            case 'overdue':
              query.completed = false;
              query.deadline = { $lt: new Date(), $ne: null };
              title = '⏰ Metas Vencidas';
              break;
          }
          
          const goals = await Goal.find(query).sort({ deadline: 1 });
          
          if (goals.length === 0) {
            await interaction.editReply(`Você não tem metas ${filter === 'all' ? '' : filter} no momento.`);
            return;
          }
          
          const listEmbed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(`Você tem ${goals.length} meta(s) ${filter === 'all' ? '' : filter}:`)
            .setColor('#3498db');
          
          goals.slice(0, 10).forEach((goal, index) => {
            let fieldValue = `📚 **Assunto:** ${goal.subject}\n`;
            fieldValue += `⏱️ **Progresso:** ${goal.progress}% (${goal.currentTime}/${goal.targetTime} min)\n`;
            
            if (goal.deadline) {
              fieldValue += `📅 **Prazo:** <t:${Math.floor(goal.deadline.getTime() / 1000)}:R>\n`;
            }
            
            fieldValue += `🆔 **ID:** \`${goal._id}\``;
            
            listEmbed.addFields({
              name: `${index + 1}. ${goal.title}`,
              value: fieldValue
            });
          });
          
          if (goals.length > 10) {
            listEmbed.setFooter({ text: `Mostrando 10 de ${goals.length} metas. Use /goals view para ver detalhes.` });
          }
          
          await interaction.editReply({ embeds: [listEmbed] });
          break;
          
        case 'view':
          const goalId = interaction.options.getString('id');
          
          // Tentar encontrar pelo ID primeiro
          let goalToView = null;
          try {
            goalToView = await Goal.findById(goalId);
          } catch (error) {
            // Não é um ID válido, vamos tentar pelo título
            goalToView = null;
          }
          
          // Se não encontrar pelo ID, tenta pelo título
          if (!goalToView) {
            goalToView = await Goal.findOne({ 
              userId: userId, 
              title: { $regex: new RegExp(goalId, 'i') }
            });
          }
          
          if (!goalToView) {
            await interaction.editReply('❌ Meta não encontrada. Verifique o ID ou título informado.');
            return;
          }
          
          // Verificar se a meta pertence ao usuário
          if (goalToView.userId !== userId) {
            await interaction.editReply('❌ Você não tem permissão para visualizar esta meta.');
            return;
          }
          
          const viewEmbed = new EmbedBuilder()
            .setTitle(`🎯 ${goalToView.title}`)
            .setDescription(goalToView.description || 'Sem descrição.')
            .setColor(goalToView.completed ? '#32CD32' : '#3498db')
            .addFields(
              { name: 'Status', value: goalToView.completed ? '✅ Concluída' : '🔄 Em andamento', inline: true },
              { name: 'Assunto', value: goalToView.subject, inline: true },
              { name: 'Tipo', value: goalToView.type.charAt(0).toUpperCase() + goalToView.type.slice(1), inline: true },
              { name: 'Progresso', value: `${goalToView.progress}%`, inline: true },
              { name: 'Tempo', value: `${goalToView.currentTime}/${goalToView.targetTime} minutos`, inline: true }
            );
          
          if (goalToView.deadline) {
            const now = new Date();
            const isOverdue = !goalToView.completed && goalToView.deadline < now;
            
            viewEmbed.addFields({
              name: 'Prazo',
              value: `${isOverdue ? '⚠️ ' : ''}${isOverdue ? 'Venceu' : 'Vence'} <t:${Math.floor(goalToView.deadline.getTime() / 1000)}:R>`,
              inline: true
            });
          }
          
          if (goalToView.milestones && goalToView.milestones.length > 0) {
            let milestonesText = '';
            
            goalToView.milestones.forEach((milestone, index) => {
              milestonesText += `${index + 1}. ${milestone.completed ? '✅' : '⬜'} ${milestone.title}\n`;
            });
            
            viewEmbed.addFields({
              name: '🏆 Marcos',
              value: milestonesText
            });
          }
          
          await interaction.editReply({ embeds: [viewEmbed] });
          break;
          
        case 'update':
          const updateGoalId = interaction.options.getString('id');
          
          // Tentar encontrar pelo ID primeiro
          let goalToUpdate = null;
          try {
            goalToUpdate = await Goal.findById(updateGoalId);
          } catch (error) {
            // Não é um ID válido, vamos tentar pelo título
            goalToUpdate = null;
          }
          
          // Se não encontrar pelo ID, tenta pelo título
          if (!goalToUpdate) {
            goalToUpdate = await Goal.findOne({ 
              userId: userId, 
              title: { $regex: new RegExp(updateGoalId, 'i') }
            });
          }
          
          if (!goalToUpdate) {
            await interaction.editReply('❌ Meta não encontrada. Verifique o ID ou título informado.');
            return;
          }
          
          // Verificar se a meta pertence ao usuário
          if (goalToUpdate.userId !== userId) {
            await interaction.editReply('❌ Você não tem permissão para atualizar esta meta.');
            return;
          }
          
          // Atualizar campos se fornecidos
          const newTitle = interaction.options.getString('title');
          const newDescription = interaction.options.getString('description');
          const newTarget = interaction.options.getInteger('target');
          const newDeadlineStr = interaction.options.getString('deadline');
          
          if (newTitle) goalToUpdate.title = newTitle;
          if (newDescription) goalToUpdate.description = newDescription;
          
          if (newTarget) {
            goalToUpdate.targetTime = newTarget;
            // Recalcular progresso
            goalToUpdate.updateProgress();
          }
          
          if (newDeadlineStr) {
            const [day, month, year] = newDeadlineStr.split('/').map(num => parseInt(num, 10));
            if (!isNaN(day) && !isNaN(month) && !isNaN(year) && day > 0 && day <= 31 && month > 0 && month <= 12) {
              goalToUpdate.deadline = new Date(year, month - 1, day);
            } else {
              await interaction.editReply('❌ Formato de data inválido. Use DD/MM/YYYY.');
              return;
            }
          }
          
          await goalToUpdate.save();
          
          const updateEmbed = new EmbedBuilder()
            .setTitle('✏️ Meta Atualizada')
            .setDescription(`A meta "${goalToUpdate.title}" foi atualizada com sucesso!`)
            .setColor('#FFA500');
          
          await interaction.editReply({ embeds: [updateEmbed] });
          break;
          
        case 'delete':
          const deleteGoalId = interaction.options.getString('id');
          
          // Tentar encontrar pelo ID primeiro
          let goalToDelete = null;
          try {
            goalToDelete = await Goal.findById(deleteGoalId);
          } catch (error) {
            // Não é um ID válido, vamos tentar pelo título
            goalToDelete = null;
          }
          
          // Se não encontrar pelo ID, tenta pelo título
          if (!goalToDelete) {
            goalToDelete = await Goal.findOne({ 
              userId: userId, 
              title: { $regex: new RegExp(deleteGoalId, 'i') }
            });
          }
          
          if (!goalToDelete) {
            await interaction.editReply('❌ Meta não encontrada. Verifique o ID ou título informado.');
            return;
          }
          
          // Verificar se a meta pertence ao usuário
          if (goalToDelete.userId !== userId) {
            await interaction.editReply('❌ Você não tem permissão para excluir esta meta.');
            return;
          }
          
          await Goal.findByIdAndDelete(goalToDelete._id);
          
          const deleteEmbed = new EmbedBuilder()
            .setTitle('🗑️ Meta Excluída')
            .setDescription(`A meta "${goalToDelete.title}" foi excluída com sucesso!`)
            .setColor('#FF6347');
          
          await interaction.editReply({ embeds: [deleteEmbed] });
          break;
          
        case 'add-milestone':
          const milestoneGoalId = interaction.options.getString('id');
          const milestoneTitle = interaction.options.getString('title');
          
          // Tentar encontrar pelo ID primeiro
          let goalForMilestone = null;
          try {
            goalForMilestone = await Goal.findById(milestoneGoalId);
          } catch (error) {
            // Não é um ID válido, vamos tentar pelo título
            goalForMilestone = null;
          }
          
          // Se não encontrar pelo ID, tenta pelo título
          if (!goalForMilestone) {
            goalForMilestone = await Goal.findOne({ 
              userId: userId, 
              title: { $regex: new RegExp(milestoneGoalId, 'i') }
            });
          }
          
          if (!goalForMilestone) {
            await interaction.editReply('❌ Meta não encontrada. Verifique o ID ou título informado.');
            return;
          }
          
          // Verificar se a meta pertence ao usuário
          if (goalForMilestone.userId !== userId) {
            await interaction.editReply('❌ Você não tem permissão para modificar esta meta.');
            return;
          }
          
          // Adicionar o marco
          goalForMilestone.milestones.push({
            title: milestoneTitle,
            completed: false
          });
          
          await goalForMilestone.save();
          
          const milestoneEmbed = new EmbedBuilder()
            .setTitle('🏆 Marco Adicionado')
            .setDescription(`O marco "${milestoneTitle}" foi adicionado à meta "${goalForMilestone.title}"!`)
            .setColor('#9370DB');
          
          await interaction.editReply({ embeds: [milestoneEmbed] });
          break;
      }
    } catch (error) {
      console.error(`Erro ao executar comando de metas:`, error);
      await interaction.editReply('❌ Ocorreu um erro ao processar seu comando. Por favor, tente novamente mais tarde.');
    }
  },
};