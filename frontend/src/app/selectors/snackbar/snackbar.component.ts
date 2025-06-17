import { Component } from '@angular/core';
import { SnakBarOutPut } from '@kossi-models/interfaces';
import { SnackbarService } from '@kossi-services/snackbar.service';

@Component({
  standalone: false,
  selector: 'app-snackbar',
  templateUrl: './snackbar.component.html',
  styleUrls: ['./snackbar.component.css']
})
export class SnackbarComponent {

  snackbars: SnakBarOutPut[] = [];

  constructor(private snackbarService: SnackbarService) {

    this.snackbarService.getSnackbarQueue().subscribe(snackbars => {
      this.snackbars = snackbars.map(s=>{
        s.msg =  s.msg.replace("\n", '<br>');
        s.position === 'TOP' ? 'snackbar-top-position' : 'snackbar-bottom-position';
        return s;
      });
    });
  }

  closeSnackbar(snackbar: SnakBarOutPut) {
    this.snackbarService.removeSnackbar(snackbar);
  }
}
