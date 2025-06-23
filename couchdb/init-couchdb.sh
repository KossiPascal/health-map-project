#!/bin/sh
set -e

echo "🚀 Initialisation de CouchDB..."

# Chargement des variables avec valeurs par défaut
COUCHDB_PROTOCOL="${COUCHDB_PROTOCOL:-http}"
COUCHDB_HOST="${COUCHDB_HOST:-localhost}"
COUCHDB_PORT="${COUCHDB_PORT:-5984}"
COUCHDB_USER="${COUCHDB_USER:-admin}"
COUCHDB_PASS="${COUCHDB_PASS:?❌ COUCHDB_PASS doit être défini}"
COUCHDB_DB="${COUCHDB_DB:?❌ COUCHDB_DB doit être défini}"

COUCHDB_MEMBER_USER="${COUCHDB_MEMBER_USER}"
COUCHDB_MEMBER_PASS="${COUCHDB_MEMBER_PASS}"

COUCHDB_BASE_URL="${COUCHDB_PROTOCOL}://${COUCHDB_HOST}:${COUCHDB_PORT}"
COUCHDB_AUTH_URL="${COUCHDB_PROTOCOL}://${COUCHDB_USER}:${COUCHDB_PASS}@${COUCHDB_HOST}:${COUCHDB_PORT}"

# Vérification que le membre est bien défini
if [ -z "$COUCHDB_MEMBER_USER" ] || [ -z "$COUCHDB_MEMBER_PASS" ]; then
  echo "⚠️  Les variables d'environnement COUCHDB_MEMBER_USER et COUCHDB_MEMBER_PASS doivent être définies."
  exit 1
fi

echo "⏳ Attente de la disponibilité de CouchDB sur ${COUCHDB_BASE_URL}..."
until curl -s -u "${COUCHDB_USER}:${COUCHDB_PASS}" "${COUCHDB_BASE_URL}/_up" > /dev/null; do
  sleep 2
done
echo "✅ CouchDB est prêt !"

# # Fonction de vérification et de création de base
# create_db_if_not_exists() {
#   DB_NAME="$1"
#   echo "🔍 Vérification de l'existence de la base '${DB_NAME}'..."
#   STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u "${COUCHDB_USER}:${COUCHDB_PASS}" "${COUCHDB_BASE_URL}/${DB_NAME}")
#   if [ "$STATUS" -ne 200 ]; then
#     echo "🆕 Création de la base '${DB_NAME}'..."
#     curl -s -X PUT -u "${COUCHDB_USER}:${COUCHDB_PASS}" "${COUCHDB_BASE_URL}/${DB_NAME}" > /dev/null
#   else
#     echo "✅ La base '${DB_NAME}' existe déjà."
#   fi
# }

create_db_if_not_exists() {
  local DB_NAME="$1"
  echo "🔍 Vérification de l'existence de la base '${DB_NAME}'..."

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u "${COUCHDB_USER}:${COUCHDB_PASS}" "${COUCHDB_BASE_URL}/${DB_NAME}")

  if [ "$STATUS" -eq 404 ]; then
    echo "🆕 Création de la base '${DB_NAME}'..."
    CREATE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -u "${COUCHDB_USER}:${COUCHDB_PASS}" "${COUCHDB_BASE_URL}/${DB_NAME}")
    if [ "$CREATE_STATUS" -eq 201 ]; then
      echo "✅ Base '${DB_NAME}' créée avec succès."
    else
      echo "❌ Échec de la création de la base '${DB_NAME}' (code HTTP: $CREATE_STATUS)"
      exit 1
    fi
  elif [ "$STATUS" -eq 200 ]; then
    echo "✅ La base '${DB_NAME}' existe déjà."
  else
    echo "❌ Erreur lors de la vérification de la base '${DB_NAME}' (code HTTP: $STATUS)"
    exit 1
  fi
}


# Création des bases système
# for db in _users _replicator _global_changes; do
#   create_db_if_not_exists "$db"
# done

create_db_if_not_exists "_users"

# Création de la base principale
create_db_if_not_exists "$COUCHDB_DB"

