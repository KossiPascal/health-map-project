import { HttpClientModule, HTTP_INTERCEPTORS } from "@angular/common/http";
import { CUSTOM_ELEMENTS_SCHEMA, isDevMode, NgModule, NO_ERRORS_SCHEMA } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { MapRegisterComponent } from "./modules/map-register/map-register.component";
import { MapDashboardComponent } from "./modules/map-dashboard/map-dashboard.component";
import { MapSelectComponent } from "./components/map-select/map-select.component";
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ServiceWorkerModule } from '@angular/service-worker';
import { LoginComponent } from "./modules/login/login.component";
import { MapViewerComponent } from "./modules/map-viewer/map-viewer.component";
import { NavbarComponent } from "./components/app-navbar/app-navbar.component";
import { TokenInterceptor } from "./middlewares/token.interceptor";
import { ReloadingComponent } from "@kossi-components/reloading/reloading.component";
import { SnackbarComponent } from "@kossi-selectors/snackbar/snackbar.component";
import { ModalLayoutComponent } from "@kossi-selectors/modal-layout/modal-layout.component";
import { FixModalLayoutComponent } from "@kossi-selectors/fix-modal-layout/fix-modal-layout.component";
import { DeviceDetectionComponent } from "@kossi-selectors/device-detection/device-detection.component";
import { ModalModule } from 'ngx-bootstrap/modal';
import { StoreModule } from '@ngrx/store';
import { SharedModule } from "./shares/shared.module";
import { MapVillageWithProblemsComponent } from "@kossi-modules/map-village-with-problems/map-village-with-problems.component";
import { environment } from "@kossi-environments/environment";
import { LogoutConfirmComponent } from "@kossi-modals/logout/logout-confirm.component";
import { SessionExpiredComponent } from "@kossi-modals/session-expired/session-expired.component";


@NgModule({
  declarations: [
    AppComponent,
    MapRegisterComponent,
    MapDashboardComponent,
    LoginComponent,
    MapViewerComponent,
    MapSelectComponent,
    MapVillageWithProblemsComponent,
    NavbarComponent,
    ReloadingComponent,
    ModalLayoutComponent,
    FixModalLayoutComponent,
    // LogoutConfirmComponent,
    SnackbarComponent,
    DeviceDetectionComponent,
    
  LogoutConfirmComponent,
  SessionExpiredComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    ReactiveFormsModule,
    AppRoutingModule,
    FormsModule,

    // MatSnackBarModule,
    SharedModule,
    ModalModule.forRoot(),
    StoreModule.forRoot({}),


    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      // enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    }),
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: TokenInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]

})
export class AppModule { }