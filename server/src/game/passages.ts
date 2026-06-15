// A small pool of typing passages. Pure: pickPassage() just returns one at random.

const PASSAGES: string[] = [
  'The quick brown fox jumps over the lazy dog while the sun sets behind the hills.',
  'Typing fast is good, but typing without mistakes is what actually wins the race.',
  'A journey of a thousand miles begins with a single keystroke and a steady rhythm.',
  'Practice every day and your fingers will learn the keyboard better than your eyes.',
  'Clear code reads like a short story: simple words, one idea at a time, no surprises.',
];

export function pickPassage(): string {
  return PASSAGES[Math.floor(Math.random() * PASSAGES.length)];
}
