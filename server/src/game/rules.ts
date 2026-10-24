// The one place the ruleset is chosen. See README "Game rules".
export const RULES = {
  sixToLeaveBase: true, // a token needs a 6 to come out of base
  extraTurnOnSix: true, // rolling a 6 gives another roll
  extraTurnOnCapture: true, // capturing an opponent gives another roll
  extraTurnOnFinish: true, // bringing a token home gives another roll
  threeSixesForfeit: true, // a 3rd six in a row ends the turn with no move
};

export type Rules = typeof RULES;
