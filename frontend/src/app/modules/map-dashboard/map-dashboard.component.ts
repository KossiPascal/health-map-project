import { Component, OnInit } from '@angular/core';
import { DbService } from '../../services/db.service';
import { ChwMap, MapObstacles, MapWaterSource, MapLocation, HealthCenterMap, MapInternet } from '../../models/interfaces';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { formatDistance } from '@kossi-src/app/shares/functions';
import { ApiService } from '@kossi-services/api.service';



@Component({
  standalone: false,
  selector: 'app-map-dashboard',
  templateUrl: './map-dashboard.component.html',
  styleUrls: ['./map-dashboard.component.css'],
})
export class MapDashboardComponent implements OnInit {
  ascList: ChwMap[] = [];
  healthCenterList: HealthCenterMap[] = [];
  activeTab: 'asc' | 'fs' = 'asc';

  // Pour garder l'id du doc en suppression pour animation
  deletingId: string | undefined;

  filter = {
    village: '',
    distance: ''
  };

  constructor(private db: DbService, private api: ApiService) { }

  async ngOnInit(): Promise<void> {
    try {
      this.ascList = await this.db.getAllDocs('chw') as ChwMap[];
      this.healthCenterList = await this.db.getAllDocs('fs') as HealthCenterMap[];
    } catch (err) {
      console.error('Erreur lors du chargement des ASC:', err);
      alert('Erreur lors du chargement des données des ASC.');
    }
  }

  getObstaclesLabel(obstacles: MapObstacles): string {
    const labels: string[] = [];

    if (obstacles.noObstacle) labels.push('Aucun obstacle');
    if (obstacles.mountain) labels.push('Montagne');
    if (obstacles.river) labels.push('Rivière');
    if (obstacles.others) {
      const details = obstacles.otherDetails.trim();
      labels.push(details ? details : 'Autres obstacles');
    }

    return labels.length > 0 ? labels.join(', ') : 'Aucun obstacle';
  }

  getWaterSourceLabel(waterSource: MapWaterSource): string {
    const labels: string[] = [];

    if (waterSource.noSource) labels.push("Aucune source d'eau");
    if (waterSource.tde) labels.push('TDE');
    if (waterSource.borehole) labels.push('Forage');
    if (waterSource.waterWell) labels.push('Puits');
    if (waterSource.others) {
      const details = waterSource.otherDetails.trim();
      labels.push(details ? details : 'Autres sources d’eau');
    }

    return labels.length > 0 ? labels.join(', ') : 'Aucune source d’eau';
  }

  fsDistanceToVillage(meters: number) {
    return formatDistance(meters);
  }


  getInternet(internet: MapInternet) {
    const labels: string[] = [];

    if (!internet.hasInternet) {
      labels.push("Pas d'internet");
    } else {
      if (internet.source == 'togocel') labels.push("Togocel");
      if (internet.source == 'moov') labels.push("Moov");
      if (internet.source == 'others') {
        const details = internet.source.trim();
        labels.push(details ? details : 'Autres Opérateur Internet');
      }
    }

    return labels.length > 0 ? labels.join(', ') : 'Aucune source internet';
  }

  getLocationLabel(location: MapLocation): string {
    if (location.lat === undefined || location.lng === undefined) {
      return 'Localisation inconnue';
    }

    let label = `<strong>Lat:</strong> ${location.lat.toFixed(6)}; <strong>Lng:</strong> ${location.lng.toFixed(6)}`;

    // if (location.altitude !== undefined) {
    //   label += `, Altitude: ${location.altitude} m`;
    // }

    // if (location.accuracy !== undefined) {
    //   label += `, Précision: ±${location.accuracy} m`;
    // }

    return label;
  }



  async sendToDhid2(doc: HealthCenterMap): Promise<void> {
    alert('Pas encore implémenté, En attente de validation!')
    if (!doc || !doc._id || !doc.location.lat || !doc.location.lng) {
      alert('Données manquantes dans Vos paramètres')
      return;
    }

    this.api.updateDhis2Geometry({ orgunit: doc._id, latitude: doc.location.lat, longitude: doc.location.lng }).subscribe({
      next: res => {
        console.log('✅ Unité mise à jour', res)
      },
      error: err => {
        console.error('❌ Erreur', err)
      }
    });
  }


  async updateDoc(doc: ChwMap | HealthCenterMap): Promise<void> {
    try {
      // await this.db.updateDoc(doc);
      // alert('Document mis à jour avec succès.');
      // Tu peux recharger la liste ici si besoin
    } catch (error) {
      console.error('Erreur lors de la mise à jour du document:', error);
      alert('Erreur lors de la mise à jour du document.');
    }
  }

