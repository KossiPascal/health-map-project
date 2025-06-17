import { Injectable } from '@angular/core';
import { ModalColor } from '@kossi-models/interfaces';
import { Subject } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class FixeModalService {

  private showCloseButton: Subject<boolean | undefined> = new Subject<boolean | undefined>();
  private error: Subject<string | undefined> = new Subject<string | undefined>();
  private processing: Subject<boolean | undefined> = new Subject<boolean | undefined>();
  private isFlatButton: Subject<boolean | undefined> = new Subject<boolean | undefined>();
  private modalTitle: Subject<string | undefined> = new Subject<string | undefined>();
  private cancelBtnName: Subject<string | undefined> = new Subject<string | undefined>();
  private submitBtnName: Subject<string | undefined> = new Subject<string | undefined>();
  private showBottomElements: Subject<boolean | undefined> = new Subject<boolean | undefined>();
  private showCancelButton: Subject<boolean | undefined> = new Subject<boolean | undefined>();
  private reloadApp: Subject<boolean | undefined> = new Subject<boolean | undefined>();
  private closeAfterSubmited: Subject<boolean | undefined> = new Subject<boolean | undefined>();
  private modalActionColor: Subject<ModalColor | undefined> = new Subject<ModalColor | undefined>();
  private onSubmit: Subject<(() => Promise<void>) | undefined> = new Subject<(() => Promise<void>) | undefined>();
  private onCancel: Subject<(() => Promise<void>) | undefined> = new Subject<(() => Promise<void>) | undefined>();
  private errorMsg: Subject<string | undefined> = new Subject<string | undefined>();
  private modalVisibilitySubject: Subject<boolean | undefined> = new Subject<boolean | undefined>();
  private modalContentHtmh: Subject<any> = new Subject<any>();
  private message: Subject<string | undefined> = new Subject<string | undefined>();

  constructor() { }

  show(d: { modalContentHtmh?: any, message?:string, showCloseButton?: boolean, error?: string, processing?: boolean, isFlatButton?: boolean, modalTitle?: string, cancelBtnName?: string, submitBtnName?: string, showBottomElements?: boolean, showCancelButton?: boolean, reloadApp?: boolean, closeAfterSubmited?: boolean, modalActionColor?: ModalColor, onSubmit?: () => Promise<void>, onCancel?: () => Promise<void>, errorMsg?: string }) {
    this.modalVisibilitySubject.next(true);
    this.showCloseButton.next(d.showCloseButton);
    this.error.next(d.error);
    this.processing.next(d.processing);
    this.isFlatButton.next(d.isFlatButton);
    this.modalTitle.next(d.modalTitle);
    this.cancelBtnName.next(d.cancelBtnName);
    this.submitBtnName.next(d.submitBtnName);
    this.showBottomElements.next(d.showBottomElements);
    this.showCancelButton.next(d.showCancelButton);
    this.reloadApp.next(d.reloadApp);
    this.closeAfterSubmited.next(d.closeAfterSubmited);
    this.modalActionColor.next(d.modalActionColor);
    this.onSubmit.next(d.onSubmit);
    this.onCancel.next(d.onCancel);
    this.errorMsg.next(d.errorMsg);
    this.modalContentHtmh.next(d.modalContentHtmh);
    this.message.next(d.message);
  }

  hideModal = () => this.modalVisibilitySubject.next(false);
  showModal = () => this.modalVisibilitySubject.next(true);

  getModalVisibility = () => this.modalVisibilitySubject.asObservable();
  getShowCloseButton = () => this.showCloseButton.asObservable();
  getError = () => this.error.asObservable();
  getProcessing = () => this.processing.asObservable();
  getIsFlatButton = () => this.isFlatButton.asObservable();
  getModalTitle = () => this.modalTitle.asObservable();
  getCancelBtnName = () => this.cancelBtnName.asObservable();
  getSubmitBtnName = () => this.submitBtnName.asObservable();
  getShowBottomElements = () => this.showBottomElements.asObservable();
  getShowCancelButton = () => this.showCancelButton.asObservable();
  getReloadApp = () => this.reloadApp.asObservable();
  getcloseAfterSubmited = () => this.closeAfterSubmited.asObservable();
  getModalActionColor = () => this.modalActionColor.asObservable();
  getOnSubmit = () => this.onSubmit.asObservable();
  getOnCancel = () => this.onCancel.asObservable();
  getErrorMsg = () => this.errorMsg.asObservable();
  getModalContent = () => this.modalContentHtmh.asObservable();
  getMessage = () => this.message.asObservable();
}
