import { Component, Input, HostListener, Output, EventEmitter, Attribute, OnChanges, SimpleChanges } from '@angular/core';
import { ModalColor, ModalWidth } from '@kossi-models/interfaces';
import { ModalService } from '@kossi-services/modal.service';

@Component({
  standalone: false,
  selector: 'kossi-modal-layout',
  templateUrl: './modal-layout.component.html',
  styleUrls: ['./modal-layout.component.css'],
})

export class ModalLayoutComponent implements OnChanges {
  private stateChange!: any;

  @Attribute('id') id: any;
  @Input() showCloseButton!: boolean;
  @Input() error?: string;
  @Input() processing!: boolean;
  @Input() disableSubmitButton!: boolean;
  @Input() isFlatButton!: boolean;
  @Input() modalTitle = 'Modal Title';
  @Input() cancelBtnName!: string;
  @Input() submitBtnName!: string;
  @Input() showBottomElements!: boolean;
  @Input() showCancelButton!: boolean;
  @Input() reloadApp!: boolean;
  @Input() closeAfterSubmited: boolean = true;
  @Input() closeAfterCanceled: boolean = true;
  
  @Input() modalActionColor: ModalColor = 'light-back';
  @Input() modalContentWidth:ModalWidth = 'small-width'

  @Output() onSubmit: EventEmitter<any> = new EventEmitter();
  @Output() onCancel: EventEmitter<any> = new EventEmitter();

  errorMsg!:string;

  constructor(public modalService: ModalService) { }

  
  ngOnChanges(changes: SimpleChanges) {
    if (changes['processing']) {
      this.stateChange = new Date();
    }
    if (changes['disableSubmitButton']) {
      this.stateChange = new Date();
    }
    if (changes['error']) {
      this.stateChange = new Date();
    }
  }

    
  @HostListener('window:keydown.enter')
  onEnterHandler() {
    this.submit();
  }

  cancel() {
    if (this.onCancel) {
      this.processing = true;
      this.onCancel.emit();
      this.processing = false;
    }
    if (this.closeAfterCanceled) {
      this.modalService.close();
    }
  }

  async submit() {
    if (this.onSubmit) {
      this.processing = true;
      // Créer une promesse pour attendre la fin de l'événement onSubmit
      const onSubmitPromise = new Promise<void>((resolve, reject) => {
        this.onSubmit.subscribe(() => {
          resolve();
        });
      });

      // Émettre l'événement onSubmit
      this.onSubmit.emit();

      try {
        // Attendre la fin de l'événement onSubmit
        await onSubmitPromise;
        if (this.closeAfterSubmited) {
          this.modalService.close();
        }
        if (this.reloadApp == true) {
          window.location.reload();
        }
        // this.processing = false;
      } catch (error) {
        this.errorMsg = "Erreur lors de l'execution, veuillez réessayer";
        console.error("Erreur lors de l'execution, veuillez réessayer :", error);
        this.processing = false;
      }
    } else {
      this.modalService.close();
    }
  }
}
