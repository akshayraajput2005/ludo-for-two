import { randomInt } from 'node:crypto';

// Cryptographically secure, uniform 1..6.
export const rollDie = () => randomInt(1, 7);
