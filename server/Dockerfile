FROM node:22-alpine

WORKDIR /app

# Instala dependências de compilação apenas se necessárias para better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Diretórios de dados com permissão adequada para usuário não-root
RUN mkdir -p uploads data && chown -R node:node /app

USER node

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

CMD ["node", "src/server.js"]
