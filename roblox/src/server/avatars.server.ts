// Copies the ServerStorage.Avatars / Weapons / Props folders into ReplicatedStorage so clients can clone them.
// Avatars: R15 avatar models, one per charId. Weapons: one Model per charId. Props: showroom special-move props.
const ServerStorage = game.GetService("ServerStorage");
const ReplicatedStorage = game.GetService("ReplicatedStorage");

for (const name of ["Avatars", "Weapons", "Props"]) {
	const source = ServerStorage.FindFirstChild(name);
	if (source !== undefined) {
		const copy = source.Clone();
		copy.Name = name;
		copy.Parent = ReplicatedStorage;
	} else {
		warn(`[avatars] ServerStorage.${name} missing`);
	}
}
