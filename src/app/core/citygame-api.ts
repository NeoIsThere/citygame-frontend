import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

declare global {
  interface Window {
    RACE_THE_CITY_API_URL?: string;
  }
}

export type SessionStatus = 'waiting' | 'running' | 'paused' | 'stopped';
export type ObjectiveStatus = 'active' | 'validated';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface SubmissionImage {
  id: number;
  url: string;
  urls: {
    300: string;
    600: string;
    1200: string;
  };
  fileName: string;
  index: number;
  contentType: string;
  byteSize: number;
  originalName: string;
}

export interface Submission {
  id: number;
  assignmentId: number;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  images: SubmissionImage[];
}

export interface Team {
  id: number;
  name: string;
  score: number;
  createdAt?: string;
}

export interface Objective {
  id: number;
  assignmentId?: number;
  title: string;
  locationDescription: string;
  taskDescription: string;
  points: number;
  imageUrls: string[];
  status?: ObjectiveStatus;
  assignedAt?: string;
  validatedAt?: string;
  pendingSubmission?: Submission | null;
  approvedSubmission?: Submission | null;
}

export interface SessionSummary {
  id: string;
  name: string;
  status: SessionStatus;
  durationSeconds: number;
  remainingSeconds: number;
  isExpired: boolean;
  startedAt?: string;
  createdAt?: string;
}

export interface PublicSessionState {
  session: SessionSummary;
  game: {
    id: number;
    name: string;
  };
  teams: Team[];
  joinedTeam: Team | null;
  objectives: {
    active: Objective[];
    completed: Objective[];
  };
}

export interface GameSummary {
  id: number;
  name: string;
  objectiveCount: number;
  createdAt?: string;
}

export interface HostGameDetail extends GameSummary {
  objectives: Objective[];
}

export interface HostSessionSummary extends SessionSummary {
  gameName: string;
  teamCount: number;
  pendingSubmissionCount: number;
  joinUrl: string;
}

export interface HostObjectiveTeamState {
  teamId: number;
  teamName: string;
  assignmentId: number | null;
  status: ObjectiveStatus | null;
  validatedAt: string | null;
}

export interface HostObjective extends Objective {
  teamStates: HostObjectiveTeamState[];
}

export interface HostSessionDetail {
  session: SessionSummary & {
    joinUrl: string;
  };
  game: {
    id: number;
    name: string;
  };
  teams: Team[];
  objectives: HostObjective[];
  pendingSubmissions: HostSubmission[];
}

export interface HostSubmission extends Submission {
  team: {
    id: number;
    name: string;
  };
  objective: {
    id: number;
    title: string;
    locationDescription: string;
    taskDescription: string;
    points: number;
  };
}

export interface SpotSummary {
  id: number;
  city: string;
  title: string;
  locationDescription: string;
  taskDescription: string;
  points: number;
  imageUrls: string[];
  createdAt: string;
}

export interface SpotForm {
  city: string;
  title: string;
  locationDescription: string;
  taskDescription: string;
  points: number;
  imageFiles: File[];
  keepImageUrls: string[];
}

export interface CreateGamePayload {
  name: string;
  objectives: Array<{
    title: string;
    locationDescription: string;
    taskDescription: string;
    points: number;
    imageFiles: File[];
    existingImageUrls?: string[];
    saveToLibrary?: boolean;
  }>;
}

export type BookingLanguage = 'french' | 'english';
export type BookingApplicationStatus = 'pending' | 'confirmed';

export interface BookingSlot {
  availabilityGroupId: number;
  time: string;
}

export interface BookingDateOption {
  date: string;
  slots: BookingSlot[];
}

export interface PublicBookingOptions {
  timezone: string;
  minParticipants: number;
  bookingDurationMinutes: number;
  slotIntervalMinutes: number;
  minDate: string;
  maxDate: string;
  dates: BookingDateOption[];
}

export interface BookingApplicationPayload {
  availabilityGroupId: number;
  slotDate: string;
  slotTime: string;
  participantCount: number;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  nationality: string;
  language: BookingLanguage;
}

export interface BookingAvailabilityGroup {
  id: number;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  createdAt: string;
}

export interface BookingApplication extends BookingApplicationPayload {
  id: number;
  status: BookingApplicationStatus;
  slotEndDate: string;
  slotEndTime: string;
  submittedAt: string;
  confirmedAt: string | null;
}

