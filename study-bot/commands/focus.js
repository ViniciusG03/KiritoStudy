// commands/focus.js - Modificado para usar persistência
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const User = require("../database/models/User");
const StudySession = require("../database/models/StudySession");
const ActiveSession = require("../database/models/ActiveSession");

// Cache local para sessões de foco (desempenho)
const focusCache = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("focus")
    .setDescription("Comandos do sistema de foco para estudos")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Inicia um modo de foco")
        .addIntegerOption((option) =>
          option
            .setName("duration")
            .setDescription("Duração em minutos")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("subject")
            .setDescription("Assunto que você vai estudar")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stop").setDescription("Encerra o modo de foco")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("Verifica seu status de foco")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("Lista todos os usuários em modo de foco")
    ),

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
          username: username,
        });
        await user.save();
      }

      switch (subcommand) {
        case "start":
          // Verificar se já existe uma sessão ativa
          const existingSession = await ActiveSession.findOne({
            userId: userId,
            sessionType: "focus",
          });

          if (existingSession || focusCache.has(userId)) {
            await interaction.editReply(
              "❌ Você já está em modo de foco! Use `/focus stop` para encerrar o modo atual."
            );
            return;
          }

          const duration = interaction.options.getInteger("duration");
          const subject = interaction.options.getString("subject") || "Geral";

          // Validar duração
          if (duration <= 0 || duration > 480) {
            // Máximo de 8 horas
            await interaction.editReply(
              "❌ A duração deve estar entre 1 e 480 minutos (8 horas)."
            );
            return;
          }

          // Criar nova sessão de estudo
          const session = new StudySession({
            userId: userId,
            startTime: new Date(),
            type: "focus",
            subject: subject,
          });
          await session.save();

          // Calcular tempo de término
          const endTime = new Date();
          endTime.setMinutes(endTime.getMinutes() + duration);

          // Salvar metadados para restauração
          const sessionMetadata = {
            username: username,
            channelId: interaction.channel?.id,
          };

          // Persistir sessão no banco de dados
          const activeSession = new ActiveSession({
            userId: userId,
            sessionType: "focus",
            studySessionId: session._id,
            subject: subject,
            startTime: new Date(),
            status: "work", // Usar 'work' para compatibilidade
            timeLeft: duration * 60 * 1000, // em ms
            metadata: sessionMetadata,
            lastUpdated: new Date(),
          });

          await activeSession.save();

          // Adicionar cache em memória
          const newFocusSession = {
            sessionId: session._id,
            activeSessionId: activeSession._id,
            username: username,
            subject: subject,
            startTime: new Date(),
            endTime: endTime,
            duration: duration,
            channel: interaction.channel,
            timer: null,
          };

          focusCache.set(userId, newFocusSession);

          // Configurar timer para finalizar automaticamente
          const timer = setTimeout(async () => {
            await this._endFocusMode(userId, interaction.channel);
          }, duration * 60 * 1000);

          // Armazenar o timer
          focusCache.get(userId).timer = timer;

          // Enviar mensagem de confirmação
          const startEmbed = new EmbedBuilder()
            .setTitle("🎯 Modo Foco Iniciado")
            .setDescription(
              `${username} entrou em modo de foco por ${duration} minutos!`
            )
            .setColor("#27ae60")
            .addFields(
              { name: "Assunto", value: subject, inline: true },
              {
                name: "Término",
                value: `<t:${Math.floor(endTime.getTime() / 1000)}:R>`,
                inline: true,
              }
            )
            .setFooter({
              text: "Durante o modo foco, tente evitar distrações! 🧠",
            });

          await interaction.editReply({ embeds: [startEmbed] });
          break;

        case "stop":
          // Verificar se há uma sessão no cache ou no banco
          if (!focusCache.has(userId)) {
            // Tentar buscar no banco de dados
            const dbSession = await ActiveSession.findOne({
              userId: userId,
              sessionType: "focus",
            });

            if (dbSession) {
              // Reconstruir sessão em memória para poder encerrá-la
              const studySession = await StudySession.findById(
                dbSession.studySessionId
              );
              if (!studySession) {
                await interaction.editReply(
                  "❌ Ocorreu um erro ao localizar sua sessão de foco."
                );
                return;
              }

              // Adicionar ao cache em memória
              focusCache.set(userId, {
                sessionId: studySession._id,
                activeSessionId: dbSession._id,
                username: username,
                subject: dbSession.subject,
                startTime: dbSession.startTime,
                endTime: new Date(
                  dbSession.startTime.getTime() + dbSession.timeLeft
                ),
                duration: Math.floor(dbSession.timeLeft / (60 * 1000)),
                channel: interaction.channel,
                timer: null,
              });
            } else {
              await interaction.editReply(
                "❌ Você não está em modo de foco no momento."
              );
              return;
            }
          }

          // Encerrar o modo de foco
          const stopResult = await this._endFocusMode(
            userId,
            interaction.channel
          );

          if (stopResult && stopResult.success) {
            await interaction.editReply(
              "✅ Seu modo de foco foi encerrado com sucesso!"
            );
          } else {
            await interaction.editReply(
              "❌ Ocorreu um erro ao encerrar seu modo de foco. Tente novamente."
            );
          }
          break;

        case "status":
          // Verificar se há uma sessão no cache ou no banco
          if (!focusCache.has(userId)) {
            // Tentar buscar no banco de dados
            const dbFocusSession = await ActiveSession.findOne({
              userId: userId,
              sessionType: "focus",
            });

            if (dbFocusSession) {
              // Reconstruir sessão em memória
              const studySession = await StudySession.findById(
                dbFocusSession.studySessionId
              );
              if (!studySession) {
                await interaction.editReply(
                  "❌ Ocorreu um erro ao localizar sua sessão de foco."
                );
                return;
              }

              // Adicionar ao cache em memória
              const endTimeFromDb = new Date(
                dbFocusSession.startTime.getTime() + dbFocusSession.timeLeft
              );
              focusCache.set(userId, {
                sessionId: studySession._id,
                activeSessionId: dbFocusSession._id,
                username: username,
                subject: dbFocusSession.subject,
                startTime: dbFocusSession.startTime,
                endTime: endTimeFromDb,
                duration: Math.floor(dbFocusSession.timeLeft / (60 * 1000)),
                channel: interaction.channel,
                timer: null,
              });

              // Configurar novo timer para o tempo restante
              const timeLeftMs = Math.max(0, endTimeFromDb - new Date());
              if (timeLeftMs > 0) {
                const newTimer = setTimeout(async () => {
                  await this._endFocusMode(userId, interaction.channel);
                }, timeLeftMs);

                focusCache.get(userId).timer = newTimer;
              } else {
                // Se já passou do tempo, encerrar
                setTimeout(async () => {
                  await this._endFocusMode(userId, interaction.channel);
                }, 1000);
              }
            } else {
              await interaction.editReply(
                "❓ Você não está em modo de foco no momento."
              );
              return;
            }
          }

          const userFocusData = focusCache.get(userId);
          const now = new Date();
          const timeElapsed = Math.floor(
            (now - userFocusData.startTime) / 60000
          ); // em minutos
          const timeRemaining = Math.max(
            0,
            userFocusData.duration - timeElapsed
          );

          const statusEmbed = new EmbedBuilder()
            .setTitle("🧠 Status do Modo Foco")
            .setDescription(`${username} está em modo de foco!`)
            .setColor("#3498db")
            .addFields(
              { name: "Assunto", value: userFocusData.subject, inline: true },
              {
                name: "Tempo Decorrido",
                value: `${timeElapsed} minutos`,
                inline: true,
              },
              {
                name: "Tempo Restante",
                value: `${timeRemaining} minutos`,
                inline: true,
              },
              {
                name: "Término",
                value: `<t:${Math.floor(
                  userFocusData.endTime.getTime() / 1000
                )}:R>`,
                inline: true,
              }
            )
            .setFooter({ text: "Mantenha o foco! 💪" });

          await interaction.editReply({ embeds: [statusEmbed] });
          break;

        case "list":
          // Buscar todas as sessões ativas de foco
          const activeFocusSessions = await ActiveSession.find({
            sessionType: "focus",
          });

          if (activeFocusSessions.length === 0 && focusCache.size === 0) {
            await interaction.editReply(
              "📝 Não há usuários em modo de foco no momento."
            );
            return;
          }

          // Mesclar sessões do banco de dados e do cache
          const allSessions = new Map();

          // Adicionar do cache primeiro
          focusCache.forEach((data, userId) => {
            allSessions.set(userId, data);
          });

          // Adicionar do banco de dados se não estiver no cache
          for (const dbSession of activeFocusSessions) {
            if (!allSessions.has(dbSession.userId)) {
              // Buscar informação adicional
              const metadata = dbSession.metadata || {};
              const startTime = dbSession.startTime;
              const timeLeftMs = dbSession.timeLeft;
              const endTime = new Date(startTime.getTime() + timeLeftMs);

              allSessions.set(dbSession.userId, {
                username: metadata.username || "Usuário",
                subject: dbSession.subject,
                startTime: startTime,
                endTime: endTime,
              });
            }
          }

          const listEmbed = new EmbedBuilder()
            .setTitle("📋 Usuários em Modo Foco")
            .setDescription(
              `Há ${allSessions.size} usuário(s) em modo de foco:`
            )
            .setColor("#9b59b6");

          // Adicionar cada usuário em foco
          Array.from(allSessions.entries()).forEach(([userId, data]) => {
            const now = new Date();
            const remaining = Math.max(
              0,
              Math.floor((data.endTime - now) / 60000)
            );

            listEmbed.addFields({
              name: data.username,
              value: `📚 **Assunto:** ${
                data.subject
              }\n⏱️ **Tempo Restante:** ${remaining} minutos\n🏁 **Término:** <t:${Math.floor(
                data.endTime.getTime() / 1000
              )}:R>`,
            });
          });

          await interaction.editReply({ embeds: [listEmbed] });
          break;
      }
    } catch (error) {
      console.error(`Erro ao executar comando de foco:`, error);
      await interaction.editReply(
        "❌ Ocorreu um erro ao processar seu comando. Por favor, tente novamente mais tarde."
      );
    }
  },

  /**
   * Método para encerrar o modo de foco
   * @param {string} userId - ID do usuário
   * @param {object} channel - Canal para enviar notificações
   */
  async _endFocusMode(userId, channel) {
    try {
      const focusData = focusCache.get(userId);
      if (!focusData) {
        // Tentar buscar no banco de dados
        const dbSession = await ActiveSession.findOne({
          userId: userId,
          sessionType: "focus",
        });

        if (!dbSession) {
          return { success: false, message: "Sessão de foco não encontrada" };
        }

        // Buscar sessão de estudo
        const studySession = await StudySession.findById(
          dbSession.studySessionId
        );
        if (!studySession) {
          return { success: false, message: "Sessão de estudo não encontrada" };
        }

        // Remover do banco de dados
        await ActiveSession.findByIdAndRemove(dbSession._id);

        // Calcular a duração real
        const now = new Date();
        const actualDuration = Math.floor((now - dbSession.startTime) / 60000); // em minutos

        // Atualizar a sessão de estudo
        try {
          await StudySession.findByIdAndUpdate(dbSession.studySessionId, {
            endTime: now,
            duration: actualDuration,
            completed: true,
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
              leveledUp = await user.addXP(xpGained, {
                baseXP: 100,
                growthFactor: 1.5,
              });
            } else {
              // Método alternativo caso o método addXP não exista
              user.xp += xpGained;
              if (user.xp >= user.xpToNextLevel) {
                user.level += 1;
                user.xp -= user.xpToNextLevel;
                user.xpToNextLevel = Math.floor(
                  100 * Math.pow(1.5, user.level - 1)
                );
                leveledUp = true;
              }
            }

            await user.save();

            // Enviar notificação de conclusão
            if (channel) {
              const completionEmbed = new EmbedBuilder()
                .setTitle("✅ Modo Foco Concluído")
                .setDescription(`Usuário completou uma sessão de foco!`)
                .setColor("#2ecc71")
                .addFields(
                  { name: "Assunto", value: dbSession.subject, inline: true },
                  {
                    name: "Duração",
                    value: `${actualDuration} minutos`,
                    inline: true,
                  },
                  { name: "XP Ganho", value: `${xpGained}`, inline: true }
                );

              if (leveledUp) {
                completionEmbed.addFields({
                  name: "🎉 Subiu de Nível!",
                  value: `Usuário alcançou o nível ${user.level}!`,
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
          return {
            success: false,
            message: "Erro ao atualizar dados do usuário",
          };
        }
      }

      // Limpar o timer se existir
      if (focusData.timer) {
        clearTimeout(focusData.timer);
      }

      // Calcular a duração real
      const now = new Date();
      const actualDuration = Math.floor((now - focusData.startTime) / 60000); // em minutos

      // Remover do banco de dados
      await ActiveSession.findByIdAndRemove(focusData.activeSessionId);

      // Atualizar a sessão de estudo
      try {
        await StudySession.findByIdAndUpdate(focusData.sessionId, {
          endTime: now,
          duration: actualDuration,
          completed: true,
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
            leveledUp = await user.addXP(xpGained, {
              baseXP: 100,
              growthFactor: 1.5,
            });
          } else {
            // Método alternativo caso o método addXP não exista
            user.xp += xpGained;
            if (user.xp >= user.xpToNextLevel) {
              user.level += 1;
              user.xp -= user.xpToNextLevel;
              user.xpToNextLevel = Math.floor(
                100 * Math.pow(1.5, user.level - 1)
              );
              leveledUp = true;
            }
          }

          await user.save();

          // Remover dos usuários em foco
          focusCache.delete(userId);

          // Enviar notificação de conclusão
          if (channel) {
            const completionEmbed = new EmbedBuilder()
              .setTitle("✅ Modo Foco Concluído")
              .setDescription(
                `${focusData.username} completou uma sessão de foco!`
              )
              .setColor("#2ecc71")
              .addFields(
                { name: "Assunto", value: focusData.subject, inline: true },
                {
                  name: "Duração",
                  value: `${actualDuration} minutos`,
                  inline: true,
                },
                { name: "XP Ganho", value: `${xpGained}`, inline: true }
              );

            if (leveledUp) {
              completionEmbed.addFields({
                name: "🎉 Subiu de Nível!",
                value: `${focusData.username} alcançou o nível ${user.level}!`,
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
        return {
          success: false,
          message: "Erro ao atualizar dados do usuário",
        };
      }
    } catch (error) {
      console.error("Erro ao encerrar modo de foco:", error);
      return {
        success: false,
        message: "Erro interno ao encerrar modo de foco",
      };
    } finally {
      // Garantir que o usuário seja removido da lista mesmo se houver erros
      focusCache.delete(userId);
    }
  },

  /**
   * Carrega sessões ativas do banco de dados (para uso no startup)
   * @returns {Promise<void>}
   */
  async loadActiveSessions() {
    try {
      console.log("Carregando sessões de foco ativas do banco de dados...");
      const activeSessions = await ActiveSession.find({ sessionType: "focus" });

      if (activeSessions.length === 0) {
        console.log(
          "Nenhuma sessão de foco ativa encontrada no banco de dados."
        );
        return;
      }

      console.log(
        `Encontradas ${activeSessions.length} sessões de foco ativas.`
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

          // Calcular tempo restante
          const now = new Date();
          let timeLeftMs = dbSession.timeLeft;

          // Calcular tempo de término
          const endTime = new Date(dbSession.startTime.getTime() + timeLeftMs);

          // Adicionar ao cache em memória
          focusCache.set(dbSession.userId, {
            sessionId: studySession._id,
            activeSessionId: dbSession._id,
            username: dbSession.metadata?.username || "Usuário",
            subject: dbSession.subject,
            startTime: dbSession.startTime,
            endTime: endTime,
            duration: Math.floor(timeLeftMs / (60 * 1000)),
            timer: null,
            pendingRestore: true,
          });

          console.log(
            `Restaurada sessão de foco para usuário ${dbSession.userId}`
          );
        } catch (err) {
          console.error(`Erro ao restaurar sessão ${dbSession._id}:`, err);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar sessões de foco ativas:", error);
    }
  },

  /**
   * Completa a restauração das sessões quando o client está disponível
   * @param {Object} client - Cliente Discord.js
   * @returns {Promise<void>}
   */
  async completeSessionsRestore(client) {
    for (const [userId, state] of focusCache.entries()) {
      if (state.pendingRestore) {
        try {
          // Buscar canal
          let channel = null;
          if (state.metadata?.channelId) {
            try {
              channel = await client.channels.fetch(state.metadata.channelId);
            } catch (err) {
              console.warn(
                `Não foi possível buscar canal ${state.metadata.channelId}:`,
                err.message
              );
            }
          }

          // Atualizar estado com canal
          state.channel = channel;

          // Configurar timer para tempo restante
          const now = new Date();
          const timeLeft = Math.max(0, state.endTime - now);

          if (timeLeft > 0) {
            const timer = setTimeout(async () => {
              await this._endFocusMode(userId, channel);
            }, timeLeft);

            state.timer = timer;
          } else {
            // Se já passou do tempo, encerrar
            setTimeout(async () => {
              await this._endFocusMode(userId, channel);
            }, 1000);
          }

          // Remover flag de pendência
          state.pendingRestore = false;

          console.log(
            `Restauração de sessão de foco finalizada para usuário ${userId}`
          );
        } catch (err) {
          console.error(
            `Erro ao completar restauração de foco para usuário ${userId}:`,
            err
          );
        }
      }
    }
  },

  /**
   * Limpa sessões órfãs ou expiradas do banco de dados
   * @returns {Promise<number>} Número de sessões removidas
   */
  async cleanOrphanedSessions() {
    try {
      // Remover sessões mais antigas que 12 horas
      const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);

      const result = await ActiveSession.deleteMany({
        sessionType: "focus",
        lastUpdated: { $lt: cutoff },
      });

      console.log(
        `Limpeza de sessões de foco: ${result.deletedCount} sessões antigas removidas`
      );
      return result.deletedCount;
    } catch (error) {
      console.error("Erro ao limpar sessões de foco órfãs:", error);
      return 0;
    }
  },
};
