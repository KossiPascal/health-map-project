import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MapViewerComponent } from './modules/map-viewer/map-viewer.component';
import { MapDashboardComponent } from './modules/map-dashboard/map-dashboard.component';
import { MapRegisterComponent } from './modules/map-register/map-register.component';
import { LoginComponent } from './modules/login/login.component';
import { AuthGuard } from './guards/auth.guard';
import { MapVillageWithProblemsComponent } from '@kossi-modules/map-village-with-problems/map-village-with-problems.component';
import { LogOutGuard } from './guards/logout.guard';

const routes: Routes = [
  // { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent, canActivate: [LogOutGuard] },
  { path: 'map-viewer', component: MapViewerComponent, canActivate: [AuthGuard] },
  { path: 'map-dashboard', component: MapDashboardComponent, canActivate: [AuthGuard] },
  { path: 'map-register', component: MapRegisterComponent, canActivate: [AuthGuard] },
  { path: 'map-village-matched', component: MapVillageWithProblemsComponent, canActivate: [AuthGuard] },
  { path: '**', redirectTo: 'map-viewer' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
