
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




export type ORSProfile = 'driving-car' | 'cycling-regular' | 'foot-walking';

export type OSRMProfile = 'driving' | 'cycling' | 'walking';


export type LatLng = [number, number];

export interface RouteResult {
    profile: ORSProfile;
    distance: number; // en mètres
    duration: number; // en secondes
}

export type DistanceUnits = {
    meters: number;
    kilometers: number;
    miles: number;
    feet: number;
    readable: string;
};

export type DurationUnits = {
    seconds: number;
    minutes: number;
    hours: number;
    readable: string;
};

export type DistanceResult = {
    profile: ORSProfile | OSRMProfile;
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    distance: DistanceUnits;
    duration: DurationUnits;
};
