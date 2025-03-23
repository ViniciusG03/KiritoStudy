// commands/stats.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../database/models/User');
const StudySession = require('../database/models/StudySession');
const Goal = require('../database/models/Goal');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Comandos para ver suas estatísticas de estudo')
    .addSubcommand(subcommand =>
      subcommand
        .setName('overview')
        .setDescription('Mostra um resumo das suas estatísticas'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('daily')
        .setDescription('Mostra suas estatísticas diárias')
        .addStringOption(option =>
          option.setName('date')
            .setDescription('Data (formato: DD/MM/YYYY, padrão: hoje)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('weekly')
        .setDescription('Mostra suas estatísticas semanais'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('subjects')
        .setDescription('Mostra estatísticas por assunto')
        .addStringOption(option =>
          option.setName('period')
            .setDescription('Período')
            .setRequired(false)
            .addChoices(
              { name: 'Esta semana', value: 'week' },
              { name: 'Este mês', value: 'month' },
              { name: 'Todo o período', value: 'all' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('streak')
        .setDescription('Mostra seu histórico de streak de estudos')),
  
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
    
    switch (subcommand) {
      case 'overview':
        // Estatísticas gerais
        const totalSessions = await StudySession.countDocuments({ 
          userId: userId,
          completed: true
        });
        
        const totalGoals = await Goal.countDocuments({ userId: userId });
        const completedGoals = await Goal.countDocuments({ 
          userId: userId,
          completed: true
        });
        
        // Tempo de estudo por mês
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        
        const monthlyStats = await StudySession.aggregate([
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
              sessionsCount: { $sum: 1 }
            }
          }
        ]);
        
        const monthlyTime = monthlyStats.length > 0 ? monthlyStats[0].totalDuration : 0;
        const monthlySessions = monthlyStats.length > 0 ? monthlyStats[0].sessionsCount : 0;
        
        // Média diária deste mês
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const avgDailyTime = monthlyTime > 0 ? Math.round(monthlyTime / daysInMonth) : 0;
        
        // Métricas recentes (última semana)
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        const weeklyStats = await StudySession.aggregate([
          {
            $match: {
              userId: userId,
              startTime: { $gte: startOfWeek, $lte: now },
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
        
        const weeklyTime = weeklyStats.length > 0 ? weeklyStats[0].totalDuration : 0;
        const weeklySessions = weeklyStats.length > 0 ? weeklyStats[0].sessionsCount : 0;
        
        // Formatar estatísticas para exibição
        const hours = Math.floor(user.totalStudyTime / 60);
        const minutes = user.totalStudyTime % 60;
        
        const overviewEmbed = new EmbedBuilder()
          .setTitle('📊 Estatísticas de Estudo')
          .setDescription(`Resumo das suas estatísticas de estudo:`)
          .setColor('#3498db')
          .addFields(
            { name: '⏱️ Tempo Total de Estudo', value: `${hours}h ${minutes}min`, inline: true },
            { name: '🧠 Sessões Totais', value: `${user.totalSessions}`, inline: true },
            { name: '🍅 Pomodoros Completos', value: `${user.completedPomodoros}`, inline: true },
            { name: '🔄 Streak Atual', value: `${user.currentStreak} dias`, inline: true },
            { name: '🏆 Maior Streak', value: `${user.longestStreak} dias`, inline: true },
            { name: '📈 Nível', value: `${user.level} (${user.xp}/${user.xpToNextLevel} XP)`, inline: true },
            { name: '📅 Este Mês', value: `${Math.floor(monthlyTime / 60)}h ${monthlyTime % 60}min (${monthlySessions} sessões)`, inline: true },
            { name: '📆 Esta Semana', value: `${Math.floor(weeklyTime / 60)}h ${weeklyTime % 60}min (${weeklySessions} sessões)`, inline: true },
            { name: '📊 Média Diária', value: `${Math.floor(avgDailyTime / 60)}h ${avgDailyTime % 60}min`, inline: true },
            { name: '🎯 Metas', value: `${completedGoals}/${totalGoals} concluídas`, inline: true }
          )
          .setFooter({ text: `Use /stats daily, /stats weekly ou /stats subjects para mais detalhes` });
        
        await interaction.editReply({ embeds: [overviewEmbed] });
        break;
        
      case 'daily':
        // Obter a data especificada ou usar a data atual
        const dateStr = interaction.options.getString('date');
        let targetDate;
        
        if (dateStr) {
          const [day, month, year] = dateStr.split('/').map(num => parseInt(num, 10));
          if (!isNaN(day) && !isNaN(month) && !isNaN(year) && day > 0 && day <= 31 && month > 0 && month <= 12) {
            targetDate = new Date(year, month - 1, day);
          } else {
            await interaction.editReply('❌ Formato de data inválido. Use DD/MM/YYYY.');
            return;
          }
        } else {
          targetDate = new Date();
        }
        
        // Definir início e fim do dia
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        // Buscar sessões do dia
        const dailySessions = await StudySession.find({
          userId: userId,
          startTime: { $gte: startOfDay, $lte: endOfDay },
          completed: true
        }).sort({ startTime: 1 });
        
        // Calcular estatísticas diárias
        const totalDailyMinutes = dailySessions.reduce((total, session) => total + session.duration, 0);
        const totalDailyPomodoros = dailySessions.reduce((total, session) => total + session.pomodorosCompleted, 0);
        
        // Estatísticas por assunto no dia
        const subjectStats = {};
        dailySessions.forEach(session => {
          if (!subjectStats[session.subject]) {
            subjectStats[session.subject] = {
              duration: 0,
              count: 0
            };
          }
          
          subjectStats[session.subject].duration += session.duration;
          subjectStats[session.subject].count += 1;
        });
        
        // Formatar data
        const formattedDate = `${targetDate.getDate().toString().padStart(2, '0')}/${(targetDate.getMonth() + 1).toString().padStart(2, '0')}/${targetDate.getFullYear()}`;
        
        const dailyEmbed = new EmbedBuilder()
          .setTitle(`📅 Estatísticas de ${formattedDate}`)
          .setColor('#9b59b6');
        
        if (dailySessions.length === 0) {
          dailyEmbed.setDescription(`Nenhuma sessão de estudo registrada neste dia.`);
        } else {
          dailyEmbed.setDescription(`Você estudou por ${Math.floor(totalDailyMinutes / 60)}h ${totalDailyMinutes % 60}min neste dia.`)
            .addFields(
              { name: '🧠 Sessões', value: `${dailySessions.length}`, inline: true },
              { name: '🍅 Pomodoros', value: `${totalDailyPomodoros}`, inline: true }
            );
          
          // Adicionar estatísticas por assunto
          let subjectsText = '';
          Object.entries(subjectStats)
            .sort((a, b) => b[1].duration - a[1].duration)
            .forEach(([subject, stats]) => {
              const hours = Math.floor(stats.duration / 60);
              const minutes = stats.duration % 60;
              subjectsText += `**${subject}**: ${hours}h ${minutes}min (${stats.count} sessões)\n`;
            });
          
          if (subjectsText) {
            dailyEmbed.addFields({ name: '📚 Assuntos', value: subjectsText });
          }
          
          // Listar sessões do dia
          let sessionsText = '';
          dailySessions.slice(0, 5).forEach((session, index) => {
            const startTime = session.startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            sessionsText += `${index + 1}. **${session.subject}** - ${startTime} (${session.duration} min)\n`;
          });
          
          if (sessionsText) {
            dailyEmbed.addFields({ 
              name: '⏱️ Sessões', 
              value: sessionsText + (dailySessions.length > 5 ? `\n*...e mais ${dailySessions.length - 5} sessões*` : '')
            });
          }
        }
        
        await interaction.editReply({ embeds: [dailyEmbed] });
        break;
        
      case 'weekly':
        // Definir início e fim da semana
        const currentDate = new Date();
        const currentDay = currentDate.getDay(); // 0 = Domingo, 1 = Segunda, ...
        
        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() - currentDay);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        // Buscar estatísticas por dia da semana
        const weeklySessionStats = await StudySession.aggregate([
          {
            $match: {
              userId: userId,
              startTime: { $gte: weekStart, $lte: weekEnd },
              completed: true
            }
          },
          {
            $group: {
              _id: { $dayOfWeek: '$startTime' }, // 1 = Domingo, 2 = Segunda, ...
              totalDuration: { $sum: '$duration' },
              sessionsCount: { $sum: 1 },
              pomodorosCount: { $sum: '$pomodorosCompleted' }
            }
          },
          {
            $sort: { '_id': 1 }
          }
        ]);
        
        // Mapear dias da semana
        const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const dayStats = Array(7).fill().map((_, i) => ({
          dayName: dayNames[i],
          totalDuration: 0,
          sessionsCount: 0,
          pomodorosCount: 0
        }));
        
        // Preencher dados disponíveis
        weeklySessionStats.forEach(stat => {
          const dayIndex = stat._id - 1; // Converter de 1-7 para 0-6
          dayStats[dayIndex].totalDuration = stat.totalDuration;
          dayStats[dayIndex].sessionsCount = stat.sessionsCount;
          dayStats[dayIndex].pomodorosCount = stat.pomodorosCount || 0;
        });
        
        // Calcular totais da semana
        const weeklyTotalMinutes = dayStats.reduce((total, day) => total + day.totalDuration, 0);
        const weeklyTotalSessions = dayStats.reduce((total, day) => total + day.sessionsCount, 0);
        const weeklyTotalPomodoros = dayStats.reduce((total, day) => total + day.pomodorosCount, 0);
        
        // Criar embed
        const weeklyEmbed = new EmbedBuilder()
          .setTitle('📅 Estatísticas Semanais')
          .setDescription(`Resumo da semana de ${weekStart.toLocaleDateString('pt-BR')} a ${weekEnd.toLocaleDateString('pt-BR')}:`)
          .setColor('#e74c3c')
          .addFields(
            { name: '⏱️ Tempo Total', value: `${Math.floor(weeklyTotalMinutes / 60)}h ${weeklyTotalMinutes % 60}min`, inline: true },
            { name: '🧠 Sessões', value: `${weeklyTotalSessions}`, inline: true },
            { name: '🍅 Pomodoros', value: `${weeklyTotalPomodoros}`, inline: true }
          );
        
        // Adicionar estatísticas por dia
        let daysText = '';
        dayStats.forEach(day => {
          const hours = Math.floor(day.totalDuration / 60);
          const minutes = day.totalDuration % 60;
          const timeText = day.totalDuration > 0 ? `${hours}h ${minutes}min` : '0min';
          
          daysText += `**${day.dayName}**: ${timeText} (${day.sessionsCount} sessões, ${day.pomodorosCount} pomodoros)\n`;
        });
        
        weeklyEmbed.addFields({ name: '📆 Dias da Semana', value: daysText });
        
        await interaction.editReply({ embeds: [weeklyEmbed] });
        break;
        
      case 'subjects':
        const period = interaction.options.getString('period') || 'month';
        
        let startDate, endDate, periodTitle;
        const today = new Date();
        
        switch (period) {
          case 'week':
            const dayOfWeek = today.getDay();
            startDate = new Date(today);
            startDate.setDate(today.getDate() - dayOfWeek);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date();
            periodTitle = 'Esta Semana';
            break;
          case 'month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date();
            periodTitle = 'Este Mês';
            break;
          case 'all':
            startDate = new Date(0); // 1970
            endDate = new Date();
            periodTitle = 'Todo o Período';
            break;
        }
        
        // Buscar estatísticas por assunto
        const subjectData = await StudySession.getStatsBySubject(userId, startDate, endDate);
        
        if (subjectData.length === 0) {
          await interaction.editReply(`Você não tem sessões de estudo registradas para ${periodTitle.toLowerCase()}.`);
          return;
        }
        
        // Calcular totais
        const totalSubjectMinutes = subjectData.reduce((total, subject) => total + subject.totalDuration, 0);
        
        // Formatar dados para o embed
        const subjectsEmbed = new EmbedBuilder()
          .setTitle(`📚 Estatísticas por Assunto - ${periodTitle}`)
          .setDescription(`Total: ${Math.floor(totalSubjectMinutes / 60)}h ${totalSubjectMinutes % 60}min em ${subjectData.length} assuntos`)
          .setColor('#27ae60');
        
        // Adicionar os assuntos mais estudados
        let subjectsListText = '';
        subjectData.forEach((subject, index) => {
          const percentage = Math.round((subject.totalDuration / totalSubjectMinutes) * 100);
          const hours = Math.floor(subject.totalDuration / 60);
          const minutes = subject.totalDuration % 60;
          
          subjectsListText += `${index + 1}. **${subject._id}**: ${hours}h ${minutes}min (${percentage}%, ${subject.sessionsCount} sessões)\n`;
        });
        
        subjectsEmbed.addFields({ name: '📊 Assuntos', value: subjectsListText });
        
        await interaction.editReply({ embeds: [subjectsEmbed] });
        break;
        
      case 'streak':
        const streakEmbed = new EmbedBuilder()
          .setTitle('🔥 Streak de Estudos')
          .setColor('#f39c12')
          .addFields(
            { name: '🔄 Streak Atual', value: `${user.currentStreak} dias`, inline: true },
            { name: '🏆 Maior Streak', value: `${user.longestStreak} dias`, inline: true }
          );
        
        if (user.lastSessionDate) {
          const lastSessionDate = new Date(user.lastSessionDate);
          streakEmbed.addFields({
            name: '📅 Última Sessão',
            value: `<t:${Math.floor(lastSessionDate.getTime() / 1000)}:R>`,
            inline: true
          });
        }
        
        // Buscar as últimas 10 sessões para mostrar a consistência
        const recentSessions = await StudySession.find({
          userId: userId,
          completed: true
        }).sort({ startTime: -1 }).limit(10);
        
        if (recentSessions.length > 0) {
          let recentDaysText = '';
          
          // Agrupar por dia
          const sessionsByDay = {};
          recentSessions.forEach(session => {
            const sessionDate = new Date(session.startTime);
            const dateKey = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, '0')}-${String(sessionDate.getDate()).padStart(2, '0')}`;
            
            if (!sessionsByDay[dateKey]) {
              sessionsByDay[dateKey] = {
                date: sessionDate,
                duration: 0,
                sessions: 0
              };
            }
            
            sessionsByDay[dateKey].duration += session.duration;
            sessionsByDay[dateKey].sessions += 1;
          });
          
          // Formatar para exibição
          Object.entries(sessionsByDay)
            .sort((a, b) => b[1].date - a[1].date) // Ordenar por data decrescente
            .slice(0, 7) // Limitar a 7 dias
            .forEach(([_, dayData]) => {
              const hours = Math.floor(dayData.duration / 60);
              const minutes = dayData.duration % 60;
              
              recentDaysText += `📅 <t:${Math.floor(dayData.date.getTime() / 1000)}:D>: ${hours}h ${minutes}min (${dayData.sessions} sessões)\n`;
            });
          
          if (recentDaysText) {
            streakEmbed.addFields({ name: '📆 Atividade Recente', value: recentDaysText });
          }
        }
        
        streakEmbed.setFooter({ text: `Mantenha sua streak estudando todos os dias!` });
        
        await interaction.editReply({ embeds: [streakEmbed] });
        break;
    }
  },
};