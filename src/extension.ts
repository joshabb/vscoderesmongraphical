'use strict';
import { window, ExtensionContext, StatusBarAlignment, StatusBarItem, workspace, WorkspaceConfiguration, commands } from 'vscode';
import { Units, DiskSpaceFormat, DiskSpaceFormatMappings, FreqMappings, MemMappings, NetMappings, ProgressMappings } from './constants';

var si = require('systeminformation');

export function activate(context: ExtensionContext) {
    var resourceMonitor: ResMonGraphical = new ResMonGraphical();
    for (let key of resourceMonitor.getConfigKeys()) {
        const command = `resmongraphical.openSettings${key}`;

        const commandHandler = (name: string) => {
            commands.executeCommand('workbench.action.openSettings', `resmongraphical${key}`);
        };

        context.subscriptions.push(commands.registerCommand(command, commandHandler));
    }
    resourceMonitor.StartUpdating();
    context.subscriptions.push(resourceMonitor);

}

class ResourceDisplayItem {
    public key: string;
    public text: string;
    public tooltip: string;
    public color: string | null;

    constructor(text: string, tooltip: string, color: string | null) {
        this.key = '';
        this.text = text;
        this.tooltip = tooltip;
        this.color = color;
    }
}

abstract class Resource {
    protected _config: WorkspaceConfiguration;
    protected _isShownByDefault: boolean;
    protected _configKey: string;
    protected _maxWidth: number;


    constructor(config: WorkspaceConfiguration, isShownByDefault: boolean, configKey: string) {
        this._config = config;
        this._isShownByDefault = isShownByDefault;
        this._configKey = configKey;
        this._maxWidth = 0;
    }

    public setConfig(config: WorkspaceConfiguration) {
        this._config = config;
    }

    public getConfigKey(): string {
        return this._configKey;
    }

    public async getResourceDisplay(): Promise<ResourceDisplayItem | null> {
        if (await this.isShown()) {
            let display = await this.getDisplay();
            display.key = this._configKey;
            return display;
        }

        return null;
    }

    protected getColor(): string | null {
        const defaultColor = null;

        // Enforce #RRGGBB format
        let hexColorCodeRegex = /^#[0-9A-F]{6}$/i;
        let configColor = this._config.get(`${this._configKey}.color`, defaultColor);
        if (configColor !== null && !hexColorCodeRegex.test(configColor)) {
            configColor = defaultColor;
        }

        return configColor;
    }

    protected getProgressArray(): string[] {
        let progressType = this._config.get(`${this._configKey}.style`, 'Vertical');
        if (!(progressType in ProgressMappings)) {
            console.error(`\`${progressType}\``, 'is not a valid type style. Setting to `Vertical`.')
            progressType = 'Vertical';
        }
        return ProgressMappings[progressType];
    }

    /**
     *
     * @param progress  - a number between 0 and 100
     */
    protected getProgress(progress: number): string {
        progress = Math.min(100.0, progress);
        progress = Math.max(0, progress);
        let progressArray = this.getProgressArray();
        let index = Math.round((progress / 100.0) * (progressArray.length - 1));
        let value = progressArray[index];
        if (value === undefined) {
            console.error('Hit an unknown error where value is',
                progress,
                'with index',
                index,
                'and progress array length of', progressArray.length);
        }
        return value;
    }

    protected getProgressWithRange(progress: number, min: number, max: number): string {
        return this.getProgress((progress - min) / (max - min) * 100.0);
    }

    protected static getProgressColor(progress: number)
    {
        let progressArray = [
            '#00FF00',
            '#69B34C',
            '#ACB334',
            '#FAB733',
            '#FF8E15',
            '#FF4E11',
            '#FF0D0D',
            '#FF0000'
        ];
        let index = Math.round((progress / 100) * 8);
        return progressArray[index];
    }

    protected async abstract getDisplay(): Promise<ResourceDisplayItem>;

    public async getTooltip(): Promise<string | null> {
        return null;
    }

    public async isShown(): Promise<boolean> {
        return Promise.resolve(this._config.get(`${this._configKey}.show`, false));
    }

    public getPrecision(): number {
        return Resource.getPrecision(this._config);
    }

    public static getPrecision(config: WorkspaceConfiguration): number {
        return config.get("precision", 2);
    }

    protected convertBytesToLargestUnit(bytes: number, precision: number = 2): string {
        let unit: Units = Units.None;
        while (bytes/unit >= 1024 && unit < Units.G) {
            unit *= 1024;
        }
        return `${(bytes/unit).toFixed(this.getPrecision())} ${Units[unit]}`;
    }
}

class CpuUsage extends Resource {

    constructor(config: WorkspaceConfiguration) {
        super(config, true, "cpuusage");
    }

    async getDisplay(): Promise<ResourceDisplayItem> {
        let currentLoad = await si.currentLoad();
        let cpuCurrentSpeed = await si.cpuCurrentspeed();
        let text = '$(pulse) ';
        let tooltip = 'CPU:\n';

        if (this._config.get("cpuusage.allcpus.show", true)) {
            let cpus = currentLoad.cpus;

            for (let i in cpus) {
                let idle = cpus[i].load_idle;
                let speedHz = CpuFreq.getFrequency(cpuCurrentSpeed.cores[i], this._config);
                tooltip += `${i}: ${(100 - idle).toFixed(this.getPrecision())}%`;
                tooltip += ` @ ${speedHz}\n`;
                let progress = this.getProgress(100 - idle);
                text += `${progress}`;
            }
        } else {
            let progress = this.getProgress(100 - currentLoad.currentload_idle);
            text += `${progress}`;
            let speedHz = CpuFreq.getFrequency(cpuCurrentSpeed.avg, this._config);
            tooltip += `${(100 - currentLoad.currentload_idle).toFixed(this.getPrecision())}% @ ${speedHz}`;
        }

        return new ResourceDisplayItem(text, tooltip, this.getColor());
    }
}

class CpuTemp extends Resource {

    constructor(config: WorkspaceConfiguration) {
        super(config, true, "cputemp");
    }

    public async isShown(): Promise<boolean> {
        // If the CPU temp sensor cannot retrieve a valid temperature, disallow its reporting.
        let cpuTemp = await si.cpuTemperature();
        let hasCpuTemp = false;
        if (this._config.get("cputemp.allcpus.show", true)) {
            let coreTemps = cpuTemp.cores;
            if (coreTemps.length === 0) {
                window.showErrorMessage('Cannot show all cores for CPU temperature because this information is not available. Turn off all cpus for CPU temperature.');
                return Promise.resolve(false);
            }
            let totalTemp = 0.0;
            for (let t of coreTemps) {
                totalTemp += parseFloat(t);
            }
            hasCpuTemp = coreTemps.length && totalTemp > 0.0;
        } else {
            let temp = cpuTemp.main;
            hasCpuTemp = temp > 0.0;
        }
        return Promise.resolve(hasCpuTemp && this._config.get("cputemp.show", true));
    }

    async getDisplay(): Promise<ResourceDisplayItem> {
        let cpuTemp = await si.cpuTemperature();
        const MAX_TEMP = 100.0;
        const MIN_TEMP = 30.0;
        let text = '$(flame) ';
        let tooltip = 'CPU Temperature:\n';
        if (this._config.get("cputemp.allcpus.show", true)) {
            console.log(cpuTemp.cores);
            for (let t in cpuTemp.cores) {
                let progress = this.getProgressWithRange(cpuTemp.cores[t], MIN_TEMP, MAX_TEMP);
                text += `${progress}`;
                tooltip += `${t}: ${(cpuTemp.cores[t]).toFixed(this.getPrecision())} C\n`;
            }
        } else {
            let temp = cpuTemp.main;
            let progress = this.getProgressWithRange(temp, MIN_TEMP, MAX_TEMP);
            text += `${progress}`;
            tooltip += `${(temp).toFixed(this.getPrecision())} C`;
        }
        return new ResourceDisplayItem(text, tooltip, this.getColor());
    }
}

class CpuFreq extends Resource {
    constructor(config: WorkspaceConfiguration) {
        super(config, true, "cpufreq");
    }

    async getDisplay(): Promise<ResourceDisplayItem> {
        let currentLoad = await si.currentLoad();
        let cpuCurrentSpeed = await si.cpuCurrentspeed();
        let cpu = await si.cpu();
        const CPU_MAX_SPEED: number = parseFloat(cpu.speedmax);
        const CPU_MIN_SPEED: number = parseFloat(cpu.speedmin);
        let text = '$(dashboard) ';
        let tooltip = 'CPU Speed:\n';

        if (this._config.get("cpufreq.allcpus.show", true)) {
            let cpus = currentLoad.cpus;

            for (let i in cpus) {
                let speedHz = CpuFreq.getFrequency(cpuCurrentSpeed.cores[i], this._config);
                tooltip += `${i}: ${speedHz}\n`;
                let progress = this.getProgressWithRange(cpuCurrentSpeed.cores[i],
                    CPU_MIN_SPEED, CPU_MAX_SPEED);
                text += `${progress}`;
            }
        } else {
            let progress = this.getProgressWithRange(cpuCurrentSpeed.avg,
                CPU_MIN_SPEED, CPU_MAX_SPEED);
            text += `${progress}`;
            let speedHz = CpuFreq.getFrequency(cpuCurrentSpeed.avg, this._config);
            tooltip += `${(100 - currentLoad.currentload_idle).toFixed(this.getPrecision())}% @ ${speedHz}`;
        }

        return new ResourceDisplayItem(text, tooltip, this.getColor());
    }

    static getFrequency(speed: string, config: WorkspaceConfiguration): string {
        // systeminformation returns frequency in terms of GHz by default
        let speedHz = parseFloat(speed) * Units.G;
        let formattedWithUnits = CpuFreq.getFormattedWithUnits(speedHz, config);
        return formattedWithUnits;
    }

    static getFormattedWithUnits(speedHz: number, config: WorkspaceConfiguration): string {
        var unit = config.get('cpufreq.unit', "GHz");
        var freqDivisor: number = FreqMappings[unit];
        return `${(speedHz / freqDivisor).toFixed(Resource.getPrecision(config))} ${unit}`;
    }
}

class Battery extends Resource {

    constructor(config: WorkspaceConfiguration) {
        super(config, false, "battery");
    }

    public async isShown(): Promise<boolean> {
        let hasBattery = (await si.battery()).hasbattery;
        return Promise.resolve(hasBattery && this._config.get("battery.show", false));
    }

    async getDisplay(): Promise<ResourceDisplayItem> {
        let rawBattery = await si.battery();
        let percentRemaining = Math.min(Math.max(rawBattery.percent, 0), 100);
        let text = `$(plug) `;
        let progress = this.getProgress(percentRemaining);
        text += progress;
        return new ResourceDisplayItem(text, `Battery: ${percentRemaining}%`, this.getColor());
    }
}

class Memory extends Resource {

    constructor(config: WorkspaceConfiguration) {
        super(config, true, "mem");
    }

    async getDisplay() : Promise<ResourceDisplayItem> {
        let unit = this._config.get('mem.unit', "GB");
        var memDivisor = MemMappings[unit];
        let memoryData = await si.mem();
        let memoryUsedWithUnits = memoryData.active / memDivisor;
        let memoryTotalWithUnits = memoryData.total / memDivisor;
        let text = `$(graph) `;
        text += this.getProgressWithRange(memoryUsedWithUnits, 0, memoryTotalWithUnits);
        let tooltip = `Memory:\n${(memoryUsedWithUnits).toFixed(this.getPrecision())}/${(memoryTotalWithUnits).toFixed(this.getPrecision())} ${unit}`;
        return new ResourceDisplayItem(text, tooltip, this.getColor());
    }
}

class Network extends Resource {
    private stats: { [id: string]: {[id: string]: number} };
    private timeMs: number;
    private prevDisplayItem: ResourceDisplayItem;
    constructor(config: WorkspaceConfiguration) {
        super(config, true, "network");

        // Network stats are requested through returning the delta between
        // multiple invocations
        this.getInterfaceStats();
        this.stats = {};
        this.timeMs = 0;
        this.prevDisplayItem = new ResourceDisplayItem('', '', '');
    }

    async getInterfaceStats() : Promise<any> {
        let networkInterfaces = await si.networkInterfaces();
        for (let networkInterface in networkInterfaces) {
            console.log(networkInterface);
            let networkStats = await si.networkStats(networkInterface);
            console.log(networkStats);
        }
    }

    async getDisplay(): Promise<ResourceDisplayItem> {
        let network = await si.networkStats();
        const MAX_BYTES_PER_SECOND = 1000000000; // 1 Gigabit
        let text = '';
        let tooltip = 'Network:\n';
        let currentTimeMs = +new Date();
        let timeRange = (currentTimeMs - this.timeMs) / 1000.0;
        if (timeRange === 0) {
            return this.prevDisplayItem;
        }
        for (let iface of network) {
            if (!(iface.iface in this.stats)) {
                this.stats[iface.iface] = {
                    'txBytes': 0,
                    'rxBytes': 0
                };
            }
            let rxBps = (iface.rx_bytes - this.stats[iface.iface].rxBytes) / timeRange;
            let txBps = (iface.tx_bytes - this.stats[iface.iface].txBytes) / timeRange;

            this.stats[iface.iface].rxBytes = iface.rx_bytes;
            this.stats[iface.iface].txBytes = iface.tx_bytes;
            console.log(Network.getFormattedWithUnits(rxBps, this._config))
            let progressDown = this.getProgressWithRange(rxBps, 0,
                MAX_BYTES_PER_SECOND);
            let progressUp = this.getProgressWithRange(txBps, 0,
                MAX_BYTES_PER_SECOND);
            this.timeMs = currentTimeMs;
            text += `$(arrow-down)${progressDown}`;
            text += `$(arrow-up)${progressUp}`;
            tooltip += `${iface.iface}: 🠓${Network.getFormattedWithUnits(rxBps, this._config)},`
            tooltip += `🠕${Network.getFormattedWithUnits(txBps, this._config)}\n`
        }
        this.prevDisplayItem = new ResourceDisplayItem(text, tooltip, this.getColor());
        return this.prevDisplayItem;
    }

    static getFormattedWithUnits(bytesPerSecond: number, config: WorkspaceConfiguration): string {
        var bitsPerSecond = bytesPerSecond * 8;
        var unit = config.get('network.unit', 'Kbps');
        var divisor: number = NetMappings[unit];
        return `${(bitsPerSecond / divisor).toFixed(Resource.getPrecision(config))} ${unit}`;
    }
}

class DiskSpace extends Resource {

    constructor(config: WorkspaceConfiguration) {
        super(config, true, "disk");
    }

    getFormat(): DiskSpaceFormat {
        let format: string | undefined = this._config.get<string>("disk.format");
        if (format) {
            return DiskSpaceFormatMappings[format];
        } else {
            return DiskSpaceFormat.PercentRemaining;
        }
    }

    getDrives(): string[] {
        let drives: string[] | undefined = this._config.get<string[]>("disk.drives");
        if (drives) {
            return drives;
        } else {
            return [];
        }
    }

    getFormattedDiskSpace(fsSize: any) {
        switch (this.getFormat()) {
            case DiskSpaceFormat.PercentRemaining:
                return `${fsSize.fs} ${(100 - fsSize.use).toFixed(this.getPrecision())}% remaining`;
            case DiskSpaceFormat.PercentUsed:
                return `${fsSize.fs} ${fsSize.use.toFixed(this.getPrecision())}% used`;
            case DiskSpaceFormat.Remaining:
                return `${fsSize.fs} ${this.convertBytesToLargestUnit(fsSize.size - fsSize.used)} remaining`;
            case DiskSpaceFormat.UsedOutOfTotal:
                return `${fsSize.fs} ${this.convertBytesToLargestUnit(fsSize.used)}/${this.convertBytesToLargestUnit(fsSize.size)} used`;
        }
    }

    getProgressDiskSpace(fsSize: any) {
        switch (this.getFormat()) {
            case DiskSpaceFormat.PercentRemaining:
                return this.getProgressWithRange(fsSize.size - fsSize.used, 0, fsSize.size);
            case DiskSpaceFormat.PercentUsed:
                return this.getProgressWithRange(fsSize.used, 0, fsSize.size);
            case DiskSpaceFormat.Remaining:
                return this.getProgressWithRange(fsSize.size - fsSize.used, 0, fsSize.size);
            case DiskSpaceFormat.UsedOutOfTotal:
                return this.getProgressWithRange(fsSize.used, 0, fsSize.size);
        }
    }

    async getDisplay(): Promise<ResourceDisplayItem> {
        let fsSizes = await si.fsSize();
        let drives = this.getDrives();
        let text = "$(database) ";
        let formattedDrives: string[] = [];
        for (let fsSize of fsSizes) {
            // Drives were specified, check if this is an included drive
            if (drives.length === 0 || drives.indexOf(fsSize.fs) !== -1) {
                formattedDrives.push(this.getFormattedDiskSpace(fsSize));
                text += this.getProgressDiskSpace(fsSize);
            }
        }
        let tooltip = "Drives:\n" + formattedDrives.join("\n");
        return new ResourceDisplayItem(text, tooltip, this.getColor())
    }
}


class ResMonGraphical {
    private _statusBarItems: StatusBarItem[];
    private _config: WorkspaceConfiguration;
    private _updating: boolean;
    private _resources: Resource[];
    private _configKeys: string[];
    static _workspaceName: string = 'resmongraphical';

    constructor() {
        this._config = workspace.getConfiguration(ResMonGraphical._workspaceName);
        this._updating = false;

        // Add all resources to monitor
        this._resources = [];
        this._resources.push(new CpuUsage(this._config));
        this._resources.push(new CpuFreq(this._config));
        this._resources.push(new Battery(this._config));
        this._resources.push(new Memory(this._config));
        this._resources.push(new DiskSpace(this._config));
        this._resources.push(new CpuTemp(this._config));
        this._resources.push(new Network(this._config));
        this._configKeys = [];
        for (let r of this._resources) {
            this._configKeys.push(r.getConfigKey());
        }

        // Each resource gets its own UI status bar item
        this._statusBarItems = [];
        this.createStatusBarItems();

        workspace.onDidChangeConfiguration(e => {
            if (!e.affectsConfiguration(ResMonGraphical._workspaceName)) {
                return;
            }
            this._config = workspace.getConfiguration(ResMonGraphical._workspaceName);
            this._resources.map(resource => {
                resource.setConfig(this._config);
            });
            if (e.affectsConfiguration(ResMonGraphical._workspaceName + '.alignLeft')) {
                this.createStatusBarItems();
            }
        });
    }

    private createStatusBarItems() {
        for (let i in this._statusBarItems) {
            this._statusBarItems[i].dispose();
        }
        this._statusBarItems = [];
        this._resources.map(resource => {
            let sbi = window.createStatusBarItem(this._config.get('alignLeft') ? StatusBarAlignment.Left : StatusBarAlignment.Right);
            sbi.show();
            this._statusBarItems.push(sbi);
        });
    }

    public getConfigKeys(): string[] {
        return this._configKeys;
    }

    public StartUpdating() {
        this._updating = true;
        this.update();
    }

    public StopUpdating() {
        this._updating = false;
    }

    private async update() {
        if (this._updating) {
            // Get the display of the requested resources
            let pendingUpdates: Promise<ResourceDisplayItem | null>[] =
                this._resources.map(resource => resource.getResourceDisplay());

            // Wait for the resources to update
            for (let i in pendingUpdates) {
                this._resources[i].getResourceDisplay().then(item => {
                    if (item === null) {
                        this._statusBarItems[i].hide();
                        return;
                    } else {
                        this._statusBarItems[i].show();
                    }
                    this._statusBarItems[i].command = `resmongraphical.openSettings${item.key}`;
                    this._statusBarItems[i].text = item.text;
                    this._statusBarItems[i].color = item.color !== null ? item.color : '';
                    // Currently there is bug that causes the tooltip to disappear
                    // if the text changes. Tracking it here:
                    // https://github.com/microsoft/vscode/issues/128887
                    this._statusBarItems[i].tooltip = item.tooltip;
                });
            }

            setTimeout(() => this.update(), this._config.get('updatefrequencyms', 4000));
        }
    }

    dispose() {
        this.StopUpdating();
        this._statusBarItems.map(statusBarItem => statusBarItem.dispose());
    }
}

export function deactivate() {
}
