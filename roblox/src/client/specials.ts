// Showroom special-move table: charId -> demo function.
import { SpecialFn } from "./kit";
import { caocao, simayi, xuchu, zhangliao, zhenji } from "./specialsWei";
import { guanyu, machao, zhangfei, zhaoyun, zhugeliang } from "./specialsShu";
import { daqiao, sunce, sunquan, xiaoqiao, zhouyu } from "./specialsWu";

export const SPECIALS: Record<string, SpecialFn | undefined> = {
	zhangliao,
	zhenji,
	xuchu,
	caocao,
	simayi,
	zhangfei,
	guanyu,
	zhugeliang,
	machao,
	zhaoyun,
	sunquan,
	daqiao,
	zhouyu,
	xiaoqiao,
	sunce,
};
