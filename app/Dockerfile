# Utilisation d'une image Node.js avec la version 14 (vous pouvez utiliser une autre version si nécessaire)
FROM node:lts-slim

# Install required dependencies
RUN apt-get update && apt-get install curl gnupg -y \
    && curl --location --silent https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install google-chrome-stable -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configuration du fuseau horaire
ENV TZ=Europe/Paris
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Définition du répertoire de travail
WORKDIR /usr/src/app

# Installation de l'utilitaire corepack
RUN corepack enable

# Copie des fichiers package.json et package-lock.json pour installer les dépendances
COPY package*.json ./

# Installation des dépendances
RUN pnpm install

# Copie des fichiers source dans l'image
COPY . .

# Compilation TypeScript
RUN pnpm build
