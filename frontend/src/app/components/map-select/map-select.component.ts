import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { DeviceService } from '@kossi-services/device.service';
import { GeolocationService } from '@kossi-services/geolocation.service';
import { NetworkService } from '@kossi-services/network.service';
import * as L from 'leaflet';
import 'leaflet-gpx';


@Component({
  standalone: false,
  selector: 'app-map-select',
  templateUrl: './map-select.component.html',
  styleUrls: ['./map-select.component.css'],
})
export class MapSelectComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @Input() zoom = 8;
  @Input() changed: any;
  @Input() isValidFsLatLng: boolean = false;
  @Input() healthCenterId: string | undefined;


  @Output() positionSelected = new EventEmitter<{
    lat: number | undefined;
    lng: number | undefined;
    altitude: number | undefined;
    accuracy: number | undefined;
  }>();

  map!: L.Map;
  marker: L.Marker | undefined;
  currentTileLayer?: L.TileLayer;

  lat: number | undefined;
  lng: number | undefined;
  altitude: number | undefined;
  accuracy: number | undefined;

  isMobile = false;

  private hasSetInitialView = false;
  private resizeListener = () => this.detectMobileScreen();

  isPositionLoading: boolean = false;

  readonly tileLayers: Record<string, string> = {
    streets: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    terrain: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    humanitarian: 'https://tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
  };

  isOnline: boolean = false;

  constructor(private device: DeviceService, private network: NetworkService, private geo: GeolocationService) {
    this.network.onlineChanges$.subscribe((online) => this.isOnline = online);
  }


  get isMobileDevice() {
    return this.device.isMobileDevice;
  }

  ngOnInit(): void {
    this.detectMobileScreen();
    window.addEventListener('resize', this.resizeListener);
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.setInitialView();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeListener);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['changed'] && this.changed)) {
      this.lat = undefined;
      this.lng = undefined;
      this.altitude = undefined;
      this.accuracy = undefined;
    }
  }

  private detectMobileScreen(): void {
    const width = window.innerWidth;
    const userAgent = navigator.userAgent;
    this.isMobile = width <= 768 || /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  }

  private initMap(): void {
    this.map = L.map('map-select', {
      zoomControl: true,
      attributionControl: false,
    }).setView([0, 0], this.zoom);

    this.changeBasemap('streets');

    // this.map.on('click', (e: L.LeafletMouseEvent) => {
    //   this.setPosition(e.latlng);
    // });
    this.map.on('click', this.onMapClick.bind(this));
  }

  onMapClick(e: L.LeafletMouseEvent): void {
    const latlng = e.latlng;
    this.setPosition(latlng, undefined, undefined);
    this.map.flyTo(latlng, this.zoom);
  }

  changeBasemap(style: string): void {
    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
    }
    if (this.isOnline) {
      const url = this.tileLayers[style] || this.tileLayers['streets'];
      this.currentTileLayer = L.tileLayer(url, {
        errorTileUrl: '/assets/offline-tile-0.png',
        maxZoom: 19,
      }).addTo(this.map);
    } else {
      this.currentTileLayer = L.tileLayer('/assets/img/offline-tile-0.png', {
        tileSize: 256,
        attribution: 'Vous êtes en mode hors-ligne',
      }).addTo(this.map);
    }
  }

  private async setInitialView(): Promise<void> {
    if (this.hasSetInitialView) return;

    this.hasSetInitialView = true;

    const pos = await this.geo.getCurrentPosition(false);
    if (pos) {
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      // this.setPosition(latlng, pos.coords.accuracy, pos.coords.altitude??undefined);
      this.map.flyTo(latlng, this.zoom);
    }
  }

  private setPosition(latlng: L.LatLng, accuracy?: number, altitude?: number): void {
    // if (this.marker) this.map.removeLayer(this.marker);
    this.lat = +latlng.lat.toFixed(6);
    this.lng = +latlng.lng.toFixed(6);
    this.accuracy = accuracy ? +accuracy.toFixed(1) : undefined;
    this.altitude = altitude ? +altitude.toFixed(1) : undefined;

    const userIcon = L.icon({
      iconUrl: 'assets/img/user-marker.png',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });

    if (!this.marker) {
      this.marker = L.marker(latlng, { draggable: true, icon: userIcon })
        .addTo(this.map)
        .bindPopup(`📍 Position définie${accuracy ? ` (±${Math.round(accuracy)}m)` : ''}${altitude ? `, altitude: ${Math.round(altitude)}m` : ''}`)
        .openPopup();
      this.marker.on('dragend', () => {
        const newPos = this.marker!.getLatLng();
        this.setPosition(newPos);
      });
    } else {
      this.marker.setLatLng(latlng);
    }
    this.emitPosition();
  }

  clearPosition(): void {
    this.lat = this.lng = this.accuracy = this.altitude = undefined;
    this.emitPosition();
    if (this.marker) {
      this.map.removeLayer(this.marker);
      this.marker = undefined;
    }
  }

  onManualInput(): void {
    if (
      this.lat == null ||
      this.lng == null ||
      this.lat < -90 ||
      this.lat > 90 ||
      this.lng < -180 ||
      this.lng > 180
    ) {
      return;
    }
    const latlng = L.latLng(this.lat, this.lng);
    this.setPosition(latlng);
    this.map.panTo(latlng);
  }

  async searchLocation(query: string): Promise<void> {
    if (!query.trim() || !this.isOnline) return;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data?.length) {
        const latlng = L.latLng(parseFloat(data[0].lat), parseFloat(data[0].lon));
        this.setPosition(latlng);
        this.map.flyTo(latlng, this.zoom);
      } else {
        alert('Aucun résultat trouvé.');
      }
    } catch (err) {
      console.error('Erreur lors de la recherche :', err);
    }
  }

  async useCurrentPosition(): Promise<void> {
    this.isPositionLoading = true;
    const pos = await this.geo.getCurrentPosition();
    if (pos) {
      // console.log("✅ Position détectée :", pos.coords);
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      this.setPosition(latlng, pos.coords.accuracy, pos.coords.altitude ?? undefined);
      this.map.flyTo(latlng, this.zoom);
      L.popup()
        .setLatLng(latlng)
        .setContent("📍 Position détectée automatiquement.")
        .openOn(this.map);
    } else {
      // ➕ Fallback : cliquer sur la carte pour définir la position
      this.map.once('click', (e: L.LeafletMouseEvent) => {
        this.setPosition(e.latlng);
        this.map.flyTo(e.latlng, this.zoom);
        L.popup()
          .setLatLng(e.latlng)
          .setContent("📌 Position définie manuellement.")
          .openOn(this.map);
      });
    }
    this.isPositionLoading = false;
  }

  private emitPosition(): void {
    this.positionSelected.emit({
      lat: this.lat,
      lng: this.lng,
      altitude: this.altitude,
      accuracy: this.accuracy,
    });
  }

  getChangeBasemapValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
