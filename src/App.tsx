import React, { useEffect, useState } from "react";
import ModuleFactory, { IntVector } from '../ws_src/main'

type GemKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "K" | "L" | "M" | "N" | "O" | "P";

const ASTROGEMS: Record<GemKey, { will: number; points: number }> = {
    A: { will: 3, points: 5 },
    B: { will: 3, points: 4 },
    C: { will: 3, points: 3 },
    D: { will: 4, points: 5 },
    E: { will: 4, points: 4 },
    F: { will: 4, points: 3 },
    G: { will: 5, points: 5 },
    H: { will: 5, points: 4 },
    K: { will: 5, points: 3 },
    L: { will: 6, points: 5 },
    // extra
    M: { will: 6, points: 4 },
    N: { will: 6, points: 3 },
    O: { will: 7, points: 5 },
    P: { will: 4, points: 2 },
};

const CORE_WILL = { Legendary: 12, Relic: 15, Ancient: 17,  None: 0 } as const;

type Inventory = Record<GemKey, number[]>;
type CoreConfig = { rarity: keyof typeof CORE_WILL; target: number; min: number };
type Combo = {
    combo: GemKey[];
    counts: Partial<Record<GemKey, number>>;
    will: number;
    points: number;
};
type Candidate = {
    combos: Combo[];
    counts: Partial<Record<GemKey, number>>;
    ptsRaw: number[];
    will: number[];
    power: number;
    sidenodes: number;
    combatPowerIncrease: number;
};

type OptimizationResult = { best: Candidate | null };

function emptyInventory(): Inventory {
    return { A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], K: [], L: [], M: [], N: [], O: [], P: [] };
}

let Module: Awaited<ReturnType<typeof ModuleFactory>> | null = null;
(async () => {
    Module = await ModuleFactory()
})();

function optimizeThreeCores(inv: Inventory, coreConfigs: CoreConfig[], isOrder: boolean, isSupport: boolean): OptimizationResult {
    const gemKeys =  ["A", "B", "C", "D", "E", "F", "G", "H", "K", "L", "M", "N", "O", "P"] as GemKey[];
    const inventory = gemKeys.map(k => inv[k])
    const cores = coreConfigs.map(cfg => ({
        rarity: { Legendary: 0, Relic: 1, Ancient: 2, None: 3 }[cfg.rarity],
        target: cfg.target,
        minPoints: cfg.min
    }))
    const inventoryWs = new Module!.Inventory()
    const rows: IntVector[] = []
    for (const arr of inventory) {
            const vec = new Module!.IntVector()
            for (const v of arr) {
            vec.push_back(v)
        }
        inventoryWs.push_back(vec)
    }

    const coreConfigsWs = new Module!.CoreConfigs()
    for (const c of cores) {
        coreConfigsWs.push_back(c)
    }
    console.log("Calculating...");
    let start = performance.now();
    const result = Module?.optimizeThreeCores(inventoryWs, coreConfigsWs, isOrder, isSupport)
    console.log("Calculation took", performance.now() - start, "ms");
    for (const row of rows) {
        row.delete()
    }
    inventoryWs.delete()
    coreConfigsWs.delete()

    if (!result?.hasBest) return { best: null }

    const best = result.best!!

    return {
        best: {
            combos: best.combos.map(c => {
                return {
                    counts: Object.fromEntries(c.counts.map((k, i) => {
                        return [gemKeys[i], k]
                    })),
                    combo: c.counts.map((k, i) => Array.from({ length: k }).fill(gemKeys[i]) as GemKey[]).flat(),
                    will: c.will,
                    points: c.points,
                    
                } satisfies Combo
            }),
            counts: Object.fromEntries(best.counts.map((k, i) => {
                return [gemKeys[i], k]
            })),
            ptsRaw: best.ptsRaw,
            will: best.will,
            power: best.power,
            sidenodes: best.sidenodes,
            combatPowerIncrease: best.combatPowerIncrease
        }
    }
}
    
function buildGemCards(combo: GemKey[]) {
    return combo.map((t, idx) => (
        <div key={`${t}-${idx}`} className={`gem-card gem-${t}`}>
            <div className="gem-type">{t}</div>
            <div className="gem-sub">
                {ASTROGEMS[t].will}W {ASTROGEMS[t].points}★ 
            </div>
        </div>
    ));
}

