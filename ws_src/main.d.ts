export type Core = {
    rarity: number;
    target: number;
    minPoints: number;
}

type Combo = {
    counts: number[];
    will: number;
    points: number;
};

export type Candidate = {
    counts: number[];
    combos: Combo[]
    ptsRaw: number[];
    will: number[];
    power: number;
    sidenodes: number;
    combatPowerIncrease: number;
};


export interface IntVector {
    push_back(value: number): void;
    get(index: number): number;
    size(): number;
    delete(): void;
}

export interface Inventory {
    push_back(vector: IntVector): void;
    get(index: number): IntVector;
    size(): number;
    delete(): void;
}

export interface CoreConfigs {
    push_back(core: Core): void;
    get(index: number): Core;
    size(): number;
    delete(): void;
}

declare let ModuleFactory: () => Promise<{
    optimizeThreeCores: (inventory: Inventory, cores: CoreConfigs, isOrder: boolean, isSupport: boolean) => { best: Candidate | null, hasBest: boolean };

    IntVector: { new(): IntVector };
    Inventory: { new(): Inventory };
    CoreConfigs: { new(): CoreConfigs };
}>;

export default ModuleFactory;