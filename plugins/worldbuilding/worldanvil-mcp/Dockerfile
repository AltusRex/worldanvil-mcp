FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY index.js http.js ./
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
CMD ["node", "http.js"]
