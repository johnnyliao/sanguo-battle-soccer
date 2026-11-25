// Per-character AI-generated animations (Studio generate_animation), published asset ids.
export interface CharAnims { idle?: string; run?: string; attack?: string; special?: string }
/** Shared reaction clips used by every general (showroom stage). Filled in as they are published. */
export const SHARED_ANIMS: { hit?: string; knockdown?: string; getup?: string; stun?: string } = {
	hit: "rbxassetid://108919726012363",
	knockdown: "rbxassetid://73574455643973",
	getup: "rbxassetid://122925511944396",
	stun: "rbxassetid://124437077149730",
};
export const CHAR_ANIMS: Record<string, CharAnims | undefined> = {
	zhangliao: { idle: "rbxassetid://140526805552945", run: "rbxassetid://104333416659621", attack: "rbxassetid://88577901046314", special: "rbxassetid://84408728492665" },
	caocao: { idle: "rbxassetid://105817819913966", run: "rbxassetid://95464768606214", attack: "rbxassetid://77539385585321", special: "rbxassetid://92595743732508" },
	simayi: { idle: "rbxassetid://121991521487345", run: "rbxassetid://94733126908767", attack: "rbxassetid://122046491305455", special: "rbxassetid://94788909191012" },
	zhenji: { idle: "rbxassetid://128699543811569", run: "rbxassetid://118301892966279", attack: "rbxassetid://75885763270911", special: "rbxassetid://101435930694454" },
	xuchu: { idle: "rbxassetid://134208549964593", run: "rbxassetid://99333039254914", attack: "rbxassetid://138185696677497", special: "rbxassetid://76014857359773" },
	sunquan: { idle: "rbxassetid://89095918382130", run: "rbxassetid://85893275626604", attack: "rbxassetid://77539385585321", special: "rbxassetid://111313645338869" },
	daqiao: { idle: "rbxassetid://131118536481314", run: "rbxassetid://104504795242377", attack: "rbxassetid://122046491305455", special: "rbxassetid://92341698462473" },
	zhouyu: { idle: "rbxassetid://134806644822174", run: "rbxassetid://101320311313061", attack: "rbxassetid://77539385585321", special: "rbxassetid://98831234464914" },
	xiaoqiao: { idle: "rbxassetid://134044031824636", run: "rbxassetid://72455011180662", attack: "rbxassetid://122046491305455", special: "rbxassetid://74495070162441" },
	sunce: { idle: "rbxassetid://103519738674206", run: "rbxassetid://134081281871778", attack: "rbxassetid://138185696677497", special: "rbxassetid://128672344730308" },
	zhangfei: { idle: "rbxassetid://124037965815721", run: "rbxassetid://71478303740848", attack: "rbxassetid://89918665306088", special: "rbxassetid://74819463164436" },
	guanyu: { idle: "rbxassetid://134597831718005", run: "rbxassetid://103448790801455", attack: "rbxassetid://100887317745814", special: "rbxassetid://73658700688354" },
	zhugeliang: { idle: "rbxassetid://77100127247387", run: "rbxassetid://101320311313061", attack: "rbxassetid://122046491305455", special: "rbxassetid://79212586751430" }, // run shared with zhouyu (own clips drifted),
	machao: { idle: "rbxassetid://73924859379156", run: "rbxassetid://104853164895815", attack: "rbxassetid://89918665306088", special: "rbxassetid://136821611157205" },
	zhaoyun: { idle: "rbxassetid://76108270503706", run: "rbxassetid://71657108155586", attack: "rbxassetid://89918665306088", special: "rbxassetid://89918665306088" }, // special reuses the spear thrust (own special generation failed twice)
};
