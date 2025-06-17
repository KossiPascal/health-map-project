import { Injectable, Pipe, PipeTransform } from '@angular/core';

@Pipe({ 
    standalone: false,
    name: 'formatRole' 
})
@Injectable({
  providedIn: 'root'
})
export class FormatRolePipe implements PipeTransform {
  transform(value: string): string {
    return value
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
