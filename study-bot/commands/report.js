// commands/reports.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const User = require('../database/models/User');
const StudySession = require('../database/models/StudySession');
const Goal = require('../database/models/Goal');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('reports')
      .setDescription('Gerar relatórios de estudo')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Movido para aqui
      .addSubcommand(subcommand =>
        subcommand
          .setName('daily')
          .setDescription('Gerar um relatório diário do seu progresso'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('weekly')
          .setDescription('Gerar um relatório semanal do seu progresso'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('monthly')
          .setDescription('Gerar um relatório mensal do seu progresso'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('setup')
          .setDescription('Configurar relatórios automáticos')
          .addChannelOption(option =>
            option.setName('channel')
              .setDescription('Canal para enviar relatórios automáticos')
              .setRequired(true))
          .addStringOption(option =>
            option.setName('type')
              .setDescription('Tipo de relatório automático')
              .setRequired(true)
              .addChoices(
                { name: 'Diário', value: 'daily' },
                { name: 'Semanal', value: 'weekly' },
                { name: 'Mensal', value: 'monthly' }
              ))
          .addBooleanOption(option =>
            option.setName('enabled')
              .setDescription('Ativar ou desativar')
              .setRequired(true))),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
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
      case 'daily':
        // Gerar relatório para o dia atual
        const dailyReportEmbed = await this._generateDailyReport(userId, username);
        await interaction.editReply({ embeds: [dailyReportEmbed] });
        break;
        
      case 'weekly':
        // Gerar relatório para a semana atual
        const weeklyReportEmbed = await this._generateWeeklyReport(userId, username);
        await interaction.editReply({ embeds: [weeklyReportEmbed] });
        break;
        
      case 'monthly':
        // Gerar relatório para o mês atual
        const monthlyReportEmbed = await this._generateMonthlyReport(userId, username);
        await interaction.editReply({ embeds: [monthlyReportEmbed] });
        break;
        
      case 'setup':
        // Verificar permissões
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.editReply('❌ Você não tem permissão para configurar relatórios automáticos.');
          return;
        }
        
        const channel = interaction.options.getChannel('channel');
        const type = interaction.options.getString('type');
        const enabled = interaction.options.getBoolean('enabled');
        
        // Verificar se é um canal de texto
        if (channel.type !== 0) { // 0 = GUILD_TEXT
          await interaction.editReply('❌ O canal selecionado deve ser um canal de texto.');
          return;
        }
        
        // Aqui você implementaria a lógica para salvar as configurações
        // Poderia ser em um banco de dados específico para configurações do servidor
        
        await interaction.editReply(`✅ Relatórios ${type} automáticos foram ${enabled ? 'ativados' : 'desativados'} no canal ${channel}.`);
        break;
    }
  },
  
  /**
   * Gera um relatório diário para o usuário
   * @param {string} userId - ID do usuário
   * @param {string} username - Nome do usuário
   */
  async _generateDailyReport(userId, username) {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Buscar sessões do dia
    const sessions = await StudySession.find({
      userId: userId,
      startTime: { $gte: startOfDay, $lte: endOfDay },
      completed: true
    }).sort({ startTime: 1 });
    
    // Calcular estatísticas
    const totalMinutes = sessions.reduce((total, session) => total + session.duration, 0);
    const totalSessions = sessions.length;
    const totalPomodoros = sessions.reduce((total, session) => total + (session.pomodorosCompleted || 0), 0);
    
    // Estatísticas por tipo de sessão
    const sessionTypes = {
      pomodoro: sessions.filter(s => s.type === 'pomodoro').length,
      focus: sessions.filter(s => s.type === 'focus').length,
      regular: sessions.filter(s => s.type === 'regular').length
    };
    
    // Assuntos estudados
    const subjects = {};
    sessions.forEach(session => {
      if (!subjects[session.subject]) {
        subjects[session.subject] = 0;
      }
      subjects[session.subject] += session.duration;
    });
    
    // Metas completadas hoje
    const completedGoals = await Goal.find({
      userId: userId,
      completed: true,
      // Verifica se a meta foi concluída hoje
      $expr: {
        $and: [
          { $eq: [{ $year: '$updatedAt' }, today.getFullYear()] },
          { $eq: [{ $month: '$updatedAt' }, today.getMonth() + 1] },
          { $eq: [{ $dayOfMonth: '$updatedAt' }, today.getDate()] }
        ]
      }
    });
    
    // Criar embed do relatório
    const reportEmbed = new EmbedBuilder()
      .setTitle(`📊 Relatório Diário - ${today.toLocaleDateString('pt-BR')}`)
      .setDescription(`Aqui está um resumo do seu dia de estudos, ${username}!`)
      .setColor('#3498db')
      .setTimestamp();
    
    if (totalSessions === 0) {
      reportEmbed.addFields({
        name: '❌ Sem atividade',
        value: 'Nenhuma sessão de estudo registrada hoje.'
      });
    } else {
      // Adicionar estatísticas gerais
      reportEmbed.addFields(
        { name: '⏱️ Tempo Total de Estudo', value: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}min`, inline: true },
        { name: '🧠 Sessões Realizadas', value: `${totalSessions}`, inline: true },
        { name: '🍅 Pomodoros Completos', value: `${totalPomodoros}`, inline: true }
      );
      
      // Tipos de sessão
      if (Object.values(sessionTypes).some(count => count > 0)) {
        reportEmbed.addFields({
          name: '📋 Tipos de Sessão',
          value: `🍅 Pomodoro: ${sessionTypes.pomodoro}\n🎯 Foco: ${sessionTypes.focus}\n📚 Regular: ${sessionTypes.regular}`,
          inline: true
        });
      }
      
      // Assuntos mais estudados
      if (Object.keys(subjects).length > 0) {
        const topSubjects = Object.entries(subjects)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([subject, minutes]) => `**${subject}**: ${Math.floor(minutes / 60)}h ${minutes % 60}min`);
        
        reportEmbed.addFields({
          name: '📚 Principais Assuntos',
          value: topSubjects.join('\n') || 'Nenhum assunto registrado',
          inline: true
        });
      }
      
      // Metas concluídas
      if (completedGoals.length > 0) {
        const goalsText = completedGoals
          .map(goal => `✅ **${goal.title}** (${goal.subject})`)
          .join('\n');
        
        reportEmbed.addFields({
          name: '🎯 Metas Concluídas Hoje',
          value: goalsText
        });
      }
      
      // Próxima meta com prazo mais próximo
      const nextGoal = await Goal.findOne({
        userId: userId,
        completed: false,
        deadline: { $ne: null }
      }).sort({ deadline: 1 });
      
      if (nextGoal) {
        reportEmbed.addFields({
          name: '⏰ Próxima Meta',
          value: `**${nextGoal.title}** (${nextGoal.progress}% concluída)\nPrazo: <t:${Math.floor(nextGoal.deadline.getTime() / 1000)}:R>`
        });
      }
    }
    
    return reportEmbed;
  },
  
  /**
   * Gera um relatório semanal para o usuário
   * @param {string} userId - ID do usuário
   * @param {string} username - Nome do usuário
   */
  async _generateWeeklyReport(userId, username) {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Domingo, 1 = Segunda, ...
    
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - currentDay);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    // Estatísticas por dia da semana
    const dailyStats = await StudySession.aggregate([
      {
        $match: {
          userId: userId,
          startTime: { $gte: startOfWeek, $lte: endOfWeek },
          completed: true
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: '$startTime' }, // 1 = Domingo, 2 = Segunda, ...
          totalDuration: { $sum: '$duration' },
          sessionsCount: { $sum: 1 },
          pomodorosCount: { $sum: { $ifNull: ['$pomodorosCompleted', 0] } }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);
    
    // Estatísticas por assunto
    const subjectStats = await StudySession.aggregate([
      {
        $match: {
          userId: userId,
          startTime: { $gte: startOfWeek, $lte: endOfWeek },
          completed: true
        }
      },
      {
        $group: {
          _id: '$subject',
          totalDuration: { $sum: '$duration' },
          sessionsCount: { $sum: 1 }
        }
      },
      {
        $sort: { 'totalDuration': -1 }
      }
    ]);
    
    // Metas concluídas na semana
    const completedGoals = await Goal.find({
      userId: userId,
      completed: true,
      updatedAt: { $gte: startOfWeek, $lte: endOfWeek }
    });
    
    // Calcular totais da semana
    const totalMinutes = dailyStats.reduce((total, day) => total + day.totalDuration, 0);
    const totalSessions = dailyStats.reduce((total, day) => total + day.sessionsCount, 0);
    const totalPomodoros = dailyStats.reduce((total, day) => total + day.pomodorosCount, 0);
    
    // Dias da semana em português
    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    
    // Mapear dados por dia
    const dayData = Array(7).fill().map((_, i) => ({
      dayName: dayNames[i],
      totalDuration: 0,
      sessionsCount: 0,
      pomodorosCount: 0
    }));
    
    // Preencher dados disponíveis
    dailyStats.forEach(stat => {
      const dayIndex = stat._id - 1; // Converter 1-7 para 0-6
      dayData[dayIndex].totalDuration = stat.totalDuration;
      dayData[dayIndex].sessionsCount = stat.sessionsCount;
      dayData[dayIndex].pomodorosCount = stat.pomodorosCount;
    });
    
    // Criar embed do relatório
    const reportEmbed = new EmbedBuilder()
      .setTitle(`📈 Relatório Semanal (${startOfWeek.toLocaleDateString('pt-BR')} - ${endOfWeek.toLocaleDateString('pt-BR')})`)
      .setDescription(`Resumo da sua semana de estudos, ${username}!`)
      .setColor('#27ae60')
      .setTimestamp();
    
    if (totalSessions === 0) {
      reportEmbed.addFields({
        name: '❌ Sem atividade',
        value: 'Nenhuma sessão de estudo registrada nesta semana.'
      });
    } else {
      // Adicionar estatísticas gerais
      reportEmbed.addFields(
        { name: '⏱️ Tempo Total de Estudo', value: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}min`, inline: true },
        { name: '🧠 Sessões Realizadas', value: `${totalSessions}`, inline: true },
        { name: '🍅 Pomodoros Completos', value: `${totalPomodoros}`, inline: true }
      );
      
      // Visualização por dia da semana
      const dayStatsText = dayData.map(day => {
        const hours = Math.floor(day.totalDuration / 60);
        const minutes = day.totalDuration % 60;
        return `**${day.dayName}**: ${hours}h ${minutes}min (${day.sessionsCount} sessões)`;
      }).join('\n');
      
      reportEmbed.addFields({
        name: '📅 Distribuição por Dia',
        value: dayStatsText
      });
      
      // Assuntos mais estudados
      if (subjectStats.length > 0) {
        const topSubjects = subjectStats.slice(0, 3).map(subject => {
          const hours = Math.floor(subject.totalDuration / 60);
          const minutes = subject.totalDuration % 60;
          return `**${subject._id}**: ${hours}h ${minutes}min (${subject.sessionsCount} sessões)`;
        }).join('\n');
        
        reportEmbed.addFields({
          name: '📚 Principais Assuntos',
          value: topSubjects,
          inline: true
        });
      }
      
      // Melhor dia da semana
      const bestDay = [...dayData].sort((a, b) => b.totalDuration - a.totalDuration)[0];
      if (bestDay.totalDuration > 0) {
        const hours = Math.floor(bestDay.totalDuration / 60);
        const minutes = bestDay.totalDuration % 60;
        
        reportEmbed.addFields({
          name: '🏆 Melhor Dia',
          value: `**${bestDay.dayName}**: ${hours}h ${minutes}min (${bestDay.sessionsCount} sessões)`,
          inline: true
        });
      }
      
      // Metas concluídas
      if (completedGoals.length > 0) {
        const goalsText = completedGoals
          .map(goal => `✅ **${goal.title}** (${goal.subject})`)
          .join('\n');
        
        reportEmbed.addFields({
          name: '🎯 Metas Concluídas',
          value: goalsText
        });
      }
    }
    
    // Adicionar comparação com a semana anterior
    const startOfPrevWeek = new Date(startOfWeek);
    startOfPrevWeek.setDate(startOfPrevWeek.getDate() - 7);
    
    const endOfPrevWeek = new Date(endOfWeek);
    endOfPrevWeek.setDate(endOfPrevWeek.getDate() - 7);
    
    const prevWeekStats = await StudySession.aggregate([
      {
        $match: {
          userId: userId,
          startTime: { $gte: startOfPrevWeek, $lte: endOfPrevWeek },
          completed: true
        }
      },
      {
        $group: {
          _id: null,
          totalDuration: { $sum: '$duration' },
          sessionsCount: { $sum: 1 }
        }
      }
    ]);
    
    if (prevWeekStats.length > 0 && totalSessions > 0) {
      const prevWeekMinutes = prevWeekStats[0].totalDuration;
      const prevWeekSessions = prevWeekStats[0].sessionsCount;
      
      const timeChange = totalMinutes - prevWeekMinutes;
      const sessionChange = totalSessions - prevWeekSessions;
      
      const timeChangePercent = prevWeekMinutes === 0 ? 100 : Math.round((timeChange / prevWeekMinutes) * 100);
      const sessionChangePercent = prevWeekSessions === 0 ? 100 : Math.round((sessionChange / prevWeekSessions) * 100);
      
      const timeChangeText = timeChange >= 0 ? `+${timeChange} min (${timeChangePercent}%)` : `${timeChange} min (${timeChangePercent}%)`;
      const sessionChangeText = sessionChange >= 0 ? `+${sessionChange} (${sessionChangePercent}%)` : `${sessionChange} (${sessionChangePercent}%)`;
      
      reportEmbed.addFields({
        name: '📊 Comparação com Semana Anterior',
        value: `⏱️ Tempo: ${timeChangeText}\n🧠 Sessões: ${sessionChangeText}`
      });
    }
    
    return reportEmbed;
  },
  
  /**
   * Gera um relatório mensal para o usuário
   * @param {string} userId - ID do usuário
   * @param {string} username - Nome do usuário
   */
  async _generateMonthlyReport(userId, username) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    // Estatísticas gerais do mês
    const monthStats = await StudySession.aggregate([
      {
        $match: {
          userId: userId,
          startTime: { $gte: startOfMonth, $lte: endOfMonth },
          completed: true
        }
      },
      {
        $group: {
          _id: null,
          totalDuration: { $sum: '$duration' },
          sessionsCount: { $sum: 1 },
          pomodorosCount: { $sum: { $ifNull: ['$pomodorosCompleted', 0] } }
        }
      }
    ]);
    
    // Estatísticas por semana do mês
    const weeklyStats = await StudySession.aggregate([
      {
        $match: {
          userId: userId,
          startTime: { $gte: startOfMonth, $lte: endOfMonth },
          completed: true
        }
      },
      {
        $group: {
          _id: { $week: '$startTime' },
          totalDuration: { $sum: '$duration' },
          sessionsCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);
    
    // Estatísticas por assunto
    const subjectStats = await StudySession.aggregate([
      {
        $match: {
          userId: userId,
          startTime: { $gte: startOfMonth, $lte: endOfMonth },
          completed: true
        }
      },
      {
        $group: {
          _id: '$subject',
          totalDuration: { $sum: '$duration' },
          sessionsCount: { $sum: 1 }
        }
      },
      {
        $sort: { 'totalDuration': -1 }
      }
    ]);
    
    // Metas concluídas no mês
    const completedGoals = await Goal.find({
      userId: userId,
      completed: true,
      updatedAt: { $gte: startOfMonth, $lte: endOfMonth }
    });
    
    // Extrair totais
    const totalMinutes = monthStats.length > 0 ? monthStats[0].totalDuration : 0;
    const totalSessions = monthStats.length > 0 ? monthStats[0].sessionsCount : 0;
    const totalPomodoros = monthStats.length > 0 ? monthStats[0].pomodorosCount : 0;
    
    // Nome do mês em português
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    // Criar embed do relatório
    const reportEmbed = new EmbedBuilder()
      .setTitle(`📅 Relatório Mensal - ${monthNames[now.getMonth()]} ${now.getFullYear()}`)
      .setDescription(`Resumo do seu mês de estudos, ${username}!`)
      .setColor('#e74c3c')
      .setTimestamp();
    
    if (totalSessions === 0) {
      reportEmbed.addFields({
        name: '❌ Sem atividade',
        value: 'Nenhuma sessão de estudo registrada neste mês.'
      });
    } else {
      // Adicionar estatísticas gerais
      reportEmbed.addFields(
        { name: '⏱️ Tempo Total de Estudo', value: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}min`, inline: true },
        { name: '🧠 Sessões Realizadas', value: `${totalSessions}`, inline: true },
        { name: '🍅 Pomodoros Completos', value: `${totalPomodoros}`, inline: true }
      );
      
      // Cálculo de média diária
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const activeDays = await StudySession.aggregate([
        {
          $match: {
            userId: userId,
            startTime: { $gte: startOfMonth, $lte: endOfMonth },
            completed: true
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$startTime' },
              month: { $month: '$startTime' },
              day: { $dayOfMonth: '$startTime' }
            }
          }
        },
        {
          $count: 'activeDays'
        }
      ]);
      
      const numActiveDays = activeDays.length > 0 ? activeDays[0].activeDays : 0;
      const avgDailyTime = numActiveDays > 0 ? Math.round(totalMinutes / numActiveDays) : 0;
      
      reportEmbed.addFields(
        { name: '📊 Dias Ativos', value: `${numActiveDays}/${daysInMonth} (${Math.round((numActiveDays / daysInMonth) * 100)}%)`, inline: true },
        { name: '📈 Média por Dia Ativo', value: `${Math.floor(avgDailyTime / 60)}h ${avgDailyTime % 60}min`, inline: true }
      );
      
      // Visualização por semana
      if (weeklyStats.length > 0) {
        const weekLabels = [];
        const currentWeek = new Date().getWeek();
        
        weeklyStats.forEach(week => {
          // Determinar o número da semana no mês (1-5)
          const weekOfMonth = weeklyStats.indexOf(week) + 1;
          weekLabels.push(`Semana ${weekOfMonth}`);
        });
        
        const weeklyText = weeklyStats.map((week, index) => {
          const hours = Math.floor(week.totalDuration / 60);
          const minutes = week.totalDuration % 60;
          return `**${weekLabels[index]}**: ${hours}h ${minutes}min (${week.sessionsCount} sessões)`;
        }).join('\n');
        
        reportEmbed.addFields({
          name: '📆 Estudo por Semana',
          value: weeklyText
        });
      }
      
      // Assuntos mais estudados
      if (subjectStats.length > 0) {
        const topSubjects = subjectStats.slice(0, 5).map(subject => {
          const hours = Math.floor(subject.totalDuration / 60);
          const minutes = subject.totalDuration % 60;
          const percentage = Math.round((subject.totalDuration / totalMinutes) * 100);
          return `**${subject._id}**: ${hours}h ${minutes}min (${percentage}%)`;
        }).join('\n');
        
        reportEmbed.addFields({
          name: '📚 Principais Assuntos',
          value: topSubjects
        });
      }
      
      // Metas concluídas
      if (completedGoals.length > 0) {
        const goalsText = completedGoals
          .slice(0, 5)
          .map(goal => `✅ **${goal.title}** (${goal.subject})`)
          .join('\n');
        
        reportEmbed.addFields({
          name: `🎯 Metas Concluídas (${completedGoals.length})`,
          value: goalsText + (completedGoals.length > 5 ? `\n*...e mais ${completedGoals.length - 5} metas*` : '')
        });
      }
    }
    
    // Adicionar comparação com o mês anterior
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    
    const prevMonthStats = await StudySession.aggregate([
      {
        $match: {
          userId: userId,
          startTime: { $gte: startOfPrevMonth, $lte: endOfPrevMonth },
          completed: true
        }
      },
      {
        $group: {
          _id: null,
          totalDuration: { $sum: '$duration' },
          sessionsCount: { $sum: 1 }
        }
      }
    ]);
    
    if (prevMonthStats.length > 0 && totalSessions > 0) {
      const prevMonthMinutes = prevMonthStats[0].totalDuration;
      const prevMonthSessions = prevMonthStats[0].sessionsCount;
      
      const timeChange = totalMinutes - prevMonthMinutes;
      const sessionChange = totalSessions - prevMonthSessions;
      
      const timeChangePercent = prevMonthMinutes === 0 ? 100 : Math.round((timeChange / prevMonthMinutes) * 100);
      const sessionChangePercent = prevMonthSessions === 0 ? 100 : Math.round((sessionChange / prevMonthSessions) * 100);
      
      const timeChangeText = timeChange >= 0 ? `+${timeChange} min (${timeChangePercent}%)` : `${timeChange} min (${timeChangePercent}%)`;
      const sessionChangeText = sessionChange >= 0 ? `+${sessionChange} (${sessionChangePercent}%)` : `${sessionChange} (${sessionChangePercent}%)`;
      
      reportEmbed.addFields({
        name: '📊 Comparação com Mês Anterior',
        value: `⏱️ Tempo: ${timeChangeText}\n🧠 Sessões: ${sessionChangeText}`
      });
    }
    
    return reportEmbed;
  }
};

// Função auxiliar para obter a semana do ano
Date.prototype.getWeek = function() {
  var onejan = new Date(this.getFullYear(), 0, 1);
  return Math.ceil((((this - onejan) / 86400000) + onejan.getDay() + 1) / 7);
};