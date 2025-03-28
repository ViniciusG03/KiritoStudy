// utils/pomodoroManager.js
const { EmbedBuilder } = require("discord.js");
const User = require("../database/models/User");
const StudySession = require("../database/models/StudySession");
const Goal = require("../database/models/Goal");
const ActiveSession = require("../database/models/ActiveSession"); // Novo modelo
const config = require("../config/config");

// Cache local para armazenar as sessões ativas (para desempenho)
const memoryCache = new Map();

class PomodoroManager {
  constructor() {
    this.pomodoro = config.pomodoro;
  }

  /**
   * Carrega sessões ativas do banco de dados (após reinício do bot)
   * @returns {Promise<void>}
   */
  async loadActiveSessions() {
    try {
      console.log("Carregando sessões de pomodoro ativas do banco de dados...");
      const activeSessions = await ActiveSession.find({
        sessionType: "pomodoro",
      });

      if (activeSessions.length === 0) {
        console.log(
          "Nenhuma sessão de pomodoro ativa encontrada no banco de dados."
        );
        return;
      }

      console.log(
        `Encontradas ${activeSessions.length} sessões de pomodoro ativas.`
      );

      // Reconstruir sessões em memória e reiniciar timers
      for (const dbSession of activeSessions) {
        try {
          // Recuperar informações complementares
          const studySession = await StudySession.findById(
            dbSession.studySessionId
          );
          if (!studySession) {
            console.log(
              `Sessão de estudo ${dbSession.studySessionId} não encontrada. Removendo sessão ativa.`
            );
            await ActiveSession.findByIdAndRemove(dbSession._id);
            continue;
          }

          // Calcular tempo restante ajustado
          const now = new Date();
          let timeLeftMs = dbSession.timeLeft;

          // Se estiver pausado, o tempo permanece o mesmo
          // Se não estiver pausado, ajustar o tempo com base no tempo passado desde a última atualização
          if (!dbSession.paused && dbSession.lastUpdated) {
            const elapsedSinceUpdate = now - dbSession.lastUpdated;
            timeLeftMs = Math.max(0, timeLeftMs - elapsedSinceUpdate);
          }

          // Criar objeto de estado na memória
          const sessionState = {
            sessionId: studySession._id,
            activeSessionId: dbSession._id,
            userId: dbSession.userId,
            username: dbSession.metadata?.username || "Usuário",
            serverChannelId: dbSession.metadata?.serverChannelId,
            dmChannelId: dbSession.metadata?.dmChannelId,
            subject: dbSession.subject,
            goalId: dbSession.goalId,
            currentCycle: dbSession.currentCycle,
            status: dbSession.status,
            pomodorosCompleted: dbSession.pomodorosCompleted,
            timer: null,
            startTime: dbSession.startTime,
            timeLeft: timeLeftMs / 60000, // Converter para minutos
            paused: dbSession.paused,
            pendingRestore: true, // Marcar para restauração completa quando o client estiver disponível
          };

          // Adicionar ao cache em memória
          memoryCache.set(dbSession.userId, sessionState);

          console.log(
            `Restaurada sessão para usuário ${dbSession.userId} (${sessionState.username})`
          );
        } catch (err) {
          console.error(`Erro ao restaurar sessão ${dbSession._id}:`, err);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar sessões ativas:", error);
    }
  }

  /**
   * Completa a restauração das sessões quando o client está disponível
   * @param {Object} client - Cliente Discord.js
   * @returns {Promise<void>}
   */
  async completeSessionsRestore(client) {
    for (const [userId, state] of memoryCache.entries()) {
      if (state.pendingRestore) {
        try {
          // Buscar canais
          let dmChannel;
          try {
            const user = await client.users.fetch(userId);
            if (user) {
              dmChannel = await user.createDM();
            }
          } catch (err) {
            console.warn(
              `Não foi possível criar canal DM para usuário ${userId}:`,
              err.message
            );
          }

          let serverChannel;
          if (state.serverChannelId) {
            try {
              serverChannel = await client.channels.fetch(
                state.serverChannelId
              );
            } catch (err) {
              console.warn(
                `Não foi possível buscar canal do servidor ${state.serverChannelId}:`,
                err.message
              );
            }
          }

          // Atualizar estado com canais
          state.dmChannel = dmChannel;
          state.serverChannel = serverChannel;

          // Reiniciar timer se a sessão não estiver pausada
          if (!state.paused && state.timeLeft > 0) {
            this._startTimer(state);

            // Notificar usuário que sessão foi restaurada
            if (dmChannel) {
              const embed = new EmbedBuilder()
                .setTitle("🔄 Sessão Pomodoro Restaurada")
                .setDescription(
                  "O bot foi reiniciado, mas sua sessão foi restaurada automaticamente."
                )
                .setColor("#3498db")
                .addFields(
                  {
                    name: "Status",
                    value:
                      state.status === "work"
                        ? "Trabalhando 💪"
                        : state.status === "shortBreak"
                        ? "Pausa Curta ☕"
                        : "Pausa Longa 🧘",
                    inline: true,
                  },
                  {
                    name: "Tempo Restante",
                    value: `${Math.ceil(state.timeLeft)} minutos`,
                    inline: true,
                  },
                  {
                    name: "Pomodoros Completos",
                    value: `${state.pomodorosCompleted}`,
                    inline: true,
                  }
                );

              await dmChannel
                .send({ embeds: [embed] })
                .catch((err) =>
                  console.warn(
                    `Erro ao enviar mensagem de restauração para ${userId}:`,
                    err.message
                  )
                );
            }
          }

          // Remover flag de pendência
          state.pendingRestore = false;

          console.log(
            `Restauração de sessão finalizada para usuário ${userId}`
          );
        } catch (err) {
          console.error(
            `Erro ao completar restauração para usuário ${userId}:`,
            err
          );
        }
      }
    }
  }

  /**
   * Inicia uma nova sessão de pomodoro
   * @param {string} userId - ID do usuário no Discord
   * @param {string} username - Nome do usuário
   * @param {object} serverChannel - Canal do servidor onde o comando foi executado
   * @param {object} dmChannel - Canal de DM para enviar notificações
   * @param {string} subject - Assunto de estudo
   * @param {string} goalId - ID da meta associada (opcional)
   */
  async startPomodoro(
    userId,
    username,
    serverChannel,
    dmChannel,
    subject = "Geral",
    goalId = null
  ) {
    // Verificar se já existe uma sessão ativa no banco de dados ou cache
    if (memoryCache.has(userId)) {
      return {
        success: false,
        message: "Você já tem uma sessão de estudo ativa!",
      };
    }

    const existingSession = await ActiveSession.findOne({
      userId: userId,
      sessionType: "pomodoro",
    });

    if (existingSession) {
      // Se encontrou no banco mas não no cache, remover do banco (sessão órfã)
      await ActiveSession.findByIdAndRemove(existingSession._id);
      console.log(`Removida sessão órfã para usuário ${userId}`);
    }

    // Obter ou criar usuário
    let user = await User.findOne({ discordId: userId });
    if (!user) {
      user = new User({
        discordId: userId,
        username: username,
      });
      await user.save();
    }

    // Criar nova sessão de estudo
    const studySession = new StudySession({
      userId: userId,
      startTime: new Date(),
      type: "pomodoro",
      subject: subject,
    });
    await studySession.save();

    // Salvar metadados úteis para restauração
    const sessionMetadata = {
      username: username,
      serverChannelId: serverChannel?.id,
      dmChannelId: dmChannel?.id,
    };

    // Criar sessão ativa no banco de dados
    const activeSession = new ActiveSession({
      userId: userId,
      sessionType: "pomodoro",
      studySessionId: studySession._id,
      subject: subject,
      startTime: new Date(),
      status: "work",
      timeLeft: this.pomodoro.workTime,
      goalId: goalId,
      metadata: sessionMetadata,
      lastUpdated: new Date(),
    });

    await activeSession.save();

    // Configuração do pomodoro em memória
    const pomodoroState = {
      sessionId: studySession._id,
      activeSessionId: activeSession._id,
      userId: userId,
      username: username,
      serverChannel: serverChannel,
      dmChannel: dmChannel,
      subject: subject,
      goalId: goalId,
      currentCycle: 1,
      status: "work", // 'work', 'shortBreak', 'longBreak'
      pomodorosCompleted: 0,
      timer: null,
      startTime: new Date(),
      endTime: null,
      timeLeft: this.pomodoro.workTime / 60000, // Convertendo para minutos para exibição
      paused: false,
    };

    // Iniciar o primeiro timer de trabalho
    this._startTimer(pomodoroState);

    // Adicionar à cache em memória
    memoryCache.set(userId, pomodoroState);

    // Enviar mensagem inicial
    const embed = new EmbedBuilder()
      .setTitle("🍅 Pomodoro Iniciado!")
      .setDescription(
        `Sessão de estudo iniciada!\nAssunto: ${subject}\nFoco por ${
          this.pomodoro.workTime / 60000
        } minutos.`
      )
      .setColor("#FF6347")
      .addFields(
        {
          name: "Ciclo atual",
          value: `${pomodoroState.currentCycle}/${this.pomodoro.longBreakInterval}`,
          inline: true,
        },
        { name: "Status", value: "Trabalhando 💪", inline: true },
        { name: "Pomodoros Completos", value: "0", inline: true }
      )
      .setFooter({
        text: "Use /pomodoro pause para pausar e /pomodoro stop para encerrar",
      });

    try {
      await dmChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error("Erro ao enviar mensagem para DM:", error);
      // Tentar enviar no canal do servidor como fallback
      try {
        await serverChannel.send({
          content: `${username}, não foi possível enviar mensagens por DM. Verifique suas configurações de privacidade.`,
          ephemeral: true,
        });
      } catch (err) {
        console.error("Erro ao enviar mensagem de fallback:", err);
      }

      // Mesmo com erro de DM, permitimos que a sessão continue
    }

    return {
      success: true,
      sessionId: studySession._id,
      message: "Sessão de pomodoro iniciada com sucesso!",
    };
  }

  /**
   * Inicia o timer para o estado atual e atualiza o banco de dados
   * @param {object} state - Estado do pomodoro
   */
  _startTimer(state) {
    let duration;

    switch (state.status) {
      case "work":
        duration = this.pomodoro.workTime;
        break;
      case "shortBreak":
        duration = this.pomodoro.shortBreak;
        break;
      case "longBreak":
        duration = this.pomodoro.longBreak;
        break;
    }

    state.timeLeft = duration / 60000; // Convertendo para minutos para facilitar a exibição

    // Limpar timer anterior se existir
    if (state.timer) {
      clearInterval(state.timer);
    }

    // Atualizar no banco de dados
    this._updateSessionState(state).catch((err) =>
      console.error("Erro ao atualizar estado da sessão:", err)
    );

    // Iniciar novo timer
    const startTime = Date.now();
    state.timer = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      state.timeLeft = Math.max(0, (duration - elapsed) / 60000);

      // Atualizar banco de dados periodicamente (a cada 30 segundos)
      if (elapsed % 30000 < 1000) {
        await this._updateSessionState(state).catch((err) =>
          console.error("Erro ao atualizar estado da sessão:", err)
        );
      }

      // Verificar se o timer acabou
      if (state.timeLeft <= 0) {
        clearInterval(state.timer);
        await this._handleTimerEnd(state);
      }
    }, 1000);
  }

