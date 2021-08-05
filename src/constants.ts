'use strict';

export enum Units {
    None = 1,
    K = 1024,
    M = 1024 * 1024,
    G = 1024 * 1024 * 1024
}

export enum DiskSpaceFormat {
    PercentUsed,
    PercentRemaining,
    Remaining,
    UsedOutOfTotal
}

export interface DiskSpaceFormatLookup {
    [unit: string]: DiskSpaceFormat;
}

export interface UnitLookup {
    [unit: string]: number;
}

export var DiskSpaceFormatMappings: DiskSpaceFormatLookup = {
    'PercentUsed': DiskSpaceFormat.PercentUsed,
    'PercentRemaining': DiskSpaceFormat.PercentRemaining,
    'Remaining': DiskSpaceFormat.Remaining,
    'UsedOutOfTotal': DiskSpaceFormat.UsedOutOfTotal,
};

export var FreqMappings: UnitLookup = {
    'GHz': Units.G,
    'MHz': Units.M,
    'KHz': Units.K,
    'Hz': Units.None,
};

export var MemMappings: UnitLookup = {
    'GB': Units.G,
    'MB': Units.M,
    'KB': Units.K,
    'B': Units.None,
};

export var NetMappings: UnitLookup = {
    'Gbps': Units.G,
    'Mbps': Units.M,
    'Kbps': Units.K,
    'Bps': Units.None,
};

export var ProgressMappings: { [id: string]: string[] } = {
    'Vertical': ['▁', '▂', '▃', '▅', '▆', '▇', '▉'],
    'Horizontal': ['▏', '▎', '▍', '▋', '▊', '▉'],
    'CirclePie': ['○', '◔', '◑', '◕', '●'],
    'SquarePie': ['🬁', '🬉', '🬍', '🬎'],
    'VerticalMeter': ['🭻', '🭺', '🭹', '🭸', '🭷', '🭶'],
    'HorizontalMeter': ['🭰', '🭱', '🭲', '🭳', '🭴', '🭵'],
    'Dots': ['⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿'],
    'Geo': ['🭇', '🭈', '🭊', '🭆', '🭄', '🭅', '🭃', '🭂', '🭁', '🮐'],
    'Shade': [' ', '░', '▒', '▓', '█'],
    'SquareColor': ['🟩', '🟨', '🟧', '🟥'],
    'CircleColor': ['🟢', '🟡', '🟠', '🔴'],
    'InverseSquareColor': ['🟥', '🟧', '🟨', '🟩'],
    'InverseCircleColor': ['🔴', '🟠', '🟡', '🟢']
};
