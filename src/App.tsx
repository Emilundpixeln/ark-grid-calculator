import React, { useEffect, useState } from "react";

type GemKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "K" | "L";

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
};

const CORE_WILL = { Legendary: 12, Relic: 15, Ancient: 17,  None: 0 } as const;
const CORE_POINT_CAP = { Legendary: 14, Relic: 20, Ancient: 20,  None: 0 } as const;
const MAX_SLOTS = 4;
const TOP_N = 300;

type Inventory = Record<GemKey, number[]>;
type CoreConfig = { rarity: keyof typeof CORE_WILL; target: number };
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
    key: number[];
    power: number;
    sidenodes: number;
    combatPowerIncrease: number;
};
type OptimizationResult = { best: Candidate | null };

function emptyInventory(): Inventory {
    return { A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], K: [], L: [] };
}

const coreCombatPower = {
    dps: {
        order: [
            //10  14   17   18   19   20
            [150, 400, 850, 867, 883, 900],
            [150, 400, 850, 867, 883, 900],
            [100, 250, 550, 567, 583, 600]
        ],
        chaos: [
            [50, 100, 350, 367, 383, 400],
            [50, 100, 350, 367, 383, 400],
            [50, 100, 350, 367, 383, 400]
        ]
    },
    supp: {
        order: [
            [120, 120, 900, 918, 930, 942],
            [120, 120, 900, 918, 930, 942],
            [0, 60, 300, 310, 320, 330]
        ],
        chaos: [
            [60, 120, 540, 558, 576, 600],
            [60, 120, 540, 558, 576, 600],
            [84, 168, 672, 728, 784, 840]
        ]
    }
}

function generateCoreCombos(inv: Inventory, maxWill: number) {
    const types = Object.keys(ASTROGEMS) as GemKey[];
    const results: Combo[] = [];

    function backtrack(start: number, combo: GemKey[], counts: Partial<Record<GemKey, number>>) {
        //if(combo.length>0){
        let will = 0,
            points = 0;
        for (const t of combo) {
            will += ASTROGEMS[t].will;
            points += ASTROGEMS[t].points;
        }
        if (will <= maxWill) {
            results.push({ combo: combo.slice(), counts: { ...counts }, will, points });
        }
        //}
        if (combo.length === MAX_SLOTS) return;
        for (let i = start; i < types.length; i++) {
            const t = types[i];
            const used = counts[t] || 0;
            if (used < (inv[t] || 0).length) {
                combo.push(t);
                counts[t] = (used as number) + 1;
                backtrack(i, combo, counts);
                combo.pop();
                if (used === 0) delete counts[t];
                else counts[t] = used;
            }
        }
    }

    backtrack(0, [], {});

    const byPoints: Record<number, Combo[]> = {};
    for (const r of results) {
        (byPoints[r.points] ||= []).push(r);
    }

    const finalResults: Combo[] = [];
    Object.keys(byPoints)
        .map((k) => parseInt(k))
        .sort((a, b) => b - a)
        .forEach((pts) => {
            const group = byPoints[pts];
            group.sort((a, b) => a.will - b.will);
            console.log(`Points ${pts}: ${group.length} combos`);
            const efficient = group.slice(0, 100);
            const inefficient = group.slice(-50).reverse();
            const combined = Array.from(new Set([...efficient, ...inefficient])) as Combo[];
            finalResults.push(...combined);
        });

    return finalResults;
}