  /**
   * Atualiza o estado da sessão no banco de dados
   * @param {object} state - Estado do pomodoro
   * @returns {Promise<void>}
   */
  async _updateSessionState(state) {
    try {
      await ActiveSession.findByIdAndUpdate(state.activeSessionId, {
        status: state.status,
        timeLeft: state.timeLeft * 60000, // Converter minutos para ms
        currentCycle: state.currentCycle,
        pomodorosCompleted: state.pomodorosCompleted,
        paused: state.paused,
        pausedAt: state.paused ? new Date() : null,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error("Erro ao atualizar sessão no banco de dados:", error);
      throw error;
    }
  }

  /**
   * Lidar com o fim de um timer
   * @param {object} state - Estado do pomodoro
   */
  async _handleTimerEnd(state) {
    try {
      switch (state.status) {
        case "work":
          // Incrementar pomodoros completos
          state.pomodorosCompleted += 1;

          // Atualizar sessão de estudo
          await StudySession.findByIdAndUpdate(state.sessionId, {
            pomodorosCompleted: state.pomodorosCompleted,
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
                  .setTitle("🎯 Meta Concluída!")
                  .setDescription(
                    `Parabéns! Você concluiu a meta: **${goal.title}**`
                  )
                  .setColor("#32CD32");

                await this._safelySendDM(state.dmChannel, {
                  embeds: [goalEmbed],
                });
              }
            }
          }

          // Dar XP pelo pomodoro completo
          await user.addXP(config.levels.studySessionXP / 2, config.levels);
          await user.save();

          // Verificar se é hora de uma pausa longa
          if (
            state.pomodorosCompleted % this.pomodoro.longBreakInterval ===
            0
          ) {
            state.status = "longBreak";

            const embed = new EmbedBuilder()
              .setTitle("🍵 Hora da Pausa Longa!")
              .setDescription(
                `Você completou ${
                  state.pomodorosCompleted
                } pomodoros! Tire um descanso de ${
                  this.pomodoro.longBreak / 60000
                } minutos.`
              )
              .setColor("#4169E1")
              .addFields(
                {
                  name: "Pomodoros Completos",
                  value: `${state.pomodorosCompleted}`,
                  inline: true,
                },
                { name: "Status", value: "Pausa Longa 🧘", inline: true }
              );

            await this._safelySendDM(state.dmChannel, { embeds: [embed] });
          } else {
            state.status = "shortBreak";

            const embed = new EmbedBuilder()
              .setTitle("☕ Hora da Pausa!")
              .setDescription(
                `Bom trabalho! Tire um descanso de ${
                  this.pomodoro.shortBreak / 60000
                } minutos.`
              )
              .setColor("#20B2AA")
              .addFields(
                {
                  name: "Pomodoros Completos",
                  value: `${state.pomodorosCompleted}`,
                  inline: true,
                },
                { name: "Status", value: "Pausa Curta ☕", inline: true }
              );

            await this._safelySendDM(state.dmChannel, { embeds: [embed] });
          }
          break;

        case "shortBreak":
        case "longBreak":
          state.status = "work";
          state.currentCycle += 1;

          const embed = new EmbedBuilder()
            .setTitle("🍅 De Volta ao Trabalho!")
            .setDescription(
              `Pausa concluída! Hora de focar por mais ${
                this.pomodoro.workTime / 60000
              } minutos.`
            )
            .setColor("#FF6347")
            .addFields(
              {
                name: "Ciclo atual",
                value: `${state.currentCycle}/${this.pomodoro.longBreakInterval}`,
                inline: true,
              },
              { name: "Status", value: "Trabalhando 💪", inline: true },
              {
                name: "Pomodoros Completos",
                value: `${state.pomodorosCompleted}`,
                inline: true,
              }
            );

          await this._safelySendDM(state.dmChannel, { embeds: [embed] });
          break;
      }

      // Atualizar banco de dados
      await this._updateSessionState(state);

      // Iniciar próximo timer
      this._startTimer(state);
    } catch (error) {
      console.error("Erro ao processar fim de timer:", error);
      // Tentar continuar mesmo com erro
      this._startTimer(state);
    }
  }

  /**
   * Método auxiliar para enviar mensagens para DM com segurança
   * @param {object} channel - Canal para enviar a mensagem
   * @param {object} messageOptions - Opções da mensagem
   */
  async _safelySendDM(channel, messageOptions) {
    try {
      if (channel) {
        await channel.send(messageOptions);
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem para DM:", error);
      // Silenciosamente falha, não queremos que o pomodoro pare por causa de erros de DM
    }
  }

  /**
   * Pausa a sessão de pomodoro
   * @param {string} userId - ID do usuário
   */
  async pausePomodoro(userId) {
    const session = memoryCache.get(userId);

    if (!session) {
      return {
        success: false,
        message: "Você não tem uma sessão de pomodoro ativa!",
      };
    }

    if (session.paused) {
      return {
        success: false,
        message: "Sua sessão já está pausada!",
      };
    }

    clearInterval(session.timer);
    session.timer = null;
    session.paused = true;

    // Atualizar no banco de dados
    await this._updateSessionState(session);

    const embed = new EmbedBuilder()
      .setTitle("⏸️ Pomodoro Pausado")
      .setDescription(
        `Sua sessão de pomodoro foi pausada. Use /pomodoro resume para continuar.`
      )
      .setColor("#FFA500")
      .addFields(
        {
          name: "Tempo Restante",
          value: `${Math.ceil(session.timeLeft)} minutos`,
          inline: true,
        },
        {
          name: "Status",
          value:
            session.status === "work"
              ? "Trabalhando (Pausado)"
              : "Pausa (Pausado)",
          inline: true,
        }
      );

    await this._safelySendDM(session.dmChannel, { embeds: [embed] });

    return {
      success: true,
      message: "Sessão de pomodoro pausada com sucesso!",
    };
  }

  /**
   * Retoma a sessão de pomodoro
   * @param {string} userId - ID do usuário
   */
  async resumePomodoro(userId) {
    const session = memoryCache.get(userId);

    if (!session) {
      return {
        success: false,
        message: "Você não tem uma sessão de pomodoro para retomar!",
      };
    }

    if (!session.paused) {
      return {
        success: false,
        message: "Sua sessão de pomodoro não está pausada!",
      };
    }

    session.paused = false;

    // Atualizar no banco de dados
    await this._updateSessionState(session);

    // Continuar o timer de onde parou
    const remainingTime = session.timeLeft * 60000; // Converter para ms
    const startTime = Date.now();
    session.timer = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      session.timeLeft = Math.max(0, (remainingTime - elapsed) / 60000);

      // Atualizar banco de dados periodicamente (a cada 30 segundos)
      if (elapsed % 30000 < 1000) {
        await this._updateSessionState(session).catch((err) =>
          console.error("Erro ao atualizar estado da sessão:", err)
        );
      }

      if (session.timeLeft <= 0) {
        clearInterval(session.timer);
        await this._handleTimerEnd(session);
      }
    }, 1000);

    const embed = new EmbedBuilder()
      .setTitle("▶️ Pomodoro Retomado")
      .setDescription(`Sua sessão de pomodoro foi retomada.`)
      .setColor("#32CD32")
      .addFields(
        {
          name: "Tempo Restante",
          value: `${Math.ceil(session.timeLeft)} minutos`,
          inline: true,
        },
        {
          name: "Status",
          value: session.status === "work" ? "Trabalhando 💪" : "Em Pausa 🧘",
          inline: true,
        }
      );

    await this._safelySendDM(session.dmChannel, { embeds: [embed] });

    return {
      success: true,
      message: "Sessão de pomodoro retomada com sucesso!",
    };
  }

