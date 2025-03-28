// jest-mongodb-config.js
module.exports = {
  mongodbMemoryServerOptions: {
    binary: {
      version: "5.0.0", // Versão mais recente compatível
      skipMD5: true,
    },
    instance: {
      dbName: "jest",
    },
    autoStart: false,
  },
};