export interface HostBookingState {
  timezone: string;
  minParticipants: number;
  bookingDurationMinutes: number;
  slotIntervalMinutes: number;
  today: string;
  maxBookingDate: string;
  availabilityGroups: BookingAvailabilityGroup[];
  pendingApplications: BookingApplication[];
  confirmedApplications: BookingApplication[];
}

@Injectable({ providedIn: 'root' })
export class CitygameApi {
  private readonly apiOrigin = (window.RACE_THE_CITY_API_URL || '').replace(/\/$/, '');
  private readonly baseUrl = `${this.apiOrigin}/api`;

  constructor(private readonly http: HttpClient) {}

  bookingOptions(): Observable<PublicBookingOptions> {
    return this.http.get<PublicBookingOptions>(`${this.baseUrl}/bookings/options`);
  }

  requestBooking(
    payload: BookingApplicationPayload
  ): Observable<{ id: number; status: 'pending'; submittedAt: string }> {
    return this.http.post<{ id: number; status: 'pending'; submittedAt: string }>(
      `${this.baseUrl}/bookings/applications`,
      payload
    );
  }

  getSession(sessionId: string, teamId?: number | null): Observable<PublicSessionState> {
    const query = teamId ? `?teamId=${teamId}` : '';
    return this.http.get<PublicSessionState>(`${this.baseUrl}/sessions/${sessionId}${query}`);
  }

  createTeam(sessionId: string, name: string): Observable<PublicSessionState> {
    return this.http.post<PublicSessionState>(`${this.baseUrl}/sessions/${sessionId}/teams`, { name });
  }

  submitObjectiveProof(
    sessionId: string,
    objectiveId: number,
    teamId: number,
    files: File[]
  ): Observable<PublicSessionState> {
    const formData = new FormData();
    formData.set('teamId', String(teamId));

    for (const file of files) {
      formData.append('images', file);
    }

    return this.http.post<PublicSessionState>(
      `${this.baseUrl}/sessions/${sessionId}/objectives/${objectiveId}/submissions`,
      formData
    );
  }

  hostGames(password: string): Observable<GameSummary[]> {
    return this.http.get<GameSummary[]>(`${this.baseUrl}/host/games`, {
      headers: this.hostHeaders(password)
    });
  }

  createGame(password: string, payload: CreateGamePayload): Observable<{ id: number }> {
    const formData = new FormData();
    const game = {
      name: payload.name,
      objectives: payload.objectives.map((objective) => ({
        title: objective.title,
        locationDescription: objective.locationDescription,
        taskDescription: objective.taskDescription,
        points: objective.points,
        existingImageUrls: objective.existingImageUrls ?? [],
        saveToLibrary: objective.saveToLibrary ?? false
      }))
    };

    formData.set('game', JSON.stringify(game));

    payload.objectives.forEach((objective, objectiveIndex) => {
      objective.imageFiles.forEach((file) => {
        formData.append(`objectiveImages[${objectiveIndex}]`, file);
      });
    });

    return this.http.post<{ id: number }>(`${this.baseUrl}/host/games`, formData, {
      headers: this.hostHeaders(password)
    });
  }

  hostGame(password: string, gameId: number): Observable<HostGameDetail> {
    return this.http.get<HostGameDetail>(`${this.baseUrl}/host/games/${gameId}`, {
      headers: this.hostHeaders(password)
    });
  }

