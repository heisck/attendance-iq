// The face check's challenge (face/app.py has the full story), fixed by the ticket: a colour sequence for
// the screen (indexes into COLORS) and the oval the face must come closer into ({x, y} its centre and w its
// width, as shares of the mirrored preview). Both reach the face service from the ticket, never the phone.
// No imports, so the phone (FaceCheck) and the tests can use it as is.

export const COLORS = [
  [255, 255, 255],
  [255, 40, 40],
  [40, 255, 40],
  [40, 80, 255],
  [255, 255, 40],
  [255, 40, 255],
  [40, 255, 255],
] as const;
export const FLASH_MS = 400; // per colour: 2.5 changes a second, under WCAG's 3 flashes a second
const SEQUENCE = 8;

export type Challenge = { colors: number[]; oval: { x: number; y: number; w: number } };

// Web Crypto, not Math.random: Math.random's state can be worked out from its outputs, which would let
// someone predict the next colours. (Modulo bias over 2^32 is nothing at these sizes.)
const random = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

export function pickChallenge(): Challenge {
  let colors: number[];
  do {
    colors = [];
    // Never the same colour twice in a row; the last is white (the close frames are taken in it, which
    // also lights the face for the embedding), so the one before it isn't.
    while (colors.length < SEQUENCE - 1) {
      const c = random(COLORS.length);
      if (c !== colors.at(-1) && !(colors.length === SEQUENCE - 2 && c === 0)) colors.push(c);
    }
    colors.push(0);
  } while (new Set(colors.filter(Boolean)).size < 3);
  const between = (lo: number, hi: number) => Math.round((lo + (random(1001) / 1000) * (hi - lo)) * 1000) / 1000;
  return { colors, oval: { x: between(0.4, 0.6), y: between(0.42, 0.52), w: between(0.66, 0.76) } };
}
