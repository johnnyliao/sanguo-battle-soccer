// Roblox image asset ids for the 2D art delivered on 2026-11-27 (art/incoming/batch1..3, branch art-delivery).
// Uploaded from Studio; keys are the delivered file names without ".png" (backgrounds use the 1024-wide versions).
export const ART: Record<string, string> = {
	// batch 1: menu
	bg_menu: "rbxassetid://86799086716751",
	logo: "rbxassetid://119055854422504",
	btn_red: "rbxassetid://94087741842666",
	btn_red_pressed: "rbxassetid://135821612044628",
	btn_blue: "rbxassetid://88967051594313",
	btn_blue_pressed: "rbxassetid://93012175411139",
	btn_gold: "rbxassetid://81992097034476",
	btn_gold_pressed: "rbxassetid://87007969964839",
	// batch 2: selection, map, results
	banner_shu: "rbxassetid://87479532796746",
	banner_wei: "rbxassetid://71909047870240",
	banner_wu: "rbxassetid://113352466070335",
	bg_intro: "rbxassetid://139342044696215",
	bg_map_ch1: "rbxassetid://93734162564013",
	card_frame_common: "rbxassetid://126579446700179",
	card_frame_rare: "rbxassetid://91143269125491",
	card_frame_legend: "rbxassetid://95785722458711",
	dialog_box: "rbxassetid://110019114542274",
	node_normal: "rbxassetid://135026789596368",
	node_boss: "rbxassetid://103039760754121",
	node_cleared: "rbxassetid://130505821236926",
	node_locked: "rbxassetid://75612190475814",
	title_victory: "rbxassetid://96200535521155",
	title_defeat: "rbxassetid://121357637031448",
	title_recruit: "rbxassetid://71371572721344",
	title_levelup: "rbxassetid://84759482675509",
	title_chapter_clear: "rbxassetid://76958252660967",
	weapon_sword: "rbxassetid://121031573485001",
	weapon_spear: "rbxassetid://112709855091812",
	weapon_fan: "rbxassetid://98227528437994",
	// batch 3: match HUD
	hud_scoreboard: "rbxassetid://128954569241818",
	btn_attack: "rbxassetid://96152749274976",
	btn_attack_disabled: "rbxassetid://106211715078713",
	btn_pass: "rbxassetid://133886526800307",
	btn_pass_disabled: "rbxassetid://132730462986608",
	btn_special: "rbxassetid://126541297174411",
	btn_special_disabled: "rbxassetid://136816714252639",
	icon_coin: "rbxassetid://119660377740759",
	icon_xp: "rbxassetid://105035298885929",
	icon_level: "rbxassetid://102339160775905",
	bar_frame: "rbxassetid://105013617198495",
	bar_fill: "rbxassetid://82378665867276",
	tut_arrow: "rbxassetid://81126472589070",
	tut_keys: "rbxassetid://81915600433506",
	tut_touch: "rbxassetid://85239410376739",
};

/** Bust portraits by charId (lord_* → portrait_lord, xiaobing_huangjin_boss → huangjin_boss, other xiaobing → huangjin). */
export const PORTRAIT: Record<string, string> = {
	caocao: "rbxassetid://119055883454573",
	daqiao: "rbxassetid://136478396090899",
	guanyu: "rbxassetid://98844007099052",
	machao: "rbxassetid://80969987368168",
	simayi: "rbxassetid://113816049270416",
	sunce: "rbxassetid://106818450398160",
	sunquan: "rbxassetid://115850920683476",
	xiaoqiao: "rbxassetid://73493713988449",
	xuchu: "rbxassetid://124133410678255",
	zhangfei: "rbxassetid://102316866363291",
	zhangliao: "rbxassetid://133933551452560",
	zhaoyun: "rbxassetid://99896633579312",
	zhenji: "rbxassetid://71120285494579",
	zhouyu: "rbxassetid://91098098251065",
	zhugeliang: "rbxassetid://133710583811831",
	huangjin: "rbxassetid://94919961381973",
	huangjin_boss: "rbxassetid://87038727058552",
	lord: "rbxassetid://121092250020463",
};

/** Special-move icons by charId; the lord's by weapon (lord_sword / lord_spear / lord_fan). */
export const SKILL_ICON: Record<string, string> = {
	caocao: "rbxassetid://82555611026512",
	daqiao: "rbxassetid://107521576645023",
	guanyu: "rbxassetid://97595533345731",
	machao: "rbxassetid://75468152396931",
	simayi: "rbxassetid://82148160961554",
	sunce: "rbxassetid://119146667294756",
	sunquan: "rbxassetid://84880812099919",
	xiaoqiao: "rbxassetid://75660018071506",
	xuchu: "rbxassetid://109057671067653",
	zhangfei: "rbxassetid://98234601755988",
	zhangliao: "rbxassetid://121266162046022",
	zhaoyun: "rbxassetid://114495625852420",
	zhenji: "rbxassetid://72692503887913",
	zhouyu: "rbxassetid://102447682948973",
	zhugeliang: "rbxassetid://133309690367765",
	lord_sword: "rbxassetid://106240955932153",
	lord_spear: "rbxassetid://119877353654944",
	lord_fan: "rbxassetid://136054433237746",
};

export function portraitFor(charId: string): string | undefined {
	if (charId.sub(1, 5) === "lord_") return PORTRAIT.lord;
	if (charId === "xiaobing_huangjin_boss") return PORTRAIT.huangjin_boss;
	if (charId.sub(1, 9) === "xiaobing_") return PORTRAIT.huangjin;
	return PORTRAIT[charId];
}

export function skillIconFor(charId: string, weapon?: string): string | undefined {
	if (charId.sub(1, 5) === "lord_") return SKILL_ICON[`lord_${weapon ?? "sword"}`];
	return SKILL_ICON[charId];
}
