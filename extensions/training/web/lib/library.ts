/**
 * The built-in library: everything that can be an item of a workout. Cardio (a run, a ride, a swim: time,
 * distance, optional blocks for the watch), exercises (sets of reps, seconds or minutes, with kg) and
 * recovery (sauna, stretching). The strength exercises, their descriptions and cautions come from Piotr's
 * gym log. Custom entries live in training.library and are merged in by db.server.ts.
 */
import type { Item, Sport, Unit } from './model';

export const MUSCLES = {
  chest: 'Chest',
  shoulders: 'Shoulders (front, side)',
  rear: 'Rear shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  lats: 'Lats',
  upper: 'Mid back, traps',
  lower: 'Lower back',
  glutes: 'Glutes',
  quads: 'Quads',
  hams: 'Hamstrings',
  calves: 'Calves',
  hipflex: 'Hip flexors'
} as const;
export type Muscle = keyof typeof MUSCLES;

export const GROUPS = ['cardio', 'legs', 'back', 'chest', 'shoulders', 'arms', 'core', 'recovery'] as const;
export type Group = (typeof GROUPS)[number];
export const GROUP_LABELS: Record<Group, string> = {
  cardio: 'Cardio',
  legs: 'Legs',
  back: 'Back',
  chest: 'Chest',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  recovery: 'Recovery'
};
export const GROUP_OF: Record<Muscle, Group> = {
  chest: 'chest',
  shoulders: 'shoulders',
  rear: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  abs: 'core',
  obliques: 'core',
  hipflex: 'core',
  lats: 'back',
  upper: 'back',
  lower: 'back',
  glutes: 'legs',
  quads: 'legs',
  hams: 'legs',
  calves: 'legs'
};


export interface LibraryEntry {
  id: string;
  name: string;
  kind: 'cardio' | 'exercise';
  /** cardio: its sport. */
  sport?: Sport;
  /** exercise: what a set counts. */
  unit?: Unit;
  muscles?: Muscle[];
  /** Secondary muscles. */
  also?: Muscle[];
  group: Group;
  bodyweight?: boolean;
  /** Gentle on a sore lower back. */
  back_friendly?: boolean;
  description?: string;
  cautions?: string[];
  /** A default first set when it is added. */
  set?: { reps?: number; seconds?: number; kg?: number };
  sets?: number;
  custom?: boolean;
}

type Ex = Omit<LibraryEntry, 'kind' | 'group'> & { group?: Group };
const ex = (e: Ex): LibraryEntry => ({ kind: 'exercise', unit: 'reps', group: e.group ?? GROUP_OF[e.muscles![0]], ...e });
const cardio = (id: string, name: string, sport: Sport): LibraryEntry => ({ id, name, kind: 'cardio', sport, group: 'cardio' });

