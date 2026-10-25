// The one place the ruleset is chosen. See README "Game rules".
export const RULES = {
  sixToLeaveBase: false, // a token needs a 6 to come out of base (off: a 6 never moves, see sixRerolls)
  sixRerolls: true, // a 6 moves nothing: you just roll again
  extraTurnOnSix: true, // rolling a 6 gives another roll after moving (only matters with sixRerolls off)
  extraTurnOnCapture: true, // capturing an opponent gives another roll
  extraTurnOnFinish: true, // bringing a token home gives another roll
  threeSixesForfeit: true, // a 3rd six in a row ends the turn with no move
};

export type Rules = typeof RULES;
