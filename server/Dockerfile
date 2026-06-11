# Backend (Express API)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3001
# Env (DATABASE_URL, QDRANT_*, OPENAI_API_KEY) is injected by docker-compose env_file
CMD ["node", "index.js"]
