import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BookingApplicationPayload,
  BookingLanguage,
  BookingSlot,
  CitygameApi,
  PublicBookingOptions
} from '../../core/citygame-api';
import { COUNTRY_OPTIONS } from '../../core/countries';

interface CalendarCell {
  date: string | null;
  day: number | null;
  enabled: boolean;
}

interface BookingForm {
  participantCount: number;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  nationality: string;
  language: BookingLanguage;
}

@Component({
  selector: 'app-landing',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css'
})
export class LandingComponent implements OnInit {
  readonly currentYear = new Date().getFullYear();
  readonly countries = COUNTRY_OPTIONS;
  readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  bookingOptions: PublicBookingOptions | null = null;
  selectedDate = '';
  selectedSlot: BookingSlot | null = null;
  calendarMonth = '';
  bookingLoading = true;
  bookingSaving = false;
  bookingError = '';
  bookingNotice = '';
  bookingForm: BookingForm = this.emptyBookingForm();

  constructor(private readonly api: CitygameApi) {}

  ngOnInit(): void {
    this.loadBookingOptions();
  }

  get calendarTitle(): string {
    if (!this.calendarMonth) {
      return '';
    }

    const [year, month] = this.calendarMonth.split('-').map(Number);
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(
      new Date(year, month - 1, 1)
    );
  }

  get calendarCells(): CalendarCell[] {
    if (!this.calendarMonth) {
      return [];
    }

    const [year, month] = this.calendarMonth.split('-').map(Number);
    const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const openDates = new Set(this.bookingOptions?.dates.map((option) => option.date) || []);
    const cells: CalendarCell[] = Array.from({ length: firstWeekday }, () => ({
      date: null,
      day: null,
      enabled: false
    }));

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ date, day, enabled: openDates.has(date) });
    }

    return cells;
  }

  get selectedDateSlots(): BookingSlot[] {
    return this.bookingOptions?.dates.find((option) => option.date === this.selectedDate)?.slots || [];
  }

  get canShowPreviousMonth(): boolean {
    return Boolean(
      this.bookingOptions && this.calendarMonth > this.bookingOptions.minDate.slice(0, 7)
    );
  }

  get canShowNextMonth(): boolean {
    return Boolean(
      this.bookingOptions && this.calendarMonth < this.bookingOptions.maxDate.slice(0, 7)
    );
  }

  moveCalendar(monthDelta: number): void {
    const [year, month] = this.calendarMonth.split('-').map(Number);
    const target = new Date(year, month - 1 + monthDelta, 1);
    this.calendarMonth = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
  }

  selectDate(date: string | null, enabled: boolean): void {
    if (!date || !enabled) {
      return;
    }

    this.selectedDate = date;
    this.selectedSlot = null;
    this.bookingError = '';
  }

  selectSlot(slot: BookingSlot): void {
    this.selectedSlot = slot;
    this.bookingError = '';
  }

  formatSelectedDate(date: string): string {
    return new Intl.DateTimeFormat('en', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(`${date}T12:00:00`));
  }

  submitBooking(): void {
    if (!this.bookingOptions || !this.selectedDate || !this.selectedSlot) {
      this.bookingError = 'Choose an open date and time first.';
      return;
    }

    const payload: BookingApplicationPayload = {
      availabilityGroupId: this.selectedSlot.availabilityGroupId,
      slotDate: this.selectedDate,
      slotTime: this.selectedSlot.time,
      participantCount: Number(this.bookingForm.participantCount),
      phone: this.bookingForm.phone.trim(),
      email: this.bookingForm.email.trim(),
      firstName: this.bookingForm.firstName.trim(),
      lastName: this.bookingForm.lastName.trim(),
      nationality: this.bookingForm.nationality,
      language: this.bookingForm.language
    };

    this.bookingSaving = true;
    this.bookingError = '';
    this.bookingNotice = '';

    this.api.requestBooking(payload).subscribe({
      next: () => {
        this.bookingNotice =
          'Your request has been sent. The host will contact you after reviewing it.';
        this.bookingForm = this.emptyBookingForm();
        this.selectedSlot = null;
        this.bookingSaving = false;
        this.loadBookingOptions(false);
      },
      error: (error) => {
        this.bookingError = error.error?.message || 'Could not send your booking request.';
        this.bookingSaving = false;
        if (error.status === 409) {
          this.loadBookingOptions(false);
        }
      }
    });
  }

  private loadBookingOptions(showLoading = true): void {
    if (showLoading) {
      this.bookingLoading = true;
    }

    this.api.bookingOptions().subscribe({
      next: (options) => {
        this.bookingOptions = options;
        this.calendarMonth ||= options.minDate.slice(0, 7);
        this.bookingForm.participantCount = Math.max(
          this.bookingForm.participantCount,
          options.minParticipants
        );

        if (this.selectedDate && !options.dates.some((option) => option.date === this.selectedDate)) {
          this.selectedDate = '';
          this.selectedSlot = null;
        }

        this.bookingLoading = false;
      },
      error: () => {
        this.bookingError = 'Booking times are unavailable right now. Please try again later.';
        this.bookingLoading = false;
      }
    });
  }

  private emptyBookingForm(): BookingForm {
    return {
      participantCount: this.bookingOptions?.minParticipants || 1,
      phone: '',
      email: '',
      firstName: '',
      lastName: '',
      nationality: '',
      language: 'english'
    };
  }
}