  async deleteDoc(doc: ChwMap | HealthCenterMap): Promise<void> {
    if (!doc._id || !doc._rev) {
      alert('Document invalide.');
      return;
    }

    if (!confirm(`Confirmez-vous la suppression de "${doc._id}" ?`)) {
      return;
    }

    this.deletingId = doc._id;

    try {
      const success = await this.db.deleteDoc({ _id: doc._id, _rev: doc._rev });
      if (success) {
        // Animation avant suppression de la liste
        setTimeout(() => {
          this.ascList = this.ascList.filter(d => d._id !== doc._id);
          this.deletingId = undefined;
        }, 500); // durée égale à l'animation CSS
      } else {
        alert('Impossible de supprimer le document.');
        this.deletingId = undefined;
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du document:', error);
      alert('Erreur lors de la suppression du document.');
      this.deletingId = undefined;
    }
  }


  showExportToast(type: string, format: string): void {
    const msg = `✅ Export ${type.toUpperCase()} en ${format.toUpperCase()} terminé avec succès.`;
    const toast = document.createElement('div');
    toast.className = 'export-toast';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }



  activeExportMenu: 'asc' | 'fs' | null = null;

  toggleExportMenu(menu: 'asc' | 'fs') {
    this.activeExportMenu = this.activeExportMenu === menu ? null : menu;
  }


  // ASC → CSV
  exportAscToCSV(): void {
    const headers = ['Nom ASC', 'Formation Sanitaire', 'Type', 'Village', 'Distance (m)', 'Distance (km)', 'Population', 'Obstacle', 'Source d\'eau', 'Source Internet', 'Ecole', 'Electricité'];

    const rows = this.ascList.map(asc => {
      const dist = this.fsDistanceToVillage(asc.distanceToFacility);
      return [
        asc.chwFullName,
        asc.healthCenter.name,
        asc.village.type,
        asc.village.names,
        dist.meters,
        dist.kilometers,
        asc.village.population,
        this.getObstaclesLabel(asc.obstacles),
        this.getWaterSourceLabel(asc.village.waterSource),
        this.getInternet(asc.village.internet),
        asc.village.hasSchool ? 'Oui' : 'Non',
        asc.village.hasElectricity ? 'Oui' : 'Non'
      ]
    });
    this.downloadCSV(headers, rows, 'asc_data.csv');
    this.showExportToast('ASC', 'CSV');
  }

  // ASC → JSON
  exportAscToJSON(): void {
    const json = JSON.stringify(this.ascList, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, 'asc_data.json');
    this.showExportToast('ASC', 'JSON');
  }

  // ASC → XLSX
  exportAscToXLSX(): void {
    const worksheet = XLSX.utils.json_to_sheet(this.ascList.map(asc => {
      const dist = this.fsDistanceToVillage(asc.distanceToFacility);
      return {
        'Nom ASC': asc.chwFullName,
        'Formation Sanitaire': asc.healthCenter.name,
        'Type': asc.village.type,
        'Village': asc.village.names,
        'Distance (m)': dist.meters,
        'Distance (km)': dist.kilometers,
        'Population': asc.village.population,
        'Obstacle': this.getObstaclesLabel(asc.obstacles),
        'Source d\'eau': this.getWaterSourceLabel(asc.village.waterSource),
        'Source Internet': this.getInternet(asc.village.internet),
        'Ecole': asc.village.hasSchool ? 'Oui' : 'Non',
        'Electricité': asc.village.hasElectricity ? 'Oui' : 'Non'
      }
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ASC');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, 'asc_data.xlsx');
    this.showExportToast('ASC', 'XLSX');
  }

  exportAscToPDF(): void {
    const doc = new jsPDF();
    doc.text('Données ASC', 14, 10);

    autoTable(doc, {
      startY: 15,
      head: [['Nom ASC', 'Formation Sanitaire', 'Village', 'Distance (m)', 'Distance (km)', 'Population', 'Obstacle', 'Source d\'eau', 'Source Internet', 'Ecole', 'Electricité']],

      body: this.ascList.map(asc => {
        const dist = this.fsDistanceToVillage(asc.distanceToFacility);
        return [
          asc.chwFullName,
          asc.healthCenter.name,
          asc.village.type,
          asc.village.names,
          dist.meters,
          dist.kilometers,
          asc.village.population,
          this.getObstaclesLabel(asc.obstacles),
          this.getWaterSourceLabel(asc.village.waterSource),
          this.getInternet(asc.village.internet),
          asc.village.hasSchool ? 'Oui' : 'Non',
          asc.village.hasElectricity ? 'Oui' : 'Non'
        ]
      }),
      styles: { fontSize: 8 },
    } as any);

    doc.save('asc_data.pdf');
    this.showExportToast('ASC', 'PDF');
  }


  async exportAscAllInZip(): Promise<void> {
    const zip = new JSZip();

    // CSV
    const csv = this.convertToCSV(this.ascList);
    zip.file("asc.csv", csv);

    // JSON
    zip.file("asc.json", JSON.stringify(this.ascList, null, 2));

    // Excel
    const worksheet = XLSX.utils.json_to_sheet(this.ascList);
    const workbook = { Sheets: { data: worksheet }, SheetNames: ['data'] };
    const excelBuffer: any = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    zip.file("asc.xlsx", new Blob([excelBuffer], { type: 'application/octet-stream' }));

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "export_asc.zip");

    this.showExportToast('ASC', 'ZIP');
  }

  exportFsToCSV(): void {
    const headers = ['ID', 'Nom', 'Localisation'];
    const rows = this.healthCenterList.map(fs => [
      fs._id,
      fs.name,
      this.getLocationLabel(fs.location)
    ]);

    this.downloadCSV(headers, rows, 'fs_data.csv');
    this.showExportToast('FS', 'CSV');
  }

  exportFsToJSON(): void {
    const json = JSON.stringify(this.healthCenterList, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, 'fs_data.json');
    this.showExportToast('FS', 'JSON');
  }

  exportFsToXLSX(): void {
    const worksheet = XLSX.utils.json_to_sheet(this.healthCenterList.map(fs => ({
      'ID': fs._id,
      'Nom Formation Sanitaire': fs.name,
      'Localisation': this.getLocationLabel(fs.location)
    })));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'FS');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, 'fs_data.xlsx');

    this.showExportToast('FS', 'XLSX');
  }

  exportFsToPDF(): void {
    const doc = new jsPDF();
    doc.text('Données Formation Sanitaire', 14, 10);

    autoTable(doc, {
      startY: 15,
      head: [['ID', 'Nom FS', 'Localisation']],
      body: this.healthCenterList.map(fs => [
        fs._id,
        fs.name,
        this.getLocationLabel(fs.location)
      ]),
      styles: { fontSize: 9 },
    } as any);

    doc.save('fs_data.pdf');

    this.showExportToast('FS', 'PDF');
  }

  async exportFsAllInZip(): Promise<void> {
    const zip = new JSZip();

    // CSV
    const csv = this.convertToCSV(this.healthCenterList);
    zip.file("fs.csv", csv);

    // JSON
    zip.file("fs.json", JSON.stringify(this.healthCenterList, null, 2));

    // Excel
    const worksheet = XLSX.utils.json_to_sheet(this.healthCenterList);
    const workbook = { Sheets: { data: worksheet }, SheetNames: ['data'] };
    const excelBuffer: any = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    zip.file("fs.xlsx", new Blob([excelBuffer], { type: 'application/octet-stream' }));

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "export_fs.zip");

    this.showExportToast('FS', 'ZIP');
  }

