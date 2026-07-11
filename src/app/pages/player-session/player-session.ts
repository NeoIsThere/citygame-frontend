import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CitygameApi, PublicSessionState, Team } from '../../core/citygame-api';

@Component({
  selector: 'app-player-session',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './player-session.html',
  styleUrl: './player-session.css'
})
export class PlayerSessionComponent implements OnInit, OnDestroy {
  sessionId = '';
  state: PublicSessionState | null = null;
  currentTeamId: number | null = null;
  newTeamName = '';
  loading = true;
  joining = false;
  error = '';
  displaySeconds = 0;
  selectedProofFiles: Record<number, File[]> = {};
  uploadingObjectiveId: number | null = null;

  private refreshHandle: ReturnType<typeof setInterval> | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: CitygameApi
  ) {}

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.paramMap.get('sessionId') || '';

    if (!this.sessionId) {
      this.error = 'Session not found.';
      this.loading = false;
      return;
    }

    this.currentTeamId = this.readTeamId();
    this.load(true);

    this.refreshHandle = setInterval(() => this.load(false), 10000);
    this.tickHandle = setInterval(() => this.tick(), 1000);
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
    }

    if (this.tickHandle) {
      clearInterval(this.tickHandle);
    }
  }

  get hasJoined(): boolean {
    return Boolean(this.state?.joinedTeam);
  }

  get canChangeTeam(): boolean {
    return this.state?.session.status === 'waiting';
  }

  get activeObjectives() {
    return this.state?.objectives?.active || [];
  }

  get completedObjectives() {
    return this.state?.objectives?.completed || [];
  }

  get isGameOver(): boolean {
    return Boolean(
      this.state?.session.isExpired ||
        (this.state?.session.status === 'running' && this.displaySeconds <= 0)
    );
  }

  get rankedTeams(): Team[] {
    return [...(this.state?.teams || [])].sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.name.localeCompare(right.name);
    });
  }

  get winners(): Team[] {
    const [topTeam] = this.rankedTeams;

    if (!topTeam) {
      return [];
    }

    return this.rankedTeams.filter((team) => team.score === topTeam.score);
  }

  get winnerScore(): number {
    return this.winners[0]?.score || 0;
  }

  get winnerTitle(): string {
    if (this.winners.length === 0) {
      return 'Race finished';
    }

    return this.winners.length === 1 ? 'Winner' : 'Photo finish';
  }

  get winnerNames(): string {
    if (this.winners.length === 0) {
      return 'No teams joined';
    }

    return this.winners.map((team) => team.name).join(' + ');
  }

  proofFileNames(objectiveId: number): string {
    const files = this.selectedProofFiles[objectiveId] || [];
    return files.map((file) => file.name).join(', ');
  }

  load(showLoading: boolean): void {
    if (showLoading) {
      this.loading = true;
    }

    this.api.getSession(this.sessionId, this.currentTeamId).subscribe({
      next: (state) => {
        this.state = state;
        this.displaySeconds = state.session.remainingSeconds;

        if (this.currentTeamId && !state.joinedTeam) {
          this.clearStoredTeam();
        }

        this.loading = false;
        this.error = '';
      },
      error: (error) => {
        this.error = error.error?.message || 'Could not load this session.';
        this.loading = false;
      }
    });
  }

  joinExisting(team: Team): void {
    this.currentTeamId = team.id;
    localStorage.setItem(this.storageKey(), String(team.id));
    this.load(true);
  }

  createTeam(): void {
    const name = this.newTeamName.trim();

    if (name.length < 2) {
      this.error = 'Team name must be at least 2 characters.';
      return;
    }

    this.joining = true;
    this.api.createTeam(this.sessionId, name).subscribe({
      next: (state) => {
        this.state = state;
        this.currentTeamId = state.joinedTeam?.id || null;

        if (this.currentTeamId) {
          localStorage.setItem(this.storageKey(), String(this.currentTeamId));
        }

        this.newTeamName = '';
        this.displaySeconds = state.session.remainingSeconds;
        this.joining = false;
        this.error = '';
      },
      error: (error) => {
        this.error = error.error?.message || 'Could not create this team.';
        this.joining = false;
      }
    });
  }

  onProofFiles(objectiveId: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []).slice(0, 3);
    this.selectedProofFiles[objectiveId] = files;
  }

  submitProof(objectiveId: number): void {
    const files = this.selectedProofFiles[objectiveId] || [];

    if (!this.currentTeamId) {
      this.error = 'Join a team first.';
      return;
    }

    if (files.length === 0) {
      this.error = 'Add at least one photo.';
      return;
    }

    this.uploadingObjectiveId = objectiveId;
    this.error = '';

    this.api.submitObjectiveProof(this.sessionId, objectiveId, this.currentTeamId, files).subscribe({
      next: (state) => {
        this.state = state;
        this.displaySeconds = state.session.remainingSeconds;
        delete this.selectedProofFiles[objectiveId];
        this.uploadingObjectiveId = null;
      },
      error: (error) => {
        this.error = error.error?.message || 'Could not send these photos.';
        this.uploadingObjectiveId = null;
      }
    });
  }

  changeTeam(): void {
    if (!this.canChangeTeam) {
      return;
    }

    this.clearStoredTeam();
    this.load(true);
  }

  timerText(): string {
    const session = this.state?.session;

    if (!session) {
      return '';
    }

    if (session.status === 'waiting') {
      return 'game not started yet';
    }

    if (this.displaySeconds <= 0) {
      return 'time is up';
    }

    const formatted = this.formatSeconds(this.displaySeconds);

    if (session.status === 'paused') {
      return `paused at ${formatted}`;
    }

    if (session.status === 'stopped') {
      return `stopped at ${formatted}`;
    }

    return formatted;
  }

  statusText(): string {
    const status = this.state?.session.status;

    if (!status) {
      return '';
    }

    return status === 'waiting' ? 'not started' : status;
  }

  private tick(): void {
    if (this.state?.session.status === 'running' && this.displaySeconds > 0) {
      this.displaySeconds -= 1;
    }
  }

  private formatSeconds(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private readTeamId(): number | null {
    const stored = Number(localStorage.getItem(this.storageKey()));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  }

  private clearStoredTeam(): void {
    this.currentTeamId = null;
    localStorage.removeItem(this.storageKey());
  }

  private storageKey(): string {
    return `citygame-team:${this.sessionId}`;
  }
}
