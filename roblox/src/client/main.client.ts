// Client entry: builds the pitch, wires remotes to the renderer + HUD, drives camera each frame.
import { getRemotes, type Setup, type Snapshot } from "shared/net";
import { FollowCamera } from "./camera";
import * as fx from "./fx";
import { createHud } from "./hud";
import { FX, FX_BAD, type FxSheet } from "./fxIds";
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

// Preload every effect flipbook texture so the first cast in a match does not show unloaded (solid-colour) quads.
task.spawn(() => {
	const items: Instance[] = [];
	for (const [, sheet] of pairs(FX)) {
		const img = new Instance("ImageLabel");
		img.Image = (sheet as FxSheet).id;
		items.push(img);
	}
	pcall(() =>
		game.GetService("ContentProvider").PreloadAsync(items, (id: string, status: Enum.AssetFetchStatus) => {
			if (status !== Enum.AssetFetchStatus.Success) FX_BAD.add(id);
		}),
	);
	for (const i of items) i.Destroy();
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
	camera.update(dt, renderer.getFocusX(), renderer.getFocusZ());
	// Camera shake from combat effects (hits, roars, crashes); the showroom stage applies its own.
	const cam = game.Workspace.CurrentCamera;
	if (cam !== undefined && game.Workspace.GetAttribute("ShowroomActive") !== true) {
		const off = fx.shakeOffset(dt);
		if (off.Magnitude > 0) cam.CFrame = cam.CFrame.add(off);
	}
});
