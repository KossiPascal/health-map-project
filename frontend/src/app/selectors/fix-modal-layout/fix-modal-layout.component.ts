import { Component, Input, HostListener, Attribute } from '@angular/core';
import { ModalColor } from '@kossi-models/interfaces';
import { FixeModalService } from '@kossi-services/fix-modal.service';


@Component({
  standalone: false,
  selector: 'kossi-fix-modal-layout',
  templateUrl: './fix-modal-layout.component.html',
  styleUrls: ['./fix-modal-layout.component.css'],
})
export class FixModalLayoutComponent {
  @Attribute('id') id: any;
  @Input() showCloseButton!: boolean;
  @Input() error?: string;
  @Input() processing!: boolean;
  @Input() isFlatButton!: boolean;
  @Input() modalTitle?: string;
  @Input() cancelBtnName?: string;
  @Input() submitBtnName?: string;
  @Input() showBottomElements!: boolean;
  @Input() showCancelButton!: boolean;
  @Input() reloadApp!: boolean;
  @Input() closeAfterSubmited!: boolean;
  @Input() modalActionColor?: ModalColor;
  @Input() modalContent?: any;
  @Input() message?: any;

  @Input() errorMsg?: string;

  @Input() visible: boolean = false;


  onSubmit?: () => Promise<void>
  onCancel?: () => Promise<void>

  constructor(private fix: FixeModalService) {

  this.fix.getModalVisibility().subscribe((visibility: boolean | undefined) => {
        this.visible = !!visibility;
      });
    this.fix.getShowCloseButton().subscribe((res: boolean | undefined) => {
      this.showCloseButton = !!res;
    });
    this.fix.getError().subscribe((res: string | undefined) => {
      this.error = res;
    });
    this.fix.getProcessing().subscribe((res: boolean | undefined) => {
      this.processing = !!res;
    });
    this.fix.getIsFlatButton().subscribe((res: boolean | undefined) => {
      this.isFlatButton = !!res;
    });
    this.fix.getModalTitle().subscribe((res: string | undefined) => {
      this.modalTitle = res ?? 'Modal Title';
    });
    this.fix.getCancelBtnName().subscribe((res: string | undefined) => {
      this.cancelBtnName = res;
    });
    this.fix.getSubmitBtnName().subscribe((res: string | undefined) => {
      this.submitBtnName = res;
    });
    this.fix.getShowBottomElements().subscribe((res: boolean | undefined) => {
      this.showBottomElements = !!res;
    });
    this.fix.getShowCancelButton().subscribe((res: boolean | undefined) => {
      this.showCancelButton = !!res;
    });
    this.fix.getReloadApp().subscribe((res: boolean | undefined) => {
      this.reloadApp = !!res;
    });
    this.fix.getcloseAfterSubmited().subscribe((res: boolean | undefined) => {
      this.closeAfterSubmited = !!res;
    });
    this.fix.getModalActionColor().subscribe((res: ModalColor | undefined) => {
      this.modalActionColor = res ?? 'info-back';
    });
    this.fix.getOnSubmit().subscribe((res: (() => Promise<void>) | undefined) => {
      // this.onSubmit =  ? new EventEmitter<void>(res) : new EventEmitter<void>(() => {});
    });
    this.fix.getOnCancel().subscribe((res: (() => Promise<void>) | undefined) => {
      this.onCancel = res;
    });
    this.fix.getErrorMsg().subscribe((res: string | undefined) => {
      this.errorMsg = res;
    });
    this.fix.getModalContent().subscribe((res: any) => {
      this.modalContent = res;
    });
    this.fix.getMessage().subscribe((res: string | undefined) => {
      this.message = res;
    });


  }

  @HostListener('window:keydown.enter')
  onEnterHandler() {
    this.submit();
  }

  close() {
    this.visible = false;
  }

 async cancel() {
    if (this.onCancel) {
      this.processing = true;
      await this.onCancel();
      this.processing = false;
    }
    this.visible = false;
  }

  async submit() {
    if (this.onSubmit) {
      this.processing = true;
      try {
        await this.onSubmit();
        if (this.closeAfterSubmited) this.visible = false;
        if (this.reloadApp === true) window.location.reload();
      } catch (error) {
        this.errorMsg = "Erreur lors de l'exécution, veuillez réessayer";
        console.error("Erreur lors de l'exécution, veuillez réessayer :", error);
        this.processing = false;
      }
    } else {
      this.visible = false;
    }
  }
}
