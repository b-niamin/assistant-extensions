import { describe, expect, it } from 'vitest';
import { imageOf, photoUrl } from './gym';
import { isPhoto, searchPhotos } from './photos';

describe('photos of own exercises', () => {
  it('finds a photo by name words, prefixes and equipment', () => {
    expect(searchPhotos('leg curl').map((c) => c.photo)).toEqual(expect.arrayContaining(['Lying_Leg_Curls', 'Seated_Leg_Curl']));
    expect(searchPhotos('calf raise machine').map((c) => c.photo)).toContain('Standing_Calf_Raises');
    expect(searchPhotos('abductor')[0].photo).toBe('Thigh_Abductor');
    expect(searchPhotos('  ')).toEqual([]);
  });
  it('knows only the source ids', () => {
    expect(isPhoto('Lying_Leg_Curls')).toBe(true);
    expect(isPhoto('../etc')).toBe(false);
    expect(isPhoto(undefined)).toBe(false);
  });
  it('shows a built-in picture first, else the own one', () => {
    expect(imageOf('xabc123', 1, { xabc123: 'Lying_Leg_Curls' })).toBe(photoUrl('Lying_Leg_Curls', 1));
    expect(imageOf('xabc123', 0, {})).toBeUndefined();
    expect(imageOf('bench', 0, { bench: 'Lying_Leg_Curls' })).not.toBe(photoUrl('Lying_Leg_Curls'));
  });
});
