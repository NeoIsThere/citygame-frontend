import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  BookingApplication,
  BookingAvailabilityGroup,
  CitygameApi,
  HostGameDetail,
  GameSummary,
  HostSubmission,
  HostSessionDetail,
  HostSessionSummary,
  SpotSummary,
  SpotForm,
  Team,
  HostBookingState
} from '../../core/citygame-api';
import { COUNTRY_OPTIONS } from '../../core/countries';

interface ObjectiveForm {
  title: string;
  locationDescription: string;
  taskDescription: string;
  points: number;
  imageFiles: File[];
  existingImageUrls: string[];
  saveToLibrary: boolean;
}

interface GameForm {
  name: string;
  objectives: ObjectiveForm[];
}

type HostView =
  | 'menu'
  | 'bookings'
  | 'gameEditor'
  | 'sessionStarter'
  | 'sessionDetail'
  | 'gameDetail'
  | 'spotLibrary';

@Component({
  selector: 'app-host',
  imports: [CommonModule, FormsModule],
  templateUrl: './host.html',
  styleUrl: './host.css'
})
export class HostComponent implements OnInit, OnDestroy {
  password = '';
  isAuthenticated = false;
  games: GameSummary[] = [];
  sessions: HostSessionSummary[] = [];
  selected: HostSessionDetail | null = null;
  selectedGame: HostGameDetail | null = null;
  newGame: GameForm = this.emptyGame();
  newSessionGameId = '';
  newSessionName = '';
  newSessionDurationMinutes = 75;
  loading = false;
  saving = false;
  error = '';
  notice = '';
  showSessionQrCodes = false;
  activeView: HostView = 'menu';

  bookings: HostBookingState = this.emptyBookingState();
  availabilityStartDate = '';
  availabilityEndDate = '';
  availabilityStartTime = '17:00';
  availabilityEndTime = '21:00';
  bookingSaving = false;

  spots: SpotSummary[] = [];
  spotPickerIndex: number | null = null;
  editingSpot: SpotSummary | null = null;
  spotForm: SpotForm = this.emptySpotForm();
  savingSpot = false;
  selectedCity = '';

  readonly maxObjectiveImages = 3;

  private readonly countryNames = new Map<string, string>(
    COUNTRY_OPTIONS.map((country) => [country.code, country.name])
  );

