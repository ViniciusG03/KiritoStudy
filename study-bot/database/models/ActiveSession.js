// database/models/ActiveSession.js
const mongoose = require("mongoose");

const activeSessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  sessionType: {
    type: String,
    enum: ["focus", "pomodoro"],
    required: true,
  },
  studySessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StudySession",
    required: true,
  },
  subject: {
    type: String,
    default: "Geral",
  },
  startTime: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["work", "shortBreak", "longBreak"],
    default: "work",
  },
  currentCycle: {
    type: Number,
    default: 1,
  },
  pomodorosCompleted: {
    type: Number,
    default: 0,
  },
  timeLeft: {
    type: Number, // em milissegundos
    required: true,
  },
  paused: {
    type: Boolean,
    default: false,
  },
  pausedAt: {
    type: Date,
  },
  goalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Goal",
  },
  // Dados adicionais serializados
  metadata: {
    type: Object,
    default: {},
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

// Índices para consultas eficientes
activeSessionSchema.index({ userId: 1, sessionType: 1 }, { unique: true });
activeSessionSchema.index({ lastUpdated: 1 });

module.exports = mongoose.model("ActiveSession", activeSessionSchema);