  deleteGame(password: string, gameId: number): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.baseUrl}/host/games/${gameId}`, {
      headers: this.hostHeaders(password)
    });
  }

  hostSessions(password: string): Observable<HostSessionSummary[]> {
    return this.http.get<HostSessionSummary[]>(`${this.baseUrl}/host/sessions`, {
      headers: this.hostHeaders(password)
    });
  }

  hostBookings(password: string): Observable<HostBookingState> {
    return this.http.get<HostBookingState>(`${this.baseUrl}/host/bookings`, {
      headers: this.hostHeaders(password)
    });
  }

  createBookingAvailability(
    password: string,
    payload: { startDate: string; endDate: string; startTime: string; endTime: string }
  ): Observable<BookingAvailabilityGroup> {
    return this.http.post<BookingAvailabilityGroup>(
      `${this.baseUrl}/host/booking-availabilities`,
      payload,
      { headers: this.hostHeaders(password) }
    );
  }

  deleteBookingAvailability(password: string, groupId: number): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(
      `${this.baseUrl}/host/booking-availabilities/${groupId}`,
      { headers: this.hostHeaders(password) }
    );
  }

  confirmBookingApplication(password: string, applicationId: number): Observable<HostBookingState> {
    return this.http.post<HostBookingState>(
      `${this.baseUrl}/host/booking-applications/pending/${applicationId}/confirm`,
      {},
      { headers: this.hostHeaders(password) }
    );
  }

  cancelBookingApplication(
    password: string,
    status: BookingApplicationStatus,
    applicationId: number
  ): Observable<HostBookingState> {
    return this.http.delete<HostBookingState>(
      `${this.baseUrl}/host/booking-applications/${status}/${applicationId}`,
      { headers: this.hostHeaders(password) }
    );
  }

  createSession(
    password: string,
    payload: { gameId: number; name?: string; durationMinutes: number }
  ): Observable<HostSessionDetail> {
    return this.http.post<HostSessionDetail>(`${this.baseUrl}/host/sessions`, payload, {
      headers: this.hostHeaders(password)
    });
  }

  hostSession(password: string, sessionId: string): Observable<HostSessionDetail> {
    return this.http.get<HostSessionDetail>(`${this.baseUrl}/host/sessions/${sessionId}`, {
      headers: this.hostHeaders(password)
    });
  }

  deleteSession(password: string, sessionId: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.baseUrl}/host/sessions/${sessionId}`, {
      headers: this.hostHeaders(password)
    });
  }

  sessionAction(
    password: string,
    sessionId: string,
    action: 'start' | 'pause' | 'stop' | 'resume' | 'restart'
  ): Observable<HostSessionDetail> {
    return this.http.post<HostSessionDetail>(
      `${this.baseUrl}/host/sessions/${sessionId}/${action}`,
      {},
      { headers: this.hostHeaders(password) }
    );
  }

  updateScore(
    password: string,
    sessionId: string,
    teamId: number,
    score: number
  ): Observable<HostSessionDetail> {
    return this.http.patch<HostSessionDetail>(
      `${this.baseUrl}/host/sessions/${sessionId}/teams/${teamId}/score`,
      { score },
      { headers: this.hostHeaders(password) }
    );
  }

  reviewSubmission(
    password: string,
    sessionId: string,
    submissionId: number,
    approved: boolean
  ): Observable<HostSessionDetail> {
    return this.http.post<HostSessionDetail>(
      `${this.baseUrl}/host/sessions/${sessionId}/submissions/${submissionId}/review`,
      { approved },
      { headers: this.hostHeaders(password) }
    );
  }

  qrUrl(sessionId: string): string {
    return `${this.baseUrl}/sessions/${sessionId}/qr.svg`;
  }

  hostSpots(password: string): Observable<SpotSummary[]> {
    return this.http.get<SpotSummary[]>(`${this.baseUrl}/host/spots`, {
      headers: this.hostHeaders(password)
    });
  }

  createSpot(password: string, form: SpotForm): Observable<SpotSummary> {
    const formData = new FormData();
    formData.set('city', form.city);
    formData.set('title', form.title);
    formData.set('locationDescription', form.locationDescription);
    formData.set('taskDescription', form.taskDescription);
    formData.set('points', String(form.points));

    for (const file of form.imageFiles) {
      formData.append('images', file);
    }

    return this.http.post<SpotSummary>(`${this.baseUrl}/host/spots`, formData, {
      headers: this.hostHeaders(password)
    });
  }

  updateSpot(password: string, spotId: number, form: SpotForm): Observable<SpotSummary> {
    const formData = new FormData();
    formData.set('city', form.city);
    formData.set('title', form.title);
    formData.set('locationDescription', form.locationDescription);
    formData.set('taskDescription', form.taskDescription);
    formData.set('points', String(form.points));
    formData.set('keepImageUrls', JSON.stringify(form.keepImageUrls));

    for (const file of form.imageFiles) {
      formData.append('images', file);
    }

    return this.http.patch<SpotSummary>(`${this.baseUrl}/host/spots/${spotId}`, formData, {
      headers: this.hostHeaders(password)
    });
  }

  deleteSpot(password: string, spotId: number): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.baseUrl}/host/spots/${spotId}`, {
      headers: this.hostHeaders(password)
    });
  }

  private hostHeaders(password: string): HttpHeaders {
    return new HttpHeaders({ 'x-host-password': password });
  }

}