function optimizeThreeCores(inv: Inventory, coreConfigs: CoreConfig[], isOrder: boolean, isSupport: boolean): OptimizationResult {
    const perCoreMaxWill = coreConfigs.map((c) => CORE_WILL[c.rarity]);
    const perCoreTarget = coreConfigs.map((c) => c.target || 20);
    inv = Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, v.slice().sort((a, b) => b - a)])) as Inventory;

    const combosPerCore = perCoreMaxWill.map((w) => generateCoreCombos(inv, w));
    //if(combosPerCore.some(list=>list.length===0)) return { best: null }
    const trimmed = combosPerCore.map((list) => list.slice(0, TOP_N));

    let best: Candidate | null = null;
    const caps = perCoreTarget.map((x, i) => Math.min(x || 20, CORE_POINT_CAP[coreConfigs[i].rarity]));
    const [list0, list1, list2] = trimmed;

    function fitsInventory(trioCounts: Partial<Record<GemKey, number>>, inventory: Inventory) {
        for (const t of Object.keys(ASTROGEMS) as GemKey[])
            if ((trioCounts[t] || 0) > inventory[t].length) return false;
        return true;
    }

    for (let i0 = 0; i0 < list0.length; i0++) {
        const c0 = list0[i0];
        for (let i1 = 0; i1 < list1.length; i1++) {
            const c1 = list1[i1];
            const partial: Partial<Record<GemKey, number>> = {};
            const c0counts = c0.counts as Partial<Record<GemKey, number>>;
            const c1counts = c1.counts as Partial<Record<GemKey, number>>;
            for (const t of Object.keys(c0counts)) {
                const key = t as GemKey;
                partial[key] = (partial[key] || 0) + (c0counts[key] || 0);
            }
            for (const t of Object.keys(c1counts)) {
                const key = t as GemKey;
                partial[key] = (partial[key] || 0) + (c1counts[key] || 0);
            }
            let ok01 = true;
            for (const t of Object.keys(partial)) {
                const key = t as GemKey;
                if ((partial[key] || 0) > inv[key].length) {
                    ok01 = false;
                    break;
                }
            }
            if (!ok01) continue;

            for (let i2 = 0; i2 < list2.length; i2++) {
                const c2 = list2[i2];
                const combined: Partial<Record<GemKey, number>> = { ...partial };
                const c2counts = c2.counts as Partial<Record<GemKey, number>>;
                for (const t of Object.keys(c2counts)) {
                    const key = t as GemKey;
                    combined[key] = (combined[key] || 0) + (c2counts[key] || 0);
                }
                if (!fitsInventory(combined, inv)) continue;

                let sidenodes = 0
                for (const t of Object.keys(combined)) {
                    const key = t as GemKey;
                    const used = combined[key] as number;
                    for (let i = 0; i < used; i++) {
                        sidenodes += inv[key][i];
                    }
                }
                const coreRankCombatPower = coreCombatPower[isSupport ? "supp" : "dps"][isOrder ? "order" : "chaos"];
                function roundPts(pts: number, power: number[]) {
                    if (pts >= 20) return power[5];
                    if (pts >= 19) return power[4];
                    if (pts >= 18) return power[3];
                    if (pts >= 17) return power[2];
                    if (pts >= 14) return power[1];
                    if (pts >= 10) return power[0];
                    return 0;
                }
                const pts0 = Math.min(c0.points, caps[0]);
                const pts1 = Math.min(c1.points, caps[1]);
                const pts2 = Math.min(c2.points, caps[2]);
                const pwr0 = roundPts(pts0, coreRankCombatPower[0]);
                const pwr1 = roundPts(pts1, coreRankCombatPower[1]);
                const pwr2 = roundPts(pts2, coreRankCombatPower[2]);

                const damagePerSideNode = (isSupport ? 0.00052 : 0.000314) * 10_000;

                const totalPower = pwr0 + pwr1 + pwr2 + sidenodes * damagePerSideNode + (isOrder && pts0 >= 14 && pts1 >= 14 ? 0.05 * 10_000 : 0);
                const key = [-totalPower, -(pts0 + pts1 + pts2)];
                const candidate: Candidate = {
                    combos: [c0, c1, c2],
                    counts: combined,
                    ptsRaw: [pts0, pts1, pts2],
                    power: totalPower,
                    combatPowerIncrease: (pwr0 + pwr1 + pwr2 + sidenodes * damagePerSideNode) / 10_000,
                    will: [c0.will, c1.will, c2.will],
                    sidenodes,
                    key,
                };
                if (!best) {
                    best = candidate;
                    continue;
                }
                let better = false;
                for (let k = 0; k < key.length; k++) {
                    if (key[k] < best.key[k]) {
                        better = true;
                        break;
                    }
                    if (key[k] > best.key[k]) break;
                }
                if (better) {
                    best = candidate;
                    // format 
                    console.log(`New best has power ${totalPower} = ${pwr0}+${pwr1}+${pwr2}+${sidenodes}*${damagePerSideNode} (${sidenodes*damagePerSideNode}) pts ${pts0},${pts1},${pts2}`);
                }
            }
        }
    }
    if (best?.ptsRaw.reduce((a, b) => a + b, 0) == 0) return { best: null };
    return { best };
}

