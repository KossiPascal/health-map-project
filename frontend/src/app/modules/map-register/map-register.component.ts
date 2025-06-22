import { Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { notNull } from '../../shares/functions';
import { ChwMap, HealthCenterMap, MapLocation, OrgUnit, User } from '../../models/interfaces';
import { DbService } from '../../services/db.service';
import { UserContextService } from '@kossi-services/user-context.service';
import { AuthService } from '@kossi-services/auth.service';

@Component({
  standalone: false,
  selector: 'app-map-register',
  templateUrl: './map-register.component.html',
  styleUrls: ['./map-register.component.css'],
})
export class MapRegisterComponent implements OnInit {

  resetChanged: any;

  chw: ChwMap;

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


  orgUnits: any[] = [];
  levels: { [key: number]: any[] } = {};
  selected: { [key: number]: string } = {};
  levelsDef: any[] = []; // définitions des niveaux : [{level: 1, name: 'Pays'}, ...]


  private fsLocation: MapLocation | undefined;


  message: string = '';
  errorMessage: string = '';


  constructor(private userCtx: UserContextService, private db: DbService, private auth: AuthService) {
    this.chw = this.defaultChwMap;
    this.initializeComponent();
  }

  ngOnInit(): void {

  }


  getFsLocation(): MapLocation | undefined {
    const hcId = this.chw.healthCenter.id;
    if (!hcId || hcId == '') return undefined;
    const fs = this.healthCenters.find(h => h.id === this.chw.healthCenter.id);

    if (fs && typeof fs.lat === 'number' && !isNaN(fs.lat) && typeof fs.lng === 'number' && !isNaN(fs.lng)) {
      return { lat: fs.lat, lng: fs.lng, altitude: undefined, accuracy: undefined };
    }
    return this.fsLocation;
  }

  get isValidFsLatLng(): boolean {
    const location = this.getFsLocation();
    if (!location || !location.lat || !location.lng) return false;

    const { lat, lng } = location;
    return typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng);
  }

  async checkHealthCenterData(healthCenterId: string | undefined) {
    this.fsLocation = undefined;
    const hcId = healthCenterId ?? this.chw.healthCenter.id;
    if (!hcId || hcId == '') return undefined;
    if (!this.isValidFsLatLng) {
      const fsDoc = await this.db.getDoc(hcId) as HealthCenterMap;
      if (fsDoc) {
        this.fsLocation = { lat: fsDoc.location.lat, lng: fsDoc.location.lng, altitude: fsDoc.location.altitude, accuracy: fsDoc.location.accuracy };


      }
    };
  }

  transformGeometry(unit: OrgUnit): OrgUnit {
    if (unit.geometry?.type === 'Point' && Array.isArray(unit.geometry.coordinates)) {
      const [lng, lat] = unit.geometry.coordinates as [number, number];
      return { ...unit, lat, lng };
    }
    return unit;
  }

  // selectRegions(countryId: string) {
  //   this.chw.regionId = undefined;
  //   this.chw.districtId = undefined;
  //   this.chw.communeId = undefined;
  //   this.chw.healthCenter.id = undefined;

  //   this.regions = !countryId ? [] : this.Regions.filter(r => r.parent.id === countryId);
  //   this.districts = [];
  //   this.communes = [];
  //   this.healthCenters = [];
  // }

  // selectDistricts(regionId: string) {
  //   this.chw.districtId = undefined;
  //   this.chw.communeId = undefined;
  //   this.chw.healthCenter.id = undefined;

  //   this.districts = !regionId ? [] : this.Districts.filter(d => d.parent.id === regionId);
  //   this.communes = [];
  //   this.healthCenters = [];
  // }

  // selectCommunes(districtId: string) {
  //   this.chw.communeId = undefined;
  //   this.chw.healthCenter.id = undefined;

  //   this.communes = !districtId ? [] : this.Communes.filter(c => c.parent.id === districtId);
  //   this.healthCenters = [];
  // }

  // selectHealthCenters(communeId: string) {
  //   this.chw.healthCenter.id = undefined;
  //   this.healthCenters = !communeId ? [] : this.HealthCenters.filter(h => h.parent.id === communeId);
  // }

  // this.auth.user$.subscribe((user: User | undefined) => {
  //   if (user) {
  //     this.Countries = user.orgUnits.Countries;
  //     this.Regions = user.orgUnits.Regions;
  //     this.Districts = user.orgUnits.Districts;
  //     this.Communes = user.orgUnits.Communes;
  //     this.HealthCenters = user.orgUnits.HealthCenters;

  //     if(this.Countries.length == 1) this.chw.countryId = this.Countries[0].id;
  //     if(this.Regions.length == 1) this.chw.countryId = this.Regions[0].id;
  //     if(this.Districts.length == 1) this.chw.countryId = this.Districts[0].id;
  //     if(this.Communes.length == 1) this.chw.countryId = this.Communes[0].id;
  //     if(this.HealthCenters.length == 1) this.chw.countryId = this.HealthCenters[0].id;

  //   }
  // });


  private initializeComponent() {
    try {
      const user = this.userCtx.user;

      if (!(this.Countries.length > 0)) this.Countries = user?.orgUnits.Countries ?? [];
      if (!(this.Regions.length > 0)) this.Regions = user?.orgUnits.Regions ?? [];
      if (!(this.Districts.length > 0)) this.Districts = user?.orgUnits.Districts ?? [];
      if (!(this.Communes.length > 0)) this.Communes = user?.orgUnits.Communes ?? [];
      if (!(this.HealthCenters.length > 0)) this.HealthCenters = user?.orgUnits.HealthCenters ?? [];
      this.countriesGenerate();
    } catch (error) {
      this.auth.logout();
    }
  }

  countriesGenerate() {
    this.setOrgUnitsValues({ country: true, region: true, district: true, commune: true, hospital: true });
    this.countries = this.Countries;
    this.chw.countryId = this.countries.length == 1 ? this.countries[0].id : undefined;
    this.regionsGenerate(this.chw.countryId);
  }

  regionsGenerate(countryId: string | undefined) {
    this.setOrgUnitsValues({ region: true, district: true, commune: true, hospital: true });
    if (notNull(countryId) && this.Regions.length > 0) {
      if (this.Countries.length > 0) {
        this.regions = this.Regions.filter(r => r.parent.id === countryId);
      } else {
        this.regions = this.Regions;
      }
      this.chw.regionId = this.regions.length == 1 ? this.regions[0].id : undefined;
    } else {
      this.regions = [];
      this.chw.regionId = undefined;
    }
    this.districtsGenerate(this.chw.regionId);
  }

  districtsGenerate(regionId: string | undefined) {
    this.setOrgUnitsValues({ district: true, commune: true, hospital: true });

    if (notNull(regionId) && this.Districts.length > 0) {
      if (this.Regions.length > 0) {
        this.districts = this.Districts.filter(d => d.parent.id === regionId);
      } else {
        this.districts = this.Districts;
      }
      this.chw.districtId = this.districts.length == 1 ? this.districts[0].id : undefined;
    } else {
      this.districts = [];
      this.chw.districtId = undefined;
    }
    this.communesGenerate(this.chw.districtId);
  }

  communesGenerate(districtId: string | undefined) {
    this.setOrgUnitsValues({ commune: true, hospital: true });

    if (notNull(districtId) && this.Communes.length > 0) {
      if (this.Districts.length > 0) {
        this.communes = this.Communes.filter(c => c.parent.id === districtId);
      } else {
        this.communes = this.Communes;
      }
      this.chw.communeId = this.communes.length == 1 ? this.communes[0].id : undefined;
    } else {
      this.communes = [];
      this.chw.communeId = undefined;
    }
    this.hospitalsGenerate(this.chw.communeId);
  }

  hospitalsGenerate(communeId: string | undefined) {
    this.setOrgUnitsValues({ hospital: true });

    if (notNull(communeId) && this.HealthCenters.length > 0) {
      if (this.Communes.length > 0) {
        this.healthCenters = this.HealthCenters.filter(h => h.parent.id === communeId);
      } else {
        this.healthCenters = this.HealthCenters;
      }
      this.chw.healthCenter.id = this.communes.length == 1 ? this.communes[0].id : undefined;
    } else {
      this.healthCenters = [];
      this.chw.healthCenter.id = undefined;
    }
  }


  private setOrgUnitsValues(dt: { country?: boolean, region?: boolean, district?: boolean, commune?: boolean, hospital?: boolean }) {
    if (dt.country === true) {
      this.countries = [];
      this.chw.countryId = undefined;
    }
    if (dt.region === true) {
      this.regions = [];
      this.chw.regionId = undefined;
    }
    if (dt.district === true) {
      this.districts = [];
      this.chw.districtId = undefined;
    }
    if (dt.commune === true) {
      this.communes = [];
      this.chw.communeId = undefined;
    }
    if (dt.hospital === true) {
      this.healthCenters = [];
      this.chw.healthCenter.id = undefined;
    }
  }

  isWaterSourceError: boolean = false;
  waterSourceErrorMessage: string = '';

  isObstableError: boolean = false;
  isObstableErrorMessage: string = '';

  onWaterSourceChange() {
    const { noSource, tde, borehole, waterWell, others, otherDetails } = this.chw.village.waterSource;
    const isOk003 = tde || borehole || waterWell || others;// && notNull(otherDetails);
    const isOk3 = noSource && !isOk003 || !noSource && isOk003;
    if (noSource && isOk003) {
      this.isWaterSourceError = true;
      this.waterSourceErrorMessage = 'Erreur, revoir vos choix !';
    } else if (!noSource && !isOk003) {
      this.isWaterSourceError = true;
      this.waterSourceErrorMessage = 'La selection est obligatoire';
    } else {
      this.isWaterSourceError = false;
      this.waterSourceErrorMessage = '';
    }
    return isOk3;
  }

  onObstacleChange() {
    const { noObstacle, mountain, river, others, otherDetails } = this.chw.obstacles;
    const isOk002 = mountain || river || others;// && notNull(otherDetails);
    const isOk2 = noObstacle && !isOk002 || !noObstacle && isOk002;

    if (noObstacle && isOk002) {
      this.isObstableError = true;
      this.isObstableErrorMessage = 'Erreur, revoir vos choix !';
    } else if (!noObstacle && !isOk002) {
      this.isObstableError = true;
      this.isObstableErrorMessage = 'La selection est obligatoire';
    } else {
      this.isObstableError = false;
      this.isObstableErrorMessage = '';
    }
    return isOk2;
  }



    addVillageName(): void {
        if (!this.chw) return;
        if(!this.chw.village.names) {
            this.chw.village.names = ['']
        }
        this.chw.village.names.push('');
    }

    removeVillageName(index: number): void {
        if (!this.chw) return;
        if (this.chw.village.names.length > 1) {
            this.chw.village.names.splice(index, 1);
        }
    }

    trackByIndex(index: number, item: string): any {
  return index;
}



  resetMap(msg?: string, err?: any) {
    if (msg) console.warn(msg, err);
    // this.chw.location = { lat: 9.5516, lng: 1.1900, altitude: undefined, accuracy: undefined };
    this.chw.location = { lat: undefined, lng: undefined, altitude: undefined, accuracy: undefined };
  }

  onPositionSelected(pos: { lat: number | undefined; lng: number | undefined; accuracy: number | undefined; altitude: number | undefined }) {
    const fs = this.healthCenters.find(h => h.id === this.chw.healthCenter.id);
    // const distanceKm = haversineDistance({ lat1: fs?.lat ?? null, lon1: fs?.lng ?? null, lat2: pos.lat, lon2: pos.lng });
    // this.chw.distanceToFacility = distanceKm;

    // this.directionService.getDirections({ lat1: fs?.lat ?? null, lon1: fs?.lng ?? null, lat2: pos.lat, lon2: pos.lng }).subscribe(response => {
    //   if (response.routes.length > 0) {
    //     const leg = response.routes[0].legs[0];
    //     console.log('Distance:', leg.distance.text);
    //     console.log('Durée:', leg.duration.text);
    //     this.chw.villagePopulation = leg.distance.value
    //   } else {
    //     console.log('Aucun itinéraire trouvé.');
    //   }
    // });

    const origin = `${fs?.lat},${fs?.lng}`;//'9.3135,0.9993'; // lat,lng
    const destination = `${pos.lat},${pos.lng}`;//'9.3131,0.9932';

    // this.api.getDistance(origin, destination).subscribe(res => {
    //   console.log('Distance en mètres:', res.distance);
    //   this.chw.villagePopulation = res.distance
    // });

    this.chw.location = { ...pos };
  }

  markFormFieldsTouched(form: NgForm): void {
    Object.values(form.controls).forEach(control => {
      control.markAsTouched();
      control.updateValueAndValidity();
    });
  }

  async saveChwMap(form: NgForm) {
    this.message = '';
    this.errorMessage = '';

    this.isWaterSourceError = false;
    this.waterSourceErrorMessage = '';
    this.isObstableError = false;
    this.isObstableErrorMessage = '';

    const { healthCenter, village, chwFullName, obstacles, location } = this.chw;

    const isOk1 = notNull(healthCenter.id) && notNull(village.names.join('').trim().replace(' ','')) && notNull(chwFullName);
    const isOk2 = this.onObstacleChange();
    const isOk3 = this.onWaterSourceChange();

    const isOk4 = location.lat && typeof location.lat === 'number' && location.lng && typeof location.lng === 'number';

    this.markFormFieldsTouched(form);


    if (form.invalid || !isOk2 || !isOk3) {
      this.errorMessage = "Le formulaire contient des erreurs.";
      return;
    }

    if (!isOk1 || !isOk2 || !isOk3) {
      // console.log(this.chw)
      this.errorMessage = 'Veuillez remplir tous les champs requis.';
      return;
    }

    if (!isOk4) {
      this.errorMessage = 'Veuillez sélectionner une position.';
      return;
    }
    const healthCenterFound = this.healthCenters.find(h => h.id === healthCenter.id);
    this.chw.healthCenter.name = healthCenterFound?.name;

    const fsLocation = this.getFsLocation();

    this.chw.healthCenter.location = {
      lat: fsLocation?.lat,
      lng: fsLocation?.lng,
      altitude: fsLocation?.altitude,
      accuracy: fsLocation?.accuracy
    };

    this.chw.fsParent = {
      id: healthCenterFound?.parent.id,
      name: healthCenterFound?.parent.name
    };

    const res = await this.db.createOrUpdateDoc(this.chw, 'chw');

    if (res) {
      this.message = 'ASC enregistré avec succès !';
      form.resetForm();
      this.chw = this.defaultChwMap;
      this.resetChanged = new Date().toISOString();
      this.countriesGenerate();
      return;
    } else {
      this.errorMessage = 'Erreur lors de l’enregistrement de l’ASC.';
      return;
    }
  }

  async saveFsMap(form: NgForm) {
    this.message = '';
    this.errorMessage = '';

    const { healthCenter, location } = this.chw;
    const healthCenterFound = this.healthCenters.find(h => h.id === healthCenter.id);
    const hcName = healthCenter.name ?? healthCenterFound?.name;

    this.chw.healthCenter.name = hcName;

    const isOk1 = notNull(healthCenter.id) && notNull(hcName);
    const isOk2 = location.lat && typeof location.lat === 'number' && location.lng && typeof location.lng === 'number';

    if (form.invalid || !isOk1) {
      this.errorMessage = 'Veuillez remplir tous les champs requis.';
      return;
    }

    if (!isOk2) {
      this.errorMessage = 'Veuillez sélectionner une position.';
      return;
    }

    const fsData: HealthCenterMap = {
      _id: this.chw.healthCenter.id,
      _rev: this.chw._rev,
      type: this.chw.type,
      name: this.chw.healthCenter.name,
      countryId: this.chw.countryId,
      regionId: this.chw.regionId,
      districtId: this.chw.districtId,
      communeId: this.chw.communeId,
      createdAt: this.chw.createdAt,
      owner: this.chw.owner,
      updatedAt: this.chw.updatedAt,
      updatedBy: this.chw.updatedBy,
      location: this.chw.location,
      isSendToDhis2: false,
      sendToDhis2At: undefined,
      sendToDhis2By: undefined,
    }

    const res = await this.db.createOrUpdateDoc(fsData, 'fs');

    if (res) {
      this.message = 'Formation sanitaire enregistré avec succès !';
      form.resetForm();
      this.chw = this.defaultChwMap;
      this.resetChanged = new Date().toISOString();
      this.countriesGenerate();
      return;
    } else {
      this.errorMessage = 'Erreur lors de l’enregistrement de la Formation Sanitaire.';
      return;
    }
  }

  get defaultChwMap(): ChwMap {
    return {
      _id: undefined,
      _rev: undefined,
      type: undefined,
      countryId: undefined,
      regionId: undefined,
      districtId: undefined,
      communeId: undefined,
      chwFullName: undefined,
      location: {
        lat: undefined,
        lng: undefined,
        altitude: undefined,
        accuracy: undefined
      },
      healthCenter: {
        id: undefined,
        name: undefined,
        location: {
          lat: undefined,
          lng: undefined,
          altitude: undefined,
          accuracy: undefined
        },
      },
      fsParent: {
        id: undefined,
        name: undefined
      },
      distanceToFacility: 0,
      village: {
        type: undefined,
        names: [''],
        population: undefined,
        hasSchool: undefined,
        hasElectricity: undefined,
        waterSource: {
          noSource: false,
          tde: false,
          borehole: false,
          waterWell: false,
          others: false,
          otherDetails: ''
        },
        internet: {
          hasInternet: undefined,
          source: undefined,
          otherSource: undefined
        },
      },
      obstacles: {
        noObstacle: false,
        mountain: false,
        river: false,
        others: false,
        otherDetails: ''
      },
      createdAt: undefined,
      owner: undefined,
      updatedAt: undefined,
      updatedBy: undefined,
      isSendToDhis2: false,
      sendToDhis2At: undefined,
      sendToDhis2By: undefined,
    };
  }
}
