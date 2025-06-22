import { Injectable } from '@angular/core';
import { Geolocation as CapGeolocation, Position as CapPosition } from '@capacitor/geolocation';
import { DeviceService } from './device.service';

@Injectable({ providedIn: 'root' })
export class GeolocationService {
    private watchId: number | null = null;
    private isMobileDevice: boolean = false;

    constructor(private device: DeviceService) {
        this.isMobileDevice = this.device.isMobileDevice;
    }

    getMessages(code: number): void {
        switch (code) {
            case 1:
                alert("⛔ L'autorisation d'accéder à votre position a été refusée. Veuillez autoriser l'accès à la localisation dans les paramètres de votre navigateur ou appareil.");
                break;

            case 2:
                alert("📵 La position est actuellement indisponible. Assurez-vous que le GPS est activé et que vous disposez d'une connexion réseau stable.");
                break;

            case 3:
                alert("⏳ Le délai pour obtenir votre position a été dépassé. Veuillez réessayer dans quelques instants ou déplacer-vous vers un endroit avec une meilleure réception.");
                break;

            default:
                alert("❌ Une erreur s’est produite lors de la tentative de géolocalisation. Veuillez réessayer ou vérifier les paramètres de votre appareil.");
                break;
        }
    }

    /** ✅ Obtenir une position unique */
    async getCurrentPosition(withAlert: boolean = true): Promise<GeolocationPosition | null> {
        try {
            if (this.isMobileDevice && this.isCapacitorAvailable) {
                // console.log('📱 Capacitor getCurrentPosition');
                await this.ensurePermission();

                const pos = await CapGeolocation.getCurrentPosition({
                    enableHighAccuracy: false,
                    timeout: 20000,
                });

                return this.mapCapacitorToBrowserPosition(pos);
            } else {
                // console.log('💻 navigator.geolocation.getCurrentPosition');
                return await this.getBrowserPosition({
                    enableHighAccuracy: false,
                    timeout: 20000,
                    // maximumAge: 60000,
                });
            }
        } catch (err: any) {
            if (withAlert) this.getMessages(err.code)
            // console.error('❌ getCurrentPosition error:', err);
            return null;
        }
    }

    /** 🔁 Écouter les changements de position (tracking) */
    watchPosition(callback: (pos: GeolocationPosition) => void, errorCb?: (err: any) => void, withAlert: boolean = false) {
        if (this.watchId !== null) this.clearWatch();// nettoie avant de démarrer un nouveau

        try {
            if (this.isMobileDevice && this.isCapacitorAvailable) {
                console.log('📱 Capacitor watchPosition');
                CapGeolocation.watchPosition(
                    { enableHighAccuracy: true },
                    (position, err) => {
                        if (err) {
                            console.error('❌ Capacitor watch error:', err);
                            errorCb?.(err);
                            return;
                        }
                        if (position) callback(this.mapCapacitorToBrowserPosition(position));
                    }
                );
            } else {
                console.log('💻 navigator.geolocation.watchPosition');
                this.watchId = navigator.geolocation.watchPosition(
                    callback,
                    errorCb ?? ((err) => console.error('❌ watchPosition error:', err)),
                    {
                        enableHighAccuracy: true,
                        timeout: 20000,
                        maximumAge: 0,
                    }
                );
            }
        } catch (err) {
            console.error('❌ watchPosition setup error:', err);
            errorCb?.(err);
            if (withAlert) alert("Erreur lors du suivi de la position.");
        }
    }

    /** ❌ Arrêter le suivi */
    clearWatch() {
        if (this.watchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(this.watchId);
            console.log('🛑 Suivi de position arrêté');
            this.watchId = null;
        }
    }

    /** 🔒 Vérifie et demande la permission (Capacitor) */
    private async ensurePermission(): Promise<void> {
        const perm = await CapGeolocation.checkPermissions();
        if (perm.location !== 'granted') {
            const req = await CapGeolocation.requestPermissions();
            if (req.location !== 'granted') {
                throw new Error('Permission de localisation refusée.');
            }
        }
    }

    /** 🔁 Conversion Capacitor → GeolocationPosition */
    private mapCapacitorToBrowserPosition(capPos: CapPosition): GeolocationPosition {
        return {
            coords: {
                latitude: capPos.coords.latitude,
                longitude: capPos.coords.longitude,
                accuracy: capPos.coords.accuracy ?? 0,
                altitude: capPos.coords.altitude ?? null,
                altitudeAccuracy: capPos.coords.altitudeAccuracy ?? null,
                heading: capPos.coords.heading ?? null,
                speed: capPos.coords.speed ?? null,
                toJSON: (): any => { }
            },
            toJSON: (): any => { },
            timestamp: capPos.timestamp,
        };
    }

    /** 🌐 Utiliser navigator.geolocation */
    private getBrowserPosition(options: PositionOptions, withAlert: boolean = true): Promise<GeolocationPosition> {
        return new Promise((resolve, reject) => {
            if (!this.isGeoNavigatorAvailable) {
                const error = new Error('🌐 Géolocalisation non supportée par le navigateur.');
                if (withAlert) alert('🚫 Votre navigateur ne supporte pas la géolocalisation.');
                return reject(error);
            }

            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
    }


    private get isGeoNavigatorAvailable(): boolean {
        return !!(navigator && typeof navigator !== 'undefined' && navigator.geolocation);
    }

    /** 📦 Vérifie la disponibilité de Capacitor */
    private get isCapacitorAvailable(): boolean {
        return typeof (window as any).Capacitor !== 'undefined';
    }
}