function buildGemCards(combo: GemKey[]) {
    return combo.map((t, idx) => (
        <div key={`${t}-${idx}`} className={`gem-card gem-${t}`}>
            <div className="gem-type">{t}</div>
            <div className="gem-sub">
                {ASTROGEMS[t].points}★ {ASTROGEMS[t].will}W
            </div>
        </div>
    ));
}

export default function App(): JSX.Element {
    const [classInv, setClassInv] = useState<Inventory>(() => emptyInventory());
    const [generalInv, setGeneralInv] = useState<Inventory>(() => emptyInventory());
    const [classAuto, setClassAuto] = useState(true);
    const [generalAuto, setGeneralAuto] = useState(true);
    const [classCfg, setClassCfg] = useState<CoreConfig[]>(() => [
        { rarity: "Relic", target: 20 },
        { rarity: "Relic", target: 20 },
        { rarity: "Relic", target: 20 },
    ]);
    const [generalCfg, setGeneralCfg] = useState<CoreConfig[]>(() => [
        { rarity: "Relic", target: 20 },
        { rarity: "Relic", target: 20 },
        { rarity: "Relic", target: 20 },
    ]);
    const [isSupport, setIsSupport] = useState(false);
    const [classResult, setClassResult] = useState<OptimizationResult | null>(null);
    const [generalResult, setGeneralResult] = useState<OptimizationResult | null>(null);

    useEffect(() => {
        loadInventory(false);
    }, []);


    function updateInv(side: "class" | "general", key: GemKey, oldArray: number[], value: number) {
        const setter = side === "class" ? setClassInv : setGeneralInv;
        const newArray = [...oldArray];
        if (value > oldArray.length) {
            while (newArray.length < value) newArray.push(0);
        } else {
            newArray.length = value;
        }
        setter((prev) => ({ ...prev, [key]: newArray }));
    }

    function updateCfg(side: "class" | "general", index: number, next: Partial<CoreConfig>) {
        const setter = side === "class" ? setClassCfg : setGeneralCfg;
        setter((prev) => {
            const arr = prev.slice();
            arr[index] = { ...arr[index], ...next };
            return arr;
        });
    }

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
                setClassCfg(obj.classCfg);
            }
            if (obj.generalCfg && Array.isArray(obj.generalCfg) && obj.generalCfg.length === 3) {
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
                    <h2 className="section-title">Class Inventory</h2>
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
                                <tr key={k}>
                                    <td>
                                        <span style={{ color: "inherit" }}>{k}</span>
                                    </td>
                                    <td>{ASTROGEMS[k].will}</td>
                                    <td>{ASTROGEMS[k].points}</td>
                                    <td>
                                        <input
                                            type="number"
                                            min={0}
                                            value={classInv[k].length}
                                            onChange={(e) => updateInv("class", k, classInv[k], Number(e.target.value))}
                                        />
                                    </td>
                                    <td>
                                        {classInv[k].map((_, idx) => (
                                            <input
                                                type="number"
                                                min={0}
                                                max={20}
                                                key={idx}
                                                value={classInv[k][idx]}
                                                onChange={(e) => {
                                                    const newArray = [...classInv[k]];
                                                    newArray[idx] = Math.max(
                                                        0,
                                                        Math.min(20, Math.floor(Number(e.target.value)))
                                                    );
                                                    setClassInv((prev) => ({ ...prev, [k]: newArray }));
                                                }}
                                            />
                                        ))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div
                        style={{ marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}
                    >
                        <label>
                            <input
                                type="checkbox"
                                checked={classAuto}
                                onChange={(e) => setClassAuto(e.target.checked)}
                            />{" "}
                            Auto Target (20pts priority)
                        </label>
                    </div>

                    <div>
                        {classCfg.map((cfg, i) => (
                            <div className="core-config" key={i}>
                                <label>
                                    Order {["Sun", "Moon", "Star"][i]} Type:
                                    <select
                                        value={cfg.rarity}
                                        onChange={(e) =>
                                            updateCfg("class", i, { rarity: e.target.value as keyof typeof CORE_WILL })
                                        }
                                    >
                                        <option value="Legendary">Legendary (12 WP)</option>
                                        <option value="Relic">Relic (15 WP)</option>
                                        <option value="Ancient">Ancient (17 WP)</option>
                                        <option value="None">None (0 WP)</option>
                                    </select>
                                </label>

                              
                                {!classAuto && (
                                    <label>
                                        Target:
                                        <select
                                            value={String(cfg.target)}
                                            onChange={(e) => updateCfg("class", i, { target: Number(e.target.value) })}
                                        >
                                            {Array.from({ length: 11 }, (_, k) => 10 + k).map((v) => (
                                                <option key={v} value={v}>
                                                    {v}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="panel-btn-row">
                        <button onClick={handleCalculateClass}>Calculate</button>
                    </div>
                </div>

                <div className="half right">
                    <h2 className="section-title">General Inventory</h2>
                    <table aria-label="General inventory">
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
                                <tr key={k}>
                                    <td>
                                        <span style={{ color: "inherit" }}>{k}</span>
                                    </td>
                                    <td>{ASTROGEMS[k].will}</td>
                                    <td>{ASTROGEMS[k].points}</td>
                                    <td>
                                        <input
                                            type="number"
                                            min={0}
                                            value={generalInv[k].length}
                                            onChange={(e) =>
                                                updateInv("general", k, generalInv[k], Number(e.target.value))
                                            }
                                        />
                                    </td>
                                    <td>
                                        {generalInv[k].map((_, idx) => (
                                            <input
                                                type="number"
                                                min={0}
                                                max={20}
                                                key={idx}
                                                value={generalInv[k][idx]}
                                                onChange={(e) => {
                                                    const newArray = [...generalInv[k]];
                                                    newArray[idx] = Math.max(
                                                        0,
                                                        Math.min(20, Math.floor(Number(e.target.value)))
                                                    );
                                                    setGeneralInv((prev) => ({ ...prev, [k]: newArray }));
                                                }}
                                            />
                                        ))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div
                        style={{ marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}
                    >
                        <label>
                            <input
                                type="checkbox"
                                checked={generalAuto}
                                onChange={(e) => setGeneralAuto(e.target.checked)}
                            />{" "}
                            Auto Target (20pts priority)
                        </label>
                    </div>

                    <div>
                        {generalCfg.map((cfg, i) => (
                            <div className="core-config" key={i}>
                                <label>
                                    Chaos {["Sun", "Moon", "Star"][i]} Core Type:
                                    <select
                                        value={cfg.rarity}
                                        onChange={(e) =>
                                            updateCfg("general", i, {
                                                rarity: e.target.value as keyof typeof CORE_WILL,
                                            })
                                        }
                                    >
                                        <option value="Legendary">Legendary (12 WP)</option>
                                        <option value="Relic">Relic (15 WP)</option>
                                        <option value="Ancient">Ancient (17 WP)</option>
                                        <option value="None">None (0 WP)</option>
                                    </select>
                                </label>
                                {!generalAuto && (
                                    <label>
                                        Target:
                                        <select
                                            value={String(cfg.target)}
                                            onChange={(e) =>
                                                updateCfg("general", i, { target: Number(e.target.value) })
                                            }
                                        >
                                            {Array.from({ length: 11 }, (_, k) => 10 + k).map((v) => (
                                                <option key={v} value={v}>
                                                    {v}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="panel-btn-row">
                        <button onClick={handleCalculateGeneral}>Calculate</button>
                    </div>
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