  /**
   * Encerra a sessão de pomodoro
   * @param {string} userId - ID do usuário
   */
  async stopPomodoro(userId) {
    const session = memoryCache.get(userId);

    if (!session) {
      return {
        success: false,
        message: "Você não tem uma sessão de pomodoro ativa!",
      };
    }

    // Limpar timer
    if (session.timer) {
      clearInterval(session.timer);
      session.timer = null;
    }

    // Calcular duração efetiva
    const now = new Date();
    const duration = Math.floor((now - session.startTime) / 60000); // Converter para minutos

    try {
      // Remover do banco de dados
      await ActiveSession.findByIdAndRemove(session.activeSessionId);

      // Atualizar sessão de estudo
      await StudySession.findByIdAndUpdate(session.sessionId, {
        endTime: now,
        duration: duration,
        completed: true,
        pomodorosCompleted: session.pomodorosCompleted,
      });

      // Atualizar usuário
      const user = await User.findOne({ discordId: session.userId });
      if (user) {
        user.totalStudyTime += duration;
        user.totalSessions += 1;
        user.completedPomodoros += session.pomodorosCompleted;

        // Atualizar streak
        user.updateStreak();

        // Dar XP pela sessão completa
        const xpGained = Math.min(100, duration); // Limitar a 100 XP
        let leveledUp = false;

        if (user.addXP) {
          leveledUp = await user.addXP(xpGained, config.levels);
        } else {
          // Método alternativo caso o método addXP não exista
          user.xp += xpGained;
          if (user.xp >= user.xpToNextLevel) {
            user.level += 1;
            user.xp -= user.xpToNextLevel;
            user.xpToNextLevel = Math.floor(
              config.levels.baseXP *
                Math.pow(config.levels.growthFactor, user.level - 1)
            );
            leveledUp = true;
          }
        }

        await user.save();

        // Atualizar meta se houver
        if (session.goalId) {
          const goal = await Goal.findById(session.goalId);
          if (goal) {
            goal.addTime(duration);
            await goal.save();
          }
        }

        // Enviar mensagem de conclusão
        const completionEmbed = new EmbedBuilder()
          .setTitle("✅ Sessão Pomodoro Concluída")
          .setDescription(`${session.username} encerrou a sessão de pomodoro!`)
          .setColor("#2ecc71")
          .addFields(
            { name: "Assunto", value: session.subject, inline: true },
            {
              name: "Pomodoros Completos",
              value: `${session.pomodorosCompleted}`,
              inline: true,
            },
            {
              name: "Duração Total",
              value: `${duration} minutos`,
              inline: true,
            },
            { name: "XP Ganho", value: `${xpGained}`, inline: true }
          );

        if (leveledUp) {
          completionEmbed.addFields({
            name: "🎉 Subiu de Nível!",
            value: `${session.username} alcançou o nível ${user.level}!`,
          });
        }

        await this._safelySendDM(session.dmChannel, {
          embeds: [completionEmbed],
        });

        // Remover da lista de sessões ativas
        memoryCache.delete(userId);

        return {
          success: true,
          message: "Sessão de pomodoro encerrada com sucesso!",
        };
      } else {
        console.error("Usuário não encontrado ao encerrar sessão de pomodoro");
        return {
          success: false,
          message: "Erro ao encerrar sessão: usuário não encontrado",
        };
      }
    } catch (error) {
      console.error("Erro ao encerrar sessão de pomodoro:", error);
      return {
        success: false,
        message: "Ocorreu um erro ao encerrar a sessão de pomodoro.",
      };
    } finally {
      // Garantir que o usuário seja removido da lista mesmo se houver erros
      memoryCache.delete(userId);
    }
  }

