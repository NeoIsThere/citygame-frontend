import { Routes } from '@angular/router';
import { HostComponent } from './pages/host/host';
import { LandingComponent } from './pages/landing/landing';
import { PlayerSessionComponent } from './pages/player-session/player-session';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'session/:sessionId', component: PlayerSessionComponent },
  { path: 'host', component: HostComponent },
  { path: '**', redirectTo: '' }
];