  downloadCSV(headers: string[], rows: any[][], filename: string) {
    const csvContent = [headers.join(','), ...rows.map(row => row.map(r => `"${r}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, filename);
  }


  // private downloadCSV(headers: string[], rows: any[][], filename: string): void {
  //   const csvContent =
  //     [headers, ...rows]
  //       .map(e => e.map(val => `"${(val ?? '').toString().replace(/"/g, '""')}"`).join(','))
  //       .join('\n');

  //   const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  //   const url = window.URL.createObjectURL(blob);

  //   const link = document.createElement('a');
  //   link.href = url;
  //   link.setAttribute('download', filename);
  //   link.click();

  //   window.URL.revokeObjectURL(url);
  // }

  get filteredAscList(): ChwMap[] {
    return this.ascList.filter(asc => {
      const matchVillage = this.filter.village === '' || asc.village.names.join(' | ').toLowerCase().includes(this.filter.village.toLowerCase());
      const matchDistance = this.filter.distance === ''
        || (this.filter.distance === 'lt5' && asc.distanceToFacility <= 5)
        || (this.filter.distance === 'gt5' && asc.distanceToFacility > 5);
      return matchVillage && matchDistance;
    });
  }


  convertToCSV<T>(data: T[]): string {
    if (!data || data.length === 0) return '';

    const keys = Object.keys(data[0] as any) as (keyof T)[];
    const rows = data.map(row =>
      keys.map(key => {
        const value = row[key];
        // Gérer les objets imbriqués ou nulls
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(value);
        }
        return `"${(value ?? '').toString().replace(/"/g, '""')}"`;
      }).join(',')
    );

    return `${keys.join(',')}\n${rows.join('\n')}`;
  }

}