function InventoryComponent({
        type,
        isSupport,
        gemKeys,
        inv,
        setInv,
        autoTarget,
        setAutoTarget,
        config,
        setConfig,
        showExtraGems,
        setShowExtraGems,
        handleCalculate,
    }: {
        type: "class" | "general"
        isSupport: boolean
        gemKeys: GemKey[]
        inv: Inventory
        setInv: React.Dispatch<React.SetStateAction<Inventory>>
        autoTarget: boolean
        setAutoTarget: React.Dispatch<React.SetStateAction<boolean>>
        config: CoreConfig[]
        setConfig: React.Dispatch<React.SetStateAction<CoreConfig[]>>
        showExtraGems: boolean
        setShowExtraGems: React.Dispatch<React.SetStateAction<boolean>>
        handleCalculate: () => void
    }) {
    function updateInv(key: GemKey, oldArray: number[], value: number) {
        const newArray = [...oldArray];
        if (value > oldArray.length) {
            while (newArray.length < value) newArray.push(0);
        } else {
            newArray.length = value;
        }
        setInv((prev) => ({ ...prev, [key]: newArray }));
    }

    function updateCfg(index: number, next: Partial<CoreConfig>) {
        setConfig((prev) => {
            const arr = prev.slice();
            arr[index] = { ...arr[index], ...next };
            return arr;
        });
    }

    return <>
        <h2 className="section-title">{type == "class" ? "Class" : "General"} Inventory</h2>
        <table aria-label="Class inventory">
            <thead>
                <tr>
                    <th>Gem</th>
                    <th>Will</th>
                    <th>Pts</th>
                    <th>Qty</th>
                    <th>Side Points <span >{ isSupport ? "Brand Power & Ally Attack count 2x" : "Add.Dmg & Boss Dmg count 2x"  }</span></th>
                </tr>
            </thead>
            <tbody>
                {gemKeys.map((k) => (
                    <tr key={k} style={k == "M" ? { marginTop: "1rem"} : {}}>
                        <td>
                            <span style={{ color: "inherit" }}>{k}</span>
                        </td>
                        <td>{ASTROGEMS[k].will}</td>
                        <td>{ASTROGEMS[k].points}</td>
                        <td>
                            <input
                                type="number"
                                min={0}
                                value={inv[k].length}
                                onChange={(e) => updateInv(k, inv[k], Number(e.target.value))}
                            />
                        </td>
                        <td>
                            {inv[k].map((_, idx) => (
                                <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    key={idx}
                                    value={inv[k][idx]}
                                    onChange={(e) => {
                                        const newArray = [...inv[k]];
                                        newArray[idx] = Math.max(
                                            0,
                                            Math.min(20, Math.floor(Number(e.target.value)))
                                        );
                                        setInv((prev) => ({ ...prev, [k]: newArray }));
                                    }}
                                />
                            ))}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
            <button className="muted-small" onClick={() => setShowExtraGems(!showExtraGems)}>
                {showExtraGems ? "Hide" : "Show"} rarely used gems
            </button>
        </div>

        <div
            style={{ marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}
        >
            <label>
                <input
                    type="checkbox"
                    checked={autoTarget}
                    onChange={(e) => setAutoTarget(e.target.checked)}
                />{" "}
                Auto Target (20pts priority)
            </label>
        </div>

        <div>
            {config.map((cfg, i) => (
                <div className="core-config" key={i}>
                    <label>
                        Order {["Sun", "Moon", "Star"][i]} Type:
                        <select
                            value={cfg.rarity}
                            onChange={(e) =>
                                updateCfg(i, { rarity: e.target.value as keyof typeof CORE_WILL })
                            }
                        >
                            <option value="Legendary">Legendary (12 WP)</option>
                            <option value="Relic">Relic (15 WP)</option>
                            <option value="Ancient">Ancient (17 WP)</option>
                            <option value="None">None (0 WP)</option>
                        </select>
                    </label>

                    
                    {!autoTarget && (
                        <>
                            <label>
                                Target:
                                <select
                                    value={String(cfg.target)}
                                    onChange={(e) => updateCfg(i, { target: Number(e.target.value) })}
                                >
                                    {Array.from({ length: 11 }, (_, k) => 10 + k).map((v) => (
                                        <option key={v} value={v}>
                                            {v}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Min:
                                <select
                                    value={String(cfg.min)}
                                    onChange={(e) => updateCfg(i, { min: Number(e.target.value) })}
                                >
                                    {[0, 10, 14, 17].map((v) => (
                                        <option key={v} value={v}>
                                            {v}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </>
                    )}
                </div>
            ))}
        </div>

        <div className="panel-btn-row">
            <button onClick={handleCalculate}>Calculate</button>
        </div>
    </>
}

export default function App(): JSX.Element {
    const [classInv, setClassInv] = useState<Inventory>(() => emptyInventory());
    const [generalInv, setGeneralInv] = useState<Inventory>(() => emptyInventory());
    const [classAuto, setClassAuto] = useState(true);
    const [generalAuto, setGeneralAuto] = useState(true);
    const [showExtraGems, setShowExtraGems] = useState(false);
    const [classCfg, setClassCfg] = useState<CoreConfig[]>(() => [
        { rarity: "Relic", target: 20, min: 0 },
        { rarity: "Relic", target: 20, min: 0 },
        { rarity: "Relic", target: 20, min: 0 },
    ]);
    const [generalCfg, setGeneralCfg] = useState<CoreConfig[]>(() => [
        { rarity: "Relic", target: 20, min: 0 },
        { rarity: "Relic", target: 20, min: 0 },
        { rarity: "Relic", target: 20, min: 0 },
    ]);
    const [isSupport, setIsSupport] = useState(false);
    const [classResult, setClassResult] = useState<OptimizationResult | null>(null);
    const [generalResult, setGeneralResult] = useState<OptimizationResult | null>(null);

    useEffect(() => {
        loadInventory(false);
    }, []);

    function calculateFor(inv: Inventory, cfg: CoreConfig[], isOrder: boolean) {
        return optimizeThreeCores(inv, cfg, isOrder, isSupport);
    }

    function handleCalculateClass() {
        setClassResult(calculateFor(classInv, classCfg, true));
    }
    function handleCalculateGeneral() {
        setGeneralResult(calculateFor(generalInv, generalCfg, false));
    }
    function handleCalculateBoth() {
        handleCalculateClass();
        handleCalculateGeneral();
    }

    function saveInventory() {
        const data = { class: classInv, general: generalInv, isSupport, classCfg, generalCfg };
        localStorage.setItem("arkGridInventory_v6", JSON.stringify(data));
        alert("Inventory saved");
    }
    function loadInventory(boolAlert: boolean = true) {
        const raw = localStorage.getItem("arkGridInventory_v6");
        if (!raw) {
            if (boolAlert) alert("No saved inventory");
            return;
        }
        try {
            const obj = JSON.parse(raw);
            setClassInv({ ...emptyInventory(), ...(obj.class || {}) });
            setGeneralInv({ ...emptyInventory(), ...(obj.general || {}) });
            setIsSupport(!!obj.isSupport);
            if (obj.classCfg && Array.isArray(obj.classCfg) && obj.classCfg.length === 3) {
                obj.classCfg.forEach((c: any) => {
                    if (!c.rarity || !(c.rarity in CORE_WILL)) c.rarity = "Relic";
                    if (typeof c.target !== "number") c.target = 20;
                    if (typeof c.min !== "number") c.min = 0;
                });
                setClassCfg(obj.classCfg);
            }
            if (obj.generalCfg && Array.isArray(obj.generalCfg) && obj.generalCfg.length === 3) {
                obj.generalCfg.forEach((c: any) => {
                    if (!c.rarity || !(c.rarity in CORE_WILL)) c.rarity = "Relic";
                    if (typeof c.target !== "number") c.target = 20;
                    if (typeof c.min !== "number") c.min = 0;
                });
                setGeneralCfg(obj.generalCfg);
            }
            if (boolAlert) alert("Inventory loaded");
        } catch (e) {
            if (boolAlert) alert("Failed to load");
        }
    }
    function resetDefaults() {
        setClassInv(emptyInventory());
        setGeneralInv(emptyInventory());
        setClassResult(null);
        setGeneralResult(null);
    }

    // helpers for rendering results
    function renderResult(result: OptimizationResult | null, inv: Inventory): JSX.Element {
        if (!result || !result.best) return <div className="small">No valid combos found (or inventory empty).</div>;
        const best = result.best as Candidate;
        const remaining: Record<string, number> = {};
        for (const k of Object.keys(emptyInventory())) {
            const key = k as GemKey;
            remaining[k] = inv[key].length - (best.counts[key] || 0);
        }
        return (
            <>
                <div style={{ padding: "0 4px", marginTop: 12 }}>
                    <strong style={{ fontSize: 14, color: "#8a96a3" }}>Total Sidenodes: {best.sidenodes}</strong> 
                    <br/>
                    <strong style={{ fontSize: 14, color: "#8a96a3" }}>Total Power: {best.power}</strong>           
                    <br/>
                    <strong style={{ fontSize: 14, color: "#8a96a3" }}>Combat Power Increase: {(best.combatPowerIncrease * 100).toFixed(2)}%</strong> 
                </div>
                {best.combos.map((c, i) => {
                    const gemCount = (Object.values(c.counts || {}) as Array<number | undefined>).reduce<number>(
                        (a, b) => a + (b || 0),
                        0
                    );
                    return (
                        <div className="core-box" key={i}>
                            <div className="core-header">
                                <div>
                                    <strong>Core {i + 1}</strong>{" "}
                                    <span style={{ fontSize: 12, color: "#aaa" }}>({gemCount}) gems</span>
                                </div>
                                <div className="small" style={{ color: "#fff" }}>
                                    WP: {c.will} &nbsp;•&nbsp; Pts: {c.points}
                                </div>
                            </div>
                            <div className="gem-row">{buildGemCards(c.combo)}</div>
                        </div>
                    );
                })}
                <div style={{ padding: "0 4px", marginTop: 12 }}>
                    <strong style={{ fontSize: 12, color: "#8a96a3", textTransform: "uppercase" }}>Unused Gems</strong>
                    <div className="remaining-badges">
                        {Object.keys(remaining)
                            .filter((k) => remaining[k] > 0)
                            .map((k) => (
                                <div key={k} className="badge">
                                    {k}: {remaining[k]}
                                </div>
                            )) ?? <span className="small">None</span>}
                    </div>
                </div>
            </>
        );
    }

    const gemKeys = Object.keys(ASTROGEMS) as GemKey[];

    return (
        <div>
            <h1>Ark Grid Calculator</h1>
            <p className="note">
                Manage your nodes. Optimize your Ark Passive. Modified version of{" "}
                <a href="https://skyhawkx3.github.io/LostArk/" target="_blank" rel="noopener noreferrer">
                    skyhawkx3s calculator
                </a>
                .
            </p>

            <div className="page">
                <div className="half left">
                    <InventoryComponent 
                        type="class" 
                        isSupport={isSupport} 
                        gemKeys={showExtraGems ? gemKeys : gemKeys.filter(k => !["M","N","O","P"].includes(k))} 
                        inv={classInv} 
                        setInv={setClassInv} 
                        autoTarget={classAuto} 
                        setAutoTarget={setClassAuto} 
                        config={classCfg} 
                        setConfig={setClassCfg} 
                        showExtraGems={showExtraGems} 
                        setShowExtraGems={setShowExtraGems} 
                        handleCalculate={handleCalculateClass}
                    />
                </div>
                <div className="half right">
                    <InventoryComponent 
                        type="general" 
                        isSupport={isSupport} 
                        gemKeys={showExtraGems ? gemKeys : gemKeys.filter(k => !["M","N","O","P"].includes(k))}
                        inv={generalInv} 
                        setInv={setGeneralInv} 
                        autoTarget={generalAuto} 
                        setAutoTarget={setGeneralAuto} 
                        config={generalCfg} 
                        setConfig={setGeneralCfg} 
                        showExtraGems={showExtraGems} 
                        setShowExtraGems={setShowExtraGems} 
                        handleCalculate={handleCalculateGeneral}
                    />
                </div>
            </div>

            <div className="common-controls">
             <button className="secondary" onClick={() => setIsSupport(!isSupport)}>
                    Is Support: {isSupport ? "Yes" : "No"}
                </button>
                <button className="secondary" onClick={saveInventory}>
                    Save Inventory
                </button>
                <button className="secondary" onClick={() => loadInventory(true)}>
                    Load Inventory
                </button>
                <div style={{ width: 20 }} />
                <button className="secondary" onClick={resetDefaults}>
                    Reset Data
                </button>
                <button className="primary-gold" onClick={handleCalculateBoth}>
                    Calculate Both
                </button>
            </div>

            <div id="resultsArea">
                <div className="results-half" id="classResults">
                    <h3 className="res-title">Class Optimization</h3>
                    <div id="classResultsInner" className="small">
                        {renderResult(classResult, classInv)}
                    </div>
                </div>

                <div className="results-half" id="generalResults">
                    <h3 className="res-title">General Optimization</h3>
                    <div id="generalResultsInner" className="small">
                        {renderResult(generalResult, generalInv)}
                    </div>
                </div>
            </div>
        </div>
    );
}
