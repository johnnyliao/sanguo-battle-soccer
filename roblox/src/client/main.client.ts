// Client entry: builds the pitch, wires remotes to the renderer + HUD, drives camera each frame.
import { getRemotes, type Setup, type Snapshot } from "shared/net";
import { FollowCamera } from "./camera";
import { createHud } from "./hud";
import { startInput } from "./input";
import { Renderer } from "./render";
import { buildWorld } from "./world";

const RunService = game.GetService("RunService");

// Single-player match: hide chat and player list (they cover the country cards and the HUD).
pcall(() => {
	const sg = game.GetService("StarterGui");
	sg.SetCoreGuiEnabled(Enum.CoreGuiType.Chat, false);
	sg.SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false);
});

const remotes = getRemotes();
buildWorld();
const renderer = new Renderer();
const camera = new FollowCamera();
const input = startInput(remotes);
const hud = createHud(remotes, (cooldown, reason) => input.getTouch()?.setSpecialState(cooldown, reason));

remotes.Setup.OnClientEvent.Connect((s: unknown) => {
	renderer.onSetup(s as Setup);
	hud.onSetup(s as Setup);
});

remotes.Snapshot.OnClientEvent.Connect((s: unknown) => {
	renderer.onSnapshot(s as Snapshot);
	hud.onSnapshot(s as Snapshot);
});

RunService.RenderStepped.Connect((dt) => {
	renderer.update(dt);
	camera.update(dt, renderer.getFocusX());
});
