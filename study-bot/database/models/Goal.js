// database/models/Goal.js
const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  targetTime: {
    type: Number,
    default: 0  // Tempo alvo em minutos
  },
  currentTime: {
    type: Number,
    default: 0  // Tempo atual acumulado em minutos
  },
  completed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  deadline: {
    type: Date,
    default: null
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'custom'],
    default: 'custom'
  },
  subject: {
    type: String,
    default: 'Geral'
  },
  progress: {
    type: Number,
    default: 0  // Porcentagem de progresso (0-100)
  },
  milestones: [{
    title: String,
    completed: Boolean,
    completedAt: Date
  }]
});

// Método para atualizar o progresso
goalSchema.methods.updateProgress = function() {
  if (this.targetTime > 0) {
    this.progress = Math.min(100, Math.floor((this.currentTime / this.targetTime) * 100));
    
    if (this.progress >= 100 && !this.completed) {
      this.completed = true;
      return true; // Retorna true se a meta foi concluída agora
    }
  }
  
  return false; // Não foi concluída ou já estava concluída
};

// Método para adicionar tempo à meta
goalSchema.methods.addTime = function(minutes) {
  this.currentTime += minutes;
  const wasCompleted = this.updateProgress();
  return wasCompleted;
};

// Método estático para encontrar metas ativas do usuário
goalSchema.statics.findActiveGoals = function(userId) {
  return this.find({
    userId: userId,
    completed: false
  }).sort({ deadline: 1 });
};

// Método estático para encontrar metas vencidas
goalSchema.statics.findOverdueGoals = function(userId) {
  const now = new Date();
  
  return this.find({
    userId: userId,
    completed: false,
    deadline: { $lt: now, $ne: null }
  });
};

module.exports = mongoose.model('Goal', goalSchema);