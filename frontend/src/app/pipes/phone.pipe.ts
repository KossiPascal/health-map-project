import { Injectable, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';


@Pipe({
  standalone: false,
  name: 'phone'
})
@Injectable({
  providedIn: 'root'
})
export class PhonePipe implements PipeTransform {
  constructor(
    private sanitizer: DomSanitizer,
  ) {
  }

  transform(phone:any) {
    if (!phone) {
      return;
    }
    const html = '<p>' +
                 '<a href="tel:' + phone + '" class="mobile-only">' + phone + '</a>' +
                 '<span class="desktop-only">' + phone + '</span>' +
                 '</p>';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