# Créer le document utilisateur
USER_ID="org.couchdb.user:${COUCHDB_MEMBER_USER}"
USER_DOC=$(cat <<EOF
{
  "_id": "${USER_ID}",
  "name": "${COUCHDB_MEMBER_USER}",
  "password": "${COUCHDB_MEMBER_PASS}",
  "roles": [],
  "type": "user"
}
EOF
)

echo "👤 Création de l'utilisateur ${COUCHDB_MEMBER_USER} si nécessaire..."
USER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u "${COUCHDB_USER}:${COUCHDB_PASS}" "${COUCHDB_BASE_URL}/_users/${USER_ID}")
if [ "$USER_STATUS" -eq 404 ]; then
  echo "➕ Création de l'utilisateur..."
  curl -s -X PUT -u "${COUCHDB_USER}:${COUCHDB_PASS}" -H "Content-Type: application/json" "${COUCHDB_BASE_URL}/_users/${USER_ID}" -d "$USER_DOC"
  echo "✅ Utilisateur ${COUCHDB_MEMBER_USER} créé."
else
  echo "✅ L'utilisateur existe déjà."
fi


# Appliquer le _security à la base principale
SECURITY_DOC=$(cat <<EOF
{
  "admins": {
    "names": ["${COUCHDB_MEMBER_USER}"],
    "roles": []
  },
  "members": {
    "names": ["${COUCHDB_MEMBER_USER}"],
    "roles": []
  }
}
EOF
)

echo "🔐 Application des droits sur la base ${COUCHDB_DB}..."
curl -s -X PUT -u "${COUCHDB_USER}:${COUCHDB_PASS}" -H "Content-Type: application/json" "${COUCHDB_BASE_URL}/${COUCHDB_DB}/_security" -d "$SECURITY_DOC"
echo "✅ Droits appliqués pour ${COUCHDB_MEMBER_USER} sur ${COUCHDB_DB}"



# upload_design_doc() {
#   local doc_name="$1"
#   local design_json_file="$2"
#   local db_url="${COUCHDB_BASE_URL}/${COUCHDB_DB}/_design/${doc_name}"

#   echo "📦 Vérification de l'existence du design document '${doc_name}'..."
#   status=$(curl -s -o /dev/null -w "%{http_code}" -u "${COUCHDB_USER}:${COUCHDB_PASS}" "$db_url")

#   if [ "$status" = "404" ]; then
#     echo "🆕 Design document '${doc_name}' non trouvé. Création..."
#     curl -s -o /dev/null -w "%{http_code}" -X PUT "$db_url" -u "${COUCHDB_USER}:${COUCHDB_PASS}" -H "Content-Type: application/json" --data-binary "@${design_json_file}"
#     echo "✅ Design document '${doc_name}' créé."
#   else
#     echo "🔄 Design document '${doc_name}' trouvé. Mise à jour..."
#     rev=$(curl -s -u "${COUCHDB_USER}:${COUCHDB_PASS}" "$db_url" | jq -r '._rev')
#     tmp_updated_json="$(mktemp)"
#     jq --arg rev "$rev" '. + {"_rev": $rev}' "$design_json_file" > "$tmp_updated_json"
#     curl -s -o /dev/null -w "%{http_code}" -X PUT "$db_url" -u "${COUCHDB_USER}:${COUCHDB_PASS}" -H "Content-Type: application/json" --data-binary "@$tmp_updated_json"
#     echo "✅ Design document '${doc_name}' mis à jour."
#     rm "$tmp_updated_json"
#   fi
# }


