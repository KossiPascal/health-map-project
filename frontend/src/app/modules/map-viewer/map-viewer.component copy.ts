// import { Component, OnInit, AfterViewInit } from '@angular/core';
// import * as L from 'leaflet';
// import 'leaflet.markercluster';
// import { ApiService } from '../../services/api.service';
// import { DbService } from '../../services/db.service';
// import { ChwMap, HealthCenterMap } from '../../models/interfaces';

// @Component({
//   standalone: false,
//   selector: 'app-map-viewer',
//   templateUrl: './map-viewer.component.html',
//   styleUrls: ['./map-viewer.component.css'],
// })
// export class MapViewerComponent implements OnInit, AfterViewInit {
//   private map!: L.Map;
//   private ascCluster!: L.MarkerClusterGroup;
//   // private ascMarkers: L.CircleMarker[] = [];
//   private ascMarkers: L.Marker[] = [];
//   fsMarkers: L.Marker[] = [];
//   private userMarker!: L.Marker;

//   isLoading = false;
//   displayedASCCount = 0;
//   showASCValid = true;
//   showASCInvalid = true;
//   showFS = true;
//   autoZoomEnabled = true;
//   mapInitialized = false;

//   chws: { id: string | undefined, name: string | undefined, fsName: string | undefined, lat: number | undefined, lng: number | undefined, valid: boolean, validityReason: string | undefined }[] = []

//   HealthCenters: { id: string | undefined, name: string | undefined, lat: number | undefined, lng: number | undefined }[] = []

//   constructor(private db: DbService) { }

//   ngOnInit(): void { }

//   ngAfterViewInit(): void {
//     this.initMap();
//   }

//   private async initMap(): Promise<void> {
//     this.map = L.map('map', {
//       zoomControl: false,
//       maxBounds: [[5.5, -0.3], [11, 2.5]], // Limiter à la zone du Togo
//       maxBoundsViscosity: 1.0 // Empêche de sortir de la zone
//     }).setView([8.6, 1.2], 8); // Centrer sur le Togo

//     L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
//       attribution: '&copy; OpenStreetMap contributors',
//     }).addTo(this.map);

//     L.control.zoom({ position: 'topright' }).addTo(this.map);

//     this.ascCluster = L.markerClusterGroup();
//     this.map.addLayer(this.ascCluster);

//     this.locateUser();

//     this.isLoading = true;
//     await this.loadMapsData();
//     await this.loadFSMarkers();
//     await this.refreshASCMarkers();
//     this.isLoading = false;
//     this.mapInitialized = true;
//   }




//   locateUser(): void {
//     if (navigator.geolocation) {
//       navigator.geolocation.getCurrentPosition(
//         (position) => {
//           const { latitude, longitude } = position.coords;
//           this.map.setView([latitude, longitude], 13);

//           const userIcon = L.icon({
//             iconUrl: 'assets/img/user-marker.png',
//             iconSize: [28, 28],
//             iconAnchor: [14, 28],
//           });

//           if (this.userMarker) {
//             this.map.removeLayer(this.userMarker);
//           }

//           this.userMarker = L.marker([latitude, longitude], { icon: userIcon })
//             .addTo(this.map)
//             .bindPopup('📍 Vous êtes ici')
//             .openPopup();
//         },
//         (error) => console.warn('Géolocalisation échouée:', error.message),
//         { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
//       );
//     }
//   }

//   async loadMapsData() {
//     const ascList = await this.db.getAllDocs('chw') as ChwMap[];
//     for (const asc of ascList) {
//       this.chws.push({ id: asc._id, name: asc.chwFullName, fsName:asc.healthCenterName, lat: asc.location.lat, lng: asc.location.lng, valid: asc.validity.valid, validityReason: asc.validity.reason });
//       this.HealthCenters.push({ id: asc.healthCenterId, name: asc.healthCenterName, lat: asc.fsLocation.lat, lng: asc.fsLocation.lng });
//     }
//   }

//   async refreshASCMarkers(): Promise<void> {
//     this.ascCluster.clearLayers();
//     this.ascMarkers = [];

