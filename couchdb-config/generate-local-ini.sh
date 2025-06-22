#!/bin/bash
set -e

echo "🛠️ Génération du fichier local.ini depuis les variables d'environnement..."

OUTPUT_PATH="/output/custom.ini"
SUCCESS_FILE="/output/init-success"

# Nettoyage sécurisé
[ -f "$OUTPUT_PATH" ] && rm -f "$OUTPUT_PATH"
[ -f "$SUCCESS_FILE" ] && rm -f "$SUCCESS_FILE"

# Variables avec valeurs par défaut
COUCHDB_PORT="${COUCHDB_PORT:?❌ COUCHDB_PORT doit être défini}"
COUCHDB_BIND="${COUCHDB_BIND:-127.0.0.1}"
COUCHDB_LOG_LEVEL="${COUCHDB_LOG_LEVEL:-info}"
COUCHDB_TIMEOUT="${COUCHDB_TIMEOUT:-15552000}"
COUCHDB_USER="${COUCHDB_USER:-admin}"
COUCHDB_PASSWORD="${COUCHDB_PASS:?❌ COUCHDB_PASS doit être défini}"
COUCHDB_CORS_ORIGINS="${COUCHDB_CORS_ORIGINS:-*}"

COUCHDB_MEMBER_USER="${COUCHDB_MEMBER_USER}"
COUCHDB_MEMBER_PASS="${COUCHDB_MEMBER_PASS}"


mkdir -p "$(dirname "$OUTPUT_PATH")"


cat <<EOF > "$OUTPUT_PATH"
; ========================
; 🚀 Configuration CouchDB
; ========================

[log]
level = ${COUCHDB_LOG_LEVEL}               ; Niveau de log : debug | info | warning | error

; ================
; 🌐 Interface HTTP
; ================

[chttpd]
port = ${COUCHDB_PORT}                     ; Port exposé dans CouchDB
bind_address = ${COUCHDB_BIND}             ; Écoute en bind_address
; bind_address = 0.0.0.0                   ; Écoute toutes les interfaces réseau
; bind_address = 127.0.0.1                 ; facultatif car par défaut


[httpd]
enable_cors = true
authentication_handlers = {couch_httpd_auth, cookie_authentication_handler, default_authentication_handler}
; ou ajoute proxy_authentication_handler si utilisé dans ton proxy Express
; authentication_handlers = {couch_httpd_auth, proxy_authentication_handler}, {couch_httpd_auth, cookie_authentication_handler}, {couch_httpd_auth, default_authentication_handler}


; ======================
; 🔐 Authentification
; ======================

[couch_httpd_auth]
timeout = ${COUCHDB_TIMEOUT}               ; 180 jours en secondes
require_valid_user = true
allow_persistent_cookies = true

; ===================
; 🌍 CORS (Cross-Origin)
; ===================

[cors]
credentials = true
origins = ${COUCHDB_CORS_ORIGINS}
methods = GET, PUT, POST, HEAD, DELETE, OPTIONS
headers = accept, authorization, content-type, origin, referer, x-csrf-token

; ======================
; 👤 Admins (si nécessaire)
; ======================

; [admins]
; ${COUCHDB_USER} = ${COUCHDB_PASSWORD}  ; ⚠️ sera remplacé au démarrage par COUCHDB_USER / COUCHDB_PASSWORD (si variables présentes)


; [users]
; ${COUCHDB_MEMBER_USER} = ${COUCHDB_MEMBER_PASS} 



EOF


echo "✅ Fichier local.ini généré avec succès à : $OUTPUT_PATH"


# Crée le fichier témoin de succès
touch "$SUCCESS_FILE"