export const LIBRARY: LibraryEntry[] = [
  cardio('run', 'Run', 'running'),
  cardio('ride', 'Ride', 'cycling'),
  cardio('swim', 'Swim', 'swimming'),
  cardio('walk', 'Walk', 'walking'),
  cardio('hike', 'Hike', 'hiking'),
  cardio('row', 'Rowing', 'rowing'),
  cardio('ski', 'Skiing', 'skiing'),
  ex({ id: 'sauna', name: 'Sauna', group: 'recovery', unit: 'minutes', set: { seconds: 720 }, sets: 3, description: 'Rounds in the sauna, with cooling down and rest between them. Drink water.' }),
  ex({ id: 'stretching', name: 'Stretching', group: 'recovery', unit: 'minutes', set: { seconds: 600 }, sets: 1, bodyweight: true, back_friendly: true, description: 'Calm stretching after training: hold each position, breathe, never bounce.' }),
  ex({ id: 'foamroll', name: 'Foam rolling', group: 'recovery', unit: 'minutes', set: { seconds: 600 }, sets: 1, bodyweight: true, back_friendly: true, description: 'Slow rolling of tight muscles: calves, thighs, glutes, upper back. Not on the lower back itself.' }),
  ex({
    id: 'bench', name: 'Barbell bench press', muscles: ['chest'], also: ['triceps', 'shoulders'], set: { reps: 8 }, sets: 3,
    description: 'Lie on the bench, feet firm on the floor, shoulder blades pulled together and pressed into the bench. Lower the bar under control to the lower chest and press it back up over the shoulders.',
    cautions: ['Bouncing the bar off the chest', 'Lifting the glutes off the bench', 'Elbows at 90° to the body: keep them closer, about 45-70°', 'Letting the shoulder blades go at the top', 'Heavy sets without a spotter']
  }),
  ex({
    id: 'pulldown', name: 'Lat pulldown', muscles: ['lats'], also: ['biceps', 'rear', 'upper'], set: { reps: 10 }, sets: 3,
    description: 'Sit with the thighs locked under the pads, grip a little wider than the shoulders. Start by lowering the shoulder blades, then pull the bar to the upper chest, elbows down and back.',
    cautions: ['Pulling the bar behind the head', 'Leaning far back and swinging', 'Pulling with the arms only, without the shoulder blades', 'Letting the bar fly up']
  }),
  ex({
    id: 'cablerow', name: 'Seated cable row', muscles: ['upper', 'lats'], also: ['biceps', 'rear', 'lower'], set: { reps: 10 }, sets: 3,
    description: 'Sit upright, knees slightly bent. Pull the handle to the belly, squeezing the shoulder blades and keeping the elbows close, then straighten the arms slowly.',
    cautions: ['Rocking the torso back and forth', 'Rounding the back when the arms are straight', 'Shrugging the shoulders to the ears', 'Jerking the weight']
  }),
  ex({
    id: 'hyper', name: 'Back extension', muscles: ['lower', 'glutes'], also: ['hams'], bodyweight: true, set: { reps: 12 }, sets: 3,
    description: 'Set the pad just under the hip bone. Lower the torso by bending at the hips and come back to a straight line, squeezing the glutes.',
    cautions: ['Overextending the lower back at the top', 'Jerking and swinging', 'The pad set too high, which blocks the hips']
  }),
  ex({
    id: 'facepull', name: 'Face pull', muscles: ['rear', 'upper'], also: ['shoulders'], set: { reps: 15 }, sets: 3,
    description: 'Cable at face height, rope in an overhand grip. Pull the rope towards the eyes, spreading it apart, elbows high, and rotate the hands out at the end.',
    cautions: ['A weight so heavy that you lean back', 'Elbows dropping below the shoulders', 'Pulling to the neck or chest instead of the face']
  }),
  ex({
    id: 'cablecurl', name: 'Cable biceps curl', muscles: ['biceps'], also: ['forearms'], set: { reps: 12 }, sets: 3,
    description: 'Stand facing the low cable, elbows by the body. Curl until the hands reach the shoulders and lower slowly.',
    cautions: ['Elbows drifting forward', 'Swinging the torso', 'Cutting the bottom of the movement short']
  }),
  ex({
    id: 'kneeraise', name: 'Vertical knee raise', muscles: ['abs'], also: ['obliques'], bodyweight: true, set: { reps: 12 }, sets: 3,
    description: 'Forearms on the bars, back against the pad. Raise the knees to the chest, tucking the pelvis slightly, and lower them slowly.',
    cautions: ['Swinging the legs for momentum', 'Sinking into the shoulders', 'Back leaving the pad', 'Dropping the legs fast']
  }),
  ex({
    id: 'plank', name: 'Plank', muscles: ['abs'], also: ['obliques', 'shoulders'], bodyweight: true, unit: 'seconds', set: { seconds: 45 }, sets: 2,
    description: 'On the forearms and toes, the body in one line from head to heels. Brace the belly and glutes and breathe calmly.',
    cautions: ['Hips sagging', 'Glutes high in the air', 'Holding the breath', 'Lifting the head']
  }),
  ex({
    id: 'kbpass', name: 'Plank pull-through', muscles: ['abs', 'obliques'], also: ['shoulders', 'chest', 'triceps'], set: { reps: 10 }, sets: 3,
    description: 'High plank, feet a little wider than the hips, a kettlebell on the floor beside the right hand. Reach under the body with the left hand, drag the kettlebell to the left and leave it; then drag it back with the right hand. The hips stay still and level.',
    cautions: ['Rocking and twisting the hips', 'Hips sagging or pushed up', 'Feet too close together', 'Lifting and throwing the kettlebell instead of dragging it', 'Shoulders drifting in front of the hands']
  }),
  ex({
    id: 'halo', name: 'Kettlebell halo', muscles: ['shoulders'], also: ['upper', 'triceps', 'abs'], set: { reps: 8 }, sets: 3,
    description: 'Stand tall, kettlebell held by the horns, bottom up, in front of the chest. Circle it close around the head and back to the chest, then change direction. The torso stays still, belly and glutes braced.',
    cautions: ['Leaning back and arching the lower back', 'Circling far from the head', 'Shrugging', 'A weight too heavy for a full, smooth circle', 'Holding the breath']
  }),
  ex({
    id: 'swimmers', name: 'Swimmers', muscles: ['lower', 'glutes'], also: ['rear', 'upper', 'hams', 'shoulders'], bodyweight: true, unit: 'seconds', set: { seconds: 30 }, sets: 3,
    description: 'Lie face down, arms reached forward, legs straight. Lift the chest, arms and legs a little off the mat, eyes on the mat, then flutter: right arm with left leg, left arm with right leg, short and quick, belly and glutes braced.',
    cautions: ['Lifting the head and bending the neck', 'Arching the lower back instead of using glutes and back', 'Bending the knees', 'Holding the breath', 'Jerky, too wide movements']
  }),
  ex({
    id: 'catcamel', name: 'Cat-camel', muscles: ['lower'], also: ['abs', 'upper'], bodyweight: true, back_friendly: true, set: { reps: 8 }, sets: 1,
    description: 'On hands and knees: hands under the shoulders, knees under the hips. Breathing out, round the back up slowly and drop the head; breathing in, pass neutral into a slight arch, eyes up. Calm and smooth, to loosen the spine before training. 6-8 reps.',
    cautions: ['Arching the lower back into pain', 'Fast, jerky movements', 'Shifting the weight far forward or back', 'Holding the breath']
  }),
  ex({
    id: 'birddog', name: 'Bird dog', muscles: ['lower', 'glutes'], also: ['abs', 'obliques', 'shoulders'], bodyweight: true, back_friendly: true, set: { reps: 6 }, sets: 2,
    description: 'On hands and knees, back flat as a table, belly lightly braced. Reach one arm forward and the opposite leg back into a line with the body, hold for 5 seconds and return. Pelvis and lower back do not move, as if a glass of water stood on the back. Then the other side.',
    cautions: ['Raising the leg above the hip, which arches the lower back', 'Twisting the pelvis', 'Lifting the head', 'Hurrying: control counts, not reps']
  }),
  ex({
    id: 'deadbug', name: 'Dead bug', muscles: ['abs'], also: ['obliques', 'lower'], bodyweight: true, back_friendly: true, set: { reps: 8 }, sets: 3,
    description: 'On the back, arms straight up, hips and knees at right angles. Press the lower back into the mat. Slowly lower one arm behind the head and the opposite leg forward, just above the floor, without the lower back leaving the mat. Return and change sides; breathe out on the way down.',
    cautions: ['Lower back leaving the mat', 'Going too fast', 'Lowering the leg further than you can control', 'Holding the breath']
  }),
  ex({
    id: 'sideplank', name: 'Side plank', muscles: ['obliques'], also: ['abs', 'glutes', 'shoulders'], bodyweight: true, back_friendly: true, unit: 'seconds', set: { seconds: 30 }, sets: 2,
    description: 'On the side, elbow under the shoulder, legs straight on top of each other. Lift the hips into one line from head to feet and hold. Easier: from the knees. Then the other side.',
    cautions: ['Hips sagging', 'Hips pushed back', 'Elbow far from the shoulder', 'Sinking into the shoulder']
  }),
  ex({
    id: 'glutebridge', name: 'Glute bridge', muscles: ['glutes'], also: ['hams', 'lower'], bodyweight: true, back_friendly: true, set: { reps: 12 }, sets: 3,
    description: 'On the back, knees bent, feet hip-width close to the glutes. Squeeze the glutes and lift the hips until torso and thighs are in one line. Pause at the top, lower slowly. The movement comes from the glutes, not from arching the lower back.',
    cautions: ['Overextending the lower back at the top', 'Knees falling out or in', 'Pushing from the toes instead of the heels', 'Dropping the hips fast']
  }),
  ex({
    id: 'hipflexor', name: 'Hip flexor stretch', muscles: ['hipflex'], also: ['quads'], bodyweight: true, back_friendly: true, unit: 'seconds', set: { seconds: 45 }, sets: 2,
    description: 'Half-kneeling: one knee on the mat, the other foot in front, knee over the ankle. Squeeze the glute of the kneeling leg, tuck the pelvis slightly and move the hip forward until the front of the thigh and hip stretch. Then the other side.',
    cautions: ['Arching the lower back instead of moving the hips', 'A relaxed glute', 'Front knee far past the toes', 'Bouncing']
  }),
  ex({
    id: 'dbcurl', name: 'Wide dumbbell curl', muscles: ['biceps'], also: ['forearms'], set: { reps: 10 }, sets: 3,
    description: 'Stand tall, dumbbells in an underhand grip, hands turned out a little from the body. Curl the dumbbells wider than the shoulders, elbows staying at the sides, and lower slowly to straight arms.',
    cautions: ['Elbows moving away from the body', 'Swinging and helping with the hips', 'Cutting the bottom short', 'Dropping the dumbbells instead of lowering them']
  }),
  ex({
    id: 'squat', name: 'Barbell back squat', muscles: ['quads', 'glutes'], also: ['lower', 'hams'], set: { reps: 5 }, sets: 3,
    description: 'Bar on the upper back, feet shoulder-width. Sit the hips down and back, knees over the toes, and stand up pushing the floor away.',
    cautions: ['Knees caving in', 'Heels lifting', 'Rounding the back at the bottom', 'Looking at the ceiling or straight down']
  }),
  ex({
    id: 'deadlift', name: 'Deadlift', muscles: ['hams', 'glutes', 'lower'], also: ['upper', 'forearms', 'quads'], set: { reps: 5 }, sets: 3,
    description: 'Bar over the middle of the foot, back flat, belly braced. Lift with the bar close to the legs and finish by straightening the hips.',
    cautions: ['A round back', 'The bar drifting away from the legs', 'Jerking at the start', 'Leaning back at the top']
  }),
  ex({
    id: 'rdl', name: 'Romanian deadlift', muscles: ['hams', 'glutes'], also: ['lower'], set: { reps: 8 }, sets: 3,
    description: 'Stand with the bar, knees slightly bent. Push the hips back, sliding the bar down the thighs until the back of the thighs stretches, and come back up.',
    cautions: ['Rounding the back', 'Bending the knees like a squat', 'Going lower than a flat back allows']
  }),
  ex({
    id: 'ohp', name: 'Overhead press', muscles: ['shoulders'], also: ['triceps', 'upper'], set: { reps: 6 }, sets: 3,
    description: 'Standing, bar at the collarbones. Press it straight up overhead, moving the head slightly back and then under the bar.',
    cautions: ['Overarching the lower back', 'Helping with the legs', 'Elbows flared wide']
  }),
  ex({
    id: 'pullup', name: 'Pull-up', muscles: ['lats'], also: ['biceps', 'upper'], bodyweight: true, set: { reps: 6 }, sets: 3,
    description: 'Hang from the bar, overhand grip. Start by pulling the shoulder blades down, pull up until the chin passes the bar and lower to straight arms.',
    cautions: ['Swinging and kicking', 'A partial range', 'Dropping without control']
  }),
  ex({
    id: 'bbrow', name: 'Barbell row', muscles: ['upper', 'lats'], also: ['rear', 'biceps', 'lower'], set: { reps: 8 }, sets: 3,
    description: 'Lean the torso to about 45°, back flat. Pull the bar to the belly, squeezing the shoulder blades, and lower it under control.',
    cautions: ['A round back', 'Jerking the torso up on every rep', 'Pulling to the chest instead of the belly']
  }),
  ex({
    id: 'inclinedb', name: 'Incline dumbbell press', muscles: ['chest'], also: ['shoulders', 'triceps'], set: { reps: 10 }, sets: 3,
    description: 'Bench at 30-45°. Press the dumbbells over the chest and lower them slowly to the sides of the chest.',
    cautions: ['A bench too steep (mostly shoulders work)', 'Knocking the dumbbells together', 'Shoulder blades leaving the bench']
  }),
  ex({
    id: 'pushdown', name: 'Triceps pushdown', muscles: ['triceps'], set: { reps: 12 }, sets: 3,
    description: 'Stand at the high cable, elbows by the body. Straighten the arms down fully and come back slowly.',
    cautions: ['Elbows moving away from the body', 'Leaning over the weight', 'Helping with the shoulders']
  }),
  ex({
    id: 'dips', name: 'Dips', muscles: ['chest', 'triceps'], also: ['shoulders'], bodyweight: true, set: { reps: 8 }, sets: 3,
    description: 'Support yourself on the bars, arms straight. Lower until the upper arms are about parallel to the floor and push back up.',
    cautions: ['Going so deep that it loads the shoulders', 'Shrugging the shoulders to the ears', 'Swinging the legs']
  }),
  ex({
    id: 'lunge', name: 'Dumbbell lunges', muscles: ['quads', 'glutes'], also: ['hams'], set: { reps: 10 }, sets: 3,
    description: 'Dumbbells in the hands, step forward, lower the back knee almost to the floor and push back with the front leg.',
    cautions: ['The knee caving in', 'A step too short', 'Leaning the torso forward']
  }),
  ex({
    id: 'hipthrust', name: 'Hip thrust', muscles: ['glutes'], also: ['hams'], set: { reps: 10 }, sets: 3,
    description: 'Upper back on the bench, bar on the hips. Drive the hips up into a straight line with the thighs and squeeze the glutes hard at the top.',
    cautions: ['Overextending the lower back at the top', 'Lifting the chin', 'Feet too far or too close']
  }),
  ex({
    id: 'lateral', name: 'Lateral raise', muscles: ['shoulders'], also: ['upper'], set: { reps: 12 }, sets: 3,
    description: 'Stand with the dumbbells at the thighs, elbows slightly bent. Raise the arms sideways to shoulder height and lower slowly.',
    cautions: ['Swinging the torso', 'Raising the arms above the shoulders', 'A weight too heavy']
  }),
  ex({
    id: 'legpress', name: 'Leg press', muscles: ['quads', 'glutes'], also: ['hams'], set: { reps: 10 }, sets: 3,
    description: 'Back and hips against the pad, feet hip-width. Lower the platform by bending the knees and push it away without locking the knees.',
    cautions: ['Lower back leaving the pad at the bottom', 'Locking the knees straight', 'Knees caving in']
  }),
  ex({
    id: 'bbcurl', name: 'Barbell curl', muscles: ['biceps'], also: ['forearms'], set: { reps: 10 }, sets: 3,
    description: 'Stand with the bar in an underhand grip at shoulder width (a fixed bar is fine), elbows by the body. Curl until the bar reaches the shoulders and lower slowly to straight arms.',
    cautions: ['Swinging the torso', 'Elbows drifting forward', 'Dropping the bar']
  }),
  ex({
    id: 'latpull_close', name: 'Close-grip pulldown', muscles: ['lats'], also: ['biceps', 'upper'], set: { reps: 10 }, sets: 3,
    description: 'Like the lat pulldown, with a close V handle. Pull it to the upper chest, elbows close to the body.',
    cautions: ['Leaning far back', 'Pulling with the arms only']
  })
];

export const libraryById = (id: string, extra: LibraryEntry[] = []): LibraryEntry | undefined => extra.find((e) => e.id === id) ?? LIBRARY.find((e) => e.id === id);

/** The group of an entry the profile made: cardio, recovery (minutes, no muscles), else its first muscle's. */
export function groupFor(e: { kind: string; unit?: string; muscles?: string[] }): Group {
  if (e.kind === 'cardio') return 'cardio';
  const m = (e.muscles ?? []).find((x): x is Muscle => x in MUSCLES);
  if (m) return GROUP_OF[m];
  return e.unit === 'minutes' ? 'recovery' : 'core';
}

/**
 * Entries matching a search: words in the name (as shown, so translated, or in English) or a muscle;
 * `group` is a group or 'back_friendly'.
 */
export function searchLibrary(list: LibraryEntry[], q: string, group: string, label: (s: string) => string = (s) => s): LibraryEntry[] {
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  const words = fold(q).split(/\s+/).filter(Boolean);
  return list.filter((e) => {
    if (group === 'back_friendly' ? !e.back_friendly : group && group !== 'all' && e.group !== group) return false;
    if (!words.length) return true;
    const hay = fold([e.name, label(e.name), ...(e.muscles ?? []).flatMap((m) => [MUSCLES[m], label(MUSCLES[m])])].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** A new item of a workout from an entry: its default sets, or an open cardio item. */
export function itemFrom(e: LibraryEntry): Item {
  if (e.kind === 'cardio') return { kind: 'cardio', ref: e.id, sport: e.sport ?? 'other', name: e.name };
  const set = { ...(e.set ?? (e.unit === 'reps' ? { reps: 10 } : { seconds: e.unit === 'minutes' ? 600 : 30 })) };
  return { kind: 'exercise', ref: e.id, name: e.name, unit: e.unit ?? 'reps', sets: Array.from({ length: e.sets ?? (e.unit === 'minutes' ? 1 : 3) }, () => ({ ...set })), ...(e.unit === 'reps' || !e.unit ? { rest_s: 90 } : {}) };
}
