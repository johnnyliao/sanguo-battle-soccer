// Sim px to Roblox studs. Pure math, no Roblox services (unit-tested under Lune).
import { FIELD_D, FIELD_W } from "../sim/constants";

/** 1 stud = 10 sim px. */
export const STUDS_PER_PX = 0.1;
export const FIELD_STUDS_W = FIELD_W * STUDS_PER_PX;
export const FIELD_STUDS_D = FIELD_D * STUDS_PER_PX;

export function pxToStud(px: number): number {
	return px * STUDS_PER_PX;
}

/** Sim (x, y, z) to world (X, Y, Z): sim x is world X, sim y (depth) is world Z, sim z (height) is world Y. */
export function simToWorld(x: number, y: number, z: number): [number, number, number] {
	return [x * STUDS_PER_PX, z * STUDS_PER_PX, y * STUDS_PER_PX];
}
