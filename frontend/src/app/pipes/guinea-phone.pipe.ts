import { Injectable, Pipe, PipeTransform } from '@angular/core';

@Pipe({
    standalone: false,
    name: 'guineaPhone'
})
@Injectable({
    providedIn: 'root'
})
export class GuineaPhonePipe implements PipeTransform {
    transform(value: string | number): string {
        return formatGuineaPhone(value);
    }
}

export function formatGuineaPhone(value: string | number): string {
    if (!value) return '';

    // Remove all non-digit characters
    const digits = value.toString().replace(/\D/g, '');

    let formatted = '';

    if (digits.length === 9) {
        // Assume local number like 620123456
        formatted = `+224 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
    } else if (digits.length === 12 && digits.startsWith('224')) {
        // Already has country code
        const local = digits.slice(3);
        formatted = `+224 ${local.slice(0, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
    } else {
        // Unknown format
        return value.toString();
    }

    return formatted.trim();
}
