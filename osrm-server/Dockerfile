# Étape 1 : téléchargement et préparation des données
FROM osrm/osrm-backend AS osrm-builder

WORKDIR /data

# Télécharger la carte (modifiez selon vos besoins)
RUN apt-get update && apt-get install -y wget \
  && wget https://download.geofabrik.de/africa/benin-latest.osm.pbf \
  && osrm-extract -p /opt/car.lua benin-latest.osm.pbf \
  && osrm-partition benin-latest.osrm \
  && osrm-customize benin-latest.osrm

# Étape 2 : image finale avec serveur OSRM
FROM osrm/osrm-backend

WORKDIR /data

# Copier les fichiers préparés depuis l'étape précédente
COPY --from=osrm-builder /data /data

# Exposer le port OSRM
EXPOSE 5000

# Lancer le serveur avec le profil MLD
CMD ["osrm-routed", "--algorithm", "mld", "/data/benin-latest.osrm"]



# docker build -t osrm-benin .
# docker run -p 5000:5000 osrm-benin

# curl "http://localhost:5000/route/v1/driving/2.4305,6.3673;2.6080,6.5001?overview=false"
