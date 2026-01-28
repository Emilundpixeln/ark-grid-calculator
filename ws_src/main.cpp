#include <vector>
#include <array>
#include <algorithm>
#include <limits>
#include <chrono>
#include <iostream>

constexpr int GEM_COUNT = 14;
constexpr int MAX_SLOTS = 4;
constexpr int TOP_N = 300;

struct GemStats
{
    int will;
    int points;
};

static const GemStats ASTROGEMS[GEM_COUNT] = {
    {3, 5}, {3, 4}, {3, 3}, {4, 5}, {4, 4}, {4, 3}, {5, 5}, {5, 4}, {5, 3}, {6, 5}, {6, 4}, {6, 3}, {7, 5}, {4, 2}};

// Legendary, Relic, Ancient, None
static const int CORE_WILL[4] = {12, 15, 17, 0};
static const int CORE_POINT_CAP[4] = {14, 20, 20, 0};

// combat power tables
static const int DPS_ORDER[3][6] = {
    {150, 400, 850, 867, 883, 900},
    {150, 400, 850, 867, 883, 900},
    {100, 250, 550, 567, 583, 600}};

static const int DPS_CHAOS[3][6] = {
    {50, 100, 350, 367, 383, 400},
    {50, 100, 350, 367, 383, 400},
    {50, 100, 350, 367, 383, 400}};

static const int SUPP_ORDER[3][6] = {
    {120, 120, 900, 918, 930, 942},
    {120, 120, 900, 918, 930, 942},
    {0, 60, 300, 310, 320, 330}};

static const int SUPP_CHAOS[3][6] = {
    {60, 120, 540, 558, 576, 600},
    {60, 120, 540, 558, 576, 600},
    {30, 67, 200, 211, 222, 233}};


struct Combo
{
    std::array<int, GEM_COUNT> counts{};
    int will = 0;
    int points = 0;
};

struct CoreConfig
{
    int rarity;
    int target;
    int minPoints;
};

struct Candidate
{
    std::array<Combo, 3> combos{};
    std::array<int, GEM_COUNT> counts{};
    std::array<int, 3> ptsRaw{};
    std::array<int, 3> will{};
    int sidenodes = 0;
    double power = 0.0;
    double combatPowerIncrease = 0.0;
};

struct OptimizationResult
{
    bool hasBest;
    Candidate best;
};


static int roundPts(int pts, const int power[6])
{
    if (pts >= 20)
        return power[5];
    if (pts >= 19)
        return power[4];
    if (pts >= 18)
        return power[3];
    if (pts >= 17)
        return power[2];
    if (pts >= 14)
        return power[1];
    if (pts >= 10)
        return power[0];
    return 0;
}

static bool fitsInventory(
    const std::array<int, GEM_COUNT> &used,
    const std::array<std::vector<int>, GEM_COUNT> &inv)
{
    for (int i = 0; i < GEM_COUNT; i++)
        if (used[i] > (int)inv[i].size())
            return false;
    return true;
}

// ---------- CORE COMBO GENERATION ----------

static void backtrackCombos(
    int start,
    int depth,
    int maxWill,
    int minPts,
    const std::array<std::vector<int>, GEM_COUNT> &inv,
    Combo &cur,
    std::vector<Combo> &out)
{
    if (cur.will <= maxWill && cur.points >= minPts)
        out.push_back(cur);

    if (depth == MAX_SLOTS)
        return;

    for (int i = start; i < GEM_COUNT; i++)
    {
        if (cur.counts[i] < (int)inv[i].size())
        {
            cur.counts[i]++;
            cur.will += ASTROGEMS[i].will;
            cur.points += ASTROGEMS[i].points;

            backtrackCombos(i, depth + 1, maxWill, minPts, inv, cur, out);

            cur.counts[i]--;
            cur.will -= ASTROGEMS[i].will;
            cur.points -= ASTROGEMS[i].points;
        }
    }
}

static std::vector<Combo> generateCoreCombos(
    const std::array<std::vector<int>, GEM_COUNT> &inv,
    int maxWill,
    int minPts)
{
    std::vector<Combo> all;
    Combo cur;
    backtrackCombos(0, 0, maxWill, minPts, inv, cur, all);

    std::sort(all.begin(), all.end(), [](auto &a, auto &b)
        {
            if (a.points != b.points) return a.points > b.points;
            return a.will < b.will; 
        });

    if ((int)all.size() > TOP_N) {
        #ifndef EMSCRIPTEN
        std::cout << "Pruning combos from " << all.size() << " to " << TOP_N << "\n";
        #endif
        all.resize(TOP_N);
    }
    return all;
}

// ---------- MAIN OPTIMIZER ----------

