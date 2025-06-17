#!/bin/bash
set -e
echo "🚀 Initialisation de CouchDB..."

# # Chargement des variables d'environnement
# if [ -f .env ]; then
#     echo "📄 Chargement des variables d'environnement..."
#     export $(grep -v '^#' .env | xargs)
# fi

# # Chargement de .os-env si présent
# if [ -f .env_parent ]; then
#   echo "📄 Chargement des variables d'environnement depuis .env_parent ..."
#   export $(grep -v '^#' .env_parent | xargs)
# fi

COUCHDB_PROTOCOL="${COUCHDB_PROTOCOL:-http}"
COUCHDB_HOST="${COUCHDB_HOST:-localhost}"
COUCHDB_PORT="${COUCHDB_PORT:-5984}"
COUCHDB_USER="${COUCHDB_USER:-admin}"
COUCHDB_DB="${COUCHDB_DB:-myapp}"
COUCHDB_PASS="${COUCHDB_PASS:?❌ COUCHDB_PASS doit être défini}"

COUCHDB_URL="${COUCHDB_PROTOCOL}://${COUCHDB_USER}:${COUCHDB_PASS}@${COUCHDB_HOST}:${COUCHDB_PORT}"

echo "⏳ Attente du démarrage de CouchDB sur ${COUCHDB_HOST}:${COUCHDB_PORT}..."
until curl -s "${COUCHDB_URL}/_up" > /dev/null; do
    sleep 2
done

echo "✅ CouchDB est prêt !"

# Création des bases système si elles n'existent pas
for db in _users _replicator _global_changes; do
    echo "🔧 Vérification de l'existence de la base $db..."
    if curl -s -o /dev/null -w "%{http_code}" -u "$COUCHDB_USER:$COUCHDB_PASS" -X GET "${COUCHDB_URL}/${db}" | grep -q "404"; then
    echo "➕ Création de la base $db..."
    curl -s -u "$COUCHDB_USER:$COUCHDB_PASS" -X PUT "${COUCHDB_URL}/${db}"
    else
    echo "✅ La base $db existe déjà"
    fi
done

# Création de la base principale de l'application
if curl -s -o /dev/null -w "%{http_code}" -u "$COUCHDB_USER:$COUCHDB_PASS" -X GET "${COUCHDB_URL}/${COUCHDB_DB}" | grep -q "404"; then
    echo "📦 Création de la base applicative : ${COUCHDB_DB}"
    curl -s -u "$COUCHDB_USER:$COUCHDB_PASS" -X PUT "${COUCHDB_URL}/${COUCHDB_DB}"
else
    echo "✅ La base ${COUCHDB_DB} existe déjà."
fi

echo "🎉 Initialisation CouchDB terminée."