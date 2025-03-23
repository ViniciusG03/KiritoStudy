// database/models/StudySession.js
const mongoose = require('mongoose');

const studySessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    default: null
  },
  duration: {
    type: Number,
    default: 0  // Duração em minutos
  },
  type: {
    type: String,
    enum: ['pomodoro', 'focus', 'regular'],
    default: 'regular'
  },
  completed: {
    type: Boolean,
    default: false
  },
  pomodorosCompleted: {
    type: Number,
    default: 0
  },
  subject: {
    type: String,
    default: 'Geral'
  },
  notes: {
    type: String,
    default: ''
  },
  interruptions: {
    type: Number,
    default: 0
  }
});

// Métodos para cálculos estatísticos
studySessionSchema.statics.getDailyStats = async function(userId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.aggregate([
    {
      $match: {
        userId: userId,
        startTime: { $gte: startOfDay, $lte: endOfDay },
        completed: true
      }
    },
    {
      $group: {
        _id: null,
        totalDuration: { $sum: '$duration' },
        sessionsCount: { $sum: 1 },
        pomodorosCount: { $sum: '$pomodorosCompleted' }
      }
    }
  ]);
};

studySessionSchema.statics.getWeeklyStats = async function(userId, date) {
  const startOfWeek = new Date(date);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  return this.aggregate([
    {
      $match: {
        userId: userId,
        startTime: { $gte: startOfWeek, $lte: endOfWeek },
        completed: true
      }
    },
    {
      $group: {
        _id: { $dayOfWeek: '$startTime' },
        totalDuration: { $sum: '$duration' },
        sessionsCount: { $sum: 1 }
      }
    },
    {
      $sort: { '_id': 1 }
    }
  ]);
};

// Estatísticas por assunto
studySessionSchema.statics.getStatsBySubject = async function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: userId,
        startTime: { $gte: startDate, $lte: endDate },
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
};

module.exports = mongoose.model('StudySession', studySessionSchema);