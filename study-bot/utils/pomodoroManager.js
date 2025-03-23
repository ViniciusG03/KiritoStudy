// utils/pomodoroManager.js
const { EmbedBuilder } = require('discord.js');
const User = require('../database/models/User');
const StudySession = require('../database/models/StudySession');
const Goal = require('../database/models/Goal');
const config = require('../config/config');

// Mapa para armazenar as sessões ativas
const activeSessions = new Map();

class PomodoroManager {
  constructor() {
    this.pomodoro = config.pomodoro;
  }
  
  /**
   * Inicia uma nova sessão de pomodoro
   * @param {string} userId - ID do usuário no Discord
   * @param {string} username - Nome do usuário
   * @param {object} channel - Canal para enviar notificações
   * @param {string} subject - Assunto de estudo (opcional)
   * @param {string} goalId - ID da meta associada (opcional)
   */
  async startPomodoro(userId, username, channel, subject = 'Geral', goalId = null) {
    // Verificar se já existe uma sessão ativa
    if (activeSessions.has(userId)) {
      return {
        success: false,
        message: 'Você já tem uma sessão de estudo ativa!'
      };
    }
    
    // Obter ou criar usuário
    let user = await User.findOne({ discordId: userId });
    if (!user) {
      user = new User({
        discordId: userId,
        username: username
      });
      await user.save();
    }
    
    // Criar nova sessão de estudo
    const session = new StudySession({
      userId: userId,
      startTime: new Date(),
      type: 'pomodoro',
      subject: subject
    });
    await session.save();
    
    // Configuração do pomodoro
    const pomodoroState = {
      sessionId: session._id,
      userId: userId,
      username: username,
      channel: channel,
      subject: subject,
      goalId: goalId,
      currentCycle: 1,
      status: 'work', // 'work', 'shortBreak', 'longBreak'
      pomodorosCompleted: 0,
      timer: null,
      startTime: new Date(),
      endTime: null,
      timeLeft: this.pomodoro.workTime
    };
    
    // Iniciar o primeiro timer de trabalho
    this._startTimer(pomodoroState);
    
    // Adicionar à lista de sessões ativas
    activeSessions.set(userId, pomodoroState);
    
    // Enviar mensagem inicial
    const embed = new EmbedBuilder()
      .setTitle('🍅 Pomodoro Iniciado!')
      .setDescription(`Sessão de estudo iniciada para ${username}!\nAssunto: ${subject}\nFoco por ${this.pomodoro.workTime / 60000} minutos.`)
      .setColor('#FF6347')
      .addFields(
        { name: 'Ciclo atual', value: `${pomodoroState.currentCycle}/${this.pomodoro.longBreakInterval}`, inline: true },
        { name: 'Status', value: 'Trabalhando 💪', inline: true },
        { name: 'Pomodoros Completos', value: '0', inline: true }
      )
      .setFooter({ text: 'Use /pomodoro pause para pausar e /pomodoro stop para encerrar' });
    
    await channel.send({ embeds: [embed] });
    
    return {
      success: true,
      sessionId: session._id,
      message: 'Sessão de pomodoro iniciada com sucesso!'
    };
  }
  
