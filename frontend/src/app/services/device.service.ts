import { Injectable } from '@angular/core';
import { DeviceDetectorService } from 'ngx-device-detector';
import { Platform } from '@angular/cdk/platform';

@Injectable({ providedIn: 'root' })
export class DeviceService {
    constructor(private platform: Platform, private deviceService: DeviceDetectorService) { }

    getDeviceInfo(): { isAndroid: boolean; isIOS: boolean; isTablet: boolean; isMobile: boolean; isWindows: boolean; isMac: boolean; isDesktop: boolean; } {
        const userAgent = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent.toLowerCase() : '';

        const os = this.deviceService.os?.toLowerCase() ?? '';
        const deviceType = this.deviceService.deviceType?.toLowerCase() ?? '';

        const isAndroid = /android/.test(userAgent) || os === 'android' || this.platform.ANDROID;

        const isIOS = /iphone|ipad|ipod/.test(userAgent) || os === 'ios' || this.platform.IOS;

        const isTablet = /tablet|ipad/.test(userAgent) || deviceType === 'tablet';

        const isMobile = /mobile/.test(userAgent) || deviceType === 'mobile' || this.platform.ANDROID || this.platform.IOS;

        const isWindows = /windows/.test(userAgent) || os === 'windows' || this.platform.isBrowser && navigator.platform?.toLowerCase().includes('win');

        const isMac = /macintosh|mac os/.test(userAgent) || os === 'mac' || this.platform.isBrowser && navigator.platform?.toLowerCase().includes('mac');

        const isDesktop = !isMobile && !isTablet;

        return { isAndroid, isIOS, isTablet, isMobile, isWindows, isMac, isDesktop };
    }

    /** ✅ Vrai si mobile, tablette, Android ou iOS */
    get isMobileDevice(): boolean {
        const { isMobile, isTablet, isAndroid, isIOS } = this.getDeviceInfo();
        return isMobile || isTablet || isAndroid || isIOS;
    }

    /** ✅ Vrai si PC de bureau */
    get isDesktopDevice(): boolean {
        const { isDesktop } = this.getDeviceInfo();
        return isDesktop;
    }
}
