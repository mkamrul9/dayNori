import { describe, expect, it } from 'vitest';
import { GET } from './app/api/health/route';
import { HealthResponseSchema } from '@daynori/contracts';
import HomePage from './app/page';
import TodayPage from './app/today/page';
import PlanPage from './app/plan/page';
import PlanCalendarPage from './app/plan/calendar/page';
import LibraryPage from './app/library/page';
import JournalPage from './app/journal/page';
import SettingsPage from './app/settings/page';
import HelpPage from './app/help/page';
import NotFoundPage from './app/not-found';

describe('Web Application Navigation & Health Contracts', () => {
  it('GET /api/health returns valid 200 HealthResponse', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    const parsed = HealthResponseSchema.parse(json);
    expect(parsed.status).toBe('ok');
    expect(parsed.version).toBe('0.1.0');
  });

  it('exports all parent and child route page components', () => {
    expect(HomePage).toBeDefined();
    expect(TodayPage).toBeDefined();
    expect(PlanPage).toBeDefined();
    expect(PlanCalendarPage).toBeDefined();
    expect(LibraryPage).toBeDefined();
    expect(JournalPage).toBeDefined();
    expect(SettingsPage).toBeDefined();
    expect(HelpPage).toBeDefined();
    expect(NotFoundPage).toBeDefined();
  });
});
