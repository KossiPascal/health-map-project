#!/bin/bash
# 8047
echo "📦 Démarrage du serveur backend en dev avec HTTPS (port 4047) et HTTP (port 8080)..."

# Vérifie si ssl existe
if [ ! -f ssl/key.pem ] || [ ! -f ssl/cert.pem ]; then
  echo "🔐 Certificats SSL manquants. Génération automatique..."
  mkdir -p ssl
  openssl req -x509 -newkey rsa:2048 -nodes -keyout ssl/key.pem -out ssl/cert.pem -days 365 -subj "/CN=localhost"
fi

# Lance le backend
npx nodemon --delay 3000ms src/server.ts
      
