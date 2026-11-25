// Copies the ServerStorage.Avatars folder (R15 avatar models, one per charId) into ReplicatedStorage so clients can clone them.
const ServerStorage = game.GetService("ServerStorage");
const ReplicatedStorage = game.GetService("ReplicatedStorage");

const source = ServerStorage.FindFirstChild("Avatars");
if (source !== undefined) {
	const copy = source.Clone();
	copy.Name = "Avatars";
	copy.Parent = ReplicatedStorage;
} else {
	warn("[avatars] ServerStorage.Avatars missing");
}
