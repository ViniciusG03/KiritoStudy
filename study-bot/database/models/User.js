// database/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  discordId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  level: {
    type: Number,
    default: 1
  },
  xp: {
    type: Number,
    default: 0
  },
  xpToNextLevel: {
    type: Number,
    default: 100
  },
  totalStudyTime: {
    type: Number,
    default: 0  // Tempo total em minutos
  },
  totalSessions: {
    type: Number,
    default: 0
  },
  completedPomodoros: {
    type: Number,
    default: 0
  },
  rewards: [{
    name: String,
    description: String,
    unlocked: Boolean,
    unlockedAt: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastSessionDate: {
    type: Date,
    default: null
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  focusSessions: {
    type: Number,
    default: 0
  }
});

// Método para adicionar XP e verificar se subiu de nível
userSchema.methods.addXP = async function(xpAmount, levels) {
  this.xp += xpAmount;
  
  if (this.xp >= this.xpToNextLevel) {
    this.level += 1;
    this.xp -= this.xpToNextLevel;
    
    // Calcular XP necessário para o próximo nível
    this.xpToNextLevel = Math.floor(levels.baseXP * Math.pow(levels.growthFactor, this.level - 1));
    
    return true; // Indica que subiu de nível
  }
  
  return false; // Não subiu de nível
};

// Método para atualizar streak
userSchema.methods.updateStreak = function() {
  const now = new Date();
  const lastSession = this.lastSessionDate;
  
  if (!lastSession) {
    // Primeira sessão
    this.currentStreak = 1;
  } else {
    const lastSessionDate = new Date(lastSession);
    const timeDiff = now - lastSessionDate;
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 0) {
      // Mesma data, não fazer nada com o streak
    } else if (daysDiff === 1) {
      // Dia consecutivo
      this.currentStreak += 1;
    } else {
      // Streak quebrado
      this.currentStreak = 1;
    }
  }
  
  // Atualizar o recorde de streak
  if (this.currentStreak > this.longestStreak) {
    this.longestStreak = this.currentStreak;
  }
  
  this.lastSessionDate = now;
};

module.exports = mongoose.model('User', userSchema);