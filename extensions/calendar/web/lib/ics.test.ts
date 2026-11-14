import { describe, expect, it } from 'vitest';
import { feedUrls, occurrences, parseIcs } from './ics';

const TZ = 'Europe/Warsaw';

const feed = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Family', ...events.flatMap((e) => ['BEGIN:VEVENT', e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

// Wednesday 11 Nov 2026 in Warsaw: 10 Nov 23:00Z .. 11 Nov 23:00Z
const DAY = { from: new Date('2026-11-10T23:00:00Z'), to: new Date('2026-11-11T23:00:00Z'), timeZone: TZ };
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const when = (e: { start: string; end?: string }) =>
  e.start.length === 10 ? 'All day' : e.end && e.end !== e.start ? `${clock(e.start)}–${clock(e.end)}` : clock(e.start);
const today = (text: string) => occurrences(parseIcs(text), DAY).map((e) => [e.title, when(e)]);

describe('parseIcs', () => {
  it('reads the calendar name, unfolds lines and unescapes text', () => {
    const cal = parseIcs(feed('UID:1\r\nSUMMARY:Dentist\\, then\r\n  shopping\r\nDTSTART:20261111T143000Z\r\nDTEND:20261111T150000Z'));
    expect(cal.name).toBe('Family');
    expect(cal.events[0].title).toBe('Dentist, then shopping');
    expect(cal.events[0].duration).toBe(1800);
  });
  it('ignores alarms inside an event', () => {
    const cal = parseIcs(feed('UID:1\r\nSUMMARY:Run\r\nDTSTART:20261111T060000Z\r\nBEGIN:VALARM\r\nTRIGGER:-PT10M\r\nSUMMARY:Alarm text\r\nEND:VALARM'));
    expect(cal.events).toHaveLength(1);
    expect(cal.events[0].title).toBe('Run');
  });
});

describe('occurrences', () => {
  it('keeps timed events of today in the house zone, from UTC, TZID and floating times', () => {
    expect(
      today(
        feed(
          'UID:a\r\nSUMMARY:UTC call\r\nDTSTART:20261111T140000Z\r\nDTEND:20261111T143000Z',
          'UID:b\r\nSUMMARY:Zoned\r\nDTSTART;TZID=Europe/Warsaw:20261111T193000\r\nDTEND;TZID=Europe/Warsaw:20261111T200000',
          'UID:c\r\nSUMMARY:Floating\r\nDTSTART:20261111T080000\r\nDURATION:PT45M',
          'UID:d\r\nSUMMARY:Tomorrow\r\nDTSTART:20261112T080000Z\r\nDTEND:20261112T090000Z',
          'UID:e\r\nSUMMARY:Late yesterday UTC = today 00:30\r\nDTSTART:20261110T233000Z\r\nDTEND:20261111T000000Z'
        )
      )
    ).toEqual([
      ['UTC call', '15:00–15:30'],
      ['Zoned', '19:30–20:00'],
      ['Floating', '08:00–08:45'],
      ['Late yesterday UTC = today 00:30', '00:30–01:00']
    ]);
  });
  it('covers all-day and multi-day events', () => {
    expect(
      today(
        feed(
          'UID:a\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20261111\r\nDTEND;VALUE=DATE:20261112',
          'UID:b\r\nSUMMARY:Trip\r\nDTSTART;VALUE=DATE:20261109\r\nDTEND;VALUE=DATE:20261113',
          'UID:c\r\nSUMMARY:Over\r\nDTSTART;VALUE=DATE:20261109\r\nDTEND;VALUE=DATE:20261111'
        )
      )
    ).toEqual([
      ['Holiday', 'All day'],
      ['Trip', 'All day']
    ]);
  });
  it('expands weekly, monthly and yearly rules, with exceptions and moved occurrences', () => {
    expect(
      today(
        feed(
          'UID:w\r\nSUMMARY:Gym\r\nDTSTART;TZID=Europe/Warsaw:20260902T180000\r\nDTEND;TZID=Europe/Warsaw:20260902T190000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE',
          'UID:w2\r\nSUMMARY:Every other Wednesday (not this one)\r\nDTSTART:20261104T090000Z\r\nRRULE:FREQ=WEEKLY;INTERVAL=2',
          'UID:m\r\nSUMMARY:Second Wednesday\r\nDTSTART:20260909T070000Z\r\nDURATION:PT1H\r\nRRULE:FREQ=MONTHLY;BYDAY=2WE',
          'UID:y\r\nSUMMARY:Birthday\r\nDTSTART;VALUE=DATE:20001111\r\nRRULE:FREQ=YEARLY',
          'UID:x\r\nSUMMARY:Cancelled today\r\nDTSTART:20261028T100000Z\r\nRRULE:FREQ=WEEKLY\r\nEXDATE:20261111T100000Z',
          'UID:mv\r\nSUMMARY:Standup\r\nDTSTART:20261102T080000Z\r\nDURATION:PT15M\r\nRRULE:FREQ=DAILY',
          'UID:mv\r\nSUMMARY:Standup (moved)\r\nRECURRENCE-ID:20261111T080000Z\r\nDTSTART:20261111T110000Z\r\nDURATION:PT15M',
          'UID:ended\r\nSUMMARY:Ended\r\nDTSTART:20261001T080000Z\r\nRRULE:FREQ=DAILY;UNTIL=20261031T235959Z',
          'UID:count\r\nSUMMARY:Three times\r\nDTSTART:20261109T080000Z\r\nRRULE:FREQ=DAILY;COUNT=3',
          'UID:count2\r\nSUMMARY:Twice only\r\nDTSTART:20261109T080000Z\r\nRRULE:FREQ=DAILY;COUNT=2'
        )
      )
    ).toEqual([
      ['Gym', '18:00–19:00'],
      ['Second Wednesday', '08:00–09:00'],
      ['Birthday', 'All day'],
      ['Standup (moved)', '12:00–12:15'],
      ['Three times', '09:00']
    ]);
  });
  it('skips cancelled events', () => {
    expect(today(feed('UID:a\r\nSUMMARY:Nope\r\nSTATUS:CANCELLED\r\nDTSTART:20261111T140000Z'))).toEqual([]);
  });
});

describe('occurrences over a range', () => {
  it('lists every occurrence of a month with stable ids and all-day ends', () => {
    const month = { from: new Date('2026-10-31T23:00:00Z'), to: new Date('2026-11-30T23:00:00Z'), timeZone: TZ };
    const list = occurrences(
      parseIcs(
        feed(
          'UID:w\r\nSUMMARY:Gym\r\nDTSTART;TZID=Europe/Warsaw:20260902T180000\r\nDTEND;TZID=Europe/Warsaw:20260902T190000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE',
          'UID:t\r\nSUMMARY:Trip\r\nDTSTART;VALUE=DATE:20261030\r\nDTEND;VALUE=DATE:20261103',
          'UID:c\r\nSUMMARY:Five\r\nDTSTART:20261020T080000Z\r\nRRULE:FREQ=WEEKLY;COUNT=5'
        )
      ),
      month
    );
    const gym = list.filter((e) => e.title === 'Gym');
    expect(gym).toHaveLength(9);
    expect(gym[0]).toEqual({ id: 'w|2026-11-02', title: 'Gym', start: '2026-11-02T17:00:00.000Z', end: '2026-11-02T18:00:00.000Z' });
    expect(list.find((e) => e.title === 'Trip')).toMatchObject({ start: '2026-10-30', end: '2026-11-03' });
    // 20 Oct, 27 Oct, 3, 10, 17 Nov: three of them in November
    expect(list.filter((e) => e.title === 'Five').map((e) => e.start.slice(0, 10))).toEqual(['2026-11-03', '2026-11-10', '2026-11-17']);
  });
  it('stops at the limit', () => {
    const year = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-12-31T00:00:00Z'), timeZone: TZ };
    expect(occurrences(parseIcs(feed('UID:d\r\nSUMMARY:Daily\r\nDTSTART:20260101T080000Z\r\nRRULE:FREQ=DAILY')), year, 50)).toHaveLength(50);
  });
});

describe('feedUrls', () => {
  it('takes webcal and https links, one per line or comma separated, once each', () => {
    expect(feedUrls('webcal://p01.icloud.com/x.ics\nhttps://calendar.google.com/a/basic.ics, https://calendar.google.com/a/basic.ics ftp://no')).toEqual([
      'https://p01.icloud.com/x.ics',
      'https://calendar.google.com/a/basic.ics'
    ]);
  });
});