  /**
   * Obtém a sessão ativa de um usuário
   * @param {string} userId - ID do usuário
   * @returns {object|null} Sessão ativa ou null se não existir
   */
  getActiveSession(userId) {
    const session = memoryCache.get(userId);
    if (!session) return null;

    // Calcular minutos restantes para exibição
    const timeLeftMinutes = Math.ceil(session.timeLeft);

    return {
      userId: session.userId,
      username: session.username,
      subject: session.subject,
      status: session.status,
      pomodorosCompleted: session.pomodorosCompleted,
      currentCycle: session.currentCycle,
      paused: session.paused,
      startTime: session.startTime,
      timeLeft: timeLeftMinutes,
    };
  }

  /**
   * Obtém todas as sessões de pomodoro ativas
   * @returns {Array} Array de sessões ativas
   */
  getAllActiveSessions() {
    const sessions = [];

    memoryCache.forEach((session, userId) => {
      sessions.push({
        userId: userId,
        username: session.username,
        subject: session.subject,
        status: session.status,
        pomodorosCompleted: session.pomodorosCompleted,
        paused: session.paused,
        started: session.serverChannel?.type === 1 ? "DM" : "Servidor",
      });
    });

    return sessions;
  }

  /**
   * Limpa sessões órfãs ou expiradas do banco de dados
   * @returns {Promise<number>} Número de sessões removidas
   */
  async cleanOrphanedSessions() {
    try {
      // Remover sessões mais antigas que 12 horas
      const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);

      const result = await ActiveSession.deleteMany({
        sessionType: "pomodoro",
        lastUpdated: { $lt: cutoff },
      });

      console.log(
        `Limpeza de sessões: ${result.deletedCount} sessões antigas removidas`
      );
      return result.deletedCount;
    } catch (error) {
      console.error("Erro ao limpar sessões órfãs:", error);
      return 0;
    }
  }

  /**
   * Método de limpeza específico para testes
   * @param {boolean} cacheOnly - Se true, limpa apenas o cache sem afetar o banco
   * @returns {Promise<void>}
   */
  async cleanupForTests(cacheOnly = false) {
    try {
      // Limpar todos os timers em memória
      for (const [userId, state] of memoryCache.entries()) {
        if (state.timer) {
          clearInterval(state.timer);
          state.timer = null;
        }
      }

      // Limpar o cache em memória
      memoryCache.clear();

      // Limpar também no banco de dados, se solicitado
      if (!cacheOnly) {
        await ActiveSession.deleteMany({ sessionType: "pomodoro" });
      }

      console.log("Limpeza de sessões para testes concluída");
    } catch (error) {
      console.error("Erro durante limpeza para testes:", error);
    }
  }
}

// Exportar uma instância única
module.exports = new PomodoroManager();