  /**
   * Inicia o timer para o estado atual
   * @param {object} state - Estado do pomodoro
   */
  _startTimer(state) {
    let duration;
    
    switch (state.status) {
      case 'work':
        duration = this.pomodoro.workTime;
        break;
      case 'shortBreak':
        duration = this.pomodoro.shortBreak;
        break;
      case 'longBreak':
        duration = this.pomodoro.longBreak;
        break;
    }
    
    state.timeLeft = duration;
    
    // Limpar timer anterior se existir
    if (state.timer) {
      clearInterval(state.timer);
    }
    
    // Iniciar novo timer
    const startTime = Date.now();
    state.timer = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      state.timeLeft = duration - elapsed;
      
      // Verificar se o timer acabou
      if (state.timeLeft <= 0) {
        clearInterval(state.timer);
        await this._handleTimerEnd(state);
      }
    }, 1000);
  }
  
  /**
   * Lidar com o fim de um timer
   * @param {object} state - Estado do pomodoro
   */
  async _handleTimerEnd(state) {
    switch (state.status) {
      case 'work':
        // Incrementar pomodoros completos
        state.pomodorosCompleted += 1;
        
        // Atualizar sessão de estudo
        await StudySession.findByIdAndUpdate(state.sessionId, {
          pomodorosCompleted: state.pomodorosCompleted
        });
        
        // Atualizar usuário
        const user = await User.findOne({ discordId: state.userId });
        user.completedPomodoros += 1;
        
        // Adicionar tempo à meta se existir
        if (state.goalId) {
          const goal = await Goal.findById(state.goalId);
          if (goal) {
            const workTimeMinutes = this.pomodoro.workTime / 60000;
            const goalCompleted = goal.addTime(workTimeMinutes);
            await goal.save();
            
            // Se a meta foi completada, dar XP extra
            if (goalCompleted) {
              await user.addXP(config.levels.goalCompletionXP, config.levels);
              
              // Notificar sobre a conclusão da meta
              const goalEmbed = new EmbedBuilder()
                .setTitle('🎯 Meta Concluída!')
                .setDescription(`Parabéns! Você concluiu a meta: **${goal.title}**`)
                .setColor('#32CD32');
              
              await state.channel.send({ embeds: [goalEmbed] });
            }
          }
        }
        
        // Dar XP pelo pomodoro completo
        await user.addXP(config.levels.studySessionXP / 2, config.levels);
        await user.save();
        
        // Verificar se é hora de uma pausa longa
        if (state.pomodorosCompleted % this.pomodoro.longBreakInterval === 0) {
          state.status = 'longBreak';
          
          const embed = new EmbedBuilder()
            .setTitle('🍵 Hora da Pausa Longa!')
            .setDescription(`Você completou ${state.pomodorosCompleted} pomodoros! Tire um descanso de ${this.pomodoro.longBreak / 60000} minutos.`)
            .setColor('#4169E1')
            .addFields(
              { name: 'Pomodoros Completos', value: `${state.pomodorosCompleted}`, inline: true },
              { name: 'Status', value: 'Pausa Longa 🧘', inline: true }
            );
          
          await state.channel.send({ embeds: [embed] });
        } else {
          state.status = 'shortBreak';
          
          const embed = new EmbedBuilder()
            .setTitle('☕ Hora da Pausa!')
            .setDescription(`Bom trabalho! Tire um descanso de ${this.pomodoro.shortBreak / 60000} minutos.`)
            .setColor('#20B2AA')
            .addFields(
              { name: 'Pomodoros Completos', value: `${state.pomodorosCompleted}`, inline: true },
              { name: 'Status', value: 'Pausa Curta ☕', inline: true }
            );
          
          await state.channel.send({ embeds: [embed] });
        }
        break;
        
      case 'shortBreak':
      case 'longBreak':
        state.status = 'work';
        state.currentCycle += 1;
        
        const embed = new EmbedBuilder()
          .setTitle('🍅 De Volta ao Trabalho!')
          .setDescription(`Pausa concluída! Hora de focar por mais ${this.pomodoro.workTime / 60000} minutos.`)
          .setColor('#FF6347')
          .addFields(
            { name: 'Ciclo atual', value: `${state.currentCycle}/${this.pomodoro.longBreakInterval}`, inline: true },
            { name: 'Status', value: 'Trabalhando 💪', inline: true },
            { name: 'Pomodoros Completos', value: `${state.pomodorosCompleted}`, inline: true }
          );
        
        await state.channel.send({ embeds: [embed] });
        break;
    }
    
    // Iniciar próximo timer
    this._startTimer(state);
  }
  
  /**
   * Pausa a sessão de pomodoro
   * @param {string} userId - ID do usuário
   */
  async pausePomodoro(userId) {
    const session = activeSessions.get(userId);
    
    if (!session) {
      return {
        success: false,
        message: 'Você não tem uma sessão de pomodoro ativa!'
      };
    }
    
    clearInterval(session.timer);
    session.timer = null;
    session.paused = true;
    
    const embed = new EmbedBuilder()
      .setTitle('⏸️ Pomodoro Pausado')
      .setDescription(`Sua sessão de pomodoro foi pausada. Use /pomodoro resume para continuar.`)
      .setColor('#FFA500')
      .addFields(
        { name: 'Tempo Restante', value: `${Math.ceil(session.timeLeft / 60000)} minutos`, inline: true },
        { name: 'Status', value: session.status === 'work' ? 'Trabalhando (Pausado)' : 'Pausa (Pausado)', inline: true }
      );
    
    await session.channel.send({ embeds: [embed] });
    
    return {
      success: true,
      message: 'Sessão de pomodoro pausada com sucesso!'
    };
  }
  
  /**
   * Retoma a sessão de pomodoro
   * @param {string} userId - ID do usuário
   */
  async resumePomodoro(userId) {
    const session = activeSessions.get(userId);
    
    if (!session) {
      return {
        success: false,
        message: 'Você não tem uma sessão de pomodoro para retomar!'
      };
    }
    
    if (!session.paused) {
      return {
        success: false,
        message: 'Sua sessão de pomodoro não está pausada!'
      };
    }
    
    session.paused = false;
    
    // Continuar o timer de onde parou
    const startTime = Date.now();
    session.timer = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      session.timeLeft -= elapsed;
      
      if (session.timeLeft <= 0) {
        clearInterval(session.timer);
        await this._handleTimerEnd(session);
      }
    }, 1000);
    
    const embed = new EmbedBuilder()
      .setTitle('▶️ Pomodoro Retomado')
      .setDescription(`Sua sessão de pomodoro foi retomada.`)
      .setColor('#32CD32')
      .addFields(
        { name: 'Tempo Restante', value: `${Math.ceil(session.timeLeft / 60000)} minutos`, inline: true },
        { name: 'Status', value: session.status === 'work' ? 'Trabalhando 💪' : 'Em Pausa 🧘', inline: true }
      );
  }
}