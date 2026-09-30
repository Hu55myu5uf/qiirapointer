// Business hours utility functions

export interface DayHours {
    open: string;
    close: string;
    closed: boolean;
}

export interface BusinessHours {
    monday: DayHours;
    tuesday: DayHours;
    wednesday: DayHours;
    thursday: DayHours;
    friday: DayHours;
    saturday: DayHours;
    sunday: DayHours;
}

export const DAYS_OF_WEEK = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
] as const;

export const DAY_LABELS: Record<string, string> = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
    monday: { open: '09:00', close: '17:00', closed: false },
    tuesday: { open: '09:00', close: '17:00', closed: false },
    wednesday: { open: '09:00', close: '17:00', closed: false },
    thursday: { open: '09:00', close: '17:00', closed: false },
    friday: { open: '09:00', close: '17:00', closed: false },
    saturday: { open: '10:00', close: '14:00', closed: false },
    sunday: { open: '00:00', close: '00:00', closed: true },
};

/**
 * Check if a business is currently open based on their hours
 */
export function isCurrentlyOpen(businessHours?: BusinessHours): { isOpen: boolean; message: string } {
    if (!businessHours) {
        return { isOpen: false, message: 'Hours not available' };
    }

    const now = new Date();
    const currentDay = DAYS_OF_WEEK[now.getDay()];
    const todayHours = businessHours[currentDay as keyof BusinessHours];

    if (!todayHours || todayHours.closed) {
        return { isOpen: false, message: 'Closed today' };
    }

    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    if (currentTime >= todayHours.open && currentTime <= todayHours.close) {
        return { isOpen: true, message: `Open until ${formatTime(todayHours.close)}` };
    } else if (currentTime < todayHours.open) {
        return { isOpen: false, message: `Opens at ${formatTime(todayHours.open)}` };
    } else {
        return { isOpen: false, message: 'Closed for today' };
    }
}

/**
 * Format time from 24h to 12h format
 */
export function formatTime(time: string): string {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

/**
 * Get display string for a day's hours
 */
export function getHoursDisplayString(dayHours: DayHours): string {
    if (dayHours.closed) {
        return 'Closed';
    }
    return `${formatTime(dayHours.open)} - ${formatTime(dayHours.close)}`;
}
