import { Component, OnInit, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { DbService } from '../../services/db.service';
import { ChwMap, OrgUnit } from '../../models/interfaces';
import Chart from 'chart.js/auto';

// import regionGeoJson from '../../../assets/data/regions.json';
// import { GeoJsonObject } from 'geojson';
import { formatDistance, notNull } from '../../shares/functions';
import { NgForm } from '@angular/forms';
import { UserContextService } from '@kossi-services/user-context.service';
import { NetworkService } from '@kossi-services/network.service';





@Component({
  standalone: false,
  selector: 'app-map-viewer',
  templateUrl: './map-viewer.component.html',
  styleUrls: ['./map-viewer.component.css'],
})
export class MapViewerComponent implements OnInit, AfterViewInit {
  private map!: L.Map;
  private ascCluster!: L.MarkerClusterGroup;
  private ascMarkers: L.Marker[] = [];
  public fsMarkers: L.Marker[] = [];
  private userMarker!: L.Marker;
  private lines: L.Polyline[] = [];
  private regionLayer!: L.GeoJSON;

  isLoading = false;
  displayedASCCount = 0;
  showASCValid = true;
  showASCInvalid = true;
  showFS = true;
  autoZoomEnabled = true;
  mapInitialized = false;

  distanceFilter = 20;
  searchText = '';

  chart: any;

  filterDate: any;

  regions$: string[] = [];
  selectedRegion: string = '';
  viewTogoOnly: boolean = true;

  worldViewAnimated = false;

  showFilterModal = false;
  showOrgUnitFilterModal = false;


  private boundsTogo: L.LatLngBoundsExpression = [[4.5, 0.3], [12, 1.5]];
  private boundsExtended: L.LatLngBoundsExpression = [[4.0, -1.5], [13.0, 3.0]];

  private boundsWestAfrica: L.LatLngBoundsExpression = [[2.5, -10.0], [10.5, 15.0]];

  viewWorld = false;
  private worldTileLayer!: L.TileLayer;
  private defaultTileLayer!: L.TileLayer;


  chws$: { id: string | undefined, name: string | undefined, village: string | undefined, fsName: string | undefined, lat: number | undefined, lng: number | undefined, valid: boolean, validityReason: string | undefined, fsLat?: number, fsLng?: number, distance?: string, distanceKm?: number, lastUpdated?: string }[] = [];
  HealthCenters$: { id: string | undefined, name: string | undefined, lat: number | undefined, lng: number | undefined }[] = [];

  showGlobe = false;

  chw: { country: string | undefined, region: string | undefined, district: string | undefined, commune: string | undefined, healthCenter: string | undefined };



  private get defaultChw() {
    return {
      country: undefined,
      region: undefined,
      district: undefined,
      commune: undefined,
      healthCenter: undefined,
    }
  }



  Countries: OrgUnit[] = [];
  Regions: OrgUnit[] = [];
  Districts: OrgUnit[] = [];
  Communes: OrgUnit[] = [];
  HealthCenters: OrgUnit[] = [];

  countries: OrgUnit[] = [];
  regions: OrgUnit[] = [];
  districts: OrgUnit[] = [];
  communes: OrgUnit[] = [];
  healthCenters: OrgUnit[] = [];

  isOnline: boolean = false;

  canvas: HTMLCanvasElement | null = null;


  constructor(private db: DbService, private network: NetworkService, private userCtx: UserContextService) {
    this.network.onlineChanges$.subscribe((online) => this.isOnline = online);

    this.chw = this.defaultChw;
    this.initializeComponent();
  }

  ngOnInit(): void { }

  async ngAfterViewInit(): Promise<void> {
    this.canvas = document.getElementById('ascChart') as any;
    await this.initMap();
    this.zoomToFitAll();
  }


  /** ✅ Couche OSM normale (requiert Internet) */
  private initMapWithOSMLayer(): void {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      // attribution: '<i class="fas fa-map-marker-alt"></i> <strong>My Custom Map</strong>',
      // maxZoom: 19,
      errorTileUrl: '/assets/offline-tile-0.png', // si la tuile échoue
    }).addTo(this.map);

    // 🗺️ Carte alternative sombre (facultatif)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      // attribution: '&copy; CARTO',
      errorTileUrl: '/assets/offline-tile-0.png',
    });
  }

  /** ✅ Couche hors-ligne : fond gris ou image locale */
  private initMapWithOfflineTileLayer(): void {
    L.tileLayer('/assets/img/offline-tile-0.png', {
      tileSize: 256,
      attribution: 'Vous êtes en mode hors-ligne',
    }).addTo(this.map);
  }



  private async initMap(): Promise<void> {
    // 🧼 Supprimer les URLs d'icônes par défaut de Leaflet
    delete (L.Icon.Default.prototype as any)._getIconUrl;

    // 🎯 Définir une icône par défaut personnalisée AVANT toute création de marker
    L.Icon.Default.mergeOptions({
      iconUrl: 'assets/logo/ih.png',
      iconRetinaUrl: 'assets/logo/ih.png',
      shadowUrl: '', // ou null selon si tu veux une ombre
    });

    // 🗺️ Initialiser la carte AVANT d’ajouter des contrôles
    this.map = L.map('map', {
      attributionControl: false, // on désactive l'attribution par défaut
      zoomControl: false,
      maxBounds: [[4.0, -1.5], [13.0, 3.0]], // Togo + frontières
      maxBoundsViscosity: 1.0
    }).setView([8.5, 1.2], 7); // Centré sur le Togo

    if (this.isOnline) {
      this.initMapWithOSMLayer();
      this.initAfterMapInit();
    } else {
      this.initMapWithOfflineTileLayer();
      this.initAfterMapInit();
    }

  }

  async initAfterMapInit() {

    // ➕ Contrôle de zoom (en haut à droite)
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // ➕ Attribution Leaflet sans le lien "Leaflet"
    L.control.attribution({ position: 'bottomright' }).addTo(this.map).setPrefix(false);

    // ✅ Contrôle personnalisé avec logo et nom
    const CustomAttribution = L.Control.extend({
      onAdd(map: L.Map) {
        const div = L.DomUtil.create('div', 'custom-attribution');
        div.innerHTML = `
          <img src="assets/logo/ih.png" style="height: 20px; vertical-align: middle; margin-right: 6px;">
          <a style="text-decoration: none;font-weight: bold;" href="https://integratehealth.org/">Santé Intégrée</a>
        `;
        return div;
      },
      onRemove(map: L.Map) {
        // Rien à faire ici pour le moment
      }
    });
    const attributionControl = new CustomAttribution({ position: 'bottomright' });
    attributionControl.addTo(this.map);

    // ➕ Regroupement de marqueurs
    this.ascCluster = L.markerClusterGroup();
    this.map.addLayer(this.ascCluster);

    // 📍 Chargement des données dynamiques
    this.locateUser();
    this.loadGeoZones();

    this.isLoading = true;
    await this.loadMapsData();
    await this.loadFSMarkers();
    await this.refreshASCMarkers();
    this.isLoading = false;
    this.mapInitialized = true;
  }


  loadGeoZones(): void {
    // this.regionLayer = L.geoJSON(regionGeoJson as GeoJsonObject, {
    //   style: () => ({ color: '#888', weight: 1, fillOpacity: 0.05 }),
    //   onEachFeature: (feature, layer) => {
    //     layer.bindPopup(`<strong>Zone:</strong> ${feature.properties.nom}`);
    //   }
    // });
    // this.regionLayer.addTo(this.map);
    // this.regions$ = regionGeoJson.features.map(f => f.properties.nom).sort();

  }
  zoomToRegion(name: string): void {
    // const feature = regionGeoJson.features.find(f => f.properties.nom === name);
    // if (feature) {
    //   const bounds = L.geoJSON(feature as any).getBounds();
    //   this.map.fitBounds(bounds.pad(0.2));
    // }
  }

  updateMapBounds(): void {
    const bounds = this.viewTogoOnly ? this.boundsTogo : this.boundsWestAfrica;//this.boundsExtended;
    this.map.setMaxBounds(bounds);
    this.map.fitBounds(bounds);
  }

  applyFilters(): void {
    this.showFilterModal = false;
    this.showOrgUnitFilterModal = false;
    this.loadFSMarkers();
    this.zoomToFitAll();
    this.refreshASCMarkers();
  }


  async resetFilters(): Promise<void> {
    this.showASCValid = true;
    this.showASCInvalid = true;
    this.showFS = true;
    this.viewTogoOnly = true;
    this.showFilterModal = false;
    this.showOrgUnitFilterModal = false;

    await this.loadMapsData()

    this.updateMapBounds();
    this.zoomToFitAll();
    this.applyFilters();
  }



  toggleWorldView(): void {
    if (this.viewWorld) {
      this.map.removeLayer(this.defaultTileLayer);
      this.worldTileLayer.addTo(this.map);

      this.map.setMaxBounds(null as any);
      this.map.flyTo([20, 0], 2, { animate: true, duration: 3, easeLinearity: 0.25 });

      // Ajout d'une animation visuelle
      this.worldViewAnimated = true;
      this.showGlobe = true;
      setTimeout(() => {
        this.worldViewAnimated = false;
        this.showGlobe = false;
      }, 2000);
    } else {
      this.map.removeLayer(this.worldTileLayer);
      this.defaultTileLayer.addTo(this.map);
      this.updateMapBounds();
    }
  }



  locateUser(): void {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          this.map.setView([latitude, longitude], 13);

          const userIcon = L.icon({
            iconUrl: 'assets/img/user-marker.png',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
          });

          if (this.userMarker) {
            this.map.removeLayer(this.userMarker);
          }

          this.userMarker = L.marker([latitude, longitude], { icon: userIcon })
            .addTo(this.map)
            // .bindPopup('📍 Vous êtes ici')
            .openPopup();
        },
        (error) => console.warn('Géolocalisation échouée:', error.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }


  async loadMapsData(healthCenterId: string | undefined = undefined) {
    let ascList;
    this.chws$ = [];
    this.HealthCenters$ = [];
    if (healthCenterId) {
      ascList = await this.db.getChwsByFsId(healthCenterId);
    } else {
      ascList = await this.db.getAllDocs('chw') as ChwMap[];
    }
    const fsSet = new Set<string>();

    for (const asc of ascList) {
      const fsLat = asc.healthCenter.location?.lat;
      const fsLng = asc.healthCenter.location?.lng;
      const lat = asc.location?.lat;
      const lng = asc.location?.lng;

      const distance = formatDistance(asc.distanceToFacility)

      const isValid = !!distance.kilometers && distance.kilometers < 5;

      this.chws$.push({
        id: asc._id,
        name: asc.chwFullName,
        village: asc.village.names[0],
        fsName: asc.healthCenter.name,
        lat,
        lng,
        fsLat,
        fsLng,
        valid: isValid, //asc.validity.valid,
        validityReason: isValid ? '✅ Moins de 5 km' : '❌ Distance > 5 km',//asc.validity.reason,
        distance: distance.readable,
        distanceKm: distance.kilometers,
        lastUpdated: asc.updatedAt
      });

      if (asc.healthCenter.id && !fsSet.has(asc.healthCenter.id)) {
        fsSet.add(asc.healthCenter.id);
        this.HealthCenters$.push({
          id: asc.healthCenter.id,
          name: asc.healthCenter.name,
          lat: fsLat,
          lng: fsLng
        });
      }
    }
  }


  deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async refreshASCMarkers(): Promise<void> {
    this.ascCluster.clearLayers();
    this.ascMarkers = [];
    this.lines.forEach(line => this.map.removeLayer(line));
    this.lines = [];

    const filtered = this.chws$.filter(asc =>
      ((asc?.valid && this.showASCValid) || (!asc?.valid && this.showASCInvalid))

      // && (asc.distanceKm ?? 999) <= this.distanceFilter
      // && (
      //       this.searchText.trim() === '' ||
      //       (asc.name?.toLowerCase().includes(this.searchText.toLowerCase())) ||
      //       (asc.fsName?.toLowerCase().includes(this.searchText.toLowerCase()))
      //     ) 
      // && (!this.filterDate || new Date(asc.lastUpdated || '') >= this.filterDate)
    );

    this.displayedASCCount = filtered.length;

    const latlngs: L.LatLng[] = [];

    filtered.forEach(asc => {
      if (asc?.lat && asc?.lng) {

        const style = `style="color:${(asc.distanceKm ?? 0) > 5 ? 'red' : 'green'} ;"`
        const marker = L.marker([asc.lat, asc.lng], {
          icon: L.icon({
            iconUrl: asc.valid ? 'assets/img/yellow-marker.png' : 'assets/img/red-marker.png',
            iconSize: asc.valid ? [50, 50] : [30, 30],
            iconAnchor: [14, 28],
          })
        })
          // Statut: ${asc?.valid ? '✅ Valide' : '❌ Invalide'}<br>
          // 🔗 <a href="/asc/${asc.id}" target="_blank">Voir profil</a><br>
          // 📋 <a href="/rapports?asc=${asc.id}">Rapports</a>
          // 📍 📏 
          .bindPopup(`
          <div style="font-size:14px">
            <strong>ASC: ${asc.name}</strong><br>
            <strong>Village: </strong> ${asc.village}<br>
            <strong>FS:</strong> ${asc.fsName}<br>
            <strong>Distance: <span ${style}>${asc.distance}</span></strong>
          </div>
        `);
        // <br> ${asc?.validityReason || ''}<br>

        this.ascCluster.addLayer(marker);
        this.ascMarkers.push(marker);
        latlngs.push(marker.getLatLng());

        if (asc.fsLat && asc.fsLng) {
          const line = L.polyline([
            [asc.lat, asc.lng],
            [asc.fsLat, asc.fsLng]
          ], { color: 'blue', weight: 1, dashArray: '4,6' });
          line.addTo(this.map);
          this.lines.push(line);
        }
      }
    });

    if (this.autoZoomEnabled && latlngs.length) {
      const bounds = L.latLngBounds(latlngs);
      this.map.fitBounds(bounds.pad(0.1));
    }

    this.updateStatsChart(filtered);
  }

  updateStatsChart(data: any[]): void {

    if (!this.canvas) {
      console.warn('[Chart] Canvas element with ID "ascChart" not found.');
      return;
    }

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      console.warn('[Chart] Unable to get 2D context from canvas.');
      return;
    }

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    if (data.length === 0) {
      console.log('[Chart] No data available to display.');
      return;
    }

    const validCount = data.filter(d => d.valid).length;
    const invalidCount = data.filter(d => !d.valid).length;

    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Valides', 'Invalides'],
        datasets: [{
          data: [validCount, invalidCount],
          backgroundColor: ['#4CAF50', '#FF9800'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: (tooltipItem) => {
                const label = tooltipItem.label || '';
                const value = tooltipItem.raw as number;
                return `${label}: ${value}`;
              }
            }
          }
        }
      }
    });
  }





  exportVisiblePointsCSV(): void {
    const rows = this.chws$.filter(asc => {
      return ((asc?.valid && this.showASCValid) || (!asc?.valid && this.showASCInvalid)) && (asc.distanceKm ?? 999) <= this.distanceFilter
    }).map(asc => ({
      id: asc.id,
      name: asc.name,
      fsName: asc.fsName,
      distance: asc.distance,
      distanceKm: asc.distanceKm?.toFixed(2),
      valid: asc.valid ? 'Oui' : 'Non'
    }));

    const csv = [
      ['ID', 'Nom ASC', 'FS', 'Distance', 'Valide'],
      ...rows.map(r => [r.id, r.name, r.fsName, r.distance, r.valid])
    ]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asc_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  exportVisiblePointsGeoJSON(): void {
    const features = this.chws$.filter(asc =>
      ((asc?.valid && this.showASCValid) || (!asc?.valid && this.showASCInvalid)) &&
      (asc.distanceKm ?? 999) <= this.distanceFilter &&
      (
        this.searchText.trim() === '' ||
        (asc.name?.toLowerCase().includes(this.searchText.toLowerCase())) ||
        (asc.fsName?.toLowerCase().includes(this.searchText.toLowerCase()))
      )
    ).map(asc => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [asc.lng, asc.lat]
      },
      properties: {
        id: asc.id,
        name: asc.name,
        fsName: asc.fsName,
        distanceKm: asc.distanceKm,
        valid: asc.valid
      }
    }));

    const geojson = {
      type: 'FeatureCollection',
      features
    };

    const blob = new Blob([JSON.stringify(geojson)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asc_export_${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    window.URL.revokeObjectURL(url);
  }



  async loadFSMarkers(): Promise<void> {
    this.fsMarkers.forEach(m => this.map.removeLayer(m));
    this.fsMarkers = [];

    if (!this.showFS) return;

    this.HealthCenters$.forEach(fs => {
      if (fs?.lat && fs?.lng) {
        const marker = L.marker([fs.lat, fs.lng], {
          icon: L.icon({
            iconUrl: 'assets/img/health-center.png',
            iconSize: [30, 30],
            iconAnchor: [14, 28],
          })
        }).bindPopup(`
          <strong>FS:</strong> ${fs.name}<br>
            <strong>ID:</strong> ${fs.id}<br>`
        );

        marker.addTo(this.map);
        this.fsMarkers.push(marker);
      }
    });
  }

  async toggleFSMarkers(): Promise<void> {
    if (this.showFS) {
      await this.loadFSMarkers();
    } else {
      this.fsMarkers.forEach(m => this.map.removeLayer(m));
      this.fsMarkers = [];
    }
  }

  zoomToFitAll(): void {
    const bounds = new L.LatLngBounds([]);
    this.ascMarkers.forEach(m => bounds.extend(m.getLatLng()));
    this.fsMarkers.forEach(m => bounds.extend(m.getLatLng()));
    if (this.userMarker) bounds.extend(this.userMarker.getLatLng());
    if (bounds.isValid()) this.map.fitBounds(bounds.pad(0.05));
  }

  clearMap(): void {
    this.ascCluster.clearLayers();
    this.fsMarkers.forEach(m => this.map.removeLayer(m));
    this.fsMarkers = [];
    this.lines.forEach(l => this.map.removeLayer(l));
    this.lines = [];
    if (this.userMarker) this.map.removeLayer(this.userMarker);
    if (this.regionLayer) this.map.removeLayer(this.regionLayer);
  }

  exportVisiblePoints(): void {
    const visibleASC = this.ascMarkers.map(m => m.getLatLng());
    const visibleFS = this.fsMarkers.map(m => m.getLatLng());
    const user = this.userMarker?.getLatLng();
    console.log('Export ASC:', visibleASC);
    console.log('Export FS:', visibleFS);
    console.log('Export User:', user);
    // Exportation avancée possible ici (GeoJSON, CSV, etc.)
  }







  // ORG UNIT ELEMENTS

  private initializeComponent() {
    const user = this.userCtx.user;
    if (!(this.Countries.length > 0)) this.Countries = user?.orgUnits.Countries ?? [];
    if (!(this.Regions.length > 0)) this.Regions = user?.orgUnits.Regions ?? [];
    if (!(this.Districts.length > 0)) this.Districts = user?.orgUnits.Districts ?? [];
    if (!(this.Communes.length > 0)) this.Communes = user?.orgUnits.Communes ?? [];
    if (!(this.HealthCenters.length > 0)) this.HealthCenters = user?.orgUnits.HealthCenters ?? [];
    this.countriesGenerate();
  }



  countriesGenerate() {
    this.setOrgUnitsValues({ country: true, region: true, district: true, commune: true, hospital: true });
    this.countries = this.Countries;
    this.chw.country = this.countries.length == 1 ? this.countries[0].id : undefined;
    this.regionsGenerate(this.chw.country);
  }

  regionsGenerate(countryId: string | undefined) {
    this.setOrgUnitsValues({ region: true, district: true, commune: true, hospital: true });
    if (notNull(countryId) && this.Regions.length > 0) {
      if (this.Countries.length > 0) {
        this.regions = this.Regions.filter(r => r.parent.id === countryId);
      } else {
        this.regions = this.Regions;
      }
      this.chw.region = this.regions.length == 1 ? this.regions[0].id : undefined;
    } else {
      this.regions = [];
      this.chw.region = undefined;
    }
    this.districtsGenerate(this.chw.region);
  }

  districtsGenerate(regionId: string | undefined) {
    this.setOrgUnitsValues({ district: true, commune: true, hospital: true });

    if (notNull(regionId) && this.Districts.length > 0) {
      if (this.Regions.length > 0) {
        this.districts = this.Districts.filter(d => d.parent.id === regionId);
      } else {
        this.districts = this.Districts;
      }
      this.chw.district = this.districts.length == 1 ? this.districts[0].id : undefined;
    } else {
      this.districts = [];
      this.chw.district = undefined;
    }
    this.communesGenerate(this.chw.district);
  }

  communesGenerate(districtId: string | undefined) {
    this.setOrgUnitsValues({ commune: true, hospital: true });

    if (notNull(districtId) && this.Communes.length > 0) {
      if (this.Districts.length > 0) {
        this.communes = this.Communes.filter(c => c.parent.id === districtId);
      } else {
        this.communes = this.Communes;
      }
      this.chw.commune = this.communes.length == 1 ? this.communes[0].id : undefined;
    } else {
      this.communes = [];
      this.chw.commune = undefined;
    }
    this.hospitalsGenerate(this.chw.commune);
  }

  hospitalsGenerate(communeId: string | undefined) {
    this.setOrgUnitsValues({ hospital: true });

    if (notNull(communeId) && this.HealthCenters.length > 0) {
      if (this.Communes.length > 0) {
        this.healthCenters = this.HealthCenters.filter(h => h.parent.id === communeId);
      } else {
        this.healthCenters = this.HealthCenters;
      }
      this.chw.healthCenter = this.communes.length == 1 ? this.communes[0].id : undefined;
    } else {
      this.healthCenters = [];
      this.chw.healthCenter = undefined;
    }
  }


  private setOrgUnitsValues(dt: { country?: boolean, region?: boolean, district?: boolean, commune?: boolean, hospital?: boolean }) {
    if (dt.country === true) {
      this.countries = [];
      this.chw.country = undefined;
    }
    if (dt.region === true) {
      this.regions = [];
      this.chw.region = undefined;
    }
    if (dt.district === true) {
      this.districts = [];
      this.chw.district = undefined;
    }
    if (dt.commune === true) {
      this.communes = [];
      this.chw.commune = undefined;
    }
    if (dt.hospital === true) {
      this.healthCenters = [];
      this.chw.healthCenter = undefined;
    }

  }




  async makeOrgUnitMapFilter(form: NgForm) {
    const { healthCenter } = this.chw;

    if (form.invalid || !notNull(healthCenter)) {
      alert('Veuillez remplir tous les champs requis.');
      return;
    }

    // const healthCenterObj = this.healthCenters.find(h => h.id === healthCenter);

    await this.loadMapsData(healthCenter)
    // this.updateMapBounds();
    this.applyFilters();
    this.zoomToFitAll();

    form.resetForm();
    this.chw = this.defaultChw;
    this.countriesGenerate();
    return;

  }



}
