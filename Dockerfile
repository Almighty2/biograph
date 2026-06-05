# Étape 1 : build avec une image complète
FROM node:18-alpine AS builder

WORKDIR /app

# Copie les fichiers nécessaires à l'installation
COPY package*.json ./
COPY prisma ./prisma

# Installe toutes les dépendances
RUN npm install

# Copie le reste du code source
COPY . .

# Génère les fichiers Prisma
RUN npx prisma generate

# Compile l'app NestJS
RUN npm run build

# Étape 2 : image finale légère
FROM node:18-alpine AS production

WORKDIR /app

# Copie uniquement les dépendances nécessaires
COPY package*.json ./
RUN npm ci --omit=dev

# Copie les fichiers nécessaires à l'exécution
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Génère à nouveau Prisma Client dans l'image finale si nécessaire
RUN npx prisma generate

EXPOSE 8091

CMD ["node", "dist/main"]