OptimizationResult optimizeThreeCores(
    std::vector<std::vector<int>> inventoryJS,
    std::vector<CoreConfig> cores,
    bool isOrder,
    bool isSupport)
{
    std::array<std::vector<int>, GEM_COUNT> inv;
    for (int i = 0; i < GEM_COUNT; i++)
    {
        inv[i] = inventoryJS[i];
        std::sort(inv[i].begin(), inv[i].end(), std::greater<>());
    }

    auto c0 = generateCoreCombos(inv, CORE_WILL[cores[0].rarity], cores[0].minPoints);
    auto c1 = generateCoreCombos(inv, CORE_WILL[cores[1].rarity], cores[1].minPoints);
    auto c2 = generateCoreCombos(inv, CORE_WILL[cores[2].rarity], cores[2].minPoints);

    const int (*table)[6] =
        isSupport
            ? (isOrder ? SUPP_ORDER : SUPP_CHAOS)
            : (isOrder ? DPS_ORDER : DPS_CHAOS);

    Candidate best;
    double bestKey = -std::numeric_limits<double>::infinity();
    bool found = false;

    for (auto &a : c0)
        for (auto &b : c1)
            for (auto &c : c2)
            {
                std::array<int, GEM_COUNT> used{};
                for (int i = 0; i < GEM_COUNT; i++)
                    used[i] = a.counts[i] + b.counts[i] + c.counts[i];
                if (!fitsInventory(used, inv))
                    continue;

                int sidenodes = 0;
                for (int i = 0; i < GEM_COUNT; i++)
                    for (int j = 0; j < used[i]; j++)
                        sidenodes += inv[i][j];

                int pts[3] = {
                    std::min(a.points, CORE_POINT_CAP[cores[0].rarity]),
                    std::min(b.points, CORE_POINT_CAP[cores[1].rarity]),
                    std::min(c.points, CORE_POINT_CAP[cores[2].rarity])};

                int pwr =
                    roundPts(pts[0], table[0]) +
                    roundPts(pts[1], table[1]) +
                    roundPts(pts[2], table[2]);

                double dmgPerNode = (isSupport ? 0.00052 : 0.000314) * 10000.0;
                double total = pwr + sidenodes * dmgPerNode;

                if (total > bestKey)
                {
                    bestKey = total;
                    found = true;
                    best = {
                        {a, b, c},
                        used,
                        {pts[0], pts[1], pts[2]},
                        {a.will, b.will, c.will},
                        sidenodes,
                        total,
                        total / 10000.0};
                }
            }

    return {found, best};
}

// ---------- BINDINGS ----------
#ifdef EMSCRIPTEN
#include <emscripten/bind.h>
using namespace emscripten;
EMSCRIPTEN_BINDINGS(my_module)
{
    value_array<std::array<int, 14>>("ArrayInt14")
        .element(emscripten::index<0>()).element(emscripten::index<1>())
        .element(emscripten::index<2>()).element(emscripten::index<3>())
        .element(emscripten::index<4>()).element(emscripten::index<5>())
        .element(emscripten::index<6>()).element(emscripten::index<7>())
        .element(emscripten::index<8>()).element(emscripten::index<9>())
        .element(emscripten::index<10>()).element(emscripten::index<11>())
        .element(emscripten::index<12>()).element(emscripten::index<13>());

    value_array<std::array<int, 3>>("ArrayInt3")
        .element(emscripten::index<0>())
        .element(emscripten::index<1>())
        .element(emscripten::index<2>());

    value_object<CoreConfig>("CoreConfig")
        .field("rarity", &CoreConfig::rarity)
        .field("target", &CoreConfig::target)
        .field("minPoints", &CoreConfig::minPoints);

    value_object<Combo>("Combo")
        .field("counts", &Combo::counts)
        .field("will", &Combo::will)
        .field("points", &Combo::points);
    
    value_array<std::array<Combo, 3>>("ArrayCombo3")
        .element(emscripten::index<0>())
        .element(emscripten::index<1>())
        .element(emscripten::index<2>());

    value_object<Candidate>("Candidate")
        .field("combos", &Candidate::combos)
        .field("counts", &Candidate::counts)
        .field("ptsRaw", &Candidate::ptsRaw)
        .field("will", &Candidate::will)
        .field("sidenodes", &Candidate::sidenodes)
        .field("power", &Candidate::power)
        .field("combatPowerIncrease", &Candidate::combatPowerIncrease);

    value_object<OptimizationResult>("OptimizationResult")
        .field("hasBest", &OptimizationResult::hasBest)
        .field("best", &OptimizationResult::best);

    register_vector<int>("IntVector");
    register_vector<std::vector<int>>("Inventory");
    register_vector<CoreConfig>("CoreConfigs");

    function("optimizeThreeCores", &optimizeThreeCores);
}
#else 
int main()
{
    std::vector<std::vector<int>> inventoryJS;
    inventoryJS.resize(GEM_COUNT);
    inventoryJS[0] = {5, 4, 3, 2};
    inventoryJS[1] = {5, 2};
    inventoryJS[2] = {5, 4, 3, 2};
    inventoryJS[3] = {5, };
    inventoryJS[4] = {2};
    inventoryJS[5] = {2};

    std::vector<CoreConfig> cores = {
        {2, 20, 0},
        {2, 20, 0},
        {2, 20, 0}};
    
    auto start = std::chrono::high_resolution_clock::now();
    auto res = optimizeThreeCores(inventoryJS, cores, true, false);
    auto end = std::chrono::high_resolution_clock::now();

    if (res.hasBest)
    {
        auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
        std::cout << "Optimization took "
                  << diff.count()
                  << " ms\n";
        int totalGems = 0;
        for (const auto& row : inventoryJS)
            totalGems += row.size();
        std::cout << "Total gems in inventory: " << totalGems << "\n";

        std::cout << "Best candidate found:\n";
        std::cout << "Power: " << res.best.power << "\n";
        std::cout << "Sidenodes: " << res.best.sidenodes << "\n";
        for (int i = 0; i < 3; i++)
        {
            std::cout << "Core " << i << " - Points: " << res.best.ptsRaw[i] << ", Will: " << res.best.will[i] << "\n";
            std::cout << "  Gem counts: ";
            for (int j = 0; j < GEM_COUNT; j++)
                std::cout << res.best.combos[i].counts[j] << " ";
            std::cout << "\n";
        }
    }
    else
    {
        std::cout << "No valid candidate found.\n";
    }
    
    return 0;
}
#endif