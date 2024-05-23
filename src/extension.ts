import * as vscode from 'vscode';
import * as dbus from 'dbus-next';

enum ColorScheme {
	preferDark = 1,
	preferLight = 2,
	noPreference,
}


function colorSchemeToString(value: ColorScheme) {
	switch (value) {
		case ColorScheme.preferDark:
			return "Prefer Dark";
		case ColorScheme.preferLight:
			return "Prefer Light";
		default:
			return "No Preference";
	}
}


const COLOR_SCHEME_KEY = 'color-scheme';
const APPEARANCE_NAMESPACE = 'org.freedesktop.appearance';

const SETTINGS_LIGHT_THEME_KEY = 'color-scheme-light';
const SETTINGS_DARK_THEME_KEY = 'color-scheme-dark';

class Extension {
	private _colorScheme: ColorScheme;
	private bus: dbus.MessageBus;
	private iface: dbus.ClientInterface | null;
	private isColorSchemeWatched: boolean;
	private ifaceVersion: number;

	constructor() {
		this.bus = dbus.sessionBus();
		this.iface = null;
		this.ifaceVersion = 0;
		this._colorScheme = ColorScheme.noPreference;
		this.isColorSchemeWatched = this.getSettings(COLOR_SCHEME_KEY) || false;

		console.log(`Watch color scheme: ${this.isColorSchemeWatched}`);
	}

	public get colorScheme() {
		return this._colorScheme;
	}

	public set colorScheme(value: ColorScheme) {
		console.log(`Setting colorScheme to ${colorSchemeToString(value)}`);
		this._colorScheme = value;
		let theme;
		switch (this.colorScheme) {
			case ColorScheme.preferDark:
				theme = this.getSettings(SETTINGS_DARK_THEME_KEY);
			break;
			default:
			case ColorScheme.noPreference:
			case ColorScheme.preferLight:
				theme = this.getSettings(SETTINGS_LIGHT_THEME_KEY);
			break;
		}
		if (theme)
		{
			vscode.workspace.getConfiguration('workbench')
				.update('colorTheme', theme);
		}
	}

	async setup(): Promise<void> {
		const obj = await this.bus.getProxyObject('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop');

		const properties = obj.getInterface('org.freedesktop.DBus.Properties');
		this.ifaceVersion = (await properties.Get('org.freedesktop.portal.Settings', 'version') as dbus.Variant).value as number;
		console.log(`Settings iface version: ${this.ifaceVersion}`);
		this.iface =  obj.getInterface('org.freedesktop.portal.Settings');
		this.iface.on('SettingChanged', (namespace: string, key: string, valueVariant: dbus.Variant) => {
			console.log(`Setting changed: namespace=${namespace},key=${key},value=${valueVariant.value}`);
			if (namespace === APPEARANCE_NAMESPACE && key === COLOR_SCHEME_KEY && this.isColorSchemeWatched)
				{
					const innerVariant = valueVariant.value as number;
					// Avoid duplicated signals 
					if (this.colorScheme !== innerVariant)
						{
							this.colorScheme = innerVariant;
						}
				}
		});
		// Get actual initial state
		this.colorScheme = await this.getDBus(APPEARANCE_NAMESPACE, COLOR_SCHEME_KEY) as number;
		console.log(`Initial color scheme: ${colorSchemeToString(this.colorScheme)}`);
	}

	getSettings(key: string): any {
		return vscode.workspace.getConfiguration('xdp').get(key);
	}

	async getDBus(namespace: string, key: string): Promise<any> {
		if (this.ifaceVersion > 1)
			{
				const variant = await this.iface?.ReadOne(namespace, key) as dbus.Variant;
				return variant.value;
			} else {
				const innerVariant = await this.iface?.Read(namespace, key) as dbus.Variant;
				const outerVariant = innerVariant.value as dbus.Variant;
				return outerVariant.value;
			}
	}
}


export async function activate() {
	const extension = new Extension();
	await extension.setup();
}

export function deactivate() {}