upload_design_doc() {
  local doc_name="$1"
  local design_json_file="$2"
  local db_url="${COUCHDB_BASE_URL}/${COUCHDB_DB}/_design/${doc_name}"

  echo "📦 Vérification de l'existence du design document '${doc_name}'..."
  status=$(curl -s -o /dev/null -w "%{http_code}" -u "${COUCHDB_USER}:${COUCHDB_PASS}" "$db_url")

  if [ "$status" = "404" ]; then
    echo "🆕 Design document '${doc_name}' non trouvé. Création..."
    curl -s -o /dev/null -w "%{http_code}" -X PUT "$db_url" -u "${COUCHDB_USER}:${COUCHDB_PASS}" -H "Content-Type: application/json" --data-binary "@${design_json_file}"
    echo "✅ Design document '${doc_name}' créé."
  else
    echo "🔄 Design document '${doc_name}' trouvé. Mise à jour..."

    # Récupérer le _rev du document existant (extrait simple)
    rev=$(curl -s -u "${COUCHDB_USER}:${COUCHDB_PASS}" "$db_url" | grep -oP '"_rev"\s*:\s*"\K[^"]+')

    # Injecter _rev dans le JSON (remplacer la ligne _rev si existe, sinon l'ajouter)
    if grep -q '"_rev"' "$design_json_file"; then
      # Remplacer la ligne _rev existante
      sed -i "s/\"_rev\"\s*:\s*\"[^\"]*\"/\"_rev\":\"$rev\"/" "$design_json_file"
    else
      # Ajouter _rev après _id
      sed -i "/\"_id\"/a \  \"_rev\": \"$rev\"," "$design_json_file"
    fi

    curl -s -o /dev/null -w "%{http_code}" -X PUT "$db_url" -u "${COUCHDB_USER}:${COUCHDB_PASS}" -H "Content-Type: application/json" --data-binary "@${design_json_file}"
    echo "✅ Design document '${doc_name}' mis à jour."
  fi
}



# Fichier JSON temporaire
TMP_JSON=$(mktemp)

# -------------------------
# 1. Design: _design/filters
# -------------------------
cat <<EOF > "$TMP_JSON"
{
  "_id": "_design/filters",
  "language": "javascript",
  "filters": {
    "by_owner": "function (doc, req) { if (doc._deleted) return true; if (!doc.owner || !req.query.owner) return false; return doc.owner.toString() === req.query.owner.toString(); }"
  }
}
EOF

upload_design_doc "filters" "$TMP_JSON"


# -------------------------
# 2. Design: _design/map-client
# -------------------------
cat <<EOF > "$TMP_JSON"
{
  "_id": "_design/map-client",
  "language": "javascript",
  "views": {
    "by_owner": {
      "map": "function (doc) { if ((doc.type === 'chw-map' || doc.type === 'fs-map') && doc.owner) { emit(doc.owner, doc._id); } }"
    },
    "by_type": {
      "map": "function (doc) { if (doc.type === 'chw-map' || doc.type === 'fs-map') { emit(doc.type, doc._id); } }"
    },
    "by_type_and_parent": {
      "map": "function (doc) { if (doc.type === 'chw-map' && doc.healthCenterId) { emit([doc.type, doc.healthCenterId], doc._id); } }"
    },
    "by_type_and_parent_and_owner": {
      "map": "function (doc) { if (doc.type === 'chw-map' && doc.healthCenterId && doc.owner) { emit([doc.type, doc.healthCenterId, doc.owner], doc._id); } }"
    },
    "by_parent": {
      "map": "function (doc) { if (doc.type === 'chw-map' && doc.healthCenterId) { emit(doc.healthCenterId, doc._id); } }"
    },
    "by_type_and_owner": {
      "map": "function (doc) { if ((doc.type === 'chw-map' || doc.type === 'fs-map') && doc.owner) { emit([doc.type, doc.owner], doc._id); } }"
    },
    "by_parent_and_owner": {
      "map": "function (doc) { if (doc.type === 'chw-map' && doc.healthCenterId && doc.owner) { emit([doc.healthCenterId, doc.owner], doc._id); } }"
    },
    "by_no_distance": {
      "map": "function (doc) { if (doc.type === 'chw-map' && (!doc.distanceToFacility || doc.distanceToFacility === 0)) { emit(doc._id, doc.distanceToFacility); } }"
    },
    "last_doc": {
      "map": "function (doc) { if (doc.type && doc.createdAt) { emit([doc.type, doc.createdAt], doc); } }"
    }
  }
}
EOF

upload_design_doc "map-client" "$TMP_JSON"

rm -f "$TMP_JSON"



echo "🎉 Initialisation complète de CouchDB terminée."
