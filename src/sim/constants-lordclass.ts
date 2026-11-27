// Lord class passives (流派): 猛將 mengjiang (FW), 軍師 junshi (MF), 鐵壁 tiebi (DF). Only a player whose CharacterDef has lordClass gets them.
// Timings are in ticks at TICK_HZ (60 per second).

/** 猛將 破陣: the ball shield absorbs one ball loss, then recharges this many ticks after it was used (3 s). */
export const LORD_SHIELD_RECHARGE_TICKS = 180;
/** 猛將 破陣: each knockdown he causes cuts his special cooldown by this many ticks (2 s, min 0). */
export const LORD_MENGJIANG_CD_CUT_TICKS = 120;
/** 軍師 運籌: his special cooldown after a cast is this share of SPECIAL_COOLDOWN_TICKS (rounded down). */
export const LORD_JUNSHI_COOLDOWN_MULT = 0.75;
/** 軍師 運籌: a teammate who receives his pass runs at this speed multiplier for LORD_PASS_BOOST_TICKS. */
export const LORD_PASS_BOOST_MULT = 1.25;
export const LORD_PASS_BOOST_TICKS = 120;
/** 鐵壁 固守: his slide tackle reaches this many times farther (body radius + victim radius + contact pad). */
export const LORD_TIEBI_TACKLE_RADIUS_MULT = 1.4;
/** 鐵壁 固守: every LORD_TIEBI_HOLD_EVERY-th knockdown (2nd, 4th, …) becomes hitstun for LORD_TIEBI_HOLD_TICKS instead. */
export const LORD_TIEBI_HOLD_EVERY = 2;
export const LORD_TIEBI_HOLD_TICKS = 18;
/** 鐵壁 固守: he gains the ball by picking up a ball his own hit or tackle knocked loose, within this many ticks of the hit. */
export const LORD_TIEBI_RALLY_WINDOW = 30;
/** 鐵壁 固守: when he gains the ball, every teammate (and he) runs at this speed multiplier for LORD_TIEBI_RALLY_TICKS. */
export const LORD_TIEBI_RALLY_MULT = 1.2;
export const LORD_TIEBI_RALLY_TICKS = 90;
