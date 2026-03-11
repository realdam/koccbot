FROM node:24-bookworm-slim

WORKDIR /app

COPY Bot ./Bot

CMD ["node", "Bot/Bot.js"]
