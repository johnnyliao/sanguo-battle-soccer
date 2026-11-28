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

/** Batch 4 (lord progression, delivered 2026-11-28). */
export const ART4: Record<string, string> = {
	camp_bg: "rbxassetid://76607932354752",
	class_mengjiang: "rbxassetid://118994347952249",
	class_junshi: "rbxassetid://102966626893331",
	class_tiebi: "rbxassetid://97934459687256",
	emblem_mengjiang: "rbxassetid://120083761475954",
	emblem_junshi: "rbxassetid://82594911572617",
	emblem_tiebi: "rbxassetid://125628926605930",
	passive_pozhen: "rbxassetid://133153423878766",
	passive_yunchou: "rbxassetid://97891587054627",
	passive_gushou: "rbxassetid://139190926700095",
	loot_banner: "rbxassetid://140522221090572",
	slot_frame: "rbxassetid://137997648566832",
	weapon_type_sword: "rbxassetid://128551622237138",
	weapon_type_polearm: "rbxassetid://74368815073852",
	weapon_type_fan: "rbxassetid://123053922784775",
	weapon_type_heavy: "rbxassetid://139979883963780",
	// batch 6: appearance upgrades (forge)
	aura_bronze: "rbxassetid://130920687505365",
	aura_silver: "rbxassetid://78530779654025",
	aura_gold: "rbxassetid://126155043053416",
	aura_rainbow: "rbxassetid://94284973095363",
	badge_plus: "rbxassetid://74188109666498",
	banner_ultimate: "rbxassetid://80561150885991",
	btn_forge: "rbxassetid://87224568307352",
	btn_forge_pressed: "rbxassetid://131347275418669",
	forge_bg: "rbxassetid://112941857730172",
	fx_flame: "rbxassetid://78337100495206",
	fx_lightning: "rbxassetid://81144395424817",
	res_bingshu: "rbxassetid://131242888168611",
	res_jingtie: "rbxassetid://103021756520601",
	star_off: "rbxassetid://117111278107299",
	star_on: "rbxassetid://103145719846750",
	trail_slash: "rbxassetid://76754800122479",
	// batch 7: lord ranks and look parts (rank_01..11 = rank tiers 1..11)
	beast_chihu: "rbxassetid://88966794394977",
	beast_jinlong: "rbxassetid://96668193302861",
	beast_qingluan: "rbxassetid://105271255417631",
	beast_xuangui: "rbxassetid://83811445437326",
	fx_dragonscale: "rbxassetid://138160829653549",
	fx_vortex: "rbxassetid://110011939123647",
	halo: "rbxassetid://133668242910563",
	rank_01: "rbxassetid://134720432113730",
	rank_02: "rbxassetid://105058619697076",
	rank_03: "rbxassetid://110057856366233",
	rank_04: "rbxassetid://100250588911536",
	rank_05: "rbxassetid://111679583601712",
	rank_06: "rbxassetid://108712527138113",
	rank_07: "rbxassetid://113192109176900",
	rank_08: "rbxassetid://136661098930002",
	rank_09: "rbxassetid://131514334531439",
	rank_10: "rbxassetid://126643733031431",
	rank_11: "rbxassetid://111731813475727",
	title_entrance: "rbxassetid://77656110332747",
	title_rankup: "rbxassetid://109336802097927",
	wings_aura: "rbxassetid://76805715949291",
	wings_gold: "rbxassetid://125067017605866",
};

/** Weapon icons by item id: general charId → that general's weapon; lord_* → the batch-2 weapon art. */
export const WEAPON_ICON: Record<string, string> = {
	caocao: "rbxassetid://122094886195427",
	daqiao: "rbxassetid://121342837188773",
	guanyu: "rbxassetid://81379639411884",
	machao: "rbxassetid://105722030877731",
	simayi: "rbxassetid://123931166690230",
	sunce: "rbxassetid://87906466550148",
	sunquan: "rbxassetid://78104747702957",
	xiaoqiao: "rbxassetid://136698709223514",
	xuchu: "rbxassetid://102451533302322",
	zhangfei: "rbxassetid://108071655794853",
	zhangliao: "rbxassetid://114546431235925",
	zhaoyun: "rbxassetid://82125448494617",
	zhenji: "rbxassetid://118514362065278",
	zhouyu: "rbxassetid://138649674273815",
	zhugeliang: "rbxassetid://96937769327410",
	lord_sword: "rbxassetid://121031573485001",
	lord_spear: "rbxassetid://112709855091812",
	lord_fan: "rbxassetid://98227528437994",
};

/** Look-part icons by cosmetic id (cosmetics.ts). Batch-7 icons are named by pinyin (icon_part_<slot>_<pinyin>.png); beasts use
 * their full art. Parts without an entry (trails, orbit, entrance, goal) have no icon yet. */
export const PART_ICON: Record<string, string> = {
	helmet_cloth: "rbxassetid://131384450730133", // icon_part_helmet_butoujin
	helmet_leather: "rbxassetid://79235726752515", // icon_part_helmet_pikui
	helmet_iron_plume: "rbxassetid://118467046876325", // icon_part_helmet_tiefeng
	helmet_eyeglow: "rbxassetid://135581221819213", // icon_part_helmet_yanfeng
	helmet_phoenix: "rbxassetid://139192114505783", // icon_part_helmet_fengchi
	helmet_dragon: "rbxassetid://106885803970658", // icon_part_helmet_longshou
	chest_rags: "rbxassetid://118967997433310", // icon_part_chest_pobuyi
	chest_leather: "rbxassetid://112265445852897", // icon_part_chest_pijia
	chest_iron: "rbxassetid://102242303872713", // icon_part_chest_tiejia
	chest_silver_shiny: "rbxassetid://75501178287888", // icon_part_chest_liangyin
	chest_silver_gold: "rbxassetid://127914660134699", // icon_part_chest_yinjiajinbian
	chest_gold: "rbxassetid://98839112234117", // icon_part_chest_jinjia
	chest_gold_thunder: "rbxassetid://89089657916887", // icon_part_chest_leiwen
	chest_dragon: "rbxassetid://89818668756619", // icon_part_chest_jinlong
	shoulder_leather: "rbxassetid://106192348100321", // icon_part_shoulder_pihujian
	shoulder_silver: "rbxassetid://75004966318318", // icon_part_shoulder_liangyin
	shoulder_lion: "rbxassetid://92509704659295", // icon_part_shoulder_shitou
	shoulder_dragon: "rbxassetid://106940478802559", // icon_part_shoulder_jinlong
	cape_brown: "rbxassetid://136846098019253", // icon_part_cape_hedapeng
	cape_red: "rbxassetid://95997975931682", // icon_part_cape_hongdapeng
	cape_flame: "rbxassetid://84241437279620", // icon_part_cape_huoyan
	cape_gold: "rbxassetid://87513805491599", // icon_part_cape_jinwen
	cape_dragon: "rbxassetid://132818113963098", // icon_part_cape_jinlong
	back_pennant: "rbxassetid://104084381522515", // icon_part_back_sanjiaoqi
	back_flags2: "rbxassetid://86810883414675", // icon_part_back_shuangqi
	back_flags4: "rbxassetid://101820429955404", // icon_part_back_siqi
	back_wings_aura: "rbxassetid://89036964933879", // icon_part_back_zhanqi
	back_wings_gold: "rbxassetid://130584149551842", // icon_part_back_guangyi
	beast_chihu: "rbxassetid://88966794394977",
	beast_qingluan: "rbxassetid://105271255417631",
	beast_xuangui: "rbxassetid://83811445437326",
	beast_jinlong: "rbxassetid://96668193302861",
};
