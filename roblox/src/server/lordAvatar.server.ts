// Builds each player's Roblox avatar as the lord model "lord_<userId>" inside ReplicatedStorage.Avatars, so the client
// can clone it like the other templates. Runs after avatars.server.ts has created the Avatars folder; the model is
// destroyed when the player leaves. Local test players (userId <= 0 in Studio) get a default HumanoidDescription.
const Players = game.GetService("Players");
const ReplicatedStorage = game.GetService("ReplicatedStorage");

/** Seconds to wait for avatars.server.ts to create ReplicatedStorage.Avatars. */
const AVATARS_WAIT = 30;

const lords = new Map<Player, Model>();

function createModel(desc: HumanoidDescription): Model | undefined {
	const [ok, model] = pcall(() => {
		return Players.CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15);
	});
	return ok ? model : undefined;
}

/** Builds the R15 lord model for a player: their real avatar if it can be fetched, else the default description. */
function buildLord(player: Player): Model | undefined {
	let model: Model | undefined;
	if (player.UserId > 0) {
		// Async variant (the sync one is deprecated). The typings take an opaque User type, so the number is cast.
		const [ok, desc] = pcall(() => {
			return Players.GetHumanoidDescriptionFromUserIdAsync(player.UserId as never);
		});
		if (ok && desc !== undefined) model = createModel(desc);
	}
	if (model === undefined) {
		model = createModel(new Instance("HumanoidDescription"));
	}
	if (model === undefined) return undefined;

	model.Name = `lord_${player.UserId}`;
	// Strip scripts (e.g. the Animate script) so the lord is a plain body like the other templates.
	for (const d of model.GetDescendants()) {
		if (d.IsA("Script") || d.IsA("LocalScript") || d.IsA("ModuleScript")) d.Destroy();
	}
	// Same structure as the other templates: an Animator under the Humanoid (client anims drive it).
	const humanoid = model.FindFirstChildOfClass("Humanoid");
	if (humanoid !== undefined && humanoid.FindFirstChildOfClass("Animator") === undefined) {
		const animator = new Instance("Animator");
		animator.Parent = humanoid;
	}
	return model;
}

function addLord(player: Player): void {
	if (lords.has(player)) return;
	task.spawn(() => {
		const folder: Instance | undefined = ReplicatedStorage.WaitForChild("Avatars", AVATARS_WAIT);
		if (folder === undefined) {
			warn("[lord] ReplicatedStorage.Avatars missing, no lord model");
			return;
		}
		const model = buildLord(player);
		if (model === undefined) {
			warn(`[lord] could not build model for ${player.Name}`);
			return;
		}
		model.Parent = folder;
		// The player may have left while the description was loading.
		if (player.Parent === undefined) {
			model.Destroy();
			return;
		}
		lords.set(player, model);
		print("[lord] model ready", model.Name);
	});
}

Players.PlayerAdded.Connect((player) => {
	addLord(player);
});

Players.PlayerRemoving.Connect((player) => {
	const model = lords.get(player);
	if (model !== undefined) {
		model.Destroy();
		lords.delete(player);
	}
});

for (const player of Players.GetPlayers()) {
	addLord(player);
}
