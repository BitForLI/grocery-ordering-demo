const PICKUP_SLOT_MS = 60 * 60 * 1000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;

export interface PickupSlot {
  displayTime: string;
  value: string;
  dayKey: string;
}

export interface PickupDayCard {
  key: string;
  dayTop: string;
  dayBottom: string;
}

function getPickupHoursForDay(dayIndex: number): { openHour: number; closeHour: number } {
  if (dayIndex === 6) return { openHour: 8, closeHour: 18 };
  if (dayIndex === 0) return { openHour: 9, closeHour: 18 };
  return { openHour: 7, closeHour: 20 };
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function sameDay(first: Date, second: Date): boolean {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function ceilToNextHour(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 0, 0, 0);
  if (result.getTime() < date.getTime()) result.setHours(result.getHours() + 1);
  return result;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date, closeHour: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), closeHour, 0, 0, 0);
}

export function generateAllPickupSlots(now: Date): PickupSlot[] {
  const formatTime = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const slots: PickupSlot[] = [];
  const days = [startOfDay(now), new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)];

  for (const day of days) {
    const { openHour, closeHour } = getPickupHoursForDay(day.getDay());
    const dayOpen = new Date(day.getFullYear(), day.getMonth(), day.getDate(), openHour, 0, 0, 0);
    const dayClose = endOfDay(day, closeHour);
    const minimumStart = day.getTime() === startOfDay(now).getTime()
      ? ceilToNextHour(new Date(now.getTime() + PICKUP_SLOT_MS))
      : dayOpen;
    let slotStart = minimumStart > dayOpen ? minimumStart : dayOpen;

    while (slotStart < dayClose) {
      const slotEnd = new Date(slotStart.getTime() + PICKUP_SLOT_MS);
      if (slotEnd > dayClose) break;
      slots.push({
        displayTime: `${formatTime.format(slotStart)} – ${formatTime.format(slotEnd)}`,
        value: slotStart.toISOString(),
        dayKey: dateKey(slotStart),
      });
      slotStart = slotEnd;
    }
  }

  return slots;
}

export function generatePickupDayCards(now: Date): PickupDayCard[] {
  const keys = [...new Set(generateAllPickupSlots(now).map((slot) => slot.dayKey))].sort();
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const formatDate = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' });

  return keys.map((key) => {
    const date = parseDateKey(key);
    let dayTop: string;
    if (sameDay(date, today)) dayTop = 'Today';
    else if (sameDay(date, tomorrow)) dayTop = 'Tomorrow';
    else dayTop = WEEKDAY[date.getDay()];
    return { key, dayTop, dayBottom: formatDate.format(date) };
  });
}
