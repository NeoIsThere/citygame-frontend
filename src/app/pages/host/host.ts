import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  CitygameApi,
  HostGameDetail,
  GameSummary,
  HostSubmission,
  HostSessionDetail,
  HostSessionSummary,
  Team
} from '../../core/citygame-api';

interface ObjectiveForm {
  title: string;
  locationDescription: string;
  taskDescription: string;
  points: number;
  imageFiles: File[];
}

interface GameForm {
  name: string;
  durationMinutes: number;
  objectives: ObjectiveForm[];
}

type HostView = 'menu' | 'gameEditor' | 'sessionStarter' | 'sessionDetail' | 'gameDetail';

@Component({
  selector: 'app-host',
  imports: [CommonModule, FormsModule],
  templateUrl: './host.html',
  styleUrl: './host.css'
})
export class HostComponent implements OnInit {
  password = '';
  isAuthenticated = false;
  games: GameSummary[] = [];
  sessions: HostSessionSummary[] = [];
  selected: HostSessionDetail | null = null;
  selectedGame: HostGameDetail | null = null;
  newGame: GameForm = this.emptyGame();
  newSessionGameId = '';
  newSessionName = '';
  loading = false;
  saving = false;
  error = '';
  notice = '';
  showSessionQrCodes = false;
  activeView: HostView = 'menu';

  readonly maxObjectiveImages = 3;

  private readonly passwordKey = 'citygame-host-password';

  constructor(private readonly api: CitygameApi) {}

  ngOnInit(): void {
    const stored = localStorage.getItem(this.passwordKey);

    if (stored) {
      this.password = stored;
      this.verifyPasswordAndLoadDashboard(stored);
    }
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
    localStorage.removeItem(this.passwordKey);
    this.isAuthenticated = false;
    this.password = '';
    this.games = [];
    this.sessions = [];
    this.selected = null;
    this.selectedGame = null;
    this.activeView = 'menu';
  }

  loadDashboard(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      games: this.api.hostGames(this.password),
      sessions: this.api.hostSessions(this.password)
    }).subscribe({
      next: ({ games, sessions }) => {
        this.games = games;
        this.sessions = sessions;
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
      sessions: this.api.hostSessions(password)
    }).subscribe({
      next: ({ games, sessions }) => {
        this.password = password;
        this.isAuthenticated = true;
        localStorage.setItem(this.passwordKey, password);
        this.games = games;
        this.sessions = sessions;
        this.loading = false;
        this.activeView = 'menu';
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
    this.activeView = 'gameEditor';
    this.selectedGame = null;
    this.error = '';
    this.notice = '';
  }

  openSessionStarter(): void {
    this.activeView = 'sessionStarter';
    this.selected = null;
    this.error = '';
    this.notice = '';
  }

  backToMenu(): void {
    this.activeView = 'menu';
    this.error = '';
  }

  removeObjective(index: number): void {
    if (this.newGame.objectives.length === 1) {
      return;
    }

    this.newGame.objectives.splice(index, 1);
  }

  createGame(): void {
    const payload = {
      name: this.newGame.name.trim(),
      durationMinutes: Number(this.newGame.durationMinutes),
      objectives: this.newGame.objectives.map((objective) => ({
        title: objective.title.trim(),
        locationDescription: objective.locationDescription.trim(),
        taskDescription: objective.taskDescription.trim(),
        points: Number(objective.points),
        imageFiles: objective.imageFiles
      }))
    };

    this.saving = true;
    this.error = '';

    this.api.createGame(this.password, payload).subscribe({
      next: () => {
        this.notice = 'Game created.';
        this.newGame = this.emptyGame();
        this.saving = false;
        this.loadDashboard();
        this.activeView = 'menu';
      },
      error: (error) => this.handleError(error, 'Could not create game.')
    });
  }

  createSession(): void {
    const gameId = Number(this.newSessionGameId);

    if (!Number.isInteger(gameId)) {
      this.error = 'Select a game first.';
      return;
    }

    this.saving = true;
    this.error = '';

    this.api
      .createSession(this.password, {
        gameId,
        name: this.newSessionName.trim() || undefined
      })
      .subscribe({
        next: (detail) => {
          this.selected = detail;
        this.newSessionName = '';
        this.notice = 'Session created. QR code is ready.';
        this.saving = false;
        this.loadSessionsOnly();
        this.activeView = 'sessionDetail';
      },
      error: (error) => this.handleError(error, 'Could not create session.')
    });
  }

  selectGame(gameId: number): void {
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

    const remainingSlots = this.maxObjectiveImages - objective.imageFiles.length;

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

  private loadSessionsOnly(): void {
    this.api.hostSessions(this.password).subscribe({
      next: (sessions) => {
        this.sessions = sessions;
      },
      error: (error) => this.handleError(error, 'Could not refresh sessions.')
    });
  }

  private emptyGame(): GameForm {
    return {
      name: '',
      durationMinutes: 75,
      objectives: [this.emptyObjective(), this.emptyObjective(), this.emptyObjective()]
    };
  }

  private emptyObjective(): ObjectiveForm {
    return {
      title: '',
      locationDescription: '',
      taskDescription: '',
      points: 20,
      imageFiles: []
    };
  }

  private handleError(error: any, fallback: string): void {
    this.error = error.error?.message || fallback;
    this.loading = false;
    this.saving = false;

    if (error.status === 401) {
      localStorage.removeItem(this.passwordKey);
      this.isAuthenticated = false;
    }
  }
}
