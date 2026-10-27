/* ============================================================
 * 百年宗谱 · 家计模块
 * 集市粮价 / 田亩分派 / 粮食产耗 / 百业俸禄 / 宅院 / 门第月耗
 * ============================================================ */
(function () {
  "use strict";
  const Game = window.Game;
  const { rand, clamp, pick, chance } = Game.U;
  const log = (t, cls) => Game.log(t, cls);

  const FOOD_BASE = { rice: 0.8, wheat: 0.6, veg: 0.25, fruit: 0.9 };

  /* ---------------- 集市粮价（逐月浮动） ---------------- */
  Game.rollMarket = function () {
    const m = {};
    Object.keys(FOOD_BASE).forEach(k => {
      m[k] = Math.round(FOOD_BASE[k] * (0.7 + Math.random() * 0.6) * 100) / 100;
    });
    return m;
  };

  /* ---------------- 百业营生 ---------------- */
  Game.jobInfo = function (key) { return Game.JOBS.find(j => j.key === key) || null; };

  /* 按资质择一可任的最高月俸营生 */
  Game.pickJob = function (p) {
    if (!p || !p.stats) return "farmhand";
    let best = Game.JOBS[0];
    Game.JOBS.forEach(j => {
      if (!j.stat) { if (best.key === "farmhand") best = j; return; }
      if ((p.stats[j.stat] || 0) >= j.need && j.salary > best.salary) best = j;
    });
    return best.key;
  };

  /* 族人月入：有官身领官俸，有功名领月廪，否则领营生月钱 */
  Game.personSalary = function (p) {
    if (!p) return 0;
    if (p.palace) return Game.palaceSalary(p);
    if (p.office) return Game.SALARY(p.office.grade);
    const j = Game.jobInfo(p.job);
    const wage = j ? j.salary : 0;
    const stip = p.title ? (Game.TITLE_STIPEND[p.title] || 0) : 0;
    return Math.max(wage, stip);
  };

  /* 单人贡献的铺面数：现任官员按品级，余者按功名；白丁无额 */
  Game.personShopCap = function (p) {
    if (!p) return 0;
    if (p.office) return Game.officeShopCap(p.office.grade);
    if (p.palace && p.palace.track === "consort") {
      const r = Game.PALACE_CONSORT_RANKS[p.palace.grade] || {};
      return r.shopCap || 0;
    }
    return p.title ? (Game.TITLE_SHOP_CAP[p.title] || 0) : 0;
  };

  /* 阖族可开张的铺面上限：小家本有两间，族中功名官身越多，额度越高 */
  Game.shopCap = function () {
    let cap = Game.SHOP_CAP_BASE;
    Game.householdMembers().forEach(m => { cap += Game.personShopCap(m.person); });
    /* 入宫女儿虽不在家，高位妃嫔仍荫家（不与 household 重复计） */
    (Game.G.children || []).filter(x => x.alive && x.out === "palace").forEach(x => { cap += Game.personShopCap(x); });
    return cap;
  };

  /* ---------------- 族人名册 ---------------- */
  Game.getMember = function (id) {
    const g = Game.G;
    if (id === "head") return { person: g.char, role: "head", rel: "家主" };
    if (g.spouse && ("sp-" + g.spouse.id) === id)
      return { person: g.spouse, role: "spouse", rel: g.char.gender === "男" ? "妻" : "赘夫" };
    const ch = g.children.find(x => x.id === id);
    if (ch) return { person: ch, role: "child", rel: ch.relation || "族人" };
    if (id && id.indexOf("il-") === 0) {
      const pid = id.slice(3);
      for (const c of g.children) {
        if (c.spouse && c.spouse.id === pid)
          return { person: c.spouse, role: "inlaw", rel: c.gender === "男" ? "媳" : "赘婿" };
      }
    }
    return null;
  };

  /* 共同居处于宅中的在籍家人 */
  Game.householdMembers = function () {
    const g = Game.G;
    const list = [{ person: g.char, role: "head", rel: "家主" }];
    if (g.spouse) list.push({ person: g.spouse, role: "spouse", rel: g.char.gender === "男" ? "妻" : "赘夫" });
    g.children.filter(x => x.alive && !x.out).forEach(x =>
      list.push({ person: x, role: "child", rel: x.relation || "族人" }));
    /* 入门者同居：在家媳与招赘婿 */
    g.children.filter(x => x.alive && !x.out && x.spouse && x.spouse.joined).forEach(x =>
      list.push({ person: x.spouse, role: "inlaw", rel: x.gender === "男" ? "媳" : "赘婿" }));
    return list;
  };

  Game.houseCapacity = function () { return Game.G.house.rooms * Game.ROOM_CAP; };

  /* ---------------- 门第日用 ---------------- */
  Game.livingTier = function () {
    const rep = Game.G.family.peakReputation;
    let t = Game.LIVING_TIERS[0];
    Game.LIVING_TIERS.forEach(x => { if (rep >= x.rep) t = x; });
    return t;
  };

  /* ---------------- 田亩分派 ---------------- */
  Game.landAllocated = function () {
    const u = Game.G.landUse;
    return u.rent + u.rice + u.wheat + u.veg + u.fruit;
  };

  /* 在两种用途间改派 n 亩；from 减、to 增。已播种、正在生长的田亩不可改派 */
  Game.reallocLand = function (from, to, n) {
    const g = Game.G;
    n = Math.max(0, Math.floor(Number(n)));
    if (!n) return;
    if (from === to) return;
    const free = g.landUse[from] - Game.standingMu(g, from);
    if (free < n)
      return log(from === "rent"
        ? `此种田只有${g.landUse[from]}亩可改派。`
        : `有${Game.standingMu(g, from)}亩正种着庄稼，只${free}亩空闲可改派。`, "bad");
    g.landUse[from] -= n;
    g.landUse[to] += n;
    const names = {};
    Game.LAND_USES.forEach(u => names[u.key] = u.name);
    log(`将${n}亩${names[from]}改作${names[to]}。`, "");
    Game.save(); Game.refresh();
  };

  /* 随机事件等直接改 g.land 后，校准分派使之与总亩数一致；得田入佃租，失田依次核减 */
  Game.syncLand = function () {
    const g = Game.G;
    const diff = g.land - Game.landAllocated();
    if (diff > 0) g.landUse.rent += diff;
    else if (diff < 0) Game.removeLand(-diff);
  };

  /* 卖出时从佃租田起依次核减；若动到在田庄稼，一并削去相应在田批次 */
  Game.removeLand = function (n) {
    const g = Game.G;
    let left = n;
    ["rent", "rice", "wheat", "veg", "fruit"].forEach(k => {
      const take = Math.min(left, g.landUse[k]);
      g.landUse[k] -= take;
      left -= take;
    });
    Game.reconcileFields(g);
  };

  /* ---------------- 宅院扩建 ---------------- */
  Game.buildRoom = function () {
    const g = Game.G;
    const manor = Game.manorInfo ? Game.manorInfo(g.manor || "hut") : { maxRooms: 99 };
    if (g.house.rooms >= (manor.maxRooms || 99))
      return log(`${manor.name}至多容${manor.maxRooms}间厢房，欲广厦连绵，须先营造更高宅邸。`, "bad");
    const cost = Game.buildRoomCost(g.house.rooms);
    if (g.money < cost) return log(`起一间厢房需银${cost}两，囊中不足。`, "bad");
    g.money -= cost;
    g.house.rooms += 1;
    log(`鸠工庀材，新起厢房一间（可多居${Game.ROOM_CAP}人），耗银${cost}两。`, "good");
    Game.save(); Game.refresh();
  };

  /* ---------------- 集市买卖粮食（斗） ---------------- */
  Game.buyFood = function (kind, dou) {
    const g = Game.G;
    dou = Math.max(0, Math.floor(Number(dou)));
    if (!dou) return;
    const cost = Math.round(dou * g.market[kind] * 100) / 100;
    if (g.money < cost) return log(`买${dou}斗${Game.FOOD_NAME[kind]}需${cost}两，银两不足。`, "bad");
    g.money -= cost;
    g.granary[kind] += dou;
    log(`入市籴${Game.FOOD_NAME[kind]}${dou}斗，耗银${cost}两。`, "");
    Game.save(); Game.refresh();
  };
  Game.sellFood = function (kind, dou) {
    const g = Game.G;
    dou = Math.max(0, Math.floor(Number(dou)));
    if (!dou) return;
    if (g.granary[kind] < dou) return log(`仓中${Game.FOOD_NAME[kind]}不足${dou}斗。`, "bad");
    const income = Math.round(dou * g.market[kind] * 100) / 100;
    g.granary[kind] -= dou;
    g.money += income;
    log(`出粜${Game.FOOD_NAME[kind]}${dou}斗，得银${income}两。`, "");
    Game.save(); Game.refresh();
  };

  /* ============================================================
   * 月度家计结算（在 nextMonth 内调用）
   * ============================================================ */

  /* ============================================================
   * 农时：播种 / 在田 / 收获（分作物、分熟制，按月份）
   * g.fields[key].lots = [{ mu, hm:收月, hy:收年, bear:果木成林否 }]
   * ============================================================ */
  Game.standingMu = function (g, key) {
    const f = g.fields && g.fields[key];
    return f ? f.lots.reduce((s, l) => s + l.mu, 0) : 0;
  };

  /* 当月适播的农时季；返回 { season, idx } 或 null */
  Game.sowSeasonNow = function (crop, month) {
    for (let i = 0; i < crop.seasons.length; i++)
      if (crop.seasons[i].sow.indexOf(month) >= 0) return { season: crop.seasons[i], idx: i };
    return null;
  };

  /* 据播月推算下一熟的收月、收年 */
  function nextHarvest(crop, season, month, year) {
    const hm = season.harvest[0];
    let hy = year;
    if (hm < month) hy += 1;          /* 跨年成熟（如秋种麦） */
    if (crop.perennial) hy += 1;      /* 果木栽种经年，越岁方始挂果 */
    return { hm, hy };
  }

  /* 某类作物当前空闲、可播种的亩数 */
  Game.freeMu = function (g, key) {
    return Math.max(0, (g.landUse[key] || 0) - Game.standingMu(g, key));
  };

  /* 播种 n 亩：须在播期内、有空闲地、备得起种子工本 */
  Game.sowLand = function (key, n, silent) {
    const g = Game.G;
    n = Math.max(0, Math.floor(Number(n)));
    const crop = Game.cropInfo(key);
    if (!crop || !n) return;
    const now = Game.sowSeasonNow(crop, g.month);
    if (!now)
      return log(`${crop.name}现下不是下种的时节。`, "bad");
    const free = Game.freeMu(g, key);
    if (free <= 0) return log(`没有空闲的${crop.name}田可种。`, "bad");
    n = Math.min(n, free);
    const labor = Math.round((Game.FARM_LABOR_PER_MU || 0.35) * n * 100) / 100;
    const cost = Math.round((crop.seed * n + labor) * 100) / 100;
    if (g.money < cost) return log(`备${n}亩${crop.name}种子工本并雇工需银${cost}两（含工钱${labor}两），囊中不足。`, "bad");
    g.money -= cost;
    const { hm, hy } = nextHarvest(crop, now.season, g.month, g.year);
    g.fields = g.fields || {};
    g.fields[key] = g.fields[key] || { lots: [] };
    /* 同收期的批次合并，免得地块太碎 */
    const same = g.fields[key].lots.find(l => l.hm === hm && l.hy === hy && !l.bear);
    if (same && !crop.perennial) same.mu += n;
    else g.fields[key].lots.push({ mu: n, hm, hy, bear: false });
    g._lastSow = { key, n, cost };
    g._monthSeed = Math.round(((g._monthSeed || 0) + cost) * 100) / 100;
    log(`${silent && g.steward ? "庄头" + g.steward.name + "作主" : "雇工"}下${crop.name}种${n}亩，耗种子工本${cost}两，约${hm}月可收。`, "good");
    if (!silent) { Game.save(); Game.refresh(); }
  };

  /* 失田后，把超出留存亩数的在田批次削齐（从末批起） */
  Game.reconcileFields = function (g) {
    if (!g.fields) return;
    Game.FOOD_KEYS.forEach(k => {
      const f = g.fields[k];
      if (!f) return;
      let over = Game.standingMu(g, k) - (g.landUse[k] || 0);
      for (let i = f.lots.length - 1; i >= 0 && over > 0; i--) {
        const cut = Math.min(over, f.lots[i].mu);
        f.lots[i].mu -= cut; over -= cut;
        if (f.lots[i].mu <= 0) f.lots.splice(i, 1);
      }
    });
  };

  /* 佃租：仅夏、秋两季收租（受天时与督工影响；乡绅以上租+10%） */
  Game.settleRent = function (g, weatherMul, workMul) {
    workMul = workMul || 1;
    g._lastRent = 0;
    const term = Game.RENT_HARVEST.find(t => t.month === g.month);
    if (term && g.landUse.rent > 0) {
      const privMul = (Game.repPriv ? Game.repPriv().rentMul : 1) || 1;
      const rent = Math.round(g.landUse.rent * term.perMu * (0.75 + Math.random() * 0.5) * weatherMul * workMul * privMul * 10) / 10;
      g.money += rent;
      g._lastRent = rent;
      log(`佃户缴来${g.month === 6 ? "夏" : "秋"}租${rent}两。`, rent > 0 ? "good" : "");
    }
  };

  /* 自耕诸色：到收月方熟，入仓；果木成林后岁岁再结（祖佑加成） */
  Game.settleCrops = function (g, weatherMul, workMul) {
    workMul = workMul || 1;
    const blessMul = (g.riteBuff && g.riteBuff.harvest > 0) ? (g.riteBuff.harvestMul || 1.1) : 1;
    Game.FOOD_KEYS.forEach(k => { g["_yield_" + k] = 0; });
    g._harvestNames = [];
    if (!g.fields) return;
    Game.FOOD_KEYS.forEach(k => {
      const f = g.fields[k];
      if (!f) return;
      const crop = Game.cropInfo(k);
      for (let i = f.lots.length - 1; i >= 0; i--) {
        const lot = f.lots[i];
        const due = lot.bear
          ? (g.month === crop.seasons[0].harvest[0])                       /* 果木：年年到月挂果 */
          : (g.month === lot.hm && g.year >= lot.hy);
        if (!due) continue;
        const yld = lot.mu * crop.yield * (0.8 + Math.random() * 0.4) * weatherMul * workMul * blessMul;
        g.granary[k] += yld;
        g["_yield_" + k] = (g["_yield_" + k] || 0) + Math.round(yld);
        g._harvestNames.push(`${crop.name}${Math.round(yld)}斗`);
        if (crop.perennial) {
          lot.bear = true;            /* 首收后成林，次年续结 */
        } else {
          f.lots.splice(i, 1);        /* 一熟一收，地归空闲 */
        }
      }
    });
    if (g._harvestNames.length)
      log(`田间开镰，收得${g._harvestNames.join("、")}，尽纳入仓。`, "good");
  };

  /* 旧档迁移：首载农时，把当月正适播的在田自耕补播上，免致撂荒 */
  Game.migrateFields = function (g) {
    if (g.fields) return;
    g.fields = {};
    Game.CROPS.forEach(crop => {
      g.fields[crop.key] = { lots: [] };
      const mu = g.landUse[crop.key] || 0;
      const now = Game.sowSeasonNow(crop, g.month);
      if (mu > 0 && now) {
        const { hm, hy } = nextHarvest(crop, now.season, g.month, g.year);
        g.fields[crop.key].lots.push({ mu, hm, hy, bear: false });
      }
    });
  };

  /* 2. 族人俸禄月钱（抱病者仅半饷；家主无官亦兼业糊口） */
  Game.settleSalaries = function (g) {
    let total = 0, headPay = 0, palaceRemit = 0;
    /* 宫中女儿月俸径寄回家 */
    (g.children || []).filter(x => x.alive && x.out === "palace").forEach(x => {
      palaceRemit += Game.palaceRemit ? Game.palaceRemit(x) : Game.palaceSalary(x);
    });
    Game.householdMembers().forEach(m => {
      const p = m.person;
      if (p.age < 16) return;
      if (m.role === "head") {
        if (p.office) return;   /* 家主官俸在别处计 */
        const best = Game.pickJob(p);
        if (p.job !== best) p.job = best;   /* 家主随本事自动换营生，静默不刷屏 */
        let pay = Game.personSalary(p);
        if (p.isSick) pay = Math.round(pay / 2 * 10) / 10;
        headPay = pay; total += pay;
        return;
      }
      if (!p.office && !p.title && !p.job) Game.assignJobIfIdle(p);  // 旧档/事件婚配补职
      /* 无功名官身者随本事自动跳槽， log 一次 */
      if (!p.office && !p.title && p.age >= 16) {
        const best = Game.pickJob(p);
        if (best && p.job !== best) {
          const oldJ = Game.jobInfo(p.job);
          p.job = best;
          const newJ = Game.jobInfo(best);
          if (oldJ && newJ && oldJ.key !== newJ.key && (g.year > 1 || g.month > 1))
            Game.log(`${m.rel || "族人"}${p.name}改行做了${newJ.name}，月入${newJ.salary}两。`, "");
        }
      }
      let pay = Game.personSalary(p);
      if (p.isSick) pay = Math.round(pay / 2 * 10) / 10;
      total += pay;
    });
    total = Math.round((total + palaceRemit) * 10) / 10;
    g.money += total;
    g._lastSalaries = total;
    g._lastHeadPay = headPay;
    g._lastPalaceRemit = palaceRemit;
    return total;
  };

  /* 3. 口粮与门第日用。返回 {foodCost, living, short} */
  Game.settleHousehold = function (g) {
    const members = Game.householdMembers();
    const tier = Game.livingTier();

    /* 每人每月口粮（斗）：米为主，麦次之，菜为辅，果最少；幼童减半 */
    const NEED = { rice: 0.7, wheat: 0.3, veg: 0.6, fruit: 0.15 };
    let need = { rice: 0, wheat: 0, veg: 0, fruit: 0 };
    let adults = 0, children = 0;
    members.forEach(m => {
      const scale = m.person.age < 12 ? 0.5 : 1;
      if (m.person.age < 16) children += 1; else adults += 1;
      Object.keys(NEED).forEach(k => need[k] += NEED[k] * scale);
    });

    /* 先尽仓粮，不足则入市照时价购买 */
    let foodCost = 0;
    let shortKinds = [];
    let grainShort = false;       // 米、麦等主粮短欠方算饥馁
    Game.FOOD_KEYS.forEach(k => {
      const have = g.granary[k];
      if (have >= need[k]) {
        g.granary[k] = have - need[k];
      } else {
        const lack = need[k] - have;
        g.granary[k] = 0;
        foodCost += lack * g.market[k];
        shortKinds.push(Game.FOOD_NAME[k]);
        if (k === "rice" || k === "wheat") grainShort = true;
      }
    });

    if (foodCost > 0) g.money -= Math.round(foodCost * 100) / 100;

    /* 主粮短欠：银两只算采买；若折成负数，说明无力入市，合家饥馁 */
    let starved = false;
    if (grainShort) {
      if (g.money < 0) {
        starved = true;
        members.forEach(m => {
          m.person.stats = m.person.stats || {};
          m.person.stats.体力 = clamp((m.person.stats.体力 || 40) - rand(3, 7), 0, 100);
        });
        g.char.stats.体力 = clamp(g.char.stats.体力 - rand(4, 8), 0, Game.maxSta());
        log("仓廪空空、市粮难继，合家用瓜菜度日，老小面有菜色。", "bad");
        g.family.reputation = Math.max(0, g.family.reputation - 1);
      } else if (shortKinds.length) {
        log(`家中${shortKinds.join("、")}粮不足，入市采买补缺。`, "");
      }
    }

    /* 门第日用：纯衣用礼数、仆从排场之费（口粮另计） */
    const living = Math.round((adults * tier.adult + children * tier.child) * 10) / 10;
    g.money -= living;

    /* 宅院拥挤：房不庇身，体气难复 */
    const residents = members.length;
    const cap = Game.houseCapacity();
    let crowded = residents > cap;
    if (crowded) {
      g.char.stats.体力 = clamp(g.char.stats.体力 - 2, 0, Game.maxSta());
      if (chance(0.3)) log("厢房逼仄，长幼杂处，夜不安枕，家主面带倦色。", "bad");
    }
    return { foodCost: Math.round(foodCost * 100) / 100, living, crowded, residents, cap, tier: tier.name, starved };
  };

  /* ---------------- 天时丰歉 ---------------- */
  Game.rollWeather = function () {
    const r = Math.random();
    if (r < 0.10) return { mul: 1.8, name: "风调雨顺，田禾大丰", good: true };
    if (r < 0.18) return { mul: 0.35, name: "赤日炎炎，溪涧断流，田土龟裂", bad: true };
    if (r < 0.24) return { mul: 0.4, name: "暴雨连旬，河水漫堤，低田尽没", bad: true };
    if (r < 0.28) return { mul: 0.25, name: "飞蝗蔽日，所过禾稼一空", bad: true };
    return { mul: 1, name: "", normal: true };
  };

  /* ---------------- 儿孙添丁：在家成婚的儿子 / 招赘女儿照样生养 ----------------
   * 儿子+儿媳、招赘女儿+女婿：女方16~42、男方16~50，每月约一成身孕，怀胎十月
   * 所生为孙辈（parentId 记生父/生母），入户同居，长房之孙可承祧 */
  Game.couplePair = function (ch) {
    if (!ch || !ch.alive || !ch.married || !ch.spouse || !ch.spouse.joined || ch.out || ch.palace) return null;
    if (ch.gender === "男") return { mom: ch.spouse, dad: ch };
    return { mom: ch, dad: ch.spouse };
  };
  /* 祈福送子：香火庇佑期间更易受孕 */
  Game.prayBirthBonus = function (g) {
    if (g && g.blessing && g.blessing.months > 0) return (Game.PRAY_TIER_BIRTH || [])[g.blessing.tier] || 0;
    return 0;
  };
  /* 生育率：夫妻双方折中看；难产伤身：减生育率，重则此后再难有孕 */
  Game.laborInjury = function (mom, log, whoName) {
    if (!mom) return;
    const loss = rand(15, 35);
    mom.fertility = Math.max(0, (mom.fertility == null ? 50 : mom.fertility) - loss);
    if (mom.fertility <= 8 || chance(0.35)) {
      mom.infertile = true;
      log(`${whoName}这次伤了根本，大夫摇头：此后再难有孕了。`, "bad");
    } else {
      log(`${whoName}这次伤了身子，大夫说须好生调养（生育${mom.fertility}·${Game.fertilityWord ? Game.fertilityWord(mom) : ""}）。`, "bad");
    }
  };
  Game.fertilityFactor = function (mom, dad) {
    const mf = Game.fertilityOf ? Game.fertilityOf(mom) : 50;
    const df = Game.fertilityOf ? Game.fertilityOf(dad) : 50;
    if (mom && mom.infertile) return 0;
    return clamp((mf + df) / 100, 0.15, 1.9);
  };
  /* 嗣位人选：同居的直系后代（子辈与在册孙辈），出阁/分家/入宫者不算 */
  Game.directHeirs = function (g) {
    return (g.children || []).filter(x => x.alive && !x.out);
  };
  Game.heirPerson = function (g) {
    if (!g.heirId) return null;
    const h = (g.children || []).find(x => x.id === g.heirId);
    return (h && h.alive && !h.out) ? h : null;
  };
  Game.setHeir = function (id) {
    const g = Game.G;
    const h = (g.children || []).find(x => x.id === id);
    if (!h || !h.alive || h.out) return log("须在家同居的直系后代方可立嗣。", "bad");
    g.heirId = id;
    log(`立嗣：${h.name}（${h.gender}·${h.age}岁）为${g.surname}氏继承人，来日承祧有人。`, "good");
    Game.save(); Game.refresh();
  };
  Game.clearHeir = function (silent) {
    const g = Game.G;
    g.heirId = null;
    if (!silent) { log("撤了嗣位，容后再议。", ""); Game.save(); Game.refresh(); }
  };
  Game.birthChanceCouple = function (g, ch) {
    const pair = Game.couplePair(ch);
    if (!pair) return 0;
    if (ch.pregnancy) return 0;
    if ((ch.cooldown || 0) > 0) return 0;
    const mom = pair.mom, dad = pair.dad;
    if (!mom || !dad) return 0;
    if (mom.age > 42 || mom.age < 16 || dad.age > 50 || dad.age < 16) return 0;
    if ((mom && mom.infertile)) return 0;
    if (g.children.filter(x => x.alive).length >= 8) return 0;
    let p = 0.10;
    if (Game.householdMembers().length >= Game.houseCapacity()) p -= 0.03;
    if (g.children.some(x => x.alive && x.age <= 1)) p -= 0.04;
    if (mom.age >= 36) p -= (mom.age - 35) * 0.01;
    if (g.riteBuff && g.riteBuff.birth > 0) p += (g.riteBuff.birthBonus || 0.03);
    if (Game.fertilityFactor) p *= Game.fertilityFactor(mom, dad);
    if (Game.prayBirthBonus) p += Game.prayBirthBonus(g);
    return clamp(p, 0.005, 0.18);
  };
  Game.conceiveCouple = function (g, ch, log) {
    ch.pregnancy = { month: 1, total: Game.PREG_MONTHS };
    const who = ch.gender === "男" ? ("儿媳" + ch.spouse.name) : ch.name;
    log(who + "身子不爽，延医诊脉，竟是有了身孕，合家欢喜，来年添丁。", "good");
  };
  Game.advanceCouplePregnancy = function (g, ch, log) {
    const preg = ch.pregnancy;
    if (!preg) return;
    if (!ch.spouse || !ch.spouse.joined) { ch.pregnancy = null; return; }
    preg.month += 1;
    const left = preg.total - preg.month + 1;
    if (preg.month === 5) log((ch.gender === "男" ? "儿媳" + ch.spouse.name : ch.name) + "已有五月身孕。", "");
    if (left > 0) return;
    Game.deliverCouple(g, ch, log);
  };
  Game.deliverCouple = function (g, ch, log) {
    const pair = Game.couplePair(ch);
    ch.pregnancy = null;
    ch.cooldown = Game.POSTPARTUM_MONTHS;
    if (!pair) return;
    const mom = pair.mom, dad = pair.dad;
    const risk = 0.015 + Math.max(0, mom.age - 32) * 0.006 + (mom.stats && mom.stats.体力 < 35 ? 0.02 : 0);
    if (chance(risk)) {
      if (chance(0.75)) {
        log((ch.gender === "男" ? "儿媳" + mom.name : mom.name) + "临盆艰难，产下一死胎，举家哀恸。", "bad");
        if (chance(0.4) && Game.laborInjury) Game.laborInjury(mom, log, (ch.gender === "男" ? "儿媳" + mom.name : mom.name));
      } else {
        const gender = chance(0.52) ? "男" : "女";
        const baby = Game.makeChild(gender, dad, mom, g.surname, gender === "男" ? "孙" : "孙女", ch.id);
        baby.bm = g.month; baby.bornY = g.year;
        g.children.push(baby);
        log((ch.gender === "男" ? "儿媳" + mom.name : mom.name) + "拼死诞下一" + (gender === "男" ? "孙" : "孙女") + "取名" + baby.name + "，自己却血崩而亡。", "bad");
        if (ch.gender === "男") { ch.spouse = null; ch.married = false; }
        else { ch.alive = false; }
      }
      return;
    }
    const n = chance(0.015) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const gender = chance(0.52) ? "男" : "女";
      const baby = Game.makeChild(gender, dad, mom, g.surname, gender === "男" ? "孙" : "孙女", ch.id);
      baby.bm = g.month; baby.bornY = g.year;
      g.children.push(baby);
      log((ch.gender === "男" ? "儿媳" + mom.name : mom.name) + "十月怀胎，诞下一" + (gender === "男" ? "孙" : "孙女") + "，取名" + baby.name + "。", "good");
      const notable = Game.notableBirthTraits ? Game.notableBirthTraits(baby) : [];
      if (notable.length)
        log("稳婆们奔走相告：" + baby.name + "生而" + notable.map(function (d) { return Game.traitName(d.key, gender); }).join("、") + "，" + notable[0].desc, "good");
    }
    if (n === 2) log("一胎双孙，并蒂莲开，乡人皆道是积善之报。", "good");
    /* 顺产亦有小概率伤身：高龄、体弱更险 */
    if (!mom.infertile && Game.laborInjury) {
      const ip = 0.02 + (mom.age >= 35 ? 0.06 : 0) + ((mom.stats && mom.stats.体力 < 35) ? 0.04 : 0);
      if (chance(ip)) Game.laborInjury(mom, log, (ch.gender === "男" ? "儿媳" + mom.name : mom.name));
    }
  };


  /* ---------------- 生育（怀胎十月制） ----------------
   * 受孕：已婚、男方<47、女方16~42岁，基准每月12%（坐月子/有孕期间不孕）
   * 妊娠：受孕后怀胎 10 个月才分娩，杜绝“一月一胎”
   * 宅舍拥挤、已有襁褓幼子会略降；配偶魅力略添 */
  Game.PREG_MONTHS = 10;
  Game.POSTPARTUM_MONTHS = 2;   /* 产后两月不孕，坐月子 */
  Game.birthChance = function (g) {
    const c = g.char, s = g.spouse;
    if (!s) return 0;
    if (g.pregnancy) return 0;   /* 已有身孕，不再受孕 */
    if ((g.cooldown || 0) > 0) return 0;   /* 产后调养 */
    /* 男女年龄：女方（生孩子的人）16~42，男方16~50 */
    const mother = c.gender === "女" ? c : s;
    const father = c.gender === "女" ? s : c;
    if (!mother || !father) return 0;
    if (mother.age > 42 || mother.age < 16 || father.age > 50 || father.age < 16) return 0;
    if (mother.infertile) return 0;
    if (g.children.filter(x => x.alive).length >= 8) return 0;
    let p = 0.12;
    if (Game.householdMembers().length >= Game.houseCapacity()) p -= 0.03;   // 房舍逼仄
    if (g.children.some(x => x.alive && x.age <= 1)) p -= 0.04;              // 尚有襁褓幼子
    p += Math.max(-0.02, ((s.stats && s.stats.魅力) || 50 - 50) / 1000);
    /* 夫妻好感直接影响添丁：恩爱易得子，冷淡难受孕 */
    const sf = (s.favor == null ? 65 : s.favor);
    if (sf >= 80) p += 0.02;
    else if (sf < 30) p -= 0.05;
    else if (sf < 50) p -= 0.02;
    /* 高龄略难受孕 */
    if (mother.age >= 36) p -= (mother.age - 35) * 0.01;
    /* 祖佑：祭祖后数月易受孕 */
    if (g.riteBuff && g.riteBuff.birth > 0) p += (g.riteBuff.birthBonus || 0.03);
    if (Game.fertilityFactor) p *= Game.fertilityFactor(mother, father);
    if (Game.prayBirthBonus) p += Game.prayBirthBonus(g);
    return clamp(p, 0.005, 0.20);
  };

  /* 受孕成功：立下胎记，下月起算怀胎 */
  Game.conceive = function (g, log) {
    g.pregnancy = { month: 1, total: Game.PREG_MONTHS };
    const motherName = g.char.gender === "男" ? ("夫人" + g.spouse.name) : g.char.name;
    log(`${motherName}身子不爽，延医诊脉，竟是有了身孕，合家欢喜。`, "good");
  };

  /* 每月推进妊娠：返回 true 表示本月已分娩（engine 据此不再另判受孕） */
  Game.advancePregnancy = function (g, log) {
    const preg = g.pregnancy;
    if (!preg) return false;
    /* 丧偶/无配偶：若怀的是配偶，对方已逝则胎失；若是女家主自怀则继续 */
    if (!g.spouse) { g.pregnancy = null; return false; }
    preg.month += 1;
    const left = preg.total - preg.month + 1;
    if (preg.month === 5) {
      log(`${g.char.gender === "男" ? "夫人" + g.spouse.name : g.char.name}已有五月身孕，行动渐是不便。`, "");
    }
    if (left > 0) return false;
    Game.deliver(g, log);
    return true;
  };

  /* 分娩：怀胎十月一朝落地，含双胎小概率与难产风险 */
  Game.deliver = function (g, log) {
    const c = g.char, s = g.spouse;
    g.pregnancy = null;
    g.cooldown = Game.POSTPARTUM_MONTHS;
    if (!s) return;
    const mother = c.gender === "男" ? s : c;
    /* 难产率：基础2%，母年高、体弱则升 */
    let risk = 0.02 + Math.max(0, mother.age - 32) * 0.008 + (mother.stats && mother.stats.体力 < 35 ? 0.03 : 0);
    if (chance(risk)) {
      /* 难产：母子只能保一，大概率丧子，小概率丧母；丧子亦可伤身 */
      if (chance(0.75)) {
        log(`${c.gender === "男" ? "夫人" + s.name : c.name}临盆艰难，挣扎一日夜，终产下一死胎，举家哀恸。`, "bad");
        g.family.reputation = Math.max(0, g.family.reputation - 1);
        if (chance(0.4) && Game.laborInjury) Game.laborInjury(c.gender === "男" ? s : c, log, c.gender === "男" ? "夫人" + s.name : c.name);
        return;
      } else {
        const gender = chance(0.52) ? "男" : "女";
        const child = Game.makeChild(gender, c, s, g.surname);
        child.bm = g.month; child.bornY = g.year;
        g.children.push(child);
        log(`${c.gender === "男" ? "夫人" + s.name : s.name}拼死诞下一${gender === "男" ? "子" : "女"}取名${child.name}，自己却血崩而亡。`, "bad");
        if (c.gender === "男") { g.spouse = null; g.family.reputation = Math.max(0, g.family.reputation - 1); }
        else { /* 女家主难产而死 */ if (Game.die) { log(`${c.name}难产而亡。`, "bad"); /* 延迟到 engine 死亡判定由外层处理 */ c.stats.体力 = 0; } }
        return;
      }
    }
    /* 顺产：1.5% 双胎 */
    const twins = chance(0.015);
    const n = twins ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const gender = chance(0.52) ? "男" : "女";
      const child = Game.makeChild(gender, c, s, g.surname);
      child.bm = g.month; child.bornY = g.year;
      g.children.push(child);
      log(`${c.gender === "男" ? "夫人" + s.name : s.name}十月怀胎，诞下一${gender === "男" ? "子" : "女"}，取名${child.name}。`, "good");
      const notable = Game.notableBirthTraits ? Game.notableBirthTraits(child) : [];
      if (notable.length)
        log(`稳婆们奔走相告：${child.name}生而${notable.map(d => Game.traitName(d.key, gender)).join("、")}，${notable[0].desc}`, "good");
    }
    if (twins) log(`一胎双子，并蒂莲开，乡人皆道是积善之报。`, "good");
    const _mom = c.gender === "男" ? s : c;
    if (!_mom.infertile && Game.laborInjury) {
      const _ip = 0.02 + (_mom.age >= 35 ? 0.06 : 0) + ((_mom.stats && _mom.stats.体力 < 35) ? 0.04 : 0);
      if (chance(_ip)) Game.laborInjury(_mom, log, c.gender === "男" ? "夫人" + s.name : c.name);
    }
  };

  /* 成年无官身族人补派营生 */
  Game.assignJobIfIdle = function (p) {
    if (!p) return;
    if (!p.job && !p.office) p.job = Game.pickJob(p);
  };

  /* ---------------- 赋税徭役（每月计征） ---------------- */
  Game.settleTaxes = function (g) {
    const t = Game.TAX || { landPerMu: 0.07, shopRate: 0.15, adultPoll: 0.4 };
    const landTax = Math.round(g.land * t.landPerMu * 10) / 10;
    let shopTax = 0;
    (g.shops || []).forEach(s => {
      if ((s.lastProfit || 0) > 0) shopTax += s.lastProfit * t.shopRate;
    });
    shopTax = Math.round(shopTax * 10) / 10;
    const adults = Game.householdMembers().filter(m => m.person.age >= 16).length;
    const poll = Math.round(adults * t.adultPoll * 10) / 10;
    const privTax = (Game.repPriv ? Game.repPriv().taxMul : 1) || 1;   /* 望族缙绅优免八折 */
    const total = Math.round((landTax + shopTax + poll) * privTax * 10) / 10;
    if (total > 0) {
      g.money -= total;
      g._lastTax = { landTax, shopTax, poll, total };
    } else {
      g._lastTax = { landTax: 0, shopTax: 0, poll: 0, total: 0 };
    }
    return g._lastTax;
  };

  /* ---------------- 宅院修缮 + 为官应酬（每月固定开销） ---------------- */
  Game.officeSocialCost = function (g) {
    if (!g.char.office) return 0;
    const base = Game.OFFICE_SOCIAL_BASE != null ? Game.OFFICE_SOCIAL_BASE : 3;
    const per = Game.OFFICE_SOCIAL_PER_GRADE != null ? Game.OFFICE_SOCIAL_PER_GRADE : 0.8;
    return Math.round((base + g.char.office.grade * per) * 10) / 10;
  };
  Game.settleUpkeep = function (g) {
    const keep = Math.round((g.house.rooms * (Game.HOUSE_KEEP_PER_ROOM || 0.6)) * 10) / 10;
    const social = Game.officeSocialCost(g);
    const manor = Game.manorInfo ? Game.manorInfo(g.manor || "hut") : { upkeep: 0 };
    const manorKeep = manor.upkeep || 0;
    const stewardWage = (g.steward && g.steward.wage) || 0;
    const total = Math.round((keep + social + manorKeep + stewardWage) * 10) / 10;
    if (total > 0) g.money -= total;
    g._lastUpkeep = { keep, social, manorKeep, stewardWage, total };
    return g._lastUpkeep;
  };
})();
