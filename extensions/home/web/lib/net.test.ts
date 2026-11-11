import { describe, expect, it } from 'vitest';
import { allowedHaUrl, publicUrl } from './net';

describe('where home may fetch from', () => {
  it('takes calendar feeds from the internet only', () => {
    expect(publicUrl('https://calendar.google.com/calendar/ical/x/basic.ics')).toBe(true);
    for (const bad of ['http://db:5432/', 'http://browser:9223/json/list', 'http://terminal:7681', 'http://127.0.0.1/', 'http://192.168.1.5/cal.ics', 'http://10.0.0.1/', 'http://[::1]/', 'http://web.internal/', 'file:///etc/passwd', 'http://100.101.1.2/'])
      expect(publicUrl(bad), bad).toBe(false);
  });
  it('lets Home Assistant live on the home network, not in the stack', () => {
    expect(allowedHaUrl('http://192.168.1.10:8123')).toBe(true);
    expect(allowedHaUrl('http://homeassistant.local:8123')).toBe(true);
    for (const bad of ['http://browser:9223', 'http://db:5432', 'http://127.0.0.1:8123']) expect(allowedHaUrl(bad), bad).toBe(false);
  });
});
