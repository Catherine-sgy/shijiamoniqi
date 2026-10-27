/* ============================================================
 * 百年宗谱 · 核心引擎
 * 经济 / 行动 / 科举 / 仕宦 / 生死 / 继承
 * ============================================================ */
(function () {
  "use strict";
  const Game = window.Game;
  const { rand, clamp, pick, chance } = Game.U;

  /* 体力上限：年过半百渐衰 */
  Game.maxSta = function () {
    const g = Game.G;
    if (!g) return 100;
    return Math.round(clamp(100 - Math.max(0, g.char.age - 50) * 1.3, 60, 100));
  };

  const log = (t, cls) => Game.log(t, cls);
  const rep = (n) => {
    const g = Game.G;
    g.family.reputation = Math.max(0, g.family.reputation + n);
    g.family.peakReputation = Math.max(g.family.peakReputation, g.family.reputation);
  };

  /* ============================================================
   * 行动（每月 2 点精力）
   * ============================================================ */
  Game.doAction = function (key) {
    const g = Game.G;
    if (!g.char.alive || g.locked) return;
    if (g.ap <= 0) return log("本月精力已尽，且待下月。", "bad");
    const c = g.char;
    const max = Game.maxSta();
    let done = true;

    switch (key) {
      case "study":
        if (c.stats.体力 < 8) { log("神思倦怠，读不进书，且先将养。", "bad"); done = false; break; }
        Game.gainStat(c, "智力", rand(2, 4));
        c.stats.体力 = clamp(c.stats.体力 - rand(4, 7), 0, max);
        log(pick(["寒窗夜读，经义渐通。","手不释卷，学问日进。","闭户读书一月，颇有心得。"]), "good");
        break;
      case "martial":
        if (c.stats.体力 < 8) { log("筋骨酸软，拉不开弓。", "bad"); done = false; break; }
        Game.gainStat(c, "武力", rand(2, 4));
        c.stats.体力 = clamp(c.stats.体力 - rand(4, 7), 0, max);
        log(pick(["晨起练拳，夜暮挽弓。","走马驰射，膂力渐增。","勤习不辍，武艺精进。"]), "good");
        break;
      case "social":
        if (g.money < 3) { log("囊中空空，无钱会友。", "bad"); done = false; break; }
        g.money -= 3;
        Game.gainStat(c, "魅力", rand(2, 5));
        c.stats.体力 = clamp(c.stats.体力 - 2, 0, max);
        rep(1);
        log("携酒游学会友，清谈竟日，风度为人称道。", "good");
        break;
      case "rest":
        Game.gainStat(c, "体力", rand(9, 15), max);
        if (c.isSick && c.stats.体力 > 45) { c.isSick = false; log("将养数日，病体渐愈。", "good"); }
        else log("早睡晚起，安心静养。", "");
        break;
      case "charity":
        if (g.money < 12) { log("仓中余粮不多，无力周济。", "bad"); done = false; break; }
        g.money -= 12; rep(4);
        log("开仓济贫，施药舍棺，乡邻感戴。", "good");
        break;
      case "work":
        g.workFocus = true;
        c.stats.体力 = clamp(c.stats.体力 - rand(3, 6), 0, max);
        log(g.shops.length ? "亲往各铺督工一日，本月买卖、口碑皆有望。" : "亲自下乡督收租米，本月租入可期。", "");
        break;
      case "office":
        if (!c.office) { done = false; break; }
        if (Game.ensureOfficeState) Game.ensureOfficeState(g);
        c.office.diligence = clamp(c.office.diligence + rand(7, 11));
        const got = rand(4, 8);
        c.office.merit = (c.office.merit || 0) + got;
        c.stats.体力 = clamp(c.stats.体力 - rand(4, 7), 0, max);
        log(`案牍劳形，勤于公事，政绩+${got}。`, "");
        break;
      default: done = false;
    }

    if (done) { g.ap -= 1; (g._monthActs = g._monthActs || []).push(key); Game.save(); Game.refresh && Game.refresh(); }
  };

  /* ============================================================
   * 田产
   * ============================================================ */
  function parseMu(raw) {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  Game.buyLand = function (n) {
    const g = Game.G;
    n = parseMu(n);
    if (!n) return log("请填入要买的亩数（正整数）。", "bad");
    const cost = n * g.landPrice;
    if (g.money < cost) return log(`银两不足，买入${n}亩需${cost}两。`, "bad");
    g.money -= cost; g.land += n;
    g.landUse.rent += n;   // 新购之田默认招佃收租，可在田亩页改作
    log(`立契购入田产${n}亩，耗银${cost}两（暂作佃租之田）。`, "good");
    Game.save(); Game.refresh();
  };
  Game.sellLand = function (n) {
    const g = Game.G;
    n = parseMu(n);
    if (!n) return log("请填入要卖的亩数（正整数）。", "bad");
    if (g.land < n) return log(`家中只有田${g.land}亩。`, "bad");
    const income = n * g.landPrice;
    g.land -= n; Game.removeLand(n); g.money += income;
    log(`售出田产${n}亩，得银${income}两。`, "");
    Game.save(); Game.refresh();
  };
  Game.setAutoLand = function (n) {
    const g = Game.G;
    g.autoLand = parseMu(n);
    log(g.autoLand ? `此后每月度月，自动以时价置田${g.autoLand}亩（银紧则少买）。` : "已停止每月自动置田。", "");
    Game.save(); Game.refresh();
  };

  /* ============================================================
   * 铺号商事
   * ============================================================ */
  const shopName = (s) => Game.SHOP_TYPES[s.type].name;
  Game.shopName = shopName;   /* 界面层亦用 */

  /* 口碑倍率：口碑0→0.5，50→1.0，100→1.5 */
  Game.fameMul = (fame) => 0.5 + fame / 100;
  /* 盘价：开办本金 × 口碑倍率 */
  Game.shopPrice = (s) => Math.round(((s.invested != null ? s.invested : Game.SHOP_TYPES[s.type].cost)) * Game.fameMul(s.fame));

  Game.openShop = function (type) {
    const g = Game.G;
    const t = Game.SHOP_TYPES[type];
    if (!t) return;
    const cap = Game.shopCap();
    if (g.shops.length >= cap)
      return log(`家中功名官身只撑得起${cap}间铺面。欲多开张，须族中多有人博取功名、出仕为官，以官身荫商。`, "bad");
    if (g.money < t.cost) return log(`开张${t.name}需本钱${t.cost}两。`, "bad");
    g.money -= t.cost;
    const ordinal = ["", "一", "二", "三", "四", "五", "六"][g.shops.filter(s => s.type === type).length + 1] || "";
    g.shops.push({ id: "s" + Date.now() + rand(100, 999), type, fame: 30, months: 0, lastProfit: 0, discount: false, level: 1, invested: t.cost, clerks: 0 });
    log(`择吉开张，${t.name}挂牌营业（家中第${g.shops.length}间铺面）。`, "good");
    Game.save(); Game.refresh();
  };

  /* 本月打折酬宾（度月后自动取消） */
  Game.toggleDiscount = function (id) {
    const g = Game.G;
    const s = g.shops.find(x => x.id === id);
    if (!s) return;
    s.discount = !s.discount;
    log(s.discount ? `${shopName(s)}本月打折酬宾，招徕主顾，盈利让利于口碑。` : `${shopName(s)}取消打折，照常作价。`, "");
    Game.save(); Game.refresh();
  };

  Game.sellShop = function (id) {
    const g = Game.G;
    const i = g.shops.findIndex(x => x.id === id);
    if (i < 0) return;
    const s = g.shops[i];
    const price = Game.shopPrice(s);
    g.money += price;
    const sunk = (s.invested != null ? s.invested : Game.SHOP_TYPES[s.type].cost);
    log(`将${shopName(s)}连铺面带招牌盘出，口碑${s.fame}，得银${price}两${price >= sunk ? "，反比投进去的本钱更丰" : ""}。`, price >= sunk ? "good" : "");
    g.shops.splice(i, 1);
    Game.save(); Game.refresh();
  };
  /* 雇伙计：每铺至多2人，月钱2两/人，流水+10%/人 */
  Game.hireClerk = function (id) {
    const g = Game.G;
    const s = g.shops.find(x => x.id === id);
    if (!s) return;
    if ((s.clerks || 0) >= 2) return log("这间铺子伙计已满（2人）。", "bad");
    s.clerks = (s.clerks || 0) + 1;
    log(`给${shopName(s)}雇一伙计，月钱2两，流水+10%。`, "good");
    Game.save(); Game.refresh();
  };
  Game.dismissClerk = function (id) {
    const g = Game.G;
    const s = g.shops.find(x => x.id === id);
    if (!s || !(s.clerks > 0)) return;
    s.clerks -= 1;
    log(`辞去${shopName(s)}一伙计。`, "");
    Game.save(); Game.refresh();
  };
  /* 分号升级：铺子分三级，升级加流水，盘价按累计投入算 */
  Game.shopLevelName = function (lv) { return ["", "小铺", "分号", "老字号"][lv] || "小铺"; };
  /* 一键雇佣：间间铺子配满2伙计（雇不花钱，月钱2两/人，流水各+20%） */
  Game.hireAllClerks = function () {
    const g = Game.G;
    if (!g.shops.length) return log("尚无铺面可雇人。", "bad");
    let n = 0;
    g.shops.forEach(x => { while ((x.clerks || 0) < 2) { x.clerks = (x.clerks || 0) + 1; n++; } });
    if (!n) return log("间间铺子伙计都满了，无需再雇。", "");
    const wage = g.shops.reduce((a, x) => a + (x.clerks || 0) * 2, 0);
    log(`一键雇佣${n}名伙计，间间铺子配满2人（共月钱${wage}两/月，流水各+20%）。`, "good");
    Game.save(); Game.refresh();
  };
  /* 一键升级：按现有银两，从便宜到贵逐间升，能升几间升几间（门槛不够的跳过） */
  Game.upgradeAllShops = function () {
    const g = Game.G;
    if (!g.shops.length) return log("尚无铺面可升。", "bad");
    const cands = g.shops
      .filter(s => (s.level || 1) < 3)
      .map(s => ({ s, cost: Game.upgradeCost(s) }))
      .sort((a, b) => a.cost - b.cost);
    if (!cands.length) return log("间间都是老字号，无需再升。", "");
    let n = 0, spent = 0;
    const skipped = [];
    cands.forEach(({ s, cost }) => {
      const lv = s.level || 1;
      const needMonths = lv === 1 ? 6 : 12;
      const needFame = lv === 1 ? 50 : 70;
      if ((s.months || 0) < needMonths) { skipped.push(`${shopName(s)}(经营${s.months || 0}/${needMonths}月)`); return; }
      if ((s.fame || 0) < needFame) { skipped.push(`${shopName(s)}(口碑${s.fame}/${needFame})`); return; }
      const c2 = Game.upgradeCost(s);
      if (g.money < c2) { skipped.push(`${shopName(s)}(差${c2}两)`); return; }
      g.money -= c2; spent += c2;
      s.invested = (s.invested != null ? s.invested : Game.SHOP_TYPES[s.type].cost) + c2;
      s.level = lv + 1;
      s.fame = s.level === 3 ? 50 : 40;
      n++;
    });
    if (!n) return log("没有够格升级的铺子：" + skipped.join("、") + "。", "bad");
    log(`一键升级${n}间铺子，共耗银${spent}两，口碑按新规格重攒。` + (skipped.length ? "其余未升：" + skipped.join("、") + "。" : ""), "good");
    Game.save(); Game.refresh();
  };
  Game.upgradeCost = function (s) {
    const t = Game.SHOP_TYPES[s.type];
    return Math.round(t.cost * 0.8 * (s.level || 1));
  };
  Game.upgradeShop = function (id) {
    const g = Game.G;
    const s = g.shops.find(x => x.id === id);
    if (!s) return;
    const lv = s.level || 1;
    if (lv >= 3) return log("已是三级老字号，到顶了。", "bad");
    /* 升级门槛：开得久 + 口碑够 + 出得起钱，缺一不可 */
    const needMonths = lv === 1 ? 6 : 12;
    const needFame = lv === 1 ? 50 : 70;
    if ((s.months || 0) < needMonths) return log(`${shopName(s)}才开张${s.months || 0}个月，根基未稳（需满${needMonths}个月）。`, "bad");
    if ((s.fame || 0) < needFame) return log(`${shopName(s)}口碑${s.fame}，街坊还认不得这块招牌（需口碑${needFame}）。`, "bad");
    const cost = Game.upgradeCost(s);
    if (g.money < cost) return log(`升${Game.shopLevelName(lv + 1)}需银${cost}两。`, "bad");
    g.money -= cost;
    s.invested = (s.invested != null ? s.invested : Game.SHOP_TYPES[s.type].cost) + cost;
    s.level = lv + 1;
    /* 按新规格算口碑：换了大招牌，老客要重新认门，从起步线重攒（老字号底子厚，起点稍高） */
    s.fame = s.level === 3 ? 50 : 40;
    log(`${shopName(s)}扩为${Game.shopLevelName(s.level)}：流水+25%，只是新招牌新气象，口碑按大店规格重算，从${s.fame}起攒，养回来才值钱。`, "good");
    Game.save(); Game.refresh();
  };
  /* 钱庄：存款吃月息1%，借贷月息5%（上限300两，随借随还） */
  Game.bankSettle = function (g) {
    if (!g.bank) g.bank = { deposit: 0, loan: 0 };
    g._lastBank = { depInt: 0, loanInt: 0 };
    if (g.bank.deposit > 0) {
      const i = Math.round(g.bank.deposit * 0.01 * 10) / 10;
      g.bank.deposit = Math.round((g.bank.deposit + i) * 10) / 10;
      g.money = Math.round((g.money + i) * 10) / 10;
      g._lastBank.depInt = i;
      if (i > 0) log(`钱庄结息，存款添利${i}两。`, "good");
    }
    if (g.bank.loan > 0) {
      const i = Math.round(g.bank.loan * 0.05 * 10) / 10;
      g.money = Math.round((g.money - i) * 10) / 10;
      g._lastBank.loanInt = i;
      log(`钱庄收贷息${i}两（欠银${g.bank.loan}两，记得还本）。`, i > 0 ? "" : "");
    }
  };
  Game.bankDeposit = function (n) {
    const g = Game.G;
    n = Math.max(0, Math.floor(Number(n)));
    if (!n) return log("存入先在格里填银两数。", "bad");
    if (g.money < n) return log(`存入${n}两，囊中不足。`, "bad");
    if (!g.bank) g.bank = { deposit: 0, loan: 0 };
    g.money -= n; g.bank.deposit = Math.round((g.bank.deposit + n) * 10) / 10;
    log(`存银${n}两入钱庄，月息一分。`, "good");
    Game.save(); Game.refresh();
  };
  Game.bankWithdraw = function (n) {
    const g = Game.G;
    n = Math.max(0, Math.floor(Number(n)));
    if (!n) return log("取出先在格里填银两数。", "bad");
    if (!g.bank || g.bank.deposit < n) return log("庄上没存这么多。", "bad");
    g.bank.deposit = Math.round((g.bank.deposit - n) * 10) / 10; g.money += n;
    log(`从钱庄取出${n}两。`, "");
    Game.save(); Game.refresh();
  };
  Game.bankBorrow = function (n) {
    const g = Game.G;
    n = Math.max(0, Math.floor(Number(n)));
    if (!n) return log("借入先在格里填银两数。", "bad");
    if (!g.bank) g.bank = { deposit: 0, loan: 0 };
    if (g.bank.loan + n > 300) return log("钱庄：欠账至多300两，先还旧的再借。", "bad");
    g.bank.loan += n; g.money += n;
    log(`从钱庄借银${n}两应急，月息五分，莫忘了还。`, n > 0 ? "" : "");
    Game.save(); Game.refresh();
  };
  Game.bankRepay = function (n) {
    const g = Game.G;
    n = Math.max(0, Math.floor(Number(n)));
    if (!n) return log("还欠先在格里填银两数。", "bad");
    if (!g.bank || !g.bank.loan) return log("庄上并无欠账，无须还。", "");
    n = Math.min(n, g.bank.loan, Math.floor(g.money));
    if (n <= 0) return log("囊中空空，还不起。", "bad");
    g.bank.loan = Math.round((g.bank.loan - n) * 10) / 10; g.money -= n;
    log(`还钱庄欠银${n}两（尚欠${g.bank.loan}两）。`, "good");
    Game.save(); Game.refresh();
  };

  /* 每间铺号的月度结算（含伙计工钱，口碑越高工钱越高） */
  function settleShops(g) {
    if (!g.shops.length) return;
    g.shops.forEach(s => {
      const t = Game.SHOP_TYPES[s.type];
      s.months += 1;
      const [lo, hi] = t.base;
      const mid = (lo + hi) / 2;
      let rev = mid * (1 + (Math.random() * 2 - 1) * t.vol) * (0.6 + s.fame / 100 * 0.8) * ((g.trends && g.trends[s.type]) || 1) * (1 + 0.25 * ((s.level || 1) - 1)) * (1 + 0.1 * (s.clerks || 0));
      if (s.discount) { rev *= 0.82; s.fame = clamp(s.fame + rand(2, 4)); }
      if (g.workFocus) { rev *= 1.2; s.fame = clamp(s.fame + 1); }
      const gross = Math.round(rev);
      const staff = (Game.SHOP_STAFF_BASE || 2) + (s.fame >= 70 ? (Game.SHOP_STAFF_FAME_EXTRA || 1) : 0) + (s.clerks || 0) * 2;
      let profit = gross - t.upkeep - staff;
      s.lastProfit = profit;
      s.lastStaff = staff;
      g.money += profit;
      /* 口碑随盈亏消长：营业额达到常态九成便有机会添口碑（乡绅以上跌得慢） */
      if (gross >= mid * 0.95) s.fame = clamp(s.fame + (chance(0.55) ? 1 : 0));
      else if (profit < 0) {
        const highRep = g.family.peakReputation >= 160;
        s.fame = clamp(s.fame - (highRep ? 1 : rand(1, 2)));
      }
      s.discount = false;
    });
    /* 商事际遇 */
    if (chance(0.28)) rollShopEvent(g);
  }

  function rollShopEvent(g) {
    const s = pick(g.shops);
    const t = Game.SHOP_TYPES[s.type];
    const isFood = s.type === "eatery" || s.type === "pastry" || s.type === "butcher" || s.type === "teahouse";
    const pool = [
      { w: 5, run() { s.fame = clamp(s.fame + rand(4, 8)); rep(2); log(`${t.name}待客以诚，客遗重金而遍寻不着，店夥封金候其来取，一时传为美谈，口碑大噪。`, "good"); } },
      { w: 5, run() { s.fame = clamp(s.fame + rand(3, 6)); log(`几名${s.type === "antique" ? "博雅君子" : "体面客人"}盛赞${t.name}货色地道，自此常来常往。`, "good"); } },
      { w: 4, run() { const n = rand(6, 16); g.money += n; s.fame = clamp(s.fame + 2); log(`${t.name}进的一批货被人识货高价购去，净赚${n}两。`, "good"); } },
      { w: 4, run() { s.fame = clamp(s.fame - rand(4, 8)); rep(-2); log(`有人私下议论${t.name}店大欺客${isFood ? "、缺斤短两" : "、以次充好"}，流言渐起，口碑受损。`, "bad"); } },
      { w: 3, run() { const n = rand(5, 14); g.money -= n; log(`${t.name}夜半走水，虽即扑灭，修缮折银${n}两。`, "bad"); } },
      { w: 3, run() { s.fame = clamp(s.fame - rand(6, 10)); rep(-3);
          if (s.type === "antique") log(`${t.name}重金收来的“古器”被行家当众识破是赝品，看客哄笑，颜面扫地。`, "bad");
          else if (s.type === "butcher") log(`官府查出市上病猪肉，${t.name}牵涉其中，肉案被封三日。`, "bad");
          else log(`几名客人${isFood ? "吃坏了肚子，扶墙而出" : "回去后身上不适"}，扬言再不上门，${t.name}口碑大跌。`, "bad"); } },
      { w: 3, run() { const n = rand(4, 10); g.money -= n; s.fame = clamp(s.fame + 1); log(`地痞登门敲诈，${t.name}花了${n}两破财消灾，幸得邻里帮衬。`, ""); } },
      { w: 2, run() { s.fame = clamp(s.fame + rand(6, 10)); rep(3); log(`知府家眷微服光顾${t.name}，连声称善，次日遣人送来亲题匾额一方。`, "good"); } }
    ];
    const total = pool.reduce((a, e) => a + e.w, 0);
    let r = Math.random() * total;
    for (const e of pool) { r -= e.w; if (r <= 0) return e.run(); }
  }

  /* ============================================================
   * 媒妁 / 婚姻
   * ============================================================ */
  /* 媒婆说亲也一次看三个：门户体貌全亮出来，中意便下聘，不中意全婉拒，下个月再请 */
  Game.matchmake = function (idx) {
    const g = Game.G;
    if (g.char.gender === "女" && g.spouse) return log("已招赘入门。", "bad");
    if (g.spouse) return log("已有婚配。", "bad");
    if (g.char.age < 15) return log("年纪尚幼，谈婚论嫁为时过早。", "bad");
    const mm = Game.MATCHMAKERS[idx];
    if (g.money < mm.fee) return log(`谢媒礼金${mm.fee}两尚且凑不齐。`, "bad");
    g.money -= mm.fee;
    const base = 38 + mm.quality * 16;
    const other = g.char.gender === "男" ? "女" : "男";
    g.candidates = [];
    for (let i = 0; i < 3; i++) {
      const c = {
        name: Game.makeName(other, pick(Game.SURNAMES)),
        gender: other,
        age: rand(15, 20),
        family: rand(15 + mm.quality * 15, 55 + mm.quality * 18),
        stats: {
          体力: rand(base - 12, base + 12),
          智力: rand(base - 12, base + 14),
          武力: rand(base - 18, base + 10),
          魅力: rand(base - 8, base + 18)
        },
        gift: mm.gift + rand(-5, 10)
      };
      Game.decoratePerson(c, null, null, true);
      g.candidates.push(c);
    }
    g.candidate = null;
    log(`${mm.name}收了礼金，三日后回话，一口气领来三位，${mm.desc}。`, "");
    Game.save(); Game.refresh();
    Game.showCandidate && Game.showCandidate();
  };
  Game.proposal = function (i) {
    const g = Game.G;
    const c = (g.candidates || [])[i == null ? 0 : Number(i)] || g.candidate;
    if (!c) return;

    if (g.money < c.gift) { log(`备不起${c.gift}两聘礼，婚事告吹。`, "bad"); return; }
    g.money -= c.gift;
    g.spouse = Object.assign({ id: "sp" + Date.now() + rand(100, 999), alive: true, title: null, office: null, favor: rand(70, 85) }, c);
    if (g.spouse.favor == null) g.spouse.favor = rand(70, 85);
    g.spouse.job = Game.pickJob(g.spouse);
    g.candidate = null;
    g.candidates = null;
    rep(Math.round(c.family / 12));
    log(g.char.gender === "男"
      ? `三书六礼已毕，迎娶${c.name}过门，其妻家门户${c.family}。`
      : `备下聘礼，招${c.name}入赘，承${g.surname}氏香火。`, "good");
    Game.save(); Game.refresh();
  };
  Game.rejectCandidate = function () {
    const g = Game.G;
    const n = (g.candidates || []).length;
    log(n ? `这三门亲事都婉拒了，${n}位说亲对象各自归家，下个月再请媒不迟。` : "这门亲事婉拒了。", "");
    g.candidate = null;
    g.candidates = null;
    Game.save(); Game.refresh();
  };

  /* 子女联姻 */
  /* 子女婚嫁三选一：先看人（属性/天赋/词条/门户全亮出来），中意再下聘，不中意就等下个月
   * mode: marry=子娶妻入门 / 女出嫁离家；uxori=女招赘婿入门 */
  /* 随机生成一位亲家（媒人介绍用）：门第体貌随机，天赋词条俱全 */
  function makeInLaw(gender, quality) {
    const q = quality || 0;
    const base = 40 + q * 10;
    const p = {
      id: "il" + Date.now() + rand(100, 999),
      name: Game.makeName(gender, pick(Game.SURNAMES)),
      gender, age: rand(15, 20),
      family: rand(20 + q * 10, 60 + q * 12),
      stats: {
        体力: rand(base - 10, base + 12),
        智力: rand(base - 10, base + 14),
        武力: rand(base - 16, base + 8),
        魅力: rand(base - 8, base + 16)
      },
      alive: true, title: null, office: null, job: null
    };
    Game.decoratePerson(p, null, null, true);
    p.job = Game.pickJob ? Game.pickJob(p) : "farmhand";
    p.fatherName = "不详"; p.motherName = "不详";
    return p;
  }
  function childCandidateList(g, gender) {
    const otherFamily = rand(20, 70) + Math.round(g.family.reputation / 8);
    const list = [];
    for (let i = 0; i < 3; i++) {
      const p = makeInLaw(gender);
      p.family = Math.max(10, Math.round(otherFamily + rand(-18, 18)));
      if (gender === "女") p._cost = Math.round(15 + p.family * 0.4);   /* 娶/赘：聘礼 */
      else p._gift = Math.round(10 + p.family * 0.35);                  /* 嫁：彩礼 */
      list.push(p);
    }
    return list;
  }
  Game.proposeChild = function (id, mode) {
    const g = Game.G;
    const c = g.children.find(x => x.id === id);
    if (!c || c.married || !c.alive || c.palace || c.out) return;
    if (c.age < 15) return log(`${c.name}尚未及婚龄（十五议亲），可先去人际定亲。`, "bad");
    if (mode === "uxori" && c.gender !== "女") return log("招赘只为女儿设，儿子当娶妇。", "bad");
    if (mode === "marry" && c.gender === "女" && c.uxori) c.uxori = false;
    const gender = c.gender === "男" ? "女" : "男";
    g.childCandidates = { childId: id, mode, list: childCandidateList(g, gender) };
    Game.save(); Game.refresh();
    if (Game.showChildCandidates) Game.showChildCandidates();
  };
  Game.marryChild = function (id) { Game.proposeChild(id, "marry"); };
  Game.marryChildUxori = function (id) { Game.proposeChild(id, "uxori"); };
  Game.dismissChildCandidates = function () {
    Game.G.childCandidates = null;
    log("这几门亲事都先搁下，往后再议。", "");
    Game.save(); Game.refresh();
  };
  /* 三选一定：迎娶/许嫁/招赘落定 */
  Game.confirmChildCandidate = function (idx) {
    const g = Game.G;
    const cc = g.childCandidates;
    if (!cc) return;
    const c = g.children.find(x => x.id === cc.childId);
    const cand = cc.list[idx];
    if (!c || !cand || c.married) { g.childCandidates = null; Game.save(); Game.refresh(); return; }
    if (cc.mode === "uxori") {
      if (g.money < cand._cost) return log(`招赘酒席聘礼需${cand._cost}两，家计为难。`, "bad");
      g.money -= cand._cost;
      cand.joined = true;
      c.spouse = cand;
      c.spouseApt = cand.apt; c.spouseStats = cand.stats; c.spouseFamily = cand.family;
      c.spouseName = cand.name; c.spouseTraits = cand.traits || [];
      c.uxori = true; c.married = true;
      rep(4);
      log(`为${c.name}招赘${cand.name}入门（门户${cand.family}），子嗣从${g.surname}姓，香火得续。`, "good");
    } else if (c.gender === "男") {
      if (g.money < cand._cost) return log(`娶妇聘礼需${cand._cost}两，家计为难。`, "bad");
      g.money -= cand._cost;
      cand.joined = true;
      c.spouse = cand;
      c.spouseApt = cand.apt; c.spouseStats = cand.stats; c.spouseFamily = cand.family;
      c.spouseName = cand.name; c.spouseTraits = cand.traits || [];
      c.married = true;
      log(`为${c.name}娶妇${cand.name}入门（门户${cand.family}），小两口同居理家。`, "good");
    } else {
      g.money += cand._gift;
      c.out = "married";
      c.spouseApt = cand.apt; c.spouseStats = cand.stats; c.spouseFamily = cand.family;
      c.spouseName = cand.name; c.spouseTraits = cand.traits || [];
      c.married = true;
      log(`${c.name}许嫁${cand.name}（门户${cand.family}），得彩礼${cand._gift}两。女儿出阁，来日承祧还看兄弟（无兄弟可招赘留家）。`, "good");
    }
    rep(3);
    g.childCandidates = null;
    Game.save(); Game.refresh();
    if (Game.showChildCandidates) Game.showChildCandidates();
  };
  /* 子女和离：媳/婿离家，嫁出女归家，均可再议亲 */
  Game.divorceChild = function (id) {
    const g = Game.G;
    const c = g.children.find(x => x.id === id);
    if (!c || !c.married || !c.alive) return log("此人并无婚配可离。", "bad");
    if (c.out === "branch") return log("分家各过各的，娘家管不着了。", "bad");
    const fam = (c.spouse && c.spouse.family) || c.spouseFamily || 40;
    const fee = Math.round(10 + fam * 0.2);
    if (g.money < fee) return log(`和离需安家银${fee}两，家计为难。`, "bad");
    g.money -= fee;
    g.family.reputation = Math.max(0, g.family.reputation - 3);
    const hadJoined = !!(c.spouse && c.spouse.joined);
    const wasOut = c.out === "married";
    c.spouse = null;
    c.spouseApt = null; c.spouseStats = null; c.spouseFamily = null;
    c.spouseName = null; c.spouseTraits = null;
    c.married = false; c.uxori = false;
    c.marriedClan = null;   /* 姻亲断了 */
    if (wasOut) c.out = null;
    log(hadJoined
      ? `${c.name}与配偶和离，对方收拾行李离家，付安家银${fee}两（声望-3），来日可再议亲。`
      : `${c.name}和离归家，付安家银${fee}两（声望-3），来日可再议亲（含招赘）。`, "bad");
    Game.save(); Game.refresh();
  };
  /* 未成年定亲（人际）：付定金十两，十五岁自动完婚 */
  Game.proposeBetrothal = function (contactId, childId) {
    const g = Game.G;
    const ct = (g.contacts || []).find(x => x.id === contactId);
    const ch = g.children.find(x => x.id === childId && x.alive && !x.married);
    if (!ct || !ch) return;
    if (ct.favor < 80) return log(`${ct.name}与你家尚是泛泛之交（好感${ct.favor}），此时定亲未免唐突。`, "bad");
    if (ch.gender === ct.gender) return log("同性何以结亲。", "bad");
    if (ch.age >= 15 || ch.palace || ch.out || ch.betrothed) return log("此子已可直接议亲，无需定亲。", "bad");
    if (g.money < 10) return log("定亲需十两定金。", "bad");
    g.money -= 10;
    ch.betrothed = {
      name: ct.name, gender: ct.gender, age: ct.age, family: ct.family,
      stats: ct.stats, apt: ct.apt, traits: ct.traits || []
    };
    g.contacts = g.contacts.filter(x => x.id !== contactId);
    rep(3);
    log(`与${ct.name}家指腹为婚……不，是指童为婚，付定金十两，待${ch.name}十五岁即完婚（亲家门户${ct.family}）。`, "good");
    Game.save(); Game.refresh();
  };
  /* 定亲完婚：年满十五自动操办，儿子娶入门、女儿嫁出门 */
  Game.completeBetrothal = function (ch) {
    const g = Game.G;
    const b = ch.betrothed;
    if (!b || ch.married) return;
    if (ch.gender === "男") {
      const cost = Math.round(15 + b.family * 0.4);
      if (g.money < cost) { log(`${ch.name}与${b.name}的婚事因聘礼不足（需${cost}两）暂缓，明年再议。`, "bad"); return; }
      g.money -= cost;
      const w = Object.assign({}, b, { id: b.id || ("il" + Date.now() + rand(100, 999)), alive: true, title: null, office: null, job: null, joined: true });
      if (Game.pickJob) w.job = Game.pickJob(w);
      ch.spouse = w;
      ch.spouseApt = b.apt; ch.spouseStats = b.stats; ch.spouseFamily = b.family;
      ch.spouseName = b.name; ch.spouseTraits = b.traits || [];
      ch.married = true; ch.betrothed = null;
      log(`当年定亲今日完婚：${ch.name}迎娶${b.name}入门，亲家门户${b.family}。`, "good");
    } else {
      const gift = Math.round(10 + b.family * 0.35);
      g.money += gift;
      ch.out = "married";
      ch.spouseApt = b.apt; ch.spouseStats = b.stats; ch.spouseFamily = b.family;
      ch.spouseName = b.name; ch.spouseTraits = b.traits || [];
      ch.married = true; ch.betrothed = null;
      log(`当年定亲今日完婚：${ch.name}许嫁${b.name}，得彩礼${gift}两。`, "good");
    }
    rep(3);
    Game.save(); Game.refresh();
  };

  /* ============================================================
   * 田庄掌柜：开工钱雇人，当季自动把分派田种满（手动播种仍可）
   * ============================================================ */
  Game.hireSteward = function (kind) {
    const g = Game.G;
    const t = (Game.STEWARDS || []).find(x => x.kind === kind);
    if (!t) return;
    if (g.steward) return log("庄上已有掌柜，先辞了旧人再聘。", "bad");
    if (g.family.reputation < (t.needRep || 0))
      return log(t.name + "非声望" + t.needRep + "之家不就。", "bad");
    if (g.money < t.wage) return log("连首月工钱都开不出。", "bad");
    g.steward = {
      kind: t.kind, name: t.name + "·" + Game.makeName("男", pick(Game.SURNAMES)).slice(-1) + "老",
      wage: t.wage, bonus: t.bonus
    };
    log("聘得" + g.steward.name + "（" + t.name + ")为庄头，月钱" + t.wage + "两。此后当季自动把分派田种满，你只管收成。", "good");
    Game.save(); Game.refresh();
  };
  Game.dismissSteward = function () {
    const g = Game.G;
    if (!g.steward) return;
    log("辞去庄头" + g.steward.name + "，此后播种须亲力亲为了。", "");
    g.steward = null;
    Game.save(); Game.refresh();
  };
  /* 庄头按月自动下种：当季即把分派田种满，钱不够则量力少种，种子工本照支 */
  Game.autoSow = function (g) {
    if (!g.steward) return;
    Game.FOOD_KEYS.forEach(k => {
      const crop = Game.cropInfo(k);
      if (!Game.sowSeasonNow(crop, g.month)) return;
      const need = Math.floor((g.landUse[k] || 0) - Game.standingMu(g, k));
      if (need <= 0) return;
      const perMu = crop.seed + (Game.FARM_LABOR_PER_MU || 0.35);
      const afford = Math.floor(g.money / perMu);
      if (afford <= 0) { log("囊中羞涩，" + crop.name + "本季无力下种。", "bad"); return; }
      Game.sowLand(k, Math.min(need, afford), true);
    });
  };

  /* ============================================================
   * 女官体系：女儿入宫两条路（宫女线 / 选秀妃嫔线）
   * 宫女：12-17岁送入宫为小宫女，逐年考课晋升，28岁放出归家，月俸仅自给
   * 选秀：14-19岁应选，凭姿容点为秀女/答应/常在；在宫一律不寄家，高位者危难说情、荫家开铺
   * 宫中女不承祧（出宫归家后可）；宫中有人，危难时按位分递话说情
   * ============================================================ */
  Game.palaceEligible = function (ch) {
    return ch && ch.alive && ch.gender === "女" && !ch.married && !ch.palace && !ch.out
      && ch.age >= 12 && ch.age <= 17;
  };
  Game.draftEligible = function (ch) {
    return ch && ch.alive && ch.gender === "女" && !ch.married && !ch.palace && !ch.out
      && ch.age >= 14 && ch.age <= 19;
  };
  Game.sendToPalace = function (id) {
    const g = Game.G;
    const ch = g.children.find(x => x.id === id);
    if (!ch || !Game.palaceEligible(ch)) return log("此女不合入宫之选（须12-17岁未婚在家女）。", "bad");
    if ((ch.stats.智力 || 0) + (ch.stats.魅力 || 0) < 90)
      return log(ch.name + "资质稍欠（智+魅须满90），宫中不收。", "bad");
    if (g.money < 10) return log("打点需银十两。", "bad");
    g.money -= 10;
    ch.palace = { track: "maid", grade: 0, since: g.year };
    ch.out = "palace";
    ch.job = null;
    rep(4);
    log(ch.name + "（" + ch.age + "岁）送入宫为小宫女。宫女月俸仅自给、不寄家；熬出位分或妃嫔得赏，方能荫家——危难时宫中有人递话，位分越高分量越重。宫中女不承祧，28岁放出归家。", "good");
    Game.save(); Game.refresh();
  };
  Game.palaceDraft = function (id) {
    const g = Game.G;
    const ch = g.children.find(x => x.id === id);
    if (!ch || !Game.draftEligible(ch)) return log("此女不合选秀之选（须14-19岁未婚在家女）。", "bad");
    const charm = ch.stats.魅力 || 0, smart = ch.stats.智力 || 0;
    const score = charm + smart * 0.4 + g.family.reputation / 40;
    if (score < 85) {
      rep(-1);
      log(ch.name + "参选而容色平平，被撂牌子送回家来（智魅还须磨砺，或家声再高些）。", "bad");
      Game.save(); Game.refresh();
      return;
    }
    const grade = charm >= 78 ? 2 : charm >= 65 ? 1 : 0;
    ch.palace = { track: "consort", grade, since: g.year, preg: null, favor: 30 };
    ch.out = "palace";
    ch.job = null;
    rep(10);
    const rn = Game.PALACE_CONSORT_RANKS[grade].name;
      log("喜报！" + ch.name + "选秀中选，点为" + rn + "！一朝入宫，阖家声望大涨。宫中不寄家用，高位者危难时可递话说情、荫家开铺。", "good");
    Game.save(); Game.refresh();
  };
  Game.palaceLeave = function (id) {
    const g = Game.G;
    const ch = g.children.find(x => x.id === id);
    if (!ch || !ch.palace) return;
    if (ch.palace.track === "consort" && ch.palace.grade > 2)
      return log(ch.name + "已是" + Game.palaceName(ch) + "，宫眷在身，不得出宫。", "bad");
    const cost = ch.palace.track === "consort" ? 30 : 5;
    if (g.money < cost) return log("赎归打点需银" + cost + "两。", "bad");
    g.money -= cost;
    log(ch.name + "（" + Game.palaceName(ch) + "）出宫归家，重列婚嫁。", "");
    ch.palace = null; ch.out = null; ch.pregnancy = null;
    Game.save(); Game.refresh();
  };

  /* 妃嫔每月：推进身孕/临盆（身孕十月即产） */
  Game.palaceMonthly = function (g, log) {
    (g.children || []).filter(x => x.alive && x.out === "palace" && x.palace && x.palace.track === "consort").forEach(x => {
      const pl = x.palace;
      if (pl.preg) {
        pl.preg += 1;
        if (pl.preg >= 10) {
          pl.preg = null;
          if (chance(0.85)) {
            const gender = chance(0.55) ? "男" : "女";
            const title = gender === "男" ? "皇子" : "公主";
            const baby = { id: "rp" + Date.now() + rand(100, 999), name: "皇" + (gender === "男" ? "子" : "女") + "·" + x.name.slice(-1), gender, age: 0, alive: true, royal: true, motherId: x.id, bm: g.month, bornY: g.year };
            g.royalKids = g.royalKids || [];
            g.royalKids.push(baby);
            rep(15);
            log(`${x.name}（${Game.palaceName(x)}）诞下${title}，一时恩宠无两，阖家声望+15——皇嗣降生，阖宫同庆。`, "good");
          } else {
            log(`${x.name}（${Game.palaceName(x)}）临盆艰难，竟产下一死胎，阖宫为之叹惋。`, "bad");
          }
        }
      } else {
        const fav = (pl.favor == null ? 30 : pl.favor);
        let pPreg = x.age >= 20 && x.age <= 38
          ? clamp(0.02 + (fav - 30) * 0.002 + (pl.grade >= 4 ? 0.04 : pl.grade >= 2 ? 0.02 : 0), 0, 0.10)
          : 0;
        if (x.infertile) pPreg = 0;
        else if (pPreg > 0) {
          const ff = Game.fertilityOf ? Game.fertilityOf(x) : 50;
          pPreg = clamp(pPreg * (ff / 50), 0, 0.16);
        }
        if (pPreg > 0 && chance(pPreg)) {
          pl.preg = 1;
          log(`${x.name}（${Game.palaceName(x)}）有孕在身，阖宫贺喜。`, "good");
        }
      }
    });
  };

  Game.palaceReview = function (g) {
    (g.children || []).filter(x => x.alive && x.out === "palace" && x.palace).forEach(x => {
      const pl = x.palace;
      if (pl.track === "maid") {
        Game.gainStat(x, "智力", 1);
        if (x.age >= Game.PALACE_RELEASE_AGE) {
          const fee = rand(10, 20);
          g.money += fee;
          x.palace = null; x.out = null;
          log(x.name + "年至二十八，蒙恩放出归家，携赏银" + fee + "两，重列婚嫁。", "good");
          return;
        }
        const score = (x.stats.智力 || 0) * 0.5 + (x.stats.魅力 || 0) * 0.5 + g.family.reputation / 60;
        if (pl.grade < Game.PALACE_MAID_RANKS.length - 1 && chance((score - 55) / 60)) {
          pl.grade += 1;
          rep(2);
          log("宫中考课：" + x.name + "勤谨伶俐，晋为" + Game.PALACE_MAID_RANKS[pl.grade].name + "。", "good");
        }
      } else {
        Game.gainStat(x, "魅力", 1);
        /* 身孕推进见 palaceMonthly（每月）；此处只做位分浮沉，另有宫中赏赐 */
        const fav = (pl.favor == null ? 30 : pl.favor);
        pl.favor = clamp(fav + rand(-3, 4) + (pl.grade >= 4 ? 1 : 0), 5, 95);
        if (pl.grade < Game.PALACE_CONSORT_RANKS.length - 1) {
          if (chance(((x.stats.魅力 || 0) - 60) / 50 + g.family.reputation / 800)) {
            pl.grade += 1;
            rep(6);
            log("宫中传喜：" + x.name + "晋位" + Game.PALACE_CONSORT_RANKS[pl.grade].name + "！赏供应加，阖家声望+6。", "good");
            return;
          }
        }
        if (pl.grade <= 2 && chance(0.05)) {
          x.palace = null; x.out = null;
          log(x.name + "久不得见天颜，请旨出宫归家，容色依旧，可再议亲。", "bad");
        }
      }
    });
    /* 岁考宫中体面：高位妃嫔逢年过节有赏 */
    if (Game.palaceGrace) Game.palaceGrace(g, log);
  };


  /* ============================================================
   * 族学
   * ============================================================
   /* 可出任全职西席的族人：在世、年十七以上 */
  Game.familyTeacherCandidates = function () {
    const g = Game.G;
    return g.children.filter(x => x.alive && x.age >= 17);
  };

  /* 聘族人为师（id 为空表示家主亲授） */
  Game.hireFamilyTeacher = function (id) {
    const g = Game.G;
    if (g.academy.teacher) return log("族学已有西席，先辞了旧人再聘。", "bad");
    if (id === "self") {
      if (g.char.stats.智力 < 40) return log("自家经史工夫尚浅，恐误人子弟。", "bad");
      g.academy.teacher = {
        kind: "self", id: null,
        name: g.char.name + "（家主亲授）", age: g.char.age,
        skill: g.char.stats.智力, gift: 0, stipend: 0,
        desc: "家主于理家之暇亲自督课，束脩全免，心血两分。"
      };
      log("家主于庄中开馆，亲自督课族中子弟。", "good");
    } else {
      const r = g.children.find(x => x.id === id && x.alive && x.age >= 17);
      if (!r) return log("并无此人可聘。", "bad");
      if (r.stats.智力 < 35) return log(`${r.name}自己学问也只寻常，难当西席。`, "bad");
      g.academy.teacher = {
        kind: "kin", id: r.id,
        name: r.name + (r.relation ? `（${r.relation}）` : ""), age: r.age,
        skill: r.stats.智力, gift: 0, stipend: 1,
        desc: "族中自家人，知根知底，每月只支取笔墨灯油之资一两。"
      };
      log(`聘${r.name}为族学全职先生，专意教授族中子弟。`, "good");
    }
    Game.save(); Game.refresh();
  };

  /* 外访：按西席类型寻访 1~2 位候选人 */
  Game.visitTeachers = function (kind) {
    const g = Game.G;
    if (g.academy.teacher) return log("族学已有西席。", "bad");
    const t = Game.TEACHERS.find(x => x.kind === kind);
    if (!t) return;
    if (g.family.reputation < t.needRep)
      return log(`${t.name}眼高于顶，我家声望不足${t.needRep}，不肯屈就。`, "bad");
    if (g.land < t.needLand)
      return log(`欲请${t.name}，家中田产不足${t.needLand}亩，无以示根基之稳。`, "bad");
    if (g.money < t.gift)
      return log(`延聘${t.name}需聘金${t.gift}两，囊中尚且不足。`, "bad");
    const n = chance(0.45) ? 2 : 1;
    g.academyCandidates = Array.from({ length: n }, () => {
      const skill = rand(t.skill[0], t.skill[1]);
      return {
        id: "t" + Date.now() + rand(100, 999),
        kind: t.kind, typeName: t.name,
        name: Game.makeName("男", pick(Game.SURNAMES)),
        age: t.kind === "mingsu" ? rand(55, 72) : t.kind === "jinshi" ? rand(40, 58) : rand(30, 52),
        skill,
        gift: t.gift,
        stipend: t.stipend,
        desc: t.desc + (skill >= t.skill[1] - 6 ? "　此番寻访到的，尤属其中翘楚。" : "")
      };
    });
    log(`遣人四处延访，寻得${n}位${t.typeName}，可在族学中细择。`, "");
    Game.save(); Game.refresh();
  };

  Game.hireTeacher = function (id) {
    const g = Game.G;
    const list = g.academyCandidates || [];
    const t = list.find(x => x.id === id);
    if (!t) return;
    if (g.money < t.gift) return log(`聘金${t.gift}两不足。`, "bad");
    g.money -= t.gift;
    g.academy.teacher = {
      kind: t.kind, id: null,
      name: t.name, age: t.age, skill: t.skill,
      gift: t.gift, stipend: t.stipend, desc: t.desc
    };
    g.academyCandidates = null;
    rep(4);
    log(`备聘金${t.gift}两，延${t.name}入族学授徒，每月束脩${t.stipend}两。`, "good");
    Game.save(); Game.refresh();
  };

  Game.dismissTeacher = function () {
    const g = Game.G;
    const t = g.academy.teacher;
    if (!t) return;
    log(t.kind === "self" ? "家主停了亲授，各自温书。" : `${t.name}辞馆归乡，族学暂闭。`, "");
    g.academy.teacher = null;
    Game.save(); Game.refresh();
  };

  Game.closeTeacherCandidates = function () {
    Game.G.academyCandidates = null;
    Game.save(); Game.refresh();
  };

  /* 束脩月支与去留 */
  function settleAcademy(g) {
    const t = g.academy.teacher;
    if (!t) return;
    /* 族人为师：核对本人是否仍在 */
    if (t.kind === "kin") {
      const r = g.children.find(x => x.id === t.id);
      if (!r || !r.alive) { g.academy.teacher = null; log("族中先生亡故，族学无人主持。", "bad"); return; }
      t.skill = r.stats.智力; t.age = r.age;
    } else if (t.kind === "self") {
      t.skill = g.char.stats.智力; t.age = g.char.age;
    }
    if (g.money < t.stipend) {
      g.academy.teacher = null;
      log("束脩拖欠，先生拂袖而去，族学中辍。", "bad");
      return;
    }
    g.money -= t.stipend;
    if (t.kind === "self") {
      g.char.stats.体力 = clamp(g.char.stats.体力 - 1, 0, Game.maxSta());
    }
  }

  /* 子弟岁课：有西席则开蒙进益更快 */
  function childrenTuition(g) {
    const t = g.academy.teacher;
    if (!t) return;
    /* 家主兼理庶务，授业精力两分 */
    const eff = t.kind === "self" ? 0.7 : 1;
    g.children.forEach(ch => {
      if (!ch.alive || ch.age < 3 || ch.age > 15) return;
      /* 西席授业增益作用于智力，再乘该子天赋；名师偶尔开悟气质 */
      const gain = Math.max(1, Math.round((1 + Math.round(t.skill / 30) + rand(0, 2)) * eff));
      Game.gainStat(ch, "智力", gain);
      if (chance(0.3)) Game.gainStat(ch, "魅力", 1);
    });
  }

  /* 外聘先生岁增寿算，老则辞馆 */
  function ageTeacher(g) {
    const t = g.academy.teacher;
    if (!t || t.kind === "self" || t.kind === "kin") return;
    t.age += 1;
    const leaveP = t.age >= 70 ? 0.28 : t.age >= 62 ? 0.10 : 0.02;
    if (chance(leaveP)) {
      log(t.age >= 70 ? `${t.name}年事已高，告老还乡，族学另觅良师。` : `${t.name}因故辞馆，临行留书勉力子弟向学。`, "");
      g.academy.teacher = null;
    }
  }

  /* ============================================================
   * 科举
   * ============================================================ */
  Game.examAvailable = function (ex) {
    const g = Game.G;
    const c = g.char;
    if (!c.alive || c.retired) return false;
    if (c.age < 16) return false;
    if (ex.need && c.title !== ex.need) return false;
    if (c.title === ex.key) return false;
    if (ex.month !== null && g.month !== ex.month) return false;
    /* 殿试：贡士当科连试 */
    if (ex.key === "jinshi" && c.title !== "gongshi") return false;
    return true;
  };

  Game.takeExam = function (key) {
    const g = Game.G;
    const c = g.char;
    const ex = Game.EXAMS.find(e => e.key === key);
    if (!ex) return;
    if (!Game.examAvailable(ex)) {
      if (c.age < 16) return log(`年方${c.age}岁，须年满十六方可下场。`, "bad");
      if (ex.need) {
        const nd = Game.EXAMS.find(e => e.key === ex.need);
        if (c.title !== ex.need) return log(`应${ex.name}须先中「${nd ? nd.title : ex.need}」。`, "bad");
      }
      if (ex.month !== null && g.month !== ex.month)
        return log(`${ex.name}${ex.month}月方开科（本月${g.month}月），届时再来。`, "bad");
      return log("此科暂不可应。", "bad");
    }
    if (g.money < ex.fee) return log(`应考需盘缠${ex.fee}两。`, "bad");
    if (c.stats.体力 < 10) return log("体弱难支，不堪入场。", "bad");
    g.money -= ex.fee;
    c.stats.体力 = clamp(c.stats.体力 - 8, 0, Game.maxSta());

    const ability = ex.track === "civil" ? c.stats.智力 : c.stats.武力;
    const blessExam = (g.riteBuff && g.riteBuff.exam > 0) ? (g.riteBuff.examBonus || 6) : 0;
    const privExam = (Game.repPriv ? Game.repPriv().examBonus : 0) || 0;
    const sickPenalty = c.isSick ? 8 : 0;   /* 抱病应考大打折扣，快去看医生 */
    const score = ability + rand(-14, 14) + Math.min(15, Math.round(g.family.reputation / 25)) + blessExam + privExam - sickPenalty;

    /* 放榜贺仪：中了有人送贺礼添声势 */
    const celebrate = (silver, extra) => {
      if (silver > 0) { g.money += silver; log(`乡绅亲友送来贺仪银${silver}两，门前车马盈门。`, "good"); }
      if (extra) log(extra, "good");
    };
    if (ex.key === "jinshi") {
      /* 殿试定等第：一甲三人状元榜眼探花赐进士及第，二甲进士出身（首名称传胪），三甲同进士出身 */
      c.title = "jinshi";
      g.family.titles.jinshi = g.gen;
      let rank, grade, bonus, gift;
      if (score >= 118)      { rank = "状元"; grade = 8; bonus = 50; gift = rand(150, 250); }
      else if (score >= 111) { rank = "榜眼"; grade = 8; bonus = 40; gift = rand(120, 200); }
      else if (score >= 105) { rank = "探花"; grade = 7; bonus = 35; gift = rand(100, 180); }
      else if (score >= 97)  { rank = "传胪"; grade = 7; bonus = 25; gift = rand(80, 140); }
      else if (score >= 85)  { rank = "二甲"; grade = 7; bonus = 15; gift = rand(60, 120); }
      else                   { rank = "三甲"; grade = 6; bonus = 0;  gift = rand(40, 90); }
      c.honor = rank === "二甲" || rank === "三甲" ? "进士" : rank;
      Game.appoint("civil", grade);
      rep(ex.rep + bonus);
      g.family.topHonor = rank;
      const rankTxt = rank === "状元" || rank === "榜眼" || rank === "探花"
        ? `${c.name}一甲${rank}，进士及第！跨马游街，翰苑题名，捷报传回故里，阖县轰动，爆竹声彻夜不息`
        : rank === "传胪"
        ? `金殿传胪——${c.name}二甲第一，钦点${Game.CIVIL_POSTS[grade]}！御街夸官，好不威风`
        : rank === "二甲"
        ? `金殿传胪——${c.name}位列二甲，钦点${Game.CIVIL_POSTS[grade]}！捷报传回故里，阖县轰动`
        : `金殿传胪——${c.name}三甲出身，授${Game.CIVIL_POSTS[grade]}！十年寒窗，一朝登科`;
      log(rankTxt + "。", "good");
      celebrate(gift, rank === "状元" ? "县令亲登门送匾“独占鳌头”，邀你明年为乡试作保。" : "县令亲登门道贺，邀你明年为乡试作保。");
      if (Game.queueXibao) Game.queueXibao({ who: c.name, rel: "家主", exam: "殿试", rank, detail: rankTxt, gift, showNow: true });
    } else if (score >= ex.threshold) {
      c.title = ex.key;
      g.family.titles[ex.key] = g.gen;
      rep(ex.rep);
      const mth = ex.month !== null ? ex.month + "月" : "";
      const flavor = {
        xiucai: `县衙张榜——${c.name}名列生员！戴上儒巾的那一刻，塾师捋须而笑：总算没白教你。`,
        juren: `秋闱放榜——${c.name}高中举人！报子骑马连报三声，整条街都出来看热闹。`,
        gongshi: `春闱放榜——${c.name}取中贡士！会馆同乡摆酒相庆，只待殿试一搏。`,
        wuxiucai: `校场放榜——${c.name}挽强弓、舞大刀，取中武秀才！一众军汉齐声喝彩。`,
        wujuren: `武科秋闱放榜——${c.name}高中武举人！马上步下，样样夺魁。`,
        wujinshi: `兵部放榜——${c.name}取中武进士！甲胄鲜明，御街夸官，好不威风。`
      };
      /* 乡试第一为解元，会试第一为会元，皆是大魁天下的名头 */
      let passRank = null;
      if ((ex.key === "juren" || ex.key === "wujuren") && score >= 102) passRank = "解元";
      if (ex.key === "gongshi" && score >= 102) passRank = "会元";
      if (passRank) {
        c.honor = passRank;
        rep(20);
        g.family.topHonor = passRank;
      }
      log(`${mth}${ex.name}放榜——${passRank ? `${c.name}高中${passRank}！大魁天下，捷报雪片般飞来` : (flavor[ex.key] || (c.name + "高中" + ex.title + "！"))}`, "good");
      /* 举人 / 武举人 可直接大挑授官 */
      if (ex.key === "juren" && chance(0.6)) Game.appoint("civil", rand(1, 3));
      if (ex.key === "wujuren" && chance(0.6)) Game.appoint("military", rand(1, 3));
      /* 贡士留京待殿试：无需操作，三月考试按钮会出现 */
      if (ex.key === "gongshi") log("礼部赐宴，三月即可参加殿试。", "good");
      if (ex.key === "wujinshi") Game.appoint("military", rand(6, 8));
      const _gift = passRank ? rand(60, 110) : (ex.key === "juren" || ex.key === "wujuren" ? rand(30, 60) : rand(8, 20));
      celebrate(_gift);
      /* 举人及以上放喜报：解元会元大书特书 */
      if ((ex.key === "juren" || ex.key === "wujuren" || ex.key === "gongshi") && Game.queueXibao)
        Game.queueXibao({ who: c.name, rel: "家主", exam: ex.name, rank: passRank || ex.title, gift: _gift, showNow: true });
    } else {
      const margin = ex.threshold - score;
      const comfort = margin <= 8
        ? `${ex.name}放榜——只差${margin}分！阅卷官惜才，亲批“稍欠火候”，阖家都替你惋惜。`
        : `${ex.name}落第而归，卷帙零落。回家路上无言，唯有明月相伴。`;
      log(comfort, "bad");
      c.stats.智力 = ex.track === "civil" ? clamp(c.stats.智力 + 1) : c.stats.智力;
      /* 落第有人陪：配偶灯下相伴，先生来信劝勉 */
      if (g.spouse) {
        g.spouse.favor = clamp((g.spouse.favor == null ? 65 : g.spouse.favor) + 3, 0, 100);
        log(`${g.spouse.name}灯下相伴，温言宽慰：“来科再战便是。”夫妻好感+3。`, "");
      } else if ((g.contacts || []).length) {
        const c0 = g.contacts[0];
        c0.favor = clamp(c0.favor + 3, 0, 100);
        log(`好友${c0.name}设酒相邀，开解于你，好感+3。`, "");
      }
    }
    Game.save(); Game.refresh();
  };

  Game.appoint = function (track, grade) {
    const g = Game.G;
    const c = g.char;
    const prev = c.office ? c.office.grade : -1;
    const old = c.office;
    /* 迁转官身时延续五方关系与政绩；初授则新立 */
    const rel = old && old.rel ? old.rel : (Game.freshRel ? Game.freshRel() : undefined);
    const merit = old && typeof old.merit === "number" ? old.merit : 0;
    c.office = { grade, track, diligence: old ? old.diligence : 50, merit };
    if (rel) c.office.rel = rel;
    else if (Game.ensureOfficeState) Game.ensureOfficeState(g);
    c.retired = false;
    if (grade > (g.family.bestGrade ?? -1)) {
      g.family.bestGrade = grade;
      g.family.bestPost = track === "civil" ? Game.CIVIL_POSTS[grade] : Game.MILITARY_POSTS[grade];
    }
    const posts = track === "civil" ? Game.CIVIL_POSTS : Game.MILITARY_POSTS;
    log(grade > prev ? `吏部文书下：补授${Game.GRADES[grade]}${posts[grade]}。` : `改任${Game.GRADES[grade]}${posts[grade]}。`, "good");
  };

  Game.retire = function () {
    const g = Game.G;
    const c = g.char;
    if (!c.office || c.age < 55) return;
    c.retired = true;
    c.office = null;
    rep(6);
    log("上表乞骸骨，致仕归乡，荣养林下，乡人敬重。", "good");
    Game.save(); Game.refresh();
  };

  /* ============================================================
   * 祭祖大典（花钱换声望+祖佑） / 远贸商队（花钱赌回报）
   * ============================================================ */
  /* 寺庙祈福：花钱请香火，庇佑子嗣贵相；千两法会另有奇人来投 */
  Game.pray = function (key) {
    const g = Game.G;
    const t = (Game.PRAYERS || []).find(x => x.key === key);
    if (!t) return;
    if (g.money < t.cost) return log(`办${t.name}需银${t.cost}两，囊中羞涩。`, "bad");
    g.money -= t.cost;
    g.blessing = { tier: t.tier, months: t.months };
    if (t.tier === 3) {
      rep(10);
      log(`千两办水陆法会三日，阖城轰动，声望+10。方丈合掌：善哉，此家必有贵子。`, "good");
      Game.praySage();
    } else {
      log(`${t.tier === 2 ? "长明灯前添油" : "宝刹拈香"}，许愿早生贵子，香火庇佑${t.months}个月（稀有天赋×${(Game.PRAY_TIER_MUL || [])[t.tier] || 1}、天赋+${(Game.PRAY_TIER_APT || [])[t.tier] || 0}、易孕）。`, "good");
    }
    Game.save(); Game.refresh();
  };
  /* 奇人来投：身怀稀世之才，径投名帖 */
  Game.praySage = function () {
    const g = Game.G;
    g.contacts = g.contacts || [];
    const rares = (Game.TRAITS || []).filter(d => d.rarity >= 3);
    const d = pick(rares);
    const gender = chance(0.5) ? "男" : "女";
    const ct = {
      id: "ct" + Date.now() + rand(100, 999),
      name: Game.makeName(gender, pick(Game.SURNAMES)),
      gender, age: rand(16, 24), type: "scholar", typeName: "奇士",
      family: rand(60, 100),
      stats: { 体力: rand(45, 65), 智力: rand(60, 80), 武力: rand(40, 65), 魅力: rand(60, 80) },
      favor: 70, metYear: g.year, metMonth: g.month
    };
    Game.decoratePerson(ct, null, null, true);
    /* 天赋保底75，并必怀一件稀世禀赋（同组旧有让位） */
    ["体力", "智力", "武力", "魅力"].forEach(k => { ct.apt[k] = clamp(Math.max(ct.apt[k] || 0, rand(75, 95)), 5, 99); });
    if (d) {
      ct.traits = (ct.traits || []).filter(k => { const od = Game.traitDef(k); return !od || od.group !== d.group; });
      if (ct.traits.indexOf(d.key) < 0) ct.traits.push(d.key);
      if (d.born) d.born(ct);
    }
    if (g.contacts.length >= 8) {
      const sorted = g.contacts.slice().sort((a, b) => (a.favor || 0) - (b.favor || 0));
      const drop = sorted[0];
      g.contacts = g.contacts.filter(x => x.id !== drop.id);
      log(`名帖匣子已满，最疏远的${drop.name}被新帖挤了出去。`, "");
    }
    g.contacts.push(ct);
    log(`法会圆满，竟有一${gender === "男" ? "奇士" : "奇女子"}${ct.name}慕名来投（${Game.traitName(d.key, gender)}，天赋智${ct.apt.智力}），径投名帖，好感70。`, "good");
    Game.save(); Game.refresh();
  };
  Game.holdRite = function (key) {
    const g = Game.G;
    const r = (Game.RITES || []).find(x => x.key === key);
    if (!r) return;
    if (g.money < r.cost) return log(`举行${r.name}需银${r.cost}两，囊中不足。`, "bad");
    if ((r.needRep || 0) > g.family.reputation)
      return log(`${r.name}非望族不敢举，尚需声望${r.needRep}。`, "bad");
    g.money -= r.cost;
    rep(r.rep);
    g.family.clan = Math.min(100, (g.family.clan == null ? 50 : g.family.clan) + (key === "splendid" ? 8 : key === "grand" ? 6 : 4));
    if (g.char.office && Game.adjustRel) Game.adjustRel(g, { kin: key === "splendid" ? 8 : key === "grand" ? 6 : 4 });
    const isGrand = key === "grand", isSplendid = key === "splendid";
    g.riteBuff = {
      exam: r.buffMonths,
      harvest: r.buffMonths,
      birth: r.buffMonths,
      examBonus: isSplendid ? 10 : isGrand ? 6 : 0,
      harvestMul: isSplendid ? 1.15 : 1.1,
      birthBonus: isSplendid ? 0.05 : isGrand ? 0.03 : 0
    };
    log(key === "small" ? `设牲醴于祠堂，族人罗拜，告慰列祖，声望+${r.rep}，祖佑三月。`
      : key === "grand" ? `大祭三日，阖族宴饮，乡人观礼，声望+${r.rep}，祖佑半年，子弟科举、田间收成皆有庇佑。`
      : `重修祠堂、续写族谱， Fee? 阖县士绅来贺，声望+${r.rep}，祖佑一年，福泽绵长。`.replace(" Fee? ", ""), "good");
    Game.save(); Game.refresh();
  };

  Game.sendCaravan = function (key) {
    const g = Game.G;
    const t = (Game.CARAVANS || []).find(x => x.key === key);
    if (!t) return;
    if ((g.caravans || []).length >= 3) return log("在途商队已三支，人手尽出，待其归来再遣。", "bad");
    if ((t.needRep || 0) > g.family.reputation)
      return log(`${t.name}非有声望之家不敢领，海商怕你无力赔付（需声望${t.needRep}）。`, "bad");
    if (g.money < t.cost) return log(`遣${t.name}需本钱${t.cost}两。`, "bad");
    g.money -= t.cost;
    g.caravans = g.caravans || [];
    g.caravans.push({ id: "v" + Date.now() + rand(100, 999), key: t.key, name: t.name, cost: t.cost, left: t.months, total: t.months });
    log(`旌旗招展，${t.name}离庄而去，本银${t.cost}两，约${t.months}月而还。`, "");
    Game.save(); Game.refresh();
  };

  Game.settleCaravans = function (g, logFn) {
    if (!g.caravans || !g.caravans.length) return;
    const L = logFn || log;
    for (let i = g.caravans.length - 1; i >= 0; i--) {
      const v = g.caravans[i];
      v.left -= 1;
      if (v.left > 0) continue;
      g.caravans.splice(i, 1);
      const r = Math.random();
      if (v.key === "small") {
        if (r < 0.15) { L(`${v.name}遇雨滞留，货物霉烂，血本无归（折银${v.cost}两）。`, "bad"); }
        else if (r < 0.65) { const back = rand(85, 135); g.money += back; L(`${v.name}归来，贩卖得银${back}两（本${v.cost}两）。`, back >= v.cost ? "good" : ""); }
        else { const back = rand(150, 220); g.money += back; rep(2); L(`${v.name}逢贵人提携，获利丰厚，得银${back}两，市上亦添了名声。`, "good"); }
      } else if (v.key === "big") {
        if (r < 0.3) { L(`${v.name}陷于风沙，马匹尽失，人仅以身免（折银${v.cost}两）。`, "bad"); rep(-2); }
        else if (r < 0.7) { const back = rand(160, 280); g.money += back; L(`${v.name}归来，皮货马匹大售，得银${back}两（本${v.cost}两）。`, back >= v.cost ? "good" : ""); }
        else { const back = rand(300, 450); g.money += back; rep(4); L(`${v.name}深入草原换得宝马良玉，归来轰动一时，得银${back}两！`, "good"); }
      } else if (v.key === "sea") {
        if (r < 0.35) { L(`出海香料船遇飓，片板不还，${v.cost}两尽付东流，合家痛哭。`, "bad"); rep(-5); }
        else if (r < 0.7) { const back = rand(320, 520); g.money += back; L(`海船归来，香料满舱，得银${back}两（本${v.cost}两）。`, "good"); }
        else { const back = rand(600, 850); g.money += back; rep(8); L(`海船满载而归，香料价比黄金，得银${back}两，一时富甲一方！`, "good"); }
      }
    }
  };

  /* ============================================================
   * 延医问药：三档医生，贵者愈速
   * memberId: head / sp-<id> / child id（见 family.getMember）
   * ============================================================ */
  Game.seeDoctor = function (memberId, doctorKey) {
    const g = Game.G;
    const m = Game.getMember ? Game.getMember(memberId) : null;
    if (!m) return log("并无此人。", "bad");
    const p = m.person;
    if (!p.isSick) return log(`${p.name}身子康健，无需延医。`, "");
    const d = (Game.DOCTORS || []).find(x => x.key === doctorKey);
    if (!d) return;
    if ((d.needRep || 0) > g.family.reputation)
      return log(`${d.name}非望族不请，尚需声望${d.needRep}。`, "bad");
    if (g.money < d.fee) return log(`请${d.name}需诊金${d.fee}两。`, "bad");
    g.money -= d.fee;
    const max = (m.role === "head") ? Game.maxSta() : 100;
    if (chance(d.cure)) {
      p.isSick = false;
      const back = d.key === "master" ? rand(10, 16) : d.key === "local" ? rand(7, 12) : rand(4, 9);
      p.stats = p.stats || {};
      p.stats.体力 = clamp((p.stats.体力 || 30) + back, 0, max);
      log(d.key === "master"
        ? `${d.name}捻须把脉，开方施针，${p.name}一剂而汗出病解，体力大复。`
        : `${d.name}看过${p.name}，服药数剂，病去大半。`, "good");
    } else {
      p.stats = p.stats || {};
      p.stats.体力 = clamp((p.stats.体力 || 30) - rand(2, 5), 0, max);
      log(`${d.name}药不对症，${p.name}服后未见起色，反添虚弱，不如另请高明。`, "bad");
    }
    Game.save(); Game.refresh();
  };

  /* 自动延医：定一档医生，每月入夜自动给全家看病（有钱才请） */
  Game.setAutoDoctor = function (key) {
    const g = Game.G;
    if (!key || key === "off") { g.autoDoctor = null; log("撤了自动延医，此后生病须亲点医生。", ""); }
    else {
      const d = (Game.DOCTORS || []).find(x => x.key === key);
      if (!d) return;
      if ((d.needRep || 0) > g.family.reputation)
        return log(`${d.name}非望族不请，尚需声望${d.needRep}。`, "bad");
      g.autoDoctor = key;
      log(`定下自动延医：此后每月以${d.name}（${d.fee}两/人）给抱病家人看诊。`, "good");
    }
    Game.save(); Game.refresh();
  };
  Game.autoDoctorLoop = function (g) {
    if (!g.autoDoctor) return;
    const d = (Game.DOCTORS || []).find(x => x.key === g.autoDoctor);
    if (!d) { g.autoDoctor = null; return; }
    if ((d.needRep || 0) > g.family.reputation) {
      log(`声望跌破${d.needRep}，${d.name}不肯再来，自动延医已撤。`, "bad");
      g.autoDoctor = null;
      return;
    }
    const sick = Game.householdMembers().filter(m => m.person.alive && m.person.isSick);
    if (!sick.length) return;
    sick.forEach(m => {
      const p = m.person;
      if (g.money < d.fee) { log(`想请${d.name}给${p.name}看病，囊中只剩${Math.round(g.money)}两，请不起。`, "bad"); return; }
      g.money = Math.round((g.money - d.fee) * 100) / 100;
      g._monthDoctor = Math.round(((g._monthDoctor || 0) + d.fee) * 100) / 100;
      const max = (m.role === "head") ? Game.maxSta() : 100;
      p.stats = p.stats || {};
      if (chance(d.cure)) {
        p.isSick = false;
        const back = d.key === "master" ? rand(10, 16) : d.key === "local" ? rand(7, 12) : rand(4, 9);
        p.stats.体力 = clamp((p.stats.体力 || 30) + back, 0, max);
        log(`【自动延医】${d.name}看过${p.name}，服药数剂，病去大半（耗${d.fee}两）。`, "good");
      } else {
        p.stats.体力 = clamp((p.stats.体力 || 30) - rand(2, 5), 0, max);
        log(`【自动延医】${d.name}药不对症，${p.name}未见起色（耗${d.fee}两），下月换个大夫或亲点高明。`, "bad");
      }
    });
  };

  /* 全家轮病：体弱、年老、拥挤易感；在病者每月耗体气 */
  Game.spreadIllness = function (g, logFn) {
    const L = logFn || log;
    const crowded = Game.householdMembers().length > Game.houseCapacity();
    Game.householdMembers().forEach(m => {
      const p = m.person;
      if (!p.alive) return;
      if (p.isSick) {
        p.stats = p.stats || {};
        p.stats.体力 = clamp((p.stats.体力 || 30) - rand(2, 5), 0, 100);
        /* 老幼在病有夭折之险 */
        const deathP = (p.age >= 60 ? 0.03 : 0) + (p.age <= 5 ? 0.02 : 0);
        if (deathP > 0 && chance(deathP)) {
          if (m.role === "head") return;   /* 家主之死走正常继承，不在此处决 */
          p.alive = false;
          L(`${m.rel || "族人"}${p.name}病重难返，撒手人寰，享年${p.age}岁。`, "bad");
        }
        return;
      }
      let pr = 0.012;
      if ((p.stats && p.stats.体力 < 30)) pr += 0.05;
      if (p.age >= 55) pr += 0.02;
      if (p.age <= 5) pr += 0.015;
      if (crowded) pr += 0.015;
      if (p.age < 16) pr *= 1.2;
      if (chance(pr * Game.sickMul(p))) {
        p.isSick = true;
        if (m.role === "head") L(`${p.name}偶感风寒，头重脚轻，恐要延医调治。`, "bad");
        else L(`${m.rel || "族人"}${p.name}（${p.age}岁）病倒在床，面黄肌瘦，宜速延医。`, "bad");
      }
    });
  };

  /* 借出银两的归还 */
  Game.settleLoans = function (g, logFn) {
    if (!g.loansOut || !g.loansOut.length) return;
    const L = logFn || log;
    for (let i = g.loansOut.length - 1; i >= 0; i--) {
      const o = g.loansOut[i];
      o.left -= 1;
      if (o.left > 0) continue;
      g.loansOut.splice(i, 1);
      if (chance(o.repayP != null ? o.repayP : 0.6)) {
        g.money += o.back;
        rep(2);
        L(`${o.name}如约归还银${o.back}两（本${o.amount}两），还厚赠谢礼，乡人称你仗义。`, "good");
      } else {
        rep(-2);
        L(`${o.name}借去的银${o.amount}两竟赖着不还，只推家计艰难，你也只得自认倒霉。`, "bad");
      }
    }
  };

  /* ============================================================
   * 寿宴祝寿 / 捐纳入仕 / 子弟游学（三钱袋子去处）
   * ============================================================ */
  Game.holdBirthday = function (memberId, key) {
    const g = Game.G;
    const m = Game.getMember ? Game.getMember(memberId) : null;
    if (!m) return log("并无此人。", "bad");
    const p = m.person;
    if (p.age < 40) return log(`${p.name}年纪尚轻，设甚么寿宴。`, "bad");
    if ((p.bm || 1) !== g.month) return log(`${p.name}生辰在${p.bm || 1}月，寿宴须生辰月再办（本月${g.month}月）。`, "bad");
    const b = (Game.BANQUETS || []).find(x => x.key === key);
    if (!b) return;
    if ((b.needRep || 0) > g.family.reputation)
      return log(`${b.name}非乡绅不敢举（需声望${b.needRep}）。`, "bad");
    if (g.money < b.cost) return log(`办${b.name}需银${b.cost}两。`, "bad");
    g.money -= b.cost;
    const isFull = p.age >= 50 && p.age % 10 === 0;   /* 五十、六十整寿 */
    const repGain = Math.round(b.rep * (isFull ? 1.5 : 1));
    rep(repGain);
    /* 贺礼回血：来客随份子 */
    const gift = b.key === "family" ? rand(8, 18) : b.key === "public" ? rand(35, 70) : rand(100, 180);
    g.money += gift;
    if (Game.adjustRel && p) { /* 寿宴 warm 亲族百姓 */
      /* 只有为官者有人情往来，无官则只涨声望 */
    }
    if (g.char.office && Game.adjustRel) {
      Game.adjustRel(g, { kin: b.key === "grand" ? 6 : 3, people: b.key === "grand" ? 5 : 2 });
    }
    log(`${p.name}${p.age}岁${isFull ? "整寿" : "寿辰"}，${b.name}三日，宾客盈门，贺礼得银${gift}两，声望+${repGain}。`, "good");
    p.lastBirthdayYear = g.year;
    Game.save(); Game.refresh();
  };

  Game.donate = function (key) {
    const g = Game.G;
    const c = g.char;
    const d = (Game.DONATIONS || []).find(x => x.key === key);
    if (!d) return;
    if (c.office) return log("已在官身，何须捐纳。", "bad");
    if ((d.needRep || 0) > g.family.reputation)
      return log(`捐纳非厚望之家不可（需声望${d.needRep}）。`, "bad");
    if (g.money < d.cost) return log(`${d.name}需银${d.cost}两。`, "bad");
    if (key === "jian") {
      if (c.title) return log("已有功名在身，无须再捐监生。", "bad");
      g.money -= d.cost;
      c.title = "xiucai";
      g.family.titles.xiucai = g.gen;
      rep(-3);
      log("纳粟入监，领得监生执照，视同秀才可应乡试，只是士林背后讥为买来的功名。", "");
    } else if (key === "office") {
      if (!c.title || (c.title !== "xiucai" && c.title !== "juren" && c.title !== "gongshi"))
        return log("捐官须有秀才以上功名傍身，先去考一个，或捐个监生。", "bad");
      g.money -= d.cost;
      Game.appoint("civil", 0);
      c.office.merit = 0; c.office.diligence = 40;
      if (Game.adjustRel) Game.adjustRel(g, { gentry: -5 });
      rep(-5);
      log("白银六百两开道，吏部文书下：补正九品县丞。只是出身捐纳，士林难免侧目，还须好好做官洗刷。", "");
    }
    Game.save(); Game.refresh();
  };

  Game.studyTour = function (childId, key) {
    const g = Game.G;
    const t = (Game.TOURS || []).find(x => x.key === key);
    if (!t) return;
    const ch = g.children.find(x => x.id === childId && x.alive);
    if (!ch) return log("并无此子弟。", "bad");
    if (ch.age < (t.minAge || 6) || ch.age > (t.maxAge || 15))
      return log(`${ch.name}年${ch.age}岁，不宜${t.name}（宜${t.minAge}-${t.maxAge}岁）。`, "bad");
    if (ch.lastTourYear === g.year) return log(`${ch.name}今年已游学过，来年再去。`, "bad");
    if ((t.needRep || 0) > g.family.reputation)
      return log(`${t.name}需声望${t.needRep}方可成行。`, "bad");
    if (g.money < t.cost) return log(`${t.name}需盘缠${t.cost}两。`, "bad");
    g.money -= t.cost;
    ch.lastTourYear = g.year;
    const teacherMul = g.academy.teacher ? 1.2 : 1;   /* 有先生指点，游学事半功倍 */
    let msg = "";
    if (key === "near") {
      const a = Game.gainStat(ch, "智力", Math.round(rand(6, 10) * teacherMul));
      const b2 = Game.gainStat(ch, "魅力", rand(1, 3));
      msg = `${ch.name}访邻县书院，与诸生会文，智力+${a}，魅力+${b2}。`;
    } else if (key === "far") {
      const a = Game.gainStat(ch, "智力", Math.round(rand(10, 16) * teacherMul));
      const b2 = Game.gainStat(ch, "魅力", rand(3, 5));
      Game.gainStat(ch, "体力", rand(2, 5));
      msg = `${ch.name}遍览名山，访隐者高士，心胸大开，智力+${a}，魅力+${b2}。`;
      /* 洗心革面：怠惰或有望改掉，勤学者更进一步 */
      if (Game.hasTrait(ch, "lazy") && chance(0.3)) {
        ch.traits = ch.traits.filter(k => k !== "lazy");
        msg += "归来竟改了怠惰之习。";
      } else if (!Game.hasTrait(ch, "diligent") && chance(0.15)) {
        ch.traits.push("diligent");
        msg += "归来勤勉倍于往昔。";
      }
    } else if (key === "capital") {
      const a = Game.gainStat(ch, "智力", Math.round(rand(16, 24) * teacherMul));
      const b2 = Game.gainStat(ch, "魅力", rand(5, 7));
      msg = `${ch.name}入京观国学、拜大儒，眼界大开，智力+${a}，魅力+${b2}。`;
      if (!Game.hasTrait(ch, "quickmind") && !Game.hasTrait(ch, "dull") && !Game.hasTrait(ch, "prodigy") && chance(0.12)) {
        ch.traits.push("quickmind");
        Game.gainStat(ch, "智力", 8);
        msg += "大儒抚顶：此子过目不忘！";
      }
    }
    rep(2);
    log(msg + "（游学一年一次）", "good");
    Game.save(); Game.refresh();
  };

  /* ============================================================
   * 宅邸晋升（卡家族上限）
   * ============================================================ */
  Game.upgradeManor = function (key) {
    const g = Game.G;
    if (!Game.manorInfo || !Game.MANORS) return log("宅邸图纸缺失，请先更新 data.js。", "bad");
    const cur = Game.manorInfo(g.manor || "hut");
    const nxt = Game.manorInfo(key);
    if (!nxt || key === g.manor) return;
    const curIdx = Game.MANORS.findIndex(m => m.key === (g.manor || "hut"));
    const nxtIdx = Game.MANORS.findIndex(m => m.key === key);
    if (nxtIdx < curIdx) return log("由俭入奢易，由奢入俭难，不搬了。", "");
    if (nxtIdx !== curIdx + 1) return log("宅邸须一级级营造，不可躐等。", "bad");
    if (g.family.reputation < nxt.needRep)
      return log(`${nxt.name}非声望${nxt.needRep}之家不敢居。`, "bad");
    if (g.money < nxt.cost) return log(`营造${nxt.name}需银${nxt.cost}两。`, "bad");
    g.money -= nxt.cost;
    g.manor = key;
    rep(nxtIdx * 4);
    log(`鸠工庀材，营造${nxt.name}落成，乔迁之喜，阖县来贺，声望+${nxtIdx * 4}。此后家族上限可至${["布衣","耕读","乡绅","望族","名门","世家"][nxt.maxRank]}。`, "good");
    Game.save(); Game.refresh();
  };

  /* ============================================================
   * 人际往来：结识 / 拜访 / 赠礼 / 提亲
   * ============================================================ */
  Game.makeContact = function (forceType, silent) {
    const g = Game.G;
    if ((g.contacts || []).length >= 8) return null;   /* 名帖匣子只装得下八人 */
    let pool = (Game.CONTACT_TYPES || []).filter(t => g.family.reputation >= (t.needRep || 0));
    if (!pool.length) pool = [Game.CONTACT_TYPES[0]];
    let type = forceType
      ? pool.find(t => t.key === forceType) || pick(pool)
      : pick(pool);
    /* 高声望偏向高门，低声望多遇寒门 */
    if (!forceType && chance(0.5)) {
      const hi = pool.filter(t => (t.needRep || 0) > 0);
      if (hi.length && chance(Math.min(0.7, g.family.reputation / 400))) type = pick(hi);
    }
    const gender = chance(0.5) ? "男" : "女";
    const age = type.key === "royal" ? rand(15, 28) : type.key === "official" ? rand(15, 30) : rand(14, 24);
    const family = rand(type.family[0], type.family[1]);
    const ct = {
      id: "ct" + Date.now() + rand(100, 999),
      name: Game.makeName(gender, pick(Game.SURNAMES)),
      gender, age, type: type.key, typeName: type.name,
      family,
      stats: {
        体力: rand(35, 65), 智力: rand(40, 70), 武力: rand(30, 65), 魅力: rand(45, 75)
      },
      favor: rand(type.favor0[0], type.favor0[1]),
      metYear: g.year, metMonth: g.month
    };
    Game.decoratePerson(ct, null, null, true);
    /* 高门子弟天赋保底：寒门听天由命，世家至少65，皇亲至少75，另有加成 */
    if (type.key === "gentry") {
      ct.apt.智力 = clamp(Math.max(ct.apt.智力, rand(65, 85)), 5, 99);
      ct.apt.魅力 = clamp(Math.max(ct.apt.魅力, rand(60, 80)), 5, 99);
    } else if (type.key === "official") {
      ct.apt.智力 = clamp(Math.max(ct.apt.智力, rand(60, 82)), 5, 99);
    } else if (type.key === "royal") {
      ct.apt.智力 = clamp(Math.max(ct.apt.智力, rand(75, 95)), 5, 99);
      ct.apt.魅力 = clamp(Math.max(ct.apt.魅力, rand(70, 90)), 5, 99);
    }
    g.contacts.push(ct);
    if (!silent) {
      const where = g.month === 1 ? "元宵灯市" : g.month === 7 ? "七夕鹊桥会" : g.month === 8 ? "中秋诗会" : "席间";
      log(`${where}偶遇${type.name}${ct.name}（${ct.gender}·${ct.age}岁·门户${ct.family}），谈吐不凡，互留名帖（天赋智${ct.apt.智力} 魅${ct.apt.魅力}）。`, "good");
    }
    Game.save(); Game.refresh();
    return ct;
  };

  Game.visitContact = function (id) {
    const g = Game.G;
    const ct = (g.contacts || []).find(x => x.id === id);
    if (!ct) return;
    if (g.ap <= 0 || g.locked) return log("本月精力已尽，且待下月。", "bad");
    if (g.money < 3) return log("囊中空空，无颜登门。", "bad");
    g.money -= 3; g.ap -= 1;
    const gain = rand(4, 8) + Math.round((g.char.stats.魅力 - 50) / 15);
    ct.favor = clamp(ct.favor + gain, 0, 100);
    Game.gainStat(g.char, "魅力", 1);
    log(`登门拜访${ct.name}，清谈竟日，好感+${gain}（今${ct.favor}）。`, "good");
    Game.save(); Game.refresh();
  };

  Game.giftContact = function (id, level) {
    const g = Game.G;
    const ct = (g.contacts || []).find(x => x.id === id);
    if (!ct) return;
    const cost = level === "big" ? 60 : level === "mid" ? 20 : 5;
    const base = level === "big" ? rand(15, 25) : level === "mid" ? rand(8, 14) : rand(3, 6);
    if (g.money < cost) return log(`备礼需银${cost}两。`, "bad");
    g.money -= cost;
    /* 高门眼界高，薄礼略减效 */
    const damp = (ct.family >= 90 && level === "small") ? -2 : 0;
    ct.favor = clamp(ct.favor + base + damp, 0, 100);
    log(`遣人送${level === "big" ? "珠宝锦缎" : level === "mid" ? "厚礼" : "薄礼"}与${ct.name}，好感+${base + damp}（今${ct.favor}）。`, "good");
    Game.save(); Game.refresh();
  };

  /* 好感80以上可提亲：未婚家主娶/招赘，或为成年未婚子女说亲 */
  Game.proposeContact = function (contactId, childId) {
    const g = Game.G;
    const ct = (g.contacts || []).find(x => x.id === contactId);
    if (!ct) return;
    if (ct.favor < 80) return log(`${ct.name}与你尚是泛泛之交（好感${ct.favor}），此时提亲未免唐突。`, "bad");
    if (childId) {
      const ch = g.children.find(x => x.id === childId && x.alive && !x.married);
      if (!ch) return;
      if (ch.gender === ct.gender) return log("同性何以结亲。", "bad");
      if (ch.age < 15) return log(`${ch.name}尚未及婚龄。`, "bad");
      if (ch.palace) return log(`${ch.name}身在宫中，不得议亲（先办出宫）。`, "bad");
      const gift = Math.round(ct.family * 1.2);
      if (ch.gender === "男") {
        if (g.money < gift) return log(`娶${ct.name}入门需聘礼${gift}两。`, "bad");
        g.money -= gift;
        log(`${ch.name}迎娶${ct.name}入门，亲家门户${ct.family}，天赋智${ct.apt.智力}，后代可期。`, "good");
      } else {
        g.money += Math.round(gift / 2);
        ch.out = "married";
        log(`${ch.name}许嫁${ct.name}，得彩礼${Math.round(gift / 2)}两。女儿出阁，来日承祧还看兄弟（无兄弟可招赘留家）。`, "good");
      }
      /* 子媳入籍同居：其天赋并入子女，影响下一代 */
      ch.married = true;
      ch.spouseApt = ct.apt; ch.spouseStats = ct.stats; ch.spouseFamily = ct.family;
      ch.spouseName = ct.name; ch.spouseTraits = ct.traits || [];
      if (ch.gender === "男") {
        ch.spouse = {
          id: ct.id, name: ct.name, gender: ct.gender, age: ct.age, family: ct.family,
          stats: ct.stats, apt: ct.apt, traits: ct.traits || [],
          alive: true, title: null, office: null, joined: true,
          job: Game.pickJob ? Game.pickJob(ct) : "farmhand"
        };
      }
      g.contacts = g.contacts.filter(x => x.id !== contactId);
      rep(6);
      Game.save(); Game.refresh();
      return;
    }
    /* 家主自娶 */
    if (g.spouse) return log("已有婚配。", "bad");
    if (g.char.gender === ct.gender) return log("同性何以结亲，不如为子弟说合。", "bad");
    const gift = Math.round(ct.family * 1.6);
    if (g.money < gift) return log(`迎娶${ct.name}需聘礼${gift}两（门户${ct.family}）。`, "bad");
    g.money -= gift;
    g.spouse = {
      id: "sp" + Date.now() + rand(100, 999),
      name: ct.name, gender: ct.gender, age: ct.age, family: ct.family,
      stats: ct.stats, apt: ct.apt, traits: ct.traits,
      alive: true, title: null, office: null, job: null, favor: clamp((ct.favor || 80) + rand(-5, 5), 60, 100)
    };
    if (Game.pickJob) g.spouse.job = Game.pickJob(g.spouse);
    g.contacts = g.contacts.filter(x => x.id !== contactId);
    rep(Math.round(ct.family / 12));
    log(`三书六礼，迎娶${ct.name}入门（天赋智${ct.apt.智力} 魅${ct.apt.魅力}），门户${ct.family}，后代天赋有指望了。`, "good");
    Game.save(); Game.refresh();
  };

  /* 改名：主控与子孙可自定义名姓，也可随机 */
  Game.renamePerson = function (id, fullName) {
    const g = Game.G;
    const m = Game.getMember ? Game.getMember(id) : null;
    if (!m) return Game.log("寻不到此人。", "bad");
    if (m.role !== "head" && m.role !== "child") return Game.log("此人不宜改名。", "bad");
    fullName = (fullName || "").trim().replace(/\s+/g, "");
    if (!fullName) return Game.log("名字不可为空。", "bad");
    if (fullName.length > 5) return Game.log("名字太长，五字为限。", "bad");
    const old = m.person.name;
    m.person.name = fullName;
    if (m.role === "head" && fullName[0] && fullName[0] !== g.surname) {
      g.surname = fullName[0];
      (g.children || []).forEach(ch => {
        if (ch.name) ch.name = g.surname + ch.name.slice(1);
      });
    }
    Game.log(`${old}更名为${fullName}。`, "");
    Game.save(); Game.refresh();
  };
  Game.randomizePersonName = function (id) {
    const g = Game.G;
    const m = Game.getMember ? Game.getMember(id) : null;
    if (!m) return;
    const surname = g.surname;
    if (m.role === "child" && g.family.genChar) {
      const pool = m.person.gender === "男" ? Game.MALE_GIVEN : Game.FEMALE_GIVEN;
      const tail = (Game.U && Game.U.pick) ? Game.U.pick(pool) : "";
      Game.renamePerson(id, surname + g.family.genChar + tail);
      return;
    }
    const given = Game.randomGiven ? Game.randomGiven(m.person.gender) : "平安";
    Game.renamePerson(id, (surname || "") + given);
  };
  /* ============================================================
   * 高门世家（固定五姓）：阖族一个好感，每月-2，比寻常往来难维持
   * 拜访/厚礼刷好感；85可提亲（聘礼极重、嫁要倒贴、皇帝猜忌）；90且有官身可举荐
   * ============================================================ */
  /* 嫁入某高门的在世女儿：有她在堂，该族好感每月不减 */
  Game.clanKinOf = function (g, key) {
    return (g.children || []).find(x => x.alive && x.out === "married" && x.marriedClan === key) || null;
  };
  Game.clanFavorOf = function (g, key) {
    if (!g.family.clanFavor) g.family.clanFavor = {};
    if (g.family.clanFavor[key] == null) g.family.clanFavor[key] = 15;
    return g.family.clanFavor[key];
  };
  Game.clanPerson = function (t) {
    const gender = chance(0.5) ? "男" : "女";
    const base = 58;
    const stats = { 体力: rand(45, 70), 智力: 0, 武力: 0, 魅力: 0 };
    if (t.tilt === "智") { stats.智力 = rand(62, 85); stats.魅力 = rand(58, 80); stats.武力 = rand(30, 55); }
    else if (t.tilt === "魅") { stats.魅力 = rand(66, 88); stats.智力 = rand(58, 80); stats.武力 = rand(30, 55); }
    else if (t.tilt === "武") { stats.武力 = rand(60, 85); stats.智力 = rand(55, 78); stats.魅力 = rand(55, 80); }
    else if (t.tilt === "体") { stats.智力 = rand(58, 80); stats.魅力 = rand(55, 80); stats.武力 = rand(40, 65); }
    else { stats.智力 = rand(60, 82); stats.魅力 = rand(60, 82); stats.武力 = rand(35, 60); }
    stats.体力 = t.tilt === "体" ? rand(58, 80) : rand(45, 70);
    const p = {
      id: "gc" + Date.now() + rand(100, 999),
      name: Game.makeName(gender, t.surname),
      gender, age: rand(15, 20),
      family: rand(t.family[0], t.family[1]),
      stats, alive: true, title: null, office: null, job: null, clan: t.name
    };
    Game.decoratePerson(p, null, null, true);
    p.apt.智力 = clamp(Math.max(p.apt.智力, rand(60, 82)), 5, 99);
    p.apt.魅力 = clamp(Math.max(p.apt.魅力, rand(62, 84)), 5, 99);
    p.job = Game.pickJob ? Game.pickJob(p) : "farmhand";
    return p;
  };
  Game.visitClan = function (key) {
    const g = Game.G;
    const t = (Game.GREAT_CLANS || []).find(x => x.key === key);
    if (!t) return;
    if (g.ap <= 0 || g.locked) return log("本月精力已尽，且待下月。", "bad");
    if (g.money < 8) return log("登高门须备门敬八两，囊中不足。", "bad");
    g.money -= 8; g.ap -= 1;
    const gain = rand(4, 7) + Math.round(((g.char.stats.魅力 || 50) - 50) / 18);
    g.family.clanFavor[key] = clamp(Game.clanFavorOf(g, key) + gain, 0, 100);
    log(`备门敬登门拜访${t.name}，清谈竟日，${t.name}好感+${gain}（今${g.family.clanFavor[key]}）。`, "good");
    Game.save(); Game.refresh();
  };
  Game.giftClan = function (key) {
    const g = Game.G;
    const t = (Game.GREAT_CLANS || []).find(x => x.key === key);
    if (!t) return;
    if (g.money < 30) return log("厚礼需银三十两。", "bad");
    g.money -= 30;
    const gain = rand(8, 14);
    g.family.clanFavor[key] = clamp(Game.clanFavorOf(g, key) + gain, 0, 100);
    log(`遣人送厚礼与${t.name}，${t.name}好感+${gain}（今${g.family.clanFavor[key]}）。高门眼界高，薄礼不收。`, "good");
    Game.save(); Game.refresh();
  };
  /* 高门提亲：迎娶聘礼约为门户两倍；许嫁须倒贴嫁妆、添声望、耗人情；高门不肯赘婿 */
  Game.proposeClan = function (key, childId) {
    const g = Game.G;
    const t = (Game.GREAT_CLANS || []).find(x => x.key === key);
    if (!t) return;
    if (Game.clanFavorOf(g, key) < 85) return log(`${t.name}与你家尚是泛泛之交（好感${Game.clanFavorOf(g, key)}），此时提亲未免唐突（需85）。`, "bad");
    const p = Game.clanPerson(t);
    const marryIn = (name, gift) => {
      if (g.money < gift) { log(`迎娶${name}需聘礼${gift}两（高门聘礼约为门户两倍）。`, "bad"); return; }
      g.money -= gift;
      return true;
    };
    if (childId) {
      const ch = g.children.find(x => x.id === childId && x.alive && !x.married);
      if (!ch) return;
      if (ch.gender === p.gender) { /* 性别撞了就换一位同门（仍是本姓） */
        p.gender = ch.gender === "男" ? "女" : "男";
        p.name = Game.makeName(p.gender, t.surname);
      }
      if (ch.age < 15) return log(`${ch.name}尚未及婚龄。`, "bad");
      if (ch.palace || ch.out) return log("此子不便议亲。", "bad");
      if (ch.gender === "男") {
        const gift = Math.round(p.family * 2.0);
        if (!marryIn(p.name, gift)) return;
        p.gender = "女"; p.joined = true;
        ch.spouse = p;
        ch.spouseApt = p.apt; ch.spouseStats = p.stats; ch.spouseFamily = p.family;
        ch.spouseName = p.name; ch.spouseTraits = p.traits || [];
        ch.married = true;
        rep(Math.round(p.family / 15));
        g.family.clanFavor[key] = clamp(Game.clanFavorOf(g, key) - 5, 0, 100);
        log(`${ch.name}迎娶${t.name}${p.name}入门，天赋智${p.apt.智力}，后代可期；攀此高门，人情耗费不少（${t.name}好感-5）。`, "good");
      } else {
        const dowry = Math.round(p.family * 1.2);
        if (g.money < dowry) { log(`许嫁${t.name}须备嫁妆${dowry}两，家计为难。`, "bad"); return; }
        g.money -= dowry;
        p.gender = "男";
        ch.out = "married";
        ch.marriedClan = key;   /* 嫁入高门：女儿在世一日，该族好感每月不减 */
        ch.spouseApt = p.apt; ch.spouseStats = p.stats; ch.spouseFamily = p.family;
        ch.spouseName = p.name; ch.spouseTraits = p.traits || [];
        ch.married = true;
        rep(10);
        g.family.clanFavor[key] = clamp(Game.clanFavorOf(g, key) - 5, 0, 100);
        log(`${ch.name}许嫁${t.name}${p.name}，倒贴嫁妆${dowry}两，声望+10；攀此高门，人情耗费不少（${t.name}好感-5）。`, "good");
      }
      Game.save(); Game.refresh();
      return;
    }
    /* 家主自娶 */
    if (g.spouse) return log("已有婚配。", "bad");
    if (g.char.gender === p.gender) { p.gender = g.char.gender === "男" ? "女" : "男"; p.name = Game.makeName(p.gender, t.surname); }
    const gift = Math.round(p.family * 2.0);
    if (g.money < gift) { log(`迎娶${p.name}需聘礼${gift}两。`, "bad"); return; }
    g.money -= gift;
    g.spouse = {
      id: p.id, name: p.name, gender: p.gender, age: p.age, family: p.family,
      stats: p.stats, apt: p.apt, traits: p.traits, clan: t.name,
      alive: true, title: null, office: null, job: null, favor: 75
    };
    if (Game.pickJob) g.spouse.job = Game.pickJob(g.spouse);
    rep(Math.round(p.family / 15));
    g.family.clanFavor[key] = clamp(Game.clanFavorOf(g, key) - 5, 0, 100);
    log(g.char.gender === "男"
      ? `三书六礼，迎娶${t.name}${p.name}入门（天赋智${p.apt.智力}），攀此高门，人情耗费不少（${t.name}好感-5）。`
      : `备下重聘，招${t.name}${p.name}入赘（天赋智${p.apt.智力}），攀此高门，人情耗费不少（${t.name}好感-5）。`, "good");
    Game.save(); Game.refresh();
  };
  /* 举荐升品：有官身、好感90，一年一次，直升一级、10%连升两级（人情耗损：该族好感-15） */
  Game.recommendClan = function (key) {
    const g = Game.G;
    const t = (Game.GREAT_CLANS || []).find(x => x.key === key);
    if (!t) return;
    if (!g.char.office) return log("白身布衣，无官可举，先谋个一官半职。", "bad");
    if (Game.clanFavorOf(g, key) < 90) return log(`${t.name}好感不足90，时尚早。`, "bad");
    g.clanRec = g.clanRec || {};
    if (g.clanRec[key] === g.year) return log(`${t.name}今年已为你美言过，好事须待来年。`, "bad");
    g.clanRec[key] = g.year;
    const o = g.char.office;
    const top = Game.GRADES.length - 1;
    const jump = (o.grade >= top - 1 && chance(0.1)) ? 2 : (chance(0.1) ? 2 : 1);
    const ng = Math.min(top, o.grade + jump);
    Game.appoint(o.track, ng);
    g.family.clanFavor[key] = clamp(g.family.clanFavor[key] - 15, 0, 100);
    rep(2);
    log(`${t.name}长辈在吏部为你美言，直升${Game.GRADES[ng]}${(o.track === "civil" ? Game.CIVIL_POSTS : Game.MILITARY_POSTS)[ng]}${jump === 2 ? "（连升两级，祖坟冒烟！）" : ""}——人情用一次少一次（${t.name}好感-15）。`, "good");
    Game.save(); Game.refresh();
  };


  Game.dismissContact = function (id) {
    const g = Game.G;
    g.contacts = (g.contacts || []).filter(x => x.id !== id);
    log("名帖束之高阁，渐断往来。", "");
    Game.save(); Game.refresh();
  };

  /* ============================================================
   * 夫妻相处：陪伴 / 赠礼 / 和离（离婚后可再娶再招赘）
   * ============================================================ */
  Game.ensureSpouseFavor = function () {
    const s = Game.G && Game.G.spouse;
    if (s && (s.favor == null || isNaN(s.favor))) s.favor = 65;
    return s ? s.favor : null;
  };
  /* 陪伴：耗1精力，好感+，顺带养一养自己的魅力与体力 */
  Game.spouseCare = function () {
    const g = Game.G;
    if (!g.spouse) return log("尚未婚配，何来陪伴。", "bad");
    if (g.ap <= 0 || g.locked) return log("本月精力已尽，且待下月。", "bad");
    g.ap -= 1;
    Game.ensureSpouseFavor();
    const gain = rand(4, 8) + Math.round(((g.char.stats.魅力 || 50) - 50) / 15);
    g.spouse.favor = clamp(g.spouse.favor + gain, 0, 100);
    if (Game.gainStat) { Game.gainStat(g.char, "魅力", 1); }
    log(`与${g.spouse.name}秉烛夜话 / 同游园圃，情意渐浓，好感+${gain}（今${g.spouse.favor}）。`, "good");
    Game.save(); Game.refresh();
  };
  /* 赠礼：耗1精力 + 银两，好感加得更多 */
  Game.spouseGift = function (level) {
    const g = Game.G;
    if (!g.spouse) return log("尚未婚配。", "bad");
    if (g.ap <= 0 || g.locked) return log("本月精力已尽，且待下月。", "bad");
    const cost = level === "big" ? 60 : level === "mid" ? 20 : 5;
    const base = level === "big" ? rand(12, 20) : level === "mid" ? rand(7, 12) : rand(3, 6);
    if (g.money < cost) return log(`备礼需银${cost}两。`, "bad");
    g.money -= cost; g.ap -= 1;
    Game.ensureSpouseFavor();
    g.spouse.favor = clamp(g.spouse.favor + base, 0, 100);
    log(`${level === "big" ? "金玉首饰" : level === "mid" ? "绫罗绸缎" : "胭脂点心"}赠与${g.spouse.name}，其笑逐颜开，好感+${base}（今${g.spouse.favor}）。`, "good");
    Game.save(); Game.refresh();
  };
  /* 和离：好聚好散，声望小损，分些安家银两，即可再议亲 */
  Game.divorce = function () {
    const g = Game.G;
    if (!g.spouse) return log("本就孑然一身。", "bad");
    if (g.locked) return;
    const s = g.spouse;
    const fee = Math.min(g.money, 20 + Math.round((s.family || 40) / 4));
    g.money -= fee;
    g.family.reputation = Math.max(0, g.family.reputation - 8);
    g.family.peakReputation = Math.max(g.family.peakReputation, g.family.reputation);
    log(`与${s.name}立下和离书，好聚好散，付安家银${fee}两。从此男婚女嫁，各不相干（声望-8，夫妻好感清零）。`, "bad");
    g.spouse = null;
    g.pregnancy = null;
    g.cooldown = 0;
    Game.save(); Game.refresh();
  };

  /* ============================================================
   * 过月
   * ============================================================ */
  /* 近月价格走势：保留最近6个月，供“近三月均价 + 走势” */
  /* 六业行市：每月浮动（带惯性），0.6~1.4，直乘各铺流水 */
  Game.rollTrends = function (g) {
    if (!g.trends) { g.trends = {}; Object.keys(Game.SHOP_TYPES).forEach(k => { g.trends[k] = 1; }); }
    Object.keys(Game.SHOP_TYPES).forEach(k => {
      const prev = g.trends[k] || 1;
      const shock = 0.7 + Math.random() * 0.7;
      g.trends[k] = Math.round(clamp(prev * 0.55 + shock * 0.45, 0.6, 1.4) * 100) / 100;
    });
  };

  Game.pushPrices = function (g) {
    if (!g.priceHist) g.priceHist = { land: [], rice: [], wheat: [], veg: [], fruit: [] };
    const h = g.priceHist;
    h.land.push(g.landPrice);
    ["rice", "wheat", "veg", "fruit"].forEach(k => h[k].push(g.market[k]));
    Object.keys(h).forEach(k => { if (h[k].length > 6) h[k] = h[k].slice(-6); });
  };
  Game.avg3 = function (arr) {
    if (!arr || !arr.length) return null;
    const a = arr.slice(-3);
    return Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100;
  };

  Game.nextMonth = function () {
    const g = Game.G;
    const c = g.char;
    if (!c.alive || g.locked) return;
    Game._inSettle = (Game._inSettle || 0) + 1;
    try {
    if (Game.migrateFields) Game.migrateFields(g);   /* 旧档首载农时 */

    g.month += 1;
    let yearTurned = false;
    if (g.month > 12) { g.month = 1; g.year += 1; yearTurned = true; }
    /* 生辰长岁：年龄按年月算，逢生月满一岁（岁末不再齐长） */
    (function () {
      const party = [c];
      if (g.spouse) party.push(g.spouse);
      (g.children || []).forEach(x => { party.push(x); if (x.spouse && x.spouse.joined) party.push(x.spouse); });
      (g.royalKids || []).forEach(x => party.push(x));
      party.forEach(x => { if (x && x.alive !== false && (x.bm || 1) === g.month) x.age = (x.age || 0) + 1; });
    })();


    const ctx = {};

    /* 1. 地价与集市粮价 */
    const moneyBefore = Math.round(g.money * 100) / 100;
    const granaryBefore = Object.assign({}, g.granary);
    const logStart = (g.logs || []).length;
    g.landPrice = rand(7, 16);
    g.market = Game.rollMarket();
    if (Game.rollTrends) Game.rollTrends(g);
    Game.pushPrices(g);

    /* 2. 天时丰歉 */
    const weather = Game.rollWeather();
    if (!weather.normal) log(weather.name + (weather.good ? "，租粮俱丰。" : "，租粮大减。"), weather.good ? "good" : "bad");
    const workMul = g.workFocus ? 1.3 : 1;

    /* 3. 田产：庄头先把分派田自动种满；佃租两季收银；自耕诸色依农时，到收月方获 */
    g._monthSeed = 0;
    if (Game.autoSow) Game.autoSow(g);
    Game.settleRent(g, weather.mul, workMul);
    Game.settleCrops(g, weather.mul, workMul * (g.steward ? (1 + (g.steward.bonus || 0)) : 1));

    /* 4. 每月自动置地（默认作佃租田，银紧则量力少买） */
    if (g.autoLand > 0) {
      const n = Math.min(g.autoLand, Math.floor(g.money / g.landPrice));
      if (n > 0) {
        g.land += n; g.landUse.rent += n; g.money -= n * g.landPrice;
        log(`依约自动置田${n}亩，耗银${n * g.landPrice}两。`, "");
      }
    }

    /* 5. 铺号流水 */
    settleShops(g);

    /* 6. 家主官俸与族人月钱 */
    if (c.office) {
      if (Game.ensureOfficeState) Game.ensureOfficeState(g);
      g.money += Game.SALARY(c.office.grade);
      c.office.diligence = clamp(c.office.diligence - 4 + (g.workFocus ? 2 : 0));
      if (Game.officeMonthly) Game.officeMonthly(g);   /* 五方关系消长与祸福 */
    }
    Game.settleSalaries(g);
    g.workFocus = false;

    /* 7. 束脩、口粮与门第日用 + 赋税 + 修缮应酬 + 钱庄结息 */
    settleAcademy(g);
    if (Game.bankSettle) Game.bankSettle(g);
    if (Game.palaceMonthly) Game.palaceMonthly(g, log);
    g._lastHousehold = Game.settleHousehold(g);
    if (Game.settleTaxes) {
      Game.settleTaxes(g);
      const t = g._lastTax;
      if (t && t.total > 0) log(`官差持票征比：田赋${t.landTax}两、商税${t.shopTax}两、丁银${t.poll}两，共纳${t.total}两。`, "");
    }
    if (Game.settleUpkeep) {
      Game.settleUpkeep(g);
      const u = g._lastUpkeep;
      if (u && u.total > 0) {
        let parts = [];
        if (u.keep > 0) parts.push(`宅舍修缮${u.keep}两`);
        if (u.social > 0) parts.push(`官场应酬${u.social}两`);
        if (u.manorKeep > 0) parts.push(`宅邸洒扫${u.manorKeep}两`);
        if (parts.length) log(parts.join("、") + "。", "");
      }
    }
    /* 商队在途推进 */
    if (Game.settleCaravans) Game.settleCaravans(g, log);
    /* 祖佑逐月消减 */
    if (g.riteBuff) {
      ["exam", "harvest", "birth"].forEach(k => { if (g.riteBuff[k] > 0) g.riteBuff[k] -= 1; });
      if (g.riteBuff.exam <= 0 && g.riteBuff.harvest <= 0 && g.riteBuff.birth <= 0) g.riteBuff = null;
    }
    /* 香火：祈福庇佑逐月散去 */
    if (g.blessing && g.blessing.months > 0) {
      g.blessing.months -= 1;
      if (g.blessing.months <= 0) { g.blessing = null; log("寺中香火散去，庇佑已尽，心诚则再去许愿。", ""); }
    }

    /* 8. 随机事件：在任则时有断案差事，否则寻常际遇 */
    let ev = null;
    if (!ev) ev = (c.office && Game.rollOfficeCase) ? Game.rollOfficeCase(g) : null;
    if (!ev) ev = Game.rollEvent();
    if (ev) {
      if (ev.type === "auto") {
        ev.run(g, ctx, log);
      } else {
        g.pendingEvent = ev;
      }
    }
    Game.syncLand();   /* 事件得失田产后校准分派 */

    /* 9. 健康疾病 */
    if (c.stats.体力 < 30 && chance((c.isSick ? 0.35 : 0.22) * Game.sickMul(c))) {
      c.isSick = true;
      c.stats.体力 = clamp(c.stats.体力 - rand(4, 9), 0, Game.maxSta());
      log("风寒入体，缠绵病榻，体力大损。", "bad");
    } else if (c.isSick && c.stats.体力 >= 50) {
      c.isSick = false;
      log("调养得宜，病已痊愈。", "good");
    }
    g._monthDoctor = 0;
    /* 全家轮病：老幼体弱者易感，拥挤更易传染；随后自动延医 */
    if (Game.spreadIllness) Game.spreadIllness(g, log);
    if (Game.autoDoctorLoop) Game.autoDoctorLoop(g);
    /* 声望自然消减：越高掉得越快，善名须年年维持 */
    if (g.family.reputation >= 600) g.family.reputation -= 4;
    else if (g.family.reputation >= 350) g.family.reputation -= 2;
    else if (g.family.reputation >= 160) g.family.reputation -= 1;
    /* 在外欠款/借出收回 */
    if (Game.settleLoans) Game.settleLoans(g, log);

    /* 人际：节日偶遇 + 好感自然消减 */
    if (g.contacts == null) g.contacts = [];
    const festival = g.month === 1 ? 0.22 : g.month === 7 ? 0.20 : g.month === 8 ? 0.18 : (g.month === 3 || g.month === 4) ? 0.15 : 0.06;
    if (chance(festival) && g.contacts.length < 8 && Game.makeContact) {
      Game.makeContact(null, false);
    }
    g.contacts.forEach(ct => { ct.favor = clamp(ct.favor - 1, 0, 100); });
    /* 高门世家好感每月-2，比寻常往来难维持；嫁入该族的女儿在世则姻亲不断，不减 */
    if (g.family.clanFavor) Object.keys(g.family.clanFavor).forEach(k => {
      const kin = Game.clanKinOf ? Game.clanKinOf(g, k) : null;
      if (kin) return;
      g.family.clanFavor[k] = clamp(g.family.clanFavor[k] - 2, 0, 100);
    });
    if (yearTurned) g.contacts.forEach(ct => { ct.age += 1; });
    /* 夫妻好感每月-1，相敬如宾须常陪伴；过低则同床异梦 */
    if (g.spouse) {
      if (g.spouse.favor == null) g.spouse.favor = 65;
      g.spouse.favor = clamp(g.spouse.favor - 1, 0, 100);
      if (g.spouse.favor <= 10 && chance(0.06)) {
        log(`${g.spouse.name}心灰意冷，留书出走，从此不知所踪。`, "bad");
        g.spouse = null; g.pregnancy = null; g.cooldown = 0;
        g.family.reputation = Math.max(0, g.family.reputation - 3);
      }
    }

    /* 10. 添丁（怀胎十月制）：有孕则安胎推进，无孕则判受孕 */
    if (g.cooldown > 0) g.cooldown -= 1;
    if (g.pregnancy) {
      if (Game.advancePregnancy) Game.advancePregnancy(g, log);
    } else {
      const bP = Game.birthChance(g);
      if (bP > 0 && chance(bP)) {
        if (Game.conceive) Game.conceive(g, log);
      }
    }
    /* 配偶与众人皆按生月长岁（见上），此处不再另加 */
    /* 儿孙添丁：在家成婚的儿子 / 招赘女儿照怀胎十月生养 */
    (g.children || []).forEach(function (ch) {
      if (!ch.alive || !ch.married || !ch.spouse || !ch.spouse.joined || ch.out || ch.palace) return;
      if (ch.cooldown > 0) ch.cooldown -= 1;
      if (ch.pregnancy) { if (Game.advanceCouplePregnancy) Game.advanceCouplePregnancy(g, ch, log); }
      else {
        const cp = Game.birthChanceCouple ? Game.birthChanceCouple(g, ch) : 0;
        if (cp > 0 && chance(cp)) { if (Game.conceiveCouple) Game.conceiveCouple(g, ch, log); }
      }
    });

    /* 11. 岁末：增岁、子女成长、考核 */
    if (yearTurned) {
      /* 岁末：子女成长、考核（增岁已按生月逐月办）；在朝子弟同样考课迁转 */
      growChildren(g);
      (g.children || []).forEach(x => { if (Game.npcOfficeReview) Game.npcOfficeReview(g, x); });
      /* 宗族情分：岁终结算；高则添声望，低则易生事；久不走动则渐淡 */
      if (g.family.clan == null) g.family.clan = 50;
      if (g.family.clan >= 90) { rep(4); log("宗族和睦，岁时伏腊、婚丧嫁娶一呼百应，乡人敬你家门风（声望+4）。", "good"); }
      else if (g.family.clan < 30 && chance(0.55)) {
        if (g.money >= 15) { const s = rand(10, 25); g.money -= s; log(`亲族离心，有族人上门滋事，破财${s}两方才打发。`, "bad"); }
        else { rep(-3); g.family.clan = Math.max(0, g.family.clan - 2); log("亲族在乡里散布怨言，说你为富不仁（声望-3）。", "bad"); }
      }
      if (g.family.clan > 60) g.family.clan -= 1; else if (g.family.clan < 40) g.family.clan += 1;
      if (Game.palaceReview) Game.palaceReview(g);
      childrenTuition(g);
      ageTeacher(g);
      if (c.office) { if (Game.officeAnnualReview) Game.officeAnnualReview(g); else annualReview(g); }
      g.evalBonus = 0;
    }

    /* 12. 死亡判定 */
    if (c.stats.体力 <= 0) return Game.die("油尽灯枯，一病不起。");
    if (c.isSick && chance(Math.max(0, (30 - c.stats.体力) / 220))) return Game.die("病重难返，药石无灵。");
    if (c.age >= 58) {
      const p = (c.age - 57) * 0.018 * (c.stats.体力 < 40 ? 2 : 1);
      if (chance(p)) return Game.die(`享年${c.age}岁，${c.office ? "卒于任上" : "寿终正寝"}。`);
    }
    /* 丧偶 */
    if (g.spouse && g.spouse.age >= 52 && chance(0.012 + Math.max(0, g.spouse.age - 52) * 0.002)) {
      log(`${g.spouse.name}撒手人寰，享年${g.spouse.age}岁。`, "bad");
      g.spouse = null;
      g.pregnancy = null;   /* 胎随母去 */
      rep(-1);
    }

    /* 13. 破产 */
    if (g.money < 0) {
      if (g.land > 0) {
        g.land -= 1; Game.removeLand(1);
        rep(-2);
        log("家用告罄，典卖田产一亩度日。", "bad");
      } else if (g.shops.length) {
        const s = g.shops.shift();
        log(`债户登门，${shopName(s)}被人收走抵债。`, "bad");
      }
      g.money = 0;
    }

    /* 月度账单快照：收了多少、支了多少、粮仓几何、际遇何事 */
    g._lastBill = {
      year: g.year, month: g.month,
      moneyBefore, moneyAfter: Math.round(g.money * 100) / 100,
      rent: g._lastRent || 0,
      salaries: g._lastSalaries || 0,
      shops: (g.shops || []).map(x => ({ type: x.type, profit: x.lastProfit || 0 })),
      yields: { rice: g._yield_rice || 0, wheat: g._yield_wheat || 0, veg: g._yield_veg || 0, fruit: g._yield_fruit || 0 },
      harvestNames: g._harvestNames || [],
      foodCost: (g._lastHousehold && g._lastHousehold.foodCost) || 0,
      living: (g._lastHousehold && g._lastHousehold.living) || 0,
      seedCost: g._monthSeed || 0,
      doctorCost: g._monthDoctor || 0,
      tax: (g._lastTax && g._lastTax.total) || 0,
      upkeep: (g._lastUpkeep && g._lastUpkeep.total) || 0,
      bankDepInt: (g._lastBank && g._lastBank.depInt) || 0,
      bankLoanInt: (g._lastBank && g._lastBank.loanInt) || 0,
      stewardWage: (g._lastUpkeep && g._lastUpkeep.stewardWage) || 0,
      granary: Object.assign({}, g.granary),
      granaryBefore,
      weather: (!weather.normal) ? weather.name : "",
      monthLogs: (g.logs || []).slice(logStart).filter(e => e.c !== "month").slice(-10)
    };
    g.lastActions = g._monthActs || []; g._monthActs = [];
    g.ap = 2;
    log(`—— ${g.surname}氏·第${g.gen}代 · 第${g.year}年${g.month}月 ——`, "month");
    /* 病危提醒：新病、新虚弹一次，垂危每月都弹；痊愈则消（弹窗见账单合上后） */
    (function () {
      const hw = g._hw || (g._hw = {});
      let kind = null;
      if (c.isSick && !hw.sick) { kind = "sick"; hw.sick = true; }
      else if (!c.isSick) hw.sick = false;
      const low = (c.stats.体力 || 0) <= 15;
      if (low && !hw.low) { kind = "low"; hw.low = true; }
      else if (!low) hw.low = false;
      if ((c.stats.体力 || 0) <= 8) kind = "crit";
      if (kind && !g.over && c.alive) g._healthWarn = kind;
    })();
    /* 自动度月：新月份精力到账，有安排就直接替你干了（手动度月/度年同样生效） */
    if (!g.pendingEvent && !g.over && c.alive && g.auto) Game.autoAct();
    g.locked = !!g.pendingEvent;
    Game.save();
    Game.refresh();
    /* 先出月度账单，账单合上后再出抉择事件（若有）；度年快进中则静默 */
    if (Game._autoYear) { /* 由 nextYear 收尾 */ }
    else if (Game.showBill) Game.showBill();
    else if (g.pendingEvent && Game.askChoice) {
      const payload = g.pendingEvent.build(g);
      Game.askChoice(payload, () => {
        g.pendingEvent = null;
        g.locked = false;
        Game.syncLand();   /* 抉择事件得失田产后校准分派 */
        Game.save(); Game.refresh();
      });
    }
    } finally { Game._inSettle--; }
  };
  /* 自动度月：复刻上月，或把精力全投某一项；逢抉择、抱病、丧事即停 */
  Game.setAuto = function (mode, key) {
    const g = Game.G; if (!g) return;
    g.auto = mode ? { mode, key: key || null } : null;
    Game.save(); Game.refresh && Game.refresh();
    log(!mode ? "已关闭自动度月。" : (mode === "repeat" ? "自动度月：每月复刻上月安排。" : `自动度月：精力全投「${(Game.ACTION_INFO[key] || {}).label || key}」。`), "");
  };
  Game.autoAct = function () {
    const g = Game.G; if (!g || !g.char.alive || g.locked) return;
    const au = g.auto;
    let keys = [];
    if (au && au.mode === "focus" && au.key) keys = [au.key, au.key];
    else if (au && au.mode === "repeat" && g.lastActions && g.lastActions.length) keys = g.lastActions.slice(0);
    else return;
    for (const k of keys) {
      if ((g.ap || 0) <= 0 || g.locked || !g.char.alive || g.pendingEvent) break;
      const before = g.ap;
      Game.doAction(k);
      if (g.ap >= before) break;   /* 条件不足没扣点，停下免空转 */
    }
  };
  /* 度年：连度十二个月，经济照常结算；逢抉择、丧事即停，由你定夺 */
  Game.nextYear = function () {
    const g = Game.G;
    if (!g || !g.char.alive || g.locked || g.over) return;
    const startChar = g.char;
    const start = {
      year: g.year, month: g.month,
      money: Math.round(g.money * 100) / 100,
      rep: g.family.reputation,
      kids: g.children.filter(x => x.alive).length,
      logLen: (g.logs || []).length
    };
    Game._autoYear = true;
    let steps = 0, stopReason = "";
    try {
    for (let i = 0; i < 12; i++) {
      const gg = Game.G;
      if (!gg.char.alive || gg.locked || gg.pendingEvent || gg.over) break;
      if (gg.char !== startChar) break;   /* 年中已继嗣，停下 */
      if (gg.char.isSick) { stopReason = "sick"; break; }   /* 抱病停下，先延医 */
      if (gg.auto) Game.autoAct();
      if (gg.locked || gg.pendingEvent) break;
      Game.nextMonth();
      steps++;
      const ng = Game.G;
      if (ng.char !== startChar) break;
      if (!ng.char.alive || ng.over) break;
      if (ng.pendingEvent) break;
      if (ng.char.isSick) { stopReason = "sick"; break; }
    }
    } finally { Game._autoYear = false; }
    Game.save(); Game.refresh();
    const ng = Game.G;
    if (ng.pendingEvent) { if (Game.afterBill) Game.afterBill(); return; }  /* 有抉择待断 */
    if (!ng.char.alive || ng.over) return;   /* 丧事弹窗已出 */
    if (steps > 0 && Game.showYearSummary) Game.showYearSummary(start, steps, stopReason);
  };
  /* 账单合上后，补出本月抉择事件 */
  Game.afterBill = function () {
    const g = Game.G;
    if (g && g.pendingEvent && Game.askChoice) {
      const payload = g.pendingEvent.build(g);
      Game.askChoice(payload, () => {
        g.pendingEvent = null;
        g.locked = false;
        Game.syncLand();
        Game.save(); Game.refresh();
      });
    }
  };

  function growChildren(g) {
    /* 入门亲属同寿：年过六旬有寿终之时（长岁按生月） */
    (g.children || []).forEach(function (ch) {
      const sp = ch.spouse;
      if (!sp || !sp.joined) return;
      sp.age = (sp.age || 20);   /* 入门亲属按生月长岁，此处只判寿终 */
      if (sp.age >= 60 && chance((sp.age - 58) * 0.02)) {
        sp.alive = false;
        ch.spouse = null; ch.married = false;
        log((ch.gender === "男" ? "儿媳" : "赘婿") + sp.name + "寿终，享年" + sp.age + "岁。" + ch.name + "鳏居，可再议亲。", "");
      }
    });
    g.children.forEach(ch => {
      if (!ch.alive) return;
      /* 长岁按生月逐月办，此处只管成长、寿终、应考 */
      if (ch.age <= 15) {
        /* 逐年长进：基础 3~7，再乘各人天赋与禀赋倍率 */
        ["体力", "智力", "武力", "魅力"].forEach(k => {
          Game.gainStat(ch, k, 3 + rand(0, 4));
        });
      } else {
        /* 成年族人岁长一岁，体气随年而衰 */
        ch.stats.体力 = clamp(ch.stats.体力 - (ch.age > 50 ? 1 : 0));
        if (ch.age >= 60 && chance((ch.age - 58) * 0.02)) {
          ch.alive = false;
          log(`${ch.relation || "族人"}${ch.name}寿终，享年${ch.age}岁。`, "");
        }
      }
      /* 夭折 */
      if (ch.alive && ch.age <= 5 && chance(0.02)) {
        ch.alive = false;
        log(`${ch.name}未满六岁而夭，举家悲戚。`, "bad");
        return;
      }
      if (ch.alive && ch.age === 15) {
        log(`${ch.name}年已十五，${ch.gender === "男" ? "束发就傅" : "及笄"}，可以议亲了。`, "");
      }
      /* 定亲完婚：年满十五自动操办（聘礼不足则暂缓明年） */
      if (ch.alive && ch.betrothed && !ch.married && ch.age >= 15 && !ch.palace && !ch.out) {
        if (Game.completeBetrothal) Game.completeBetrothal(ch);
      }
      /* 成年谋生：无功名官身则充百业（人人有饭吃，务农兜底） */
      if (ch.alive && ch.age === 16 && !ch.office) {
        if (ch.title) { ch.job = null; }
        else { ch.job = Game.pickJob(ch); }
        const j = Game.jobInfo(ch.job);
        log(`${ch.name}年已十六，${ch.title ? "已有功名在身" : j ? "出门营生，做了" + j.name : "在家务农"}。`, "");
      }
      /* 在业者随本事跳槽：岁末一次 */
      if (ch.alive && ch.age > 16 && !ch.office && !ch.title) {
        const best = Game.pickJob(ch);
        if (best && ch.job !== best) {
          const oldJ = Game.jobInfo(ch.job), newJ = Game.jobInfo(best);
          ch.job = best;
          if (oldJ && newJ && newJ.salary > oldJ.salary)
            log(`${ch.relation || "族人"}${ch.name}凭本事改行做了${newJ.name}，月入${newJ.salary}两。`, "good");
        }
      }
      /* 成年族人自行博取功名：到达数值线即自动下场（岁末一次） */
      if (ch.alive && ch.age >= 16 && ch.age <= 45 && !ch.office) {
        npcTryExam(ch);
      }
    });
  }

  /* 非家主族人自行应考：达线即下场，越高越易中
   * 童试线55（文/武），举人线68；每年一次，智65约两成、75约三成 */
  function npcTryExam(ch) {
    const g = Game.G;
    if (ch.out) return;
    if (ch.gender !== "男") return;   /* 女儿不走男子科举，另有入宫女官线 */
    if (ch.palace) return;
    const smart = (ch.stats.智力 || 0), strong = (ch.stats.武力 || 0);
    if (!ch.title) {
      const canCivil = smart >= 55, canMartial = strong >= 55;
      if (!canCivil && !canMartial) return;
      /* 文武双达线者择优而从 */
      const goCivil = canCivil && (!canMartial || smart >= strong);
      if (goCivil) {
        if (chance((smart - 50) / 80)) {
          ch.title = "xiucai"; ch.job = null; rep(6);
          g.family.titles.xiucai = g.gen;
          log(`${ch.relation || "族人"}${ch.name}（智${smart}）应童试高中秀才，门楣有光。`, "good");
        }
      } else {
        if (chance((strong - 50) / 80)) {
          ch.title = "wuxiucai"; ch.job = null; rep(5);
          log(`${ch.relation || "族人"}${ch.name}（武${strong}）弓马娴熟，中了武秀才。`, "good");
        }
      }
    } else if (ch.title === "xiucai" || ch.title === "wuxiucai") {
      if (ch.age < 17) return;
      const civil = ch.title === "xiucai";
      const ab = civil ? smart : strong;
      if (ab < 68) return;
      if (chance((ab - 60) / 60)) {
        const sc = Math.round(ab + rand(-14, 14) + Math.min(15, Math.round(g.family.reputation / 25)));
        const first = sc >= 102;
        ch.title = civil ? "juren" : "wujuren"; rep(first ? 32 : 12);
        if (first) { ch.honor = "解元"; g.family.topHonor = "解元"; }
        g.family.titles[ch.title] = g.gen;
        const gift = first ? rand(60, 110) : rand(20, 50);
        g.money += gift;
        if (chance(0.5)) {
          ch.office = { grade: rand(1, 3), track: civil ? "civil" : "military" };
          log(`${ch.name}秋闱连捷中了${civil ? "举人" : "武举人"}${first ? "，且是大魁天下的解元" : ""}，大挑授官，出仕去了。亲友贺仪银${gift}两。`, "good");
        } else {
          log(`${ch.name}高中${civil ? "举人" : "武举人"}${first ? "——还是解元，大魁天下" : ""}，在乡候选。亲友贺仪银${gift}两。`, "good");
        }
        if (Game.queueXibao) Game.queueXibao({ who: ch.name, rel: ch.relation || "族人", exam: civil ? "乡试" : "武乡试", rank: first ? "解元" : (civil ? "举人" : "武举人"), gift });
      }
    } else if (ch.title === "juren") {
      /* 儿子会试：中式为贡士，第一为会元（年满十九方许下场） */
      if (ch.age < 19 || ch.age > 45) return;
      if (smart < 72) return;
      if (chance((smart - 68) / 80)) {
        const sc = Math.round(smart + rand(-14, 14) + Math.min(15, Math.round(g.family.reputation / 25)));
        const first = sc >= 102;
        ch.title = "gongshi"; rep(first ? 40 : 20);
        if (first) { ch.honor = "会元"; g.family.topHonor = "会元"; }
        g.family.titles.gongshi = g.gen;
        const gift = first ? rand(60, 110) : rand(30, 60);
        g.money += gift;
        log(`${ch.name}春闱取中贡士${first ? "——会元及第，大魁天下" : ""}！会馆摆酒，只待殿试一搏。贺仪银${gift}两。`, "good");
        if (Game.queueXibao) Game.queueXibao({ who: ch.name, rel: ch.relation || "族人", exam: "会试", rank: first ? "会元" : "贡士", gift });
      }
    } else if (ch.title === "gongshi") {
      /* 儿子殿试：同样定三甲，状元榜眼探花皆有可能（年满二十方许殿试） */
      if (ch.age < 20 || ch.age > 45) return;
      if (smart < 75) return;
      if (chance((smart - 70) / 90)) {
        const sc = Math.round(smart + rand(-14, 14) + Math.min(15, Math.round(g.family.reputation / 25)));
        let rank, grade, bonus;
        if (sc >= 118)      { rank = "状元"; grade = 8; bonus = 50; }
        else if (sc >= 111) { rank = "榜眼"; grade = 8; bonus = 40; }
        else if (sc >= 105) { rank = "探花"; grade = 7; bonus = 35; }
        else if (sc >= 97)  { rank = "传胪"; grade = 7; bonus = 25; }
        else if (sc >= 85)  { rank = "二甲"; grade = 7; bonus = 15; }
        else                { rank = "三甲"; grade = 6; bonus = 0; }
        ch.title = "jinshi";
        ch.honor = rank === "二甲" || rank === "三甲" ? "进士" : rank;
        g.family.titles.jinshi = g.gen;
        g.family.topHonor = rank;
        rep(80 + bonus);
        ch.office = { grade, track: "civil" };
        const gift = rank === "状元" ? rand(150, 250) : rank === "榜眼" || rank === "探花" ? rand(120, 200) : rank === "传胪" ? rand(80, 140) : rand(40, 90);
        g.money += gift;
        const txt = rank === "状元" || rank === "榜眼" || rank === "探花"
          ? `${ch.relation || "族人"}${ch.name}金殿传胪，一甲${rank}，进士及第！跨马游街，阖县轰动`
          : `${ch.relation || "族人"}${ch.name}殿试取中${rank === "传胪" ? "二甲第一（传胪）" : rank}，授${Game.CIVIL_POSTS ? Game.CIVIL_POSTS[grade] : ""}，十年寒窗一朝登科`;
        log(txt + `。贺仪银${gift}两。`, "good");
        if (Game.queueXibao) Game.queueXibao({ who: ch.name, rel: ch.relation || "族人", exam: "殿试", rank, gift });
      }
    }
  }

  function annualReview(g) {
    const c = g.char;
    const o = c.office;
    const posts = o.track === "civil" ? Game.CIVIL_POSTS : Game.MILITARY_POSTS;

    const ability = o.track === "civil" ? c.stats.智力 : c.stats.武力;
    const score = 48 + o.diligence * 0.35 + ability * 0.25
      + (g.evalBonus || 0) + rand(-18, 18) + (c.corruption || 0) * 4;

    if (score >= 78 && o.grade < Game.GRADES.length - 1) {
      Game.appoint(o.track, o.grade + 1);
      rep(8);
      log("三年考绩，治行第一，擢升一级。", "good");
    } else if (score <= 32) {
      if (o.grade > 0 && chance(0.6)) {
        o.grade -= 1;
        rep(-5);
        log(`考绩下下，左迁为${Game.GRADES[o.grade]}${posts[o.grade]}。`, "bad");
      } else {
        c.office = null;
        rep(-10);
        log("考绩罢软，奉旨革职，冠带闲住。", "bad");
      }
    } else {
      log(`岁末考绩平平，仍任${Game.GRADES[o.grade]}${posts[o.grade]}。`, "");
    }
  }

  /* ============================================================
   * 宫中说情：宫中女儿是家里的奥援，位分越高分量越重
   * 妃嫔（秀女40→妃90）> 宫女（小宫女12→尚仪28）
   * 差事办砸、贪腐案发、言官论劾、考绩下下时自动递话，有几率从轻发落
   * ============================================================ */
  Game.topPalace = function (g) {
    const ds = (g.children || []).filter(x => x.alive && x.out === "palace" && x.palace);
    ds.sort((a, b) => {
      const ta = a.palace.track === "consort" ? 1 : 0, tb = b.palace.track === "consort" ? 1 : 0;
      if (ta !== tb) return tb - ta;
      return b.palace.grade - a.palace.grade;
    });
    return ds[0] || null;
  };
  /* 宫中赏赐体面：高位妃嫔逢年过节有赏银下家，体面得很（不再递话说情） */
  Game.palaceGrace = function (g, log) {
    const d = Game.topPalace(g);
    if (!d || !d.palace || d.palace.track !== "consort" || d.palace.grade < 4) return;
    if (!chance(0.5)) return;
    const gift = rand(20, 60);
    g.money += gift;
    rep(4);
    log(`宫中赏下体面：${Game.palaceName(d)}${d.name}位分尊崇，逢节赏家银${gift}两，阖族声望+4。`, "good");
  };
  /* 宫中女儿一律不寄钱回家（宫里开销大）；宫里的价值在赏赐体面与荫家 */
  Game.palaceRemit = function (p) {
    return 0;
  };

  /* ============================================================
   * 分家另过：成年男丁可携妻儿分出去单过（各吃各锅）
   * 未成年不得分；分出去一般喊不回——除非家中再无男丁，方可迎一支归宗
   * ============================================================ */
  Game.branchEligible = function (ch) {
    return ch && ch.alive && ch.gender === "男" && ch.age >= 16 && !ch.out && !ch.palace && !ch.betrothed;
  };
  Game.branchOut = function (id) {
    const g = Game.G;
    const ch = g.children.find(x => x.id === id);
    if (!ch || !Game.branchEligible(ch)) return log("唯成年在家男丁可分家另过。", "bad");
    if (g.money < 40) return log("分家需安家银四十两，家计为难。", "bad");
    g.money -= 40;
    const bid = "br" + Date.now() + rand(100, 999);
    const followers = [ch.id];
    if (ch.spouse && ch.spouse.joined) followers.push(ch.spouse.id);
    (g.children || []).filter(x => x.alive && x.parentId === ch.id).forEach(x => followers.push(x.id));
    followers.forEach(fid => {
      const m = g.children.find(x => x.id === fid);
      if (m) { m.out = "branch"; m.branchId = bid; }
      if (ch.spouse && ch.spouse.id === fid) { ch.spouse.out = "branch"; ch.spouse.branchId = bid; }
    });
    g.branches = g.branches || [];
    g.branches.push({ id: bid, headId: ch.id, headName: ch.name, sinceYear: g.year, sinceMonth: g.month });
    rep(-2);
    log(ch.name + "分家另过，携家眷自立门户，付安家银四十两（声望-2）。自分各吃各锅；家中若再无男丁，方可迎其归宗。", "");
    Game.save(); Game.refresh();
  };
  Game.malesAtHome = function (g) {
    return Game.householdMembers().filter(m => m.person.alive && m.person.gender === "男").length;
  };
  Game.recallBranch = function (bid, silent) {
    const g = Game.G;
    const br = (g.branches || []).find(x => x.id === bid);
    if (!br) return false;
    (g.children || []).forEach(x => { if (x.branchId === bid) { x.out = null; x.branchId = null; } });
    const hd = g.children.find(x => x.id === br.headId);
    if (hd && hd.spouse && hd.spouse.branchId === bid) { hd.spouse.out = null; hd.spouse.branchId = null; }
    g.branches = (g.branches || []).filter(x => x.id !== bid);
    if (!silent) {
      rep(2);
      log(br.headName + "一支归宗，阖家团圆（声望+2）。", "good");
      Game.save(); Game.refresh();
    }
    return true;
  };


  /* ============================================================
   * 死亡与继承
   * ============================================================ */
  Game.die = function (reason) {
    const g = Game.G;
    const c = g.char;
    c.alive = false;
    log(`【第${g.gen}代家主 ${c.name}】${reason}`, "bad");

    g.history.push({
      gen: g.gen, name: c.name, gender: c.gender, age: c.age,
      title: c.title, post: c.office
        ? Game.GRADES[c.office.grade] + (c.office.track === "civil" ? Game.CIVIL_POSTS[c.office.grade] : Game.MILITARY_POSTS[c.office.grade])
        : (c.retired ? "致仕" : "白丁"),
      years: g.year, reputation: g.family.peakReputation,
      spouse: g.spouse ? g.spouse.name : null,
      kids: g.children.filter(x => x.alive).length,
      cause: reason
    });
    /* 同步一份到 family.history，老档与新档读取统一 */
    g.family.history = g.history;

    /* 出阁女、宫中女不承祧（招赘留家者可）；先 sons 后 daughters */
    /* 若生前已立嗣且嗣子仍在堂，遵遗命直继，不再合族再议 */
    if (Game.heirPerson) {
      const named = Game.heirPerson(g);
      if (named) { g.heirId = null; return Game.succeed(named); }
      else if (g.heirId) g.heirId = null;
    }
    /* 子嗣优先于孙辈：先 sons 后 daughters；皆无则长房之孙可继 */
    const kidHeirs = g.children.filter(x => x.alive && !x.out && !x.parentId);
    const grandHeirs = g.children.filter(x => x.alive && !x.out && x.parentId);
    const bySeniority = (a, b) => (a.gender === b.gender ? a.age - b.age : a.gender === "男" ? -1 : 1);
    kidHeirs.sort(bySeniority);
    grandHeirs.sort(bySeniority);
    const heirs = kidHeirs.concat(grandHeirs);
    if (heirs.length === 0) {
      const backable = (g.children || []).filter(x => x.alive && x.out === "branch" && x.gender === "男" && !x.parentId);
      if (backable.length && Game.askRecall) {
        log("家中已无男丁承祧，族老议请分支出迎一支归宗。", "");
        Game.askRecall(backable, (pick) => {
          if (!pick) return Game.gameOver(true);
          Game.recallBranch(pick.branchId, true);
          const returned = g.children.filter(x => x.alive && !x.out);
          returned.sort(bySeniority);
          if (!returned.length) return Game.gameOver(true);
          Game.log(pick.name + "一支归宗，仍由其承继宗祧。", "good");
          Game.askSuccession(returned, (heir) => Game.succeed(heir));
        });
        return;
      }
      return Game.gameOver(true);
    }
    Game.askSuccession(heirs, (heir) => Game.succeed(heir));
  };

  /* 字辈：新立一世，字辈顺进一位（可在家宅随时改定） */
  Game.advanceGenChar = function () {
    const g = Game.G;
    g.family.genChar = Game.nextGenChar ? Game.nextGenChar(g.family.genChar) : g.family.genChar;
    return g.family.genChar;
  };
  /* 整首字辈诗：设了就按诗循环取名；清空则回到单字顺进 */
  Game.setGenPoem = function (text) {
    const g = Game.G;
    text = (text || "").replace(/\s+/g, "");
    if (!text) {
      g.family.genPoem = null;
      log("撤了字辈诗，此后仍按单字顺进。", "");
    } else {
      if (text.length > 60) return log("字辈诗太长，六十字为限。", "bad");
      g.family.genPoem = text;
      g.family.genChar = text[0];
      log("定下字辈诗“" + (text.length > 20 ? text.slice(0, 20) + "……" : text) + "”（" + text.length + "字循环），子孙取名从首字“" + text[0] + "”起。", "good");
    }
    Game.save(); Game.refresh();
  };
  Game.useGenPoem = function (i) {
    const poem = (Game.GEN_POEMS || [])[Number(i)];
    if (!poem) return;
    Game.setGenPoem(poem.chars);
  };
  Game.setGenChar = function (ch) {
    const g = Game.G;
    ch = (ch || "").trim().slice(0, 1);
    if (!ch) return Game.log("字辈不可为空。", "bad");
    g.family.genChar = ch;
    Game.log(`定下子孙字辈“${ch}”，此后新生儿名从此字。`, "good");
    Game.save(); Game.refresh();
  };

  Game.succeed = function (heir) {
    const g = Game.G;
    g.heirId = null;
    g.gen += 1;
    if (Game.advanceGenChar) Game.advanceGenChar();
    g.pendingEvent = null;
    g.locked = false;
    g.evalBonus = 0;
    g.academyCandidates = null;
    if (g.academy.teacher && g.academy.teacher.kind === "self") {
      g.academy.teacher = null;
      log("旧主已逝，家主亲授之学暂辍，待新主重开。", "");
    }
    g.spouse = null;
    g.candidate = null;
    g.candidates = null;
    g.pregnancy = null;   /* 旧主丧，胎随旧房去 */
    g.cooldown = 0;
    g.contacts = [];   /* 人走茶凉，旧交须新主重新结识 */
    /* 若继嗣者早已娶高天赋媳/赘高门，其伴侣随之入门为新主配偶 */
    if (heir.spouseApt) {
      g.spouse = {
        id: "sp" + Date.now() + rand(100, 999),
        name: heir.spouseName || Game.makeName(heir.gender === "男" ? "女" : "男", pick(Game.SURNAMES)),
        gender: heir.gender === "男" ? "女" : "男",
        age: Math.max(15, heir.age - rand(0, 3)),
        family: heir.spouseFamily || 60,
        stats: heir.spouseStats || { 体力: 50, 智力: 55, 武力: 40, 魅力: 60 },
        apt: heir.spouseApt, traits: heir.spouseTraits || [],
        alive: true, title: null, office: null, job: null, favor: 70
      };
      if (Game.pickJob) g.spouse.job = Game.pickJob(g.spouse);
      log(`${heir.name}之${heir.gender === "男" ? "妻" : "夫"}${g.spouse.name}随之入门主持中馈。`, "");
    }
    /* 铺面、田产随宗祧留存 */
    g.char = {
      name: heir.name,
      gender: heir.gender,
      age: Math.max(heir.age, 15),
      stats: heir.stats,
      alive: true,
      isSick: false,
      apt: heir.apt,
      traits: heir.traits,
      title: heir.title || null,
      office: heir.office || null,
      fatherName: heir.fatherName || "不详",
      motherName: heir.motherName || "不详",
      job: null,
      retired: false
    };
    /* 未成年子弟承家，产业由老仆照管 */
    /* 其余在世族人皆留在籍中，按与新家主的世代长幼定称谓（孙继则有伯叔姑与堂亲） */
    const heirIsGrand = !!heir.parentId;
    g.children = g.children.filter(x => x.alive && x.id !== heir.id)
      .map(x => {
        const older = x.age >= heir.age;
        let relation;
        if (x.id === heir.parentId) relation = x.gender === "男" ? "父" : "母";
        else if (x.parentId && x.parentId === heir.id) relation = x.gender === "男" ? "子" : "女";
        else if (!heirIsGrand && !x.parentId) relation = x.gender === "男" ? (older ? "兄" : "弟") : (older ? "姊" : "妹");
        else if (!heirIsGrand) relation = x.gender === "男" ? "侄子" : "侄女";
        else if (!x.parentId) relation = x.gender === "男" ? (older ? "伯" : "叔") : "姑";
        else if (x.parentId === heir.parentId) relation = x.gender === "男" ? (older ? "兄" : "弟") : (older ? "姊" : "妹");
        else relation = x.gender === "男" ? (older ? "堂兄" : "堂弟") : (older ? "堂姊" : "堂妹");
        return Object.assign({}, x, { relation });
      });
    g.ap = 2;
    /* 功名断续：连续三代无功名则门第回落 */
    if (g.family.titles[Object.keys(g.family.titles).pop()] !== undefined) {
      /* 简化：峰值声望保留，当前声望随代际自然衰减一成 */
    }
    g.family.reputation = Math.round(g.family.reputation * 0.9);
    log(`灵前继嗣，${heir.name}承${g.surname}氏宗祧，是为第${g.gen}代家主。`, "month");
    Game.save(); Game.refresh();
  };

  /* 传位：家主生前让位给直系后代（须15岁以上、在家同居）；老家主夫妇退为族中尊长 */
  Game.abdicateTo = function (id) {
    const g = Game.G;
    const heir = (g.children || []).find(x => x.id === id);
    if (!heir || !heir.alive || heir.out) return log("须在家同居的直系后代方可传位。", "bad");
    if (heir.age < 15) return log(`${heir.name}年方${heir.age}岁，尚未成年，传位恐族人不服（须15岁以上）。`, "bad");
    const old = g.char, oldSp = g.spouse;
    const isGrand = !!heir.parentId;
    const step = isGrand ? 2 : 1;
    /* 老家主夫妇退位：留家养老，不再理家（也不再生育） */
    const elderBase = { alive: true, married: false, out: null, palace: null, betrothed: null, pregnancy: null, cooldown: 0, infertile: true, title: null, office: null, job: null };
    const oldHead = Object.assign({}, old, elderBase, {
      id: "ret" + Date.now() + rand(100, 999),
      name: old.name, gender: old.gender, age: old.age,
      relation: isGrand ? (old.gender === "男" ? "祖父" : "祖母") : (old.gender === "男" ? "父" : "母"),
      parentId: null, fatherName: old.fatherName || "不详", motherName: old.motherName || "不详"
    });
    if (old.title) oldHead.title = old.title;
    g.children.push(oldHead);
    let oldSpEntry = null;
    if (oldSp) {
      oldSpEntry = Object.assign({}, oldSp, elderBase, {
        id: "ret" + Date.now() + rand(1000, 9999),
        relation: isGrand ? (oldSp.gender === "男" ? "祖父" : "祖母") : (oldSp.gender === "男" ? "父" : "母"),
        parentId: null
      });
      delete oldSpEntry.favor;
      if (oldSp.title) oldSpEntry.title = oldSp.title;
      g.children.push(oldSpEntry);
    }
    /* 新主夫妇登位：嗣子之妻/赘夫随之主持中馈 */
    let newSpouse = null;
    if (heir.spouse && heir.spouse.joined) newSpouse = heir.spouse;
    g.children = g.children.filter(x => x.alive && x.id !== heir.id);
    g.gen += step;
    if (Game.advanceGenChar) for (let i = 0; i < step; i++) Game.advanceGenChar();
    g.heirId = null;
    g.pregnancy = null; g.cooldown = 0;
    g.candidate = null; g.candidates = null;
    g.spouse = newSpouse ? Object.assign({}, newSpouse, { joined: undefined }) : null;
    if (g.spouse && g.spouse.favor == null) g.spouse.favor = 70;
    const nh = { name: heir.name, gender: heir.gender, age: heir.age, stats: heir.stats, alive: true, isSick: false, apt: heir.apt, traits: heir.traits, title: heir.title || null, office: heir.office || null, fatherName: heir.fatherName || "不详", motherName: heir.motherName || "不详", job: null, retired: false, fertility: heir.fertility, infertile: heir.infertile };
    if (nh.office && nh.office.grade == null) nh.office = null;
    g.char = nh;
    /* 其余族人按与新主的世代长幼重定称谓，退位尊长不动 */
    const elderIds = {}; elderIds[oldHead.id] = 1; if (oldSpEntry) elderIds[oldSpEntry.id] = 1;
    g.children = g.children.map(x => {
      if (elderIds[x.id]) return x;
      const older = x.age >= heir.age;
      let relation;
      if (x.id === heir.parentId) relation = x.gender === "男" ? "父" : "母";
      else if (x.parentId && x.parentId === heir.id) relation = x.gender === "男" ? "子" : "女";
      else if (!isGrand && !x.parentId) relation = x.gender === "男" ? (older ? "兄" : "弟") : (older ? "姊" : "妹");
      else if (!isGrand) relation = x.gender === "男" ? "侄子" : "侄女";
      else if (!x.parentId) relation = x.gender === "男" ? (older ? "伯" : "叔") : "姑";
      else if (x.parentId === heir.parentId) relation = x.gender === "男" ? (older ? "兄" : "弟") : (older ? "姊" : "妹");
      else relation = x.gender === "男" ? (older ? "堂兄" : "堂弟") : (older ? "堂姊" : "堂妹");
      return Object.assign({}, x, { relation });
    });
    g.history.push({ gen: g.gen - step, name: old.name, gender: old.gender, age: old.age, title: old.title, post: old.office ? Game.GRADES[old.office.grade] : (old.retired ? "致仕" : "白丁"), years: g.year, reputation: g.family.peakReputation, spouse: oldSp ? oldSp.name : null, kids: g.children.filter(x => x.alive).length, cause: "传位" + heir.name });
    g.family.history = g.history;
    g.ap = 2;
    rep(2);
    log(`传位大典：${old.name}让位${heir.name}，是为第${g.gen}代家主。老家主夫妇退居后堂颐养天年（不再理家生育）。`, "month");
    Game.save(); Game.refresh();
  };

  Game.gameOver = function (noHeir) {
    const g = Game.G;
    g.over = true;
    const summary = {
      surname: g.surname,
      gen: g.gen,
      years: g.year,
      peakRep: g.family.peakReputation,
      bestPost: g.family.bestPost,
      rank: Game.rankName(),
      noHeir: !!noHeir
    };
    Game.recordBest(summary);
    Game.clearSave();
    Game.showGameOver && Game.showGameOver(summary);
  };

  /* 门第评定（阈值抬高，望族难成；宅邸卡上限：茅舍最高耕读，宫府方可世家） */
  Game.rankName = function () {
    const g = Game.G;
    const r = g.family.peakReputation;
    const bg = g.family.bestGrade;
    const manor = Game.manorInfo ? Game.manorInfo(g.manor || "hut") : { maxRank: 5 };
    const cap = manor.maxRank != null ? manor.maxRank : 5;
    /* rep 等级 0布衣 1耕读 2乡绅 3望族 4名门 5世家 */
    let repLv = 0;
    if (r >= 1000 || bg >= 14) repLv = 5;
    else if (r >= 600 || bg >= 11) repLv = 4;
    else if (r >= 350 || bg >= 7) repLv = 3;
    else if (r >= 160) repLv = 2;
    else if (r >= 60) repLv = 1;
    const lv = Math.min(repLv, cap);
    return ["布衣白丁", "耕读之家", "乡绅门第", "一方望族", "名门望族", "诗礼世家"][lv];
  };

  /* 高声望的实惠：乡绅租+10% · 望族税-20%考试+5 · 名门考试+10 */
  Game.repPriv = function () {
    const g = Game.G;
    const r = g ? g.family.peakReputation : 0;
    const p = { rentMul: 1, taxMul: 1, examBonus: 0 };
    if (r >= 160) p.rentMul = 1.1;
    if (r >= 350) { p.taxMul = 0.8; p.examBonus = 5; }
    if (r >= 600) { p.examBonus = 10; }
    return p;
  };
})();
