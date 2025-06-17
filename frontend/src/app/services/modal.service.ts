import { Injectable, ComponentRef, ComponentFactoryResolver, ApplicationRef, Injector, Type } from '@angular/core';
import { BehaviorSubject, Subject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private componentRef: ComponentRef<any> | null = null;
  private modalContainer: HTMLElement | null = null;
  private closeSubject = new Subject<any>();
  private dataSubject = new BehaviorSubject<any>(null); // Holds modal data

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private appRef: ApplicationRef,
    private injector: Injector
  ) {}

  /**
   * Ouvre un composant en tant que modal et permet de lui passer des données.
   * @param component Le composant Angular à afficher en modal.
   * @param params Données à passer et options supplémentaires.
   * @returns Un observable permettant de récupérer une valeur retournée par la modal.
   */
  open<T>(component: Type<T>, params?: { data?: any; closeOnBodyClick?: boolean }): Observable<any> {
    if (this.componentRef) {
      this.close();
    }

    const closeOnBodyClick = params?.closeOnBodyClick === true;

    this.modalContainer = document.createElement('div');
    this.modalContainer.classList.add('modal-backdrop');
    document.body.appendChild(this.modalContainer);

    const factory = this.componentFactoryResolver.resolveComponentFactory(component);
    this.componentRef = factory.create(this.injector);

    if (params?.data && this.componentRef.instance) {
      Object.assign(this.componentRef.instance, params.data);
      this.dataSubject.next(params.data); // Emit initial data
    }

    this.appRef.attachView(this.componentRef.hostView);
    const domElement = (this.componentRef.hostView as any).rootNodes[0] as HTMLElement;
    this.modalContainer.appendChild(domElement);

    if (closeOnBodyClick) {
      this.modalContainer.addEventListener('click', (event) => {
        if (event.target === this.modalContainer) {
          this.close();
        }
      });
    }

    return this.closeSubject.asObservable();
  }

  /**
   * Met à jour les données passées au composant de la modal sans la fermer.
   * @param newData Nouvelles données à injecter.
   */
  updateData(newData: any): void {
    if (this.componentRef && this.componentRef.instance) {
      Object.assign(this.componentRef.instance, newData);
      this.dataSubject.next(newData); // Emit updated data
    }
  }

  /**
   * Récupère un observable des données du modal.
   * @returns Un observable permettant d'écouter les changements de données.
   */
  getDataObservable(): Observable<any> {
    return this.dataSubject.asObservable();
  }

  /**
   * Ferme la modal et envoie une valeur de retour (si applicable).
   * @param result Valeur optionnelle renvoyée par la modal.
   */
  close(result?: any): void {
    if (this.componentRef) {
      this.appRef.detachView(this.componentRef.hostView);
      this.componentRef.destroy();
      this.componentRef = null;
    }

    if (this.modalContainer) {
      document.body.removeChild(this.modalContainer);
      this.modalContainer = null;
    }

    this.closeSubject.next(result);
    this.closeSubject.complete();
    this.closeSubject = new Subject<any>();

    this.dataSubject.next(null); // Reset data when closing modal
  }

  /**
   * Vérifie si une modal est actuellement ouverte.
   * @returns `true` si une modal est active, sinon `false`.
   */
  isOpen(): boolean {
    return this.componentRef !== null;
  }

  /**
   * Ferme toutes les modals ouvertes (actuellement, une seule gérée à la fois).
   */
  closeAll(): void {
    this.close();
  }
}
