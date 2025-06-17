import { AfterViewInit, Component, ElementRef, HostListener } from '@angular/core';

import { ResponsiveService } from '@kossi-services/responsive.service';

@Component({
  standalone: false,
  template: `<div class="mobile-detection"></div>
            <div class="tablette-detection"></div>`,
  selector: 'device-detection',
})
export class DeviceDetectionComponent implements AfterViewInit {
  constructor(
    private elementRef:ElementRef,
    private responsiveService:ResponsiveService,
  ) {
  }

  ngAfterViewInit() {
    this.detectMobileTabletteScreenSize();
  }

  @HostListener('window:resize', [])
  private onResize() {
    this.detectMobileTabletteScreenSize();
  }

  private detectMobileTabletteScreenSize() {
    const mobileElement = this.elementRef.nativeElement.querySelector('.mobile-detection');
    const tabletteElement = this.elementRef.nativeElement.querySelector('.tablette-detection');
    const isMobileVisible = window.getComputedStyle(mobileElement).display !== 'none';
    const isTabletteVisible = window.getComputedStyle(tabletteElement).display !== 'none';
    this.responsiveService.setMobile = isMobileVisible;
    this.responsiveService.setTablette = isTabletteVisible;
  }
}
