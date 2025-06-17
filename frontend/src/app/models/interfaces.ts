

export type SyncStatus = 'idle' | 'empty' | 'changed' | 'active' | 'paused' | 'needed' | 'denied' | 'error';

export type SyncChangeStatuc = 'change' | 'paused' | 'active' | 'denied' | 'error';

export type ModalColor = 'dark-back' | 'danger-back' | 'info-back' | 'warning-back' | 'success-back' | 'light-back';

export type ModalWidth = 'small-width' | 'medium-width' | 'large-width' | 'x-large-width' | 'xx-large-width' | 'xxx-large-width';

export type SnackbarBackgroundColor = 'danger' | 'info' | 'warning' | 'success' | 'default';

export type SnackbarPosition = 'TOP' | 'BOTTOM'


export interface SnakBarOutPut {
    msg: string,
    position?: SnackbarPosition,
    color?: SnackbarBackgroundColor,
    duration?: number,
    fadeOutClass?: string
}


export interface User {
    id: string;
    isAdmin: boolean;
    orgUnits: {
        Countries: OrgUnit[];
        Regions: OrgUnit[];
        Districts: OrgUnit[];
        Communes: OrgUnit[];
        HealthCenters: OrgUnit[];
    },
    token: string;
    username: string;
}


export interface MapObstacles {
    noObstacle: boolean;
    mountain: boolean;
    river: boolean;
    others: boolean;
    otherDetails: string;
}

export interface MapWaterSource {
    noSource: boolean;
    tde: boolean;
    borehole: boolean;
    waterWell: boolean;
    others: boolean;
    otherDetails: string;
}

export interface MapLocation {
    lat: number | undefined;
    lng: number | undefined;
    altitude: number | undefined;
    accuracy: number | undefined;
}

export interface MapInternet {
    hasInternet: boolean | undefined;
    source: 'togocel' | 'moov' | 'others' | undefined
    otherSource: string | undefined
};

export interface ChwMap {
    _id: string | undefined
    _rev: string | undefined
    type: 'chw-map' | 'fs-map' | 'all' | undefined
    countryId: string | undefined;
    regionId: string | undefined;
    districtId: string | undefined;
    communeId: string | undefined;
    chwFullName: string | undefined;
    healthCenter: {
        id: string | undefined;
        name: string | undefined;
        location: MapLocation;
    }
    distanceToFacility: number;
    obstacles: MapObstacles;
    location: MapLocation;
    fsParent: {
        id: string | undefined;
        name: string | undefined;
    };
    village: {
        type: string | undefined;
        // name: string | undefined;
        names: string[];
        population: number | undefined;
        hasSchool: boolean | undefined;
        hasElectricity: boolean | undefined;
        waterSource: MapWaterSource;
        internet: MapInternet;
    };

    createdAt: string | undefined;
    owner: string | undefined;

    updatedAt: string | undefined;
    updatedBy: string | undefined;

    // validity: {
    //     valid: boolean
    //     reason: string | undefined;
    // };
}

export interface HealthCenterMap {
    _id: string | undefined
    _rev: string | undefined
    type: 'chw-map' | 'fs-map' | 'all' | undefined
    countryId: string | undefined;
    regionId: string | undefined;
    districtId: string | undefined;
    communeId: string | undefined;
    // uid: string | undefined;
    name: string | undefined;
    location: MapLocation;

    createdAt: string | undefined;
    owner: string | undefined;

    updatedAt: string | undefined;
    updatedBy: string | undefined;
}

export interface OrgUnit {
    id: string;
    level: string;
    name: string
    parent: {
        id: string;
        name: string
    },
    geometry?: {
        type: string; // "Point", "Polygon", etc.
        coordinates: number[] | number[][]; // [lng, lat] ou [[...]]
    };
    lat?: number;
    lng?: number;
}

export interface DirectionsResponse {
    routes: Array<{
        legs: Array<{
            distance: { text: string, value: number }, // text = "4.5 km", value = 4500 (en mètres)
            duration: { text: string, value: number }
        }>
    }>
}

