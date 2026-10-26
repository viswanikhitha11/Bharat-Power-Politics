'use strict';
module.exports = {
  SEATS_TOTAL: 543, MAJORITY: 272, SUPERMAJORITY: 362,
  AP_PER_ROUND: 6, START_FUNDS: 100, ENERGY_MAX: 100,
  COST: {
    rally: { ap: 1, funds: 8, energy: 14 },
    booth: { ap: 1, funds: 5 },
    ad: { ap: 1, funds: 10 },
    poll: { ap: 1, funds: 12 },
    fundraise: { ap: 1 },
    rest: { ap: 1 },
    attack: { ap: 1, funds: 12 },
  },
  LIMIT: {
    fundraisePerRound: 2, attackPerRound: 1, policyChangesPerRound: 2, rallyPerSeatPerRound: 2,
    seatSpendCap: 60,          // "Election Commission" cap on spend per party per constituency
    hoardThreshold: 200,       // funds above this decay every round
    maxAllianceSize: 3, allianceLockRounds: 2,
    chatLen: 240,
  },
  BASE_BUDGET: { health: 16, education: 16, infra: 22, welfare: 18, agri: 16, defence: 12 },
  BUDGET_SECTOR_INDEX: { health: 'health', education: 'education', infra: 'infra', welfare: 'welfare', agri: 'agri', defence: 'security' },
  BUDGET_LIMITS: { sectorMin: 5, sectorMax: 40, sectorStep: 8, taxMin: 15, taxMax: 40, taxStep: 3, defMin: 1, defMax: 9, defStep: 1 },
  ROUNDS_MIN: 4, ROUNDS_MAX: 20, TIMERS: [0, 45, 60, 90, 120, 180, 300],
};
