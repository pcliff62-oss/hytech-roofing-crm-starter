const winston = require('winston');
const logger = winston.createLogger({ level: process.env.LOG_LEVEL || 'info', transports: [new winston.transports.Console()] });

function alertSuspicious(message, meta) {
  // hook point to integrate with Sentry/Datadog/Slack
  logger.warn('SUSPICIOUS: ' + message, meta || {});
}

module.exports = { alertSuspicious };
