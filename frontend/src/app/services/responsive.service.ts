import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ResponsiveService {
  private mobile!:boolean;
  private tablette!:boolean;

  set setMobile(isMobile:boolean) {
    this.mobile = isMobile;
  }

  set setTablette(isTablette:boolean) {
    this.tablette = isTablette;
  }

  get isMobile() {
    return this.mobile;
  }

  get isTablette() {
    return this.tablette;
  }
}