  private readonly passwordKey = 'citygame-host-password';
  private readonly pollMs = 5000;
  private summaryPollHandle: ReturnType<typeof setInterval> | null = null;
  private sessionPollHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly api: CitygameApi) {}

  ngOnInit(): void {
    const stored = localStorage.getItem(this.passwordKey);

    if (stored) {
      this.password = stored;
      this.verifyPasswordAndLoadDashboard(stored);
    }
  }

  ngOnDestroy(): void {
    this.stopSummaryPolling();
    this.stopSessionPolling();
  }

  login(): void {
    const password = this.password.trim();

    if (!password) {
      this.error = 'Enter the host password.';
      return;
    }

    this.verifyPasswordAndLoadDashboard(password);
  }

  logout(): void {
    this.stopSummaryPolling();
    this.stopSessionPolling();
    localStorage.removeItem(this.passwordKey);
    this.isAuthenticated = false;
    this.password = '';
    this.games = [];
    this.sessions = [];
    this.selected = null;
    this.selectedGame = null;
    this.bookings = this.emptyBookingState();
    this.activeView = 'menu';
  }

  loadDashboard(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      games: this.api.hostGames(this.password),
      sessions: this.api.hostSessions(this.password),
      spots: this.api.hostSpots(this.password),
      bookings: this.api.hostBookings(this.password)
    }).subscribe({
      next: ({ games, sessions, spots, bookings }) => {
        this.games = games;
        this.sessions = sessions;
        this.spots = spots;
        this.setBookingState(bookings);
        this.loading = false;
      },
      error: (error) => this.handleError(error, 'Could not load host dashboard.')
    });
  }

  private verifyPasswordAndLoadDashboard(password: string): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      games: this.api.hostGames(password),
      sessions: this.api.hostSessions(password),
      spots: this.api.hostSpots(password),
      bookings: this.api.hostBookings(password)
    }).subscribe({
      next: ({ games, sessions, spots, bookings }) => {
        this.password = password;
        this.isAuthenticated = true;
        localStorage.setItem(this.passwordKey, password);
        this.games = games;
        this.sessions = sessions;
        this.spots = spots;
        this.setBookingState(bookings);
        this.loading = false;
        this.activeView = 'menu';
        this.startSummaryPolling();
      },
      error: (error) => {
        this.password = password;
        this.isAuthenticated = false;
        localStorage.removeItem(this.passwordKey);
        this.handleError(error, 'Invalid host password.');
      }
    });
  }

  addObjective(): void {
    this.newGame.objectives.push(this.emptyObjective());
  }

  openGameEditor(): void {
    this.stopSessionPolling();
    this.newGame = this.emptyGame();
    this.spotPickerIndex = null;
    this.activeView = 'gameEditor';
    this.selectedGame = null;
    this.error = '';
    this.notice = '';
  }

  openSpotLibrary(): void {
    this.stopSessionPolling();
    this.activeView = 'spotLibrary';
    this.editingSpot = null;
    this.spotForm = this.emptySpotForm();
    this.selectedCity = '';
    this.error = '';
    this.notice = '';
  }

  openSpotPicker(index: number): void {
    this.spotPickerIndex = this.spotPickerIndex === index ? null : index;
  }

  addSpotAsObjective(spot: SpotSummary): void {
    const emptyIndex = this.newGame.objectives.findIndex(
      (o) => !o.title && !o.locationDescription && !o.taskDescription && o.imageFiles.length === 0 && o.existingImageUrls.length === 0
    );

    if (emptyIndex >= 0) {
      this.applySpot(emptyIndex, spot);
    } else {
      this.newGame.objectives.push(this.emptyObjective());
      this.applySpot(this.newGame.objectives.length - 1, spot);
    }

    this.notice = `"${spot.title}" added to game.`;
  }

  applySpot(index: number, spot: SpotSummary): void {
    const objective = this.newGame.objectives[index];

    if (!objective) {
      return;
    }

    objective.title = spot.title;
    objective.locationDescription = spot.locationDescription;
    objective.taskDescription = spot.taskDescription;
    objective.points = spot.points;
    objective.existingImageUrls = [...spot.imageUrls];
    objective.imageFiles = [];
    this.spotPickerIndex = null;
  }

  removeExistingImage(objectiveIndex: number, imageIndex: number): void {
    this.newGame.objectives[objectiveIndex].existingImageUrls.splice(imageIndex, 1);
  }

  startEditingSpot(spot: SpotSummary): void {
    this.editingSpot = spot;
    this.spotForm = {
      city: spot.city,
      title: spot.title,
      locationDescription: spot.locationDescription,
      taskDescription: spot.taskDescription,
      points: spot.points,
      imageFiles: [],
      keepImageUrls: [...spot.imageUrls]
    };
    this.error = '';
  }

  cancelSpotEdit(): void {
    this.editingSpot = null;
    this.spotForm = this.emptySpotForm();
  }

  removeSpotFormImage(index: number): void {
    this.spotForm.keepImageUrls.splice(index, 1);
  }

  onSpotImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    const remainingSlots = this.maxObjectiveImages - this.spotForm.keepImageUrls.length - this.spotForm.imageFiles.length;

    if (remainingSlots <= 0) {
      this.error = `Each spot can have up to ${this.maxObjectiveImages} images.`;
      input.value = '';
      return;
    }

    this.spotForm.imageFiles = [...this.spotForm.imageFiles, ...files.slice(0, remainingSlots)];
    this.error = '';
    input.value = '';
  }

  removeSpotNewImage(index: number): void {
    this.spotForm.imageFiles.splice(index, 1);
  }

  saveNewSpot(): void {
    if (!this.spotForm.title.trim() || !this.spotForm.locationDescription.trim() || !this.spotForm.taskDescription.trim()) {
      this.error = 'Title, location, and task are required.';
      return;
    }

    this.savingSpot = true;
    this.error = '';

    const form: SpotForm = {
      ...this.spotForm,
      title: this.spotForm.title.trim(),
      locationDescription: this.spotForm.locationDescription.trim(),
      taskDescription: this.spotForm.taskDescription.trim()
    };

    this.api.createSpot(this.password, form).subscribe({
      next: (spot) => {
        this.spots = [spot, ...this.spots];
        this.spotForm = this.emptySpotForm();
        this.notice = 'Spot saved to library.';
        this.savingSpot = false;
      },
      error: (error) => {
        this.error = error.error?.message || 'Could not save spot.';
        this.savingSpot = false;
      }
    });
  }

  saveSpotEdit(): void {
    if (!this.editingSpot) {
      return;
    }

    if (!this.spotForm.title.trim() || !this.spotForm.locationDescription.trim() || !this.spotForm.taskDescription.trim()) {
      this.error = 'Title, location, and task are required.';
      return;
    }

    this.savingSpot = true;
    this.error = '';

    const form: SpotForm = {
      ...this.spotForm,
      title: this.spotForm.title.trim(),
      locationDescription: this.spotForm.locationDescription.trim(),
      taskDescription: this.spotForm.taskDescription.trim()
    };

    this.api.updateSpot(this.password, this.editingSpot.id, form).subscribe({
      next: (updated) => {
        this.spots = this.spots.map((s) => (s.id === updated.id ? updated : s));
        this.editingSpot = null;
        this.spotForm = this.emptySpotForm();
        this.notice = 'Spot updated.';
        this.savingSpot = false;
      },
      error: (error) => {
        this.error = error.error?.message || 'Could not update spot.';
        this.savingSpot = false;
      }
    });
  }

  deleteSpot(spot: SpotSummary): void {
    if (!confirm(`Delete "${spot.title}" from the library?`)) {
      return;
    }

    this.savingSpot = true;
    this.error = '';

    this.api.deleteSpot(this.password, spot.id).subscribe({
      next: () => {
        this.spots = this.spots.filter((s) => s.id !== spot.id);

        if (this.editingSpot?.id === spot.id) {
          this.editingSpot = null;
          this.spotForm = this.emptySpotForm();
        }

        this.notice = 'Spot deleted.';
        this.savingSpot = false;
      },
      error: (error) => {
        this.error = error.error?.message || 'Could not delete spot.';
        this.savingSpot = false;
      }
    });
  }

  openSessionStarter(): void {
    this.stopSessionPolling();
    this.activeView = 'sessionStarter';
    this.selected = null;
    this.error = '';
    this.notice = '';
  }

  openBookings(): void {
    this.stopSessionPolling();
    this.activeView = 'bookings';
    this.error = '';
    this.notice = '';
    this.loadBookings();
  }

  backToMenu(): void {
    this.stopSessionPolling();
    this.activeView = 'menu';
    this.error = '';
  }

  createAvailability(): void {
    if (
      !this.availabilityStartDate ||
      !this.availabilityEndDate ||
      !this.availabilityStartTime ||
      !this.availabilityEndTime
    ) {
      this.error = 'Choose the date range and daily time window.';
      return;
    }

    this.bookingSaving = true;
    this.error = '';

    this.api
      .createBookingAvailability(this.password, {
        startDate: this.availabilityStartDate,
        endDate: this.availabilityEndDate,
        startTime: this.availabilityStartTime,
        endTime: this.availabilityEndTime
      })
      .subscribe({
        next: () => {
          this.notice = 'Availability group created.';
          this.bookingSaving = false;
          this.loadBookings();
        },
        error: (error) => this.handleBookingError(error, 'Could not create availability.')
      });
  }

  deleteAvailability(group: BookingAvailabilityGroup): void {
    if (!confirm(`Delete availability from ${group.startDate} to ${group.endDate}?`)) {
      return;
    }

    this.bookingSaving = true;
    this.error = '';
    this.api.deleteBookingAvailability(this.password, group.id).subscribe({
      next: () => {
        this.notice = 'Availability group deleted.';
        this.bookingSaving = false;
        this.loadBookings();
      },
      error: (error) => this.handleBookingError(error, 'Could not delete availability.')
    });
  }

  confirmBooking(application: BookingApplication): void {
    if (!confirm(`Confirm ${application.firstName} ${application.lastName} for ${application.slotDate} at ${application.slotTime}?`)) {
      return;
    }

    this.bookingSaving = true;
    this.error = '';
    this.api.confirmBookingApplication(this.password, application.id).subscribe({
      next: (bookings) => {
        this.setBookingState(bookings);
        this.notice = 'Application confirmed. This date and time are now unavailable.';
        this.bookingSaving = false;
      },
      error: (error) => this.handleBookingError(error, 'Could not confirm this application.')
    });
  }

  cancelBooking(application: BookingApplication): void {
    const description =
      application.status === 'confirmed'
        ? 'This permanently deletes the booking and reopens its date and time.'
        : 'This permanently deletes the application.';

    if (!confirm(`Cancel ${application.firstName} ${application.lastName}? ${description}`)) {
      return;
    }

    this.bookingSaving = true;
    this.error = '';
    this.api
      .cancelBookingApplication(this.password, application.status, application.id)
      .subscribe({
        next: (bookings) => {
          this.setBookingState(bookings);
          this.notice =
            application.status === 'confirmed'
              ? 'Booking cancelled. The date and time are open again.'
              : 'Application cancelled.';
          this.bookingSaving = false;
        },
        error: (error) => this.handleBookingError(error, 'Could not cancel this application.')
      });
  }

  formatBookingDate(date: string): string {
    return new Intl.DateTimeFormat('en', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(`${date}T12:00:00`));
  }

  nationalityName(code: string): string {
    return this.countryNames.get(code) || code;
  }

  languageLabel(language: string): string {
    return language === 'french' ? '🇫🇷 French' : '🇬🇧 English';
  }

  isSlotConfirmed(application: BookingApplication): boolean {
    const candidateStamp = this.bookingStamp(application.slotDate, application.slotTime);

    return this.bookings.confirmedApplications.some(
      (confirmed) => {
        const confirmedStamp = this.bookingStamp(confirmed.slotDate, confirmed.slotTime);
        return (
          candidateStamp >= confirmedStamp &&
          candidateStamp < confirmedStamp + this.bookings.bookingDurationMinutes
        );
      }
    );
  }

  bookingWindowLabel(application: BookingApplication): string {
    const start = `${this.formatBookingDate(application.slotDate)} at ${application.slotTime}`;

    if (application.slotEndDate === application.slotDate) {
      return `${start}–${application.slotEndTime}`;
    }

    return `${start}–${this.formatBookingDate(application.slotEndDate)} at ${application.slotEndTime}`;
  }

  removeObjective(index: number): void {
    this.newGame.objectives.splice(index, 1);
  }

  createGame(): void {
    const payload = {
      name: this.newGame.name.trim(),
      objectives: this.newGame.objectives.map((objective) => ({
        title: objective.title.trim(),
        locationDescription: objective.locationDescription.trim(),
        taskDescription: objective.taskDescription.trim(),
        points: Number(objective.points),
        imageFiles: objective.imageFiles,
        existingImageUrls: objective.existingImageUrls,
        saveToLibrary: objective.saveToLibrary
      }))
    };

    this.saving = true;
    this.error = '';

    this.api.createGame(this.password, payload).subscribe({
      next: () => {
        this.notice = 'Game created.';
        this.newGame = this.emptyGame();
        this.spotPickerIndex = null;
        this.saving = false;
        this.loadDashboard();
        this.activeView = 'menu';
      },
      error: (error) => this.handleError(error, 'Could not create game.')
    });
  }

  createSession(): void {
    const gameId = Number(this.newSessionGameId);
    const durationMinutes = Number(this.newSessionDurationMinutes);

    if (!Number.isInteger(gameId)) {
      this.error = 'Select a game first.';
      return;
    }

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
      this.error = 'Session duration must be between 1 and 480 minutes.';
      return;
    }

    this.saving = true;
    this.error = '';

    this.api
      .createSession(this.password, {
        gameId,
        name: this.newSessionName.trim() || undefined,
        durationMinutes
      })
      .subscribe({
        next: (detail) => {
          this.selected = detail;
          this.newSessionName = '';
          this.notice = 'Session created. QR code is ready.';
          this.saving = false;
          this.loadSessionsOnly();
          this.activeView = 'sessionDetail';
          this.startSessionPolling();
        },
        error: (error) => this.handleError(error, 'Could not create session.')
      });
  }

  selectGame(gameId: number): void {
    this.stopSessionPolling();
    this.loading = true;
    this.error = '';

    this.api.hostGame(this.password, gameId).subscribe({
      next: (game) => {
        this.selectedGame = game;
        this.activeView = 'gameDetail';
        this.loading = false;
      },
      error: (error) => this.handleError(error, 'Could not load this game.')
    });
  }

  deleteSelectedGame(): void {
    if (!this.selectedGame) {
      return;
    }

    if (!confirm(`Delete "${this.selectedGame.name}" and its sessions?`)) {
      return;
    }

    this.saving = true;
    this.error = '';

    this.api.deleteGame(this.password, this.selectedGame.id).subscribe({
      next: () => {
        this.notice = 'Game deleted.';
        this.selectedGame = null;
        this.selected = null;
        this.saving = false;
        this.activeView = 'menu';
        this.loadDashboard();
      },
      error: (error) => this.handleError(error, 'Could not delete this game.')
    });
  }

  selectSession(sessionId: string): void {
    this.loading = true;
    this.error = '';

    this.api.hostSession(this.password, sessionId).subscribe({
      next: (detail) => {
        this.selected = detail;
        this.activeView = 'sessionDetail';
        this.loading = false;
        this.startSessionPolling();
      },
      error: (error) => this.handleError(error, 'Could not load this session.')
    });
  }

  runAction(action: 'start' | 'pause' | 'resume' | 'restart'): void {
    if (!this.selected) {
      return;
    }

    if (action === 'restart' && !confirm('Restart this session and reset scores/objectives?')) {
      return;
    }

    this.saving = true;
    this.error = '';

    this.api.sessionAction(this.password, this.selected.session.id, action).subscribe({
      next: (detail) => {
        this.selected = detail;
        this.notice = `Session ${action} complete.`;
        this.saving = false;
        this.loadSessionsOnly();
        this.startSessionPolling();
      },
      error: (error) => this.handleError(error, `Could not ${action} this session.`)
    });
  }

  deleteSelectedSession(): void {
    if (!this.selected) {
      return;
    }

    if (this.selected.session.status !== 'paused') {
      this.error = 'Pause the session before deleting it.';
      return;
    }

    if (!confirm(`Delete "${this.selected.session.name}" and all its teams, scores, and proof photos?`)) {
      return;
    }

    this.saving = true;
    this.error = '';

    this.api.deleteSession(this.password, this.selected.session.id).subscribe({
      next: () => {
        this.notice = 'Session deleted.';
        this.selected = null;
        this.stopSessionPolling();
        this.saving = false;
        this.activeView = 'menu';
        this.loadSessionsOnly();
      },
      error: (error) => this.handleError(error, 'Could not delete this session.')
    });
  }

  saveScore(team: Team): void {
    if (!this.selected) {
      return;
    }

    this.saving = true;
    this.error = '';

    this.api.updateScore(this.password, this.selected.session.id, team.id, Number(team.score)).subscribe({
      next: (detail) => {
        this.selected = detail;
        this.notice = 'Score updated.';
        this.saving = false;
        this.loadSessionsOnly();
        this.startSessionPolling();
      },
      error: (error) => this.handleError(error, 'Could not update score.')
    });
  }

  reviewSubmission(submission: HostSubmission, approved: boolean): void {
    if (!this.selected) {
      return;
    }

    this.saving = true;
    this.error = '';

    this.api
      .reviewSubmission(
        this.password,
        this.selected.session.id,
        submission.id,
        approved
      )
      .subscribe({
        next: (detail) => {
          this.selected = detail;
          this.notice = approved ? 'Submission approved.' : 'Submission rejected and photos deleted.';
          this.saving = false;
          this.loadSessionsOnly();
          this.startSessionPolling();
        },
        error: (error) => this.handleError(error, 'Could not review this submission.')
      });
  }

  qrUrl(sessionId: string): string {
    return this.api.qrUrl(sessionId);
  }

  toggleSessionQrCodes(): void {
    this.showSessionQrCodes = !this.showSessionQrCodes;
  }

  onObjectiveImagesSelected(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const objective = this.newGame.objectives[index];
    const files = Array.from(input.files || []);

    if (!objective) {
      input.value = '';
      return;
    }

    if (files.length === 0) {
      return;
    }

    const remainingSlots = this.maxObjectiveImages - objective.existingImageUrls.length - objective.imageFiles.length;

    if (remainingSlots <= 0) {
      this.error = `Each objective can have up to ${this.maxObjectiveImages} images.`;
      input.value = '';
      return;
    }

    objective.imageFiles = [
      ...objective.imageFiles,
      ...files.slice(0, remainingSlots)
    ];

    if (files.length > remainingSlots) {
      this.error = `Each objective can have up to ${this.maxObjectiveImages} images.`;
    } else {
      this.error = '';
    }

    input.value = '';
  }

  removeObjectiveImage(objectiveIndex: number, imageIndex: number): void {
    this.newGame.objectives[objectiveIndex].imageFiles.splice(imageIndex, 1);
  }

  formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  formatDurationMinutes(totalSeconds: number): string {
    return `${Math.round(totalSeconds / 60)} min`;
  }

  get availableCities(): string[] {
    return [...new Set(this.spots.map((s) => s.city))].sort();
  }

  get filteredSpots(): SpotSummary[] {
    if (!this.selectedCity) {
      return this.spots;
    }
    return this.spots.filter((s) => s.city === this.selectedCity);
  }

  private loadSessionsOnly(): void {
    this.api.hostSessions(this.password).subscribe({
      next: (sessions) => {
        this.sessions = sessions;
      },
      error: (error) => this.handleError(error, 'Could not refresh sessions.')
    });
  }

  private startSummaryPolling(): void {
    this.stopSummaryPolling();

    this.summaryPollHandle = setInterval(() => this.refreshSessionSummaries(), this.pollMs);
  }

  private stopSummaryPolling(): void {
    if (this.summaryPollHandle) {
      clearInterval(this.summaryPollHandle);
      this.summaryPollHandle = null;
    }
  }

  private refreshSessionSummaries(): void {
    if (!this.isAuthenticated || this.saving || this.bookingSaving) {
      return;
    }

    this.api.hostSessions(this.password).subscribe({
      next: (sessions) => {
        this.sessions = sessions;
      },
      error: (error) => {
        if (error.status === 401) {
          this.handleError(error, 'Could not refresh sessions.');
        }
      }
    });

    if (this.activeView === 'bookings') {
      this.api.hostBookings(this.password).subscribe({
        next: (bookings) => this.setBookingState(bookings),
        error: (error) => {
          if (error.status === 401) {
            this.handleError(error, 'Could not refresh booking applications.');
          }
        }
      });
    }
  }

  private startSessionPolling(): void {
    this.stopSessionPolling();

    this.sessionPollHandle = setInterval(() => this.refreshSelectedSession(), this.pollMs);
  }

  private stopSessionPolling(): void {
    if (this.sessionPollHandle) {
      clearInterval(this.sessionPollHandle);
      this.sessionPollHandle = null;
    }
  }

  private refreshSelectedSession(): void {
    if (!this.isAuthenticated || !this.selected || this.saving) {
      return;
    }

    const sessionId = this.selected.session.id;

    this.api.hostSession(this.password, sessionId).subscribe({
      next: (detail) => {
        if (this.selected?.session.id === sessionId) {
          this.selected = detail;
        }
      },
      error: (error) => {
        if (error.status === 401) {
          this.handleError(error, 'Could not refresh this session.');
          return;
        }

        if (error.status === 404) {
          this.selected = null;
          this.stopSessionPolling();
          this.activeView = 'menu';
          this.loadSessionsOnly();
        }
      }
    });
  }

  private loadBookings(): void {
    this.api.hostBookings(this.password).subscribe({
      next: (bookings) => this.setBookingState(bookings),
      error: (error) => this.handleBookingError(error, 'Could not load booking applications.')
    });
  }

  private setBookingState(bookings: HostBookingState): void {
    this.bookings = bookings;

    if (!this.availabilityStartDate || this.availabilityStartDate < bookings.today) {
      this.availabilityStartDate = bookings.today;
    }
    if (!this.availabilityEndDate || this.availabilityEndDate < this.availabilityStartDate) {
      this.availabilityEndDate = this.availabilityStartDate;
    }
  }

  private emptyBookingState(): HostBookingState {
    return {
      timezone: 'Europe/Paris',
      minParticipants: 1,
      bookingDurationMinutes: 180,
      slotIntervalMinutes: 30,
      today: '',
      maxBookingDate: '',
      availabilityGroups: [],
      pendingApplications: [],
      confirmedApplications: []
    };
  }

  private bookingStamp(date: string, time: string): number {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    return Date.UTC(year, month - 1, day, hours, minutes) / 60000;
  }

  private emptyGame(): GameForm {
    return {
      name: '',
      objectives: []
    };
  }

  private emptyObjective(): ObjectiveForm {
    return {
      title: '',
      locationDescription: '',
      taskDescription: '',
      points: 20,
      imageFiles: [],
      existingImageUrls: [],
      saveToLibrary: false
    };
  }

  private emptySpotForm(): SpotForm {
    return {
      city: '',
      title: '',
      locationDescription: '',
      taskDescription: '',
      points: 20,
      imageFiles: [],
      keepImageUrls: []
    };
  }

  private handleBookingError(error: any, fallback: string): void {
    this.error = error.error?.message || fallback;
    this.bookingSaving = false;

    if (error.status === 401) {
      this.handleError(error, fallback);
    }
  }

  private handleError(error: any, fallback: string): void {
    this.error = error.error?.message || fallback;
    this.loading = false;
    this.saving = false;

    if (error.status === 401) {
      localStorage.removeItem(this.passwordKey);
      this.isAuthenticated = false;
      this.stopSummaryPolling();
      this.stopSessionPolling();
    }
  }
}