//     const filtered = this.chws.filter(asc =>
//       (asc?.valid && this.showASCValid) ||
//       (!asc?.valid && this.showASCInvalid)
//     );

//     this.displayedASCCount = filtered.length;

//     const latlngs: L.LatLng[] = [];

//     filtered.forEach(asc => {
//       if (asc?.lat && asc?.lng) {
//         // const color = asc.valid ? 'green' : 'red';
//         // const marker = L.circleMarker([asc.lat, asc.lng], {
//         //   radius: 6,
//         //   color,
//         //   fillColor: color,
//         //   fillOpacity: 0.7,
//         //   className: 'asc-marker',
//         // })
        
//         const marker = L.marker([asc.lat, asc.lng], {
//           icon: L.icon({
//             iconUrl: !asc.valid ? 'assets/img/yellow-marker.png' : 'assets/img/red-marker.png',
//             iconSize: [38, 28],
//             iconAnchor: [14, 28],
//           })
//         }).bindPopup(`
//           <strong>${asc.name}</strong><br>
//           FS: ${asc.fsName}<br>
//           Statut: ${asc?.valid ? '✅ Valide' : '❌ Invalide'}<br>
//           ${asc?.validityReason || ''}
//         `);

//         // marker.on('click', () => {
//         //   marker.setStyle({ color: 'blue', weight: 3 });
//         //   setTimeout(() => marker.setStyle({ color, weight: 1 }), 1500);
//         // });

//         this.ascCluster.addLayer(marker);
//         this.ascMarkers.push(marker);
//         latlngs.push(marker.getLatLng());
//       }
//     });

//     if (this.autoZoomEnabled && latlngs.length) {
//       const bounds = L.latLngBounds(latlngs);
//       this.map.fitBounds(bounds.pad(0.1));
//     }
//   }

//   async loadFSMarkers(): Promise<void> {
//     this.fsMarkers.forEach(m => this.map.removeLayer(m));
//     this.fsMarkers = [];

//     if (!this.showFS) return;

//       this.HealthCenters.forEach(fs => {
//       if (fs?.lat && fs?.lng) {
//         const marker = L.marker([fs.lat, fs.lng], {
//           icon: L.icon({
//             iconUrl: 'assets/img/green-marker.jpg',
//             iconSize: [28, 28],
//             iconAnchor: [14, 28],
//           })
//         }).bindPopup(`<strong>FS:</strong> ${fs.name}`);

//         marker.addTo(this.map);
//         this.fsMarkers.push(marker);
//       }
//     });
//   }

//   async toggleFSMarkers(): Promise<void> {
//     if (this.showFS) {
//       await this.loadFSMarkers();
//     } else {
//       this.fsMarkers.forEach(m => this.map.removeLayer(m));
//       this.fsMarkers = [];
//     }
//   }

//   zoomToFitAll(): void {
//     const bounds = new L.LatLngBounds([]);
//     this.ascMarkers.forEach(m => bounds.extend(m.getLatLng()));
//     this.fsMarkers.forEach(m => bounds.extend(m.getLatLng()));
//     if (this.userMarker) bounds.extend(this.userMarker.getLatLng());
//     if (bounds.isValid()) this.map.fitBounds(bounds.pad(0.1));
//   }

//   clearMap(): void {
//     this.ascCluster.clearLayers();
//     this.fsMarkers.forEach(m => this.map.removeLayer(m));
//     this.fsMarkers = [];
//     if (this.userMarker) this.map.removeLayer(this.userMarker);
//   }

//   exportVisiblePoints(): void {
//     const visibleASC = this.ascMarkers.map(m => m.getLatLng());
//     const visibleFS = this.fsMarkers.map(m => m.getLatLng());
//     const user = this.userMarker?.getLatLng();
//     console.log('Export ASC:', visibleASC);
//     console.log('Export FS:', visibleFS);
//     console.log('Export User:', user);
//     // Exportation avancée possible ici (GeoJSON, CSV, etc.)
//   }
// }