import type { Country } from "shared/data/types";
import { COUNTRIES } from "shared/logic/slots";
import { countryColor, countryName, FONT, hexString } from "./theme";

function label(parent: Instance, size: UDim2, pos: UDim2, textSize: number, color = new Color3(1, 1, 1)): TextLabel {
	const l = new Instance("TextLabel");
	l.BackgroundTransparency = 1;
	l.Size = size;
	l.Position = pos;
	l.Font = FONT;
	l.TextSize = textSize;
	l.TextColor3 = color;
	l.TextStrokeTransparency = 0.4;
	l.RichText = true;
	l.Text = "";
	l.Parent = parent;
	return l;
}

/** Score, clock, toasts, the country pick panel and the result overlay. */
export class Hud {
	readonly gui: ScreenGui;
	private readonly score: TextLabel;
	private readonly clock: TextLabel;
	private readonly toastLabel: TextLabel;
	private readonly pickPanel: Frame;
	private readonly pickTitle: TextLabel;
	private readonly pickButtons: TextButton[] = [];
	private readonly resultPanel: Frame;
	private readonly resultLabel: TextLabel;
	private toastToken = 0;
	private resultToken = 0;

	constructor(onPick: (country: Country) => void) {
		const gui = new Instance("ScreenGui");
		gui.Name = "SanguoHud";
		gui.ResetOnSpawn = false;
		gui.IgnoreGuiInset = true;
		gui.DisplayOrder = 5;
		this.gui = gui;

		this.score = label(gui, UDim2.fromOffset(420, 40), new UDim2(0.5, -210, 0, 8), 32);
		this.clock = label(gui, UDim2.fromOffset(260, 24), new UDim2(0.5, -130, 0, 50), 20, Color3.fromRGB(230, 230, 230));
		this.toastLabel = label(gui, UDim2.fromOffset(640, 44), new UDim2(0.5, -320, 0, 92), 30, Color3.fromRGB(255, 232, 140));

		const pick = new Instance("Frame");
		pick.BackgroundColor3 = Color3.fromRGB(15, 18, 24);
		pick.BackgroundTransparency = 0.25;
		pick.BorderSizePixel = 0;
		pick.Size = UDim2.fromOffset(460, 220);
		pick.AnchorPoint = new Vector2(0.5, 0.5);
		pick.Position = UDim2.fromScale(0.5, 0.5);
		pick.Visible = false;
		pick.Parent = gui;
		this.pickPanel = pick;
		this.pickTitle = label(pick, UDim2.fromOffset(460, 60), UDim2.fromOffset(0, 12), 30);
		const order: Country[] = COUNTRIES; // wei, shu, wu
		order.forEach((c, i) => {
			const b = new Instance("TextButton");
			b.Size = UDim2.fromOffset(120, 100);
			b.Position = UDim2.fromOffset(25 + i * 145, 90);
			b.BackgroundColor3 = countryColor(c);
			b.BorderSizePixel = 0;
			b.Font = FONT;
			b.Text = countryName(c);
			b.TextSize = 54;
			b.TextColor3 = new Color3(1, 1, 1);
			b.AutoButtonColor = true;
			b.Parent = pick;
			b.Activated.Connect(() => onPick(c));
			this.pickButtons.push(b);
		});

		const result = new Instance("Frame");
		result.BackgroundColor3 = Color3.fromRGB(15, 18, 24);
		result.BackgroundTransparency = 0.2;
		result.BorderSizePixel = 0;
		result.Size = UDim2.fromOffset(460, 200);
		result.AnchorPoint = new Vector2(0.5, 0.5);
		result.Position = UDim2.fromScale(0.5, 0.45);
		result.Visible = false;
		result.Parent = gui;
		this.resultPanel = result;
		this.resultLabel = label(result, UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), 32);

		const player = game.GetService("Players").LocalPlayer;
		gui.Parent = player.WaitForChild("PlayerGui");
	}

	private scoreText(teams: [Country, Country], score: [number, number]): string {
		const c0 = hexString(countryColor(teams[0]));
		const c1 = hexString(countryColor(teams[1]));
		return `<font color="${c0}">${countryName(teams[0])}</font>  ${score[0]} - ${score[1]}  <font color="${c1}">${countryName(teams[1])}</font>`;
	}

	setScore(teams: [Country, Country] | undefined, score: [number, number]): void {
		this.score.Text = teams === undefined ? "" : this.scoreText(teams, score);
	}

	setClock(text: string): void {
		this.clock.Text = text;
	}

	toast(text: string, seconds = 2): void {
		this.toastToken++;
		const token = this.toastToken;
		this.toastLabel.Text = text;
		task.delay(seconds, () => {
			if (this.toastToken === token) this.toastLabel.Text = "";
		});
	}

	/** Shows the country pick panel (buttons for the picker, a waiting text for everyone else). */
	showPick(canPick: boolean): void {
		this.pickPanel.Visible = true;
		this.pickTitle.Text = canPick ? "選擇你的國家" : "等待第一位玩家選擇國家…";
		for (const b of this.pickButtons) b.Visible = canPick;
	}

	hidePick(): void {
		this.pickPanel.Visible = false;
	}

	showResult(teams: [Country, Country] | undefined, score: [number, number], pk: [number, number] | undefined, seconds: number): void {
		this.resultToken++;
		const token = this.resultToken;
		this.resultPanel.Visible = true;
		const body = teams === undefined ? `${score[0]} - ${score[1]}` : this.scoreText(teams, score);
		const pkLine = pk !== undefined ? `\nPK ${pk[0]} - ${pk[1]}` : "";
		const render = (left: number): void => {
			this.resultLabel.Text = `比賽結束\n${body}${pkLine}\n<font size="20">${left} 秒後重新開始</font>`;
		};
		let left = math.ceil(seconds);
		render(left);
		task.spawn(() => {
			while (left > 0 && this.resultToken === token) {
				task.wait(1);
				left--;
				if (this.resultToken === token && left >= 0) render(left);
			}
		});
	}

	hideResult(): void {
		this.resultToken++;
		this.resultPanel.Visible = false;
	}
}
