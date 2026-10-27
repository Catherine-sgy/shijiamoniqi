/* ============================================================
 * 百年宗谱 · 状态与存档
 * ============================================================ */
(function () {
  "use strict";
  const Game = window.Game || (window.Game = {});
  const { rand, pick, clamp } = Game.U;

  const SAVE_KEY = "shijia-save-v1";
  const BEST_KEY = "shijia-best-v1";

  function chance2(p) { return Math.random() < p; }
  function randomGiven(gender) {
    const pool = gender === "男" ? Game.MALE_GIVEN : Game.FEMALE_GIVEN;
    return chance2(0.5) ? pick(pool) : pick(pool) + pick(pool);
  }
  function makeName(gender, surname, lead) {
    if (lead) return (surname || "") + lead + pick(gender === "男" ? Game.MALE_GIVEN : Game.FEMALE_GIVEN);
    return (surname || "") + randomGiven(gender);
  }

  /* 新生婴儿：属性承父母雏形，天赋(1~100)定终身学习倍率，词条自父母遗传或罕见降生 */
  function makeChild(gender, parentA, parentB, surname, relation, parentId) {
    const stats = {};
    /* 优生：子肖父母，取双亲平均再上下浮动三成（天赋词条另有随机与遗传） */
    ["体力", "智力", "武力", "魅力"].forEach(k => {
      let avg = 45;
      if (parentA && parentB) avg = (parentA.stats[k] + parentB.stats[k]) / 2;
      else if (parentA) avg = parentA.stats[k];
      else if (parentB) avg = parentB.stats[k];
      stats[k] = clamp(Math.round(avg * (0.7 + Math.random() * 0.6)), 5, 95);
    });
    /* 字辈按辈分取：儿子辈用当前字，孙辈顺进一位，曾孙辈再进一位（可循环） */
    const lead = (function () {
      const G = window.Game.G;
      const base = (G && G.family && G.family.genChar) || null;
      if (!base) return null;
      let depth = 1, cur = parentId, guard = 0;
      const kids = (G && G.children) || [];
      while (cur && guard < 6) { depth++; const pp = kids.find(x => x.id === cur); cur = pp ? pp.parentId : null; guard++; }
      let ch = base;
      for (let i = 1; i < depth && window.Game.nextGenChar; i++) ch = window.Game.nextGenChar(ch);
      return ch;
    })();
    const child = {
      id: "c" + Date.now() + rand(100, 999),
      name: makeName(gender, surname, lead),
      gender,
      age: 0,
      stats,
      apt: null,                 // 四维先天资质 1~100（学习倍率）
      traits: null,              // 禀赋词条 key 列表
      relation: relation || (gender === "男" ? "子" : "女"),
      parentId: parentId || null,   // 孙辈记生父/生母 id
      fatherName: (parentA && parentA.gender === "男" ? parentA : (parentB && parentB.gender === "男" ? parentB : null)) ? (parentA.gender === "男" ? parentA.name : parentB.name) : "不详",
      motherName: (parentA && parentA.gender === "女" ? parentA : (parentB && parentB.gender === "女" ? parentB : null)) ? (parentA.gender === "女" ? parentA.name : parentB.name) : "不详",
      married: false,
      alive: true,
      title: null,               // 功名 key
      job: null,                 // 职业 key（成年后无官身则充百业）
      office: null               // 若大挑授官：{grade,track}
    };
    return Game.decoratePerson(child, parentA, parentB);
  }

  Game.randomGiven = randomGiven;
  Game.newGame = function (surname, gender, given, genChar) {
    Game.G = {
      version: 1,
      surname,
      gen: 1,
      year: 1,
      month: 1,
      money: rand(30, 70),
      land: rand(5, 18),
      landPrice: 10,
      landUse: null,                // 田亩分派 {rent,rice,wheat,veg,fruit}，建号时初始化
      fields: null,                 // 在田作物 {crop:{lots:[{mu,hm,hy,bear}]}}，建号时初始化
      granary: { rice: 12, wheat: 6, veg: 8, fruit: 3 },  // 粮仓（斗）
      market: null,                 // 当月集市粮价 {rice,wheat,veg,fruit}（两/斗）
      trends: null,                // 六业行市倍率 {antique:1,...}，逐月浮动 0.6~1.4
      bank: null,                  // 钱庄 {deposit:0, loan:0}
      priceHist: null,              // 近月价格走势 {land:[],rice:[],wheat:[],veg:[],fruit:[]}
      house: { rooms: 3 },          // 宅院房间数，每间住两人
      manor: "hut",               // 宅邸等级 hut/tile/courtyard/mansion/palace，卡家族上限
      contacts: [],              // 人际往来 [{id,name,gender,age,type,family,stats,apt,traits,favor}]
      shops: [],                    // 铺号：{id,type,fame,months,lastProfit}
      autoLand: 0,                  // 每月自动买入亩数（0=关闭）
      steward: null,                // 田庄掌柜 {kind,name,wage,bonus}
      sowPlan: null,                // 播种计划（已废，庄头按分派种满；留存兼容）
      autoDoctor: null,             // 自动延医档位 null|itinerant|local|master
      branches: [],              // 分出去的支（{id,headId,headName,sinceYear,sinceMonth}，成员出标识 branch）
      academy: { teacher: null },   // 族学：{ kind,id,name,age,skill,fee,gift,desc }
      academyCandidates: null,      // 外访待聘的西席名单
      spouse: null,
      children: [],
      candidate: null,
      pregnancy: null,          // 身孕 {month, total}，怀胎十月
      cooldown: 0,              // 产后调养月数，期间不受孕
      caravans: [],             // 在途商队 [{id,key,name,cost,left,total}]
      riteBuff: null,           // 祖佑 {exam,harvest,birth,examBonus,harvestMul,birthBonus}
      loansOut: [],             // 借出未归 [{name,amount,back,left,repayP}]
      family: {
        reputation: 0,
        peakReputation: 0,
        titles: {},            // 家族累计取得的功名 key -> 代数
        titleGen: 0,           // 连续功名代数
        bestGrade: null,       // 历任最高品级 index
        bestPost: null,
        founder: surname,
        genChar: null,         // 字辈：子孙取名首字
        genPoem: null,         // 字辈诗全文（设了就按诗循环，不设则单字顺进）
        clan: 50,               // 宗族情分 0~100（祭祖/周济族人涨，刻薄寡恩跌；高则岁加声望，低则生事）
        clanFavor: null,         // 高门世家好感 {key:0~100}，每月-2
        history: []            // 族谱镜像，与顶层 history 同步
      },
      char: {
        name: (surname || "") + (given || randomGiven(gender)),
        gender,
        age: 16,
        stats: {
          体力: rand(35, 55),
          智力: rand(30, 55),
          武力: rand(30, 55),
          魅力: rand(30, 55)
        },
        alive: true,
        isSick: false,
        title: null,           // 功名 key
        office: null,          // {grade, track, diligence}
        fatherName: "不知道", motherName: "不知道",   // 开宗第一代，父母不详
        retired: false
      },
      history: [],             // 历代家主：{gen,name,age,title,post,years,reputation}
      logs: [],
      ap: 2,
      locked: false
    };
    Game.G.landUse = { rent: Game.G.land, rice: 0, wheat: 0, veg: 0, fruit: 0 };
    Game.G.fields = {};
    Game.CROPS.forEach(c => { Game.G.fields[c.key] = { lots: [] }; });
    Game.G.market = Game.rollMarket ? Game.rollMarket() : { rice: 0.8, wheat: 0.6, veg: 0.25, fruit: 0.9 };
    Game.G.priceHist = { land: [Game.G.landPrice], rice: [Game.G.market.rice], wheat: [Game.G.market.wheat], veg: [Game.G.market.veg], fruit: [Game.G.market.fruit] };
    Game.G.family.clanFavor = {}; (Game.GREAT_CLANS || []).forEach(t => { Game.G.family.clanFavor[t.key] = rand(t.favor0[0], t.favor0[1]); });
    Game.G.heirId = null;   /* 嗣位：直系后代中指定继承人 */
    Game.G.clanRec = {};
    Game.G.trends = {}; Object.keys(Game.SHOP_TYPES).forEach(k => { Game.G.trends[k] = 1; });
    Game.G.bank = { deposit: 0, loan: 0 };
    Game.G.family.genChar = (genChar || Game.GEN_CHARS[Math.floor(Math.random() * Game.GEN_CHARS.length)]);
    Game.decoratePerson(Game.G.char, null, null);   /* 开家家主的先天资质与禀赋 */
    /* 开局家主即有营生兜底，免得零收入饿死 */
    if (Game.pickJob) Game.G.char.job = Game.pickJob(Game.G.char);
    else Game.G.char.job = "farmhand";
    Game.log(`【${surname}氏立家】${Game.G.char.name}，${gender}，年方十六，田产${Game.G.land}亩，银${Game.G.money}两。定子孙字辈“${Game.G.family.genChar}”。`, "month");
    Game.save();
    return Game.G;
  };

  Game.makeChild = makeChild;
  Game.makeName = makeName;

  /* ---------- 存档 ---------- */
  Game.save = function () {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.G)); } catch (e) {}
  };
  Game.load = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const g = JSON.parse(raw);
      if (!g || g.version !== 1) return null;
      if (!g.academy) g.academy = { teacher: null };
      if (g.autoLand === undefined) g.autoLand = 0;
      if (g.pregnancy === undefined) g.pregnancy = null;
      if (g.cooldown === undefined) g.cooldown = 0;
      if (g.caravans === undefined) g.caravans = [];
      if (g.riteBuff === undefined) g.riteBuff = null;
      if (g.loansOut === undefined) g.loansOut = [];
      if (g.manor === undefined) g.manor = "hut";
      if (g.contacts === undefined) g.contacts = [];
      (g.contacts || []).forEach(ct => {
        if (Game.decoratePerson && !ct.apt) Game.decoratePerson(ct, null, null, false);
      });
      if (!g.family.genChar) g.family.genChar = (Game.GEN_CHARS || ["承"])[Math.floor(Math.random() * (Game.GEN_CHARS || ["承"]).length)];
      if (g.family.genPoem === undefined) g.family.genPoem = null;
      if (g.autoDoctor === undefined) g.autoDoctor = null;
      if (g.branches === undefined) g.branches = [];
      if (g.family.clan === undefined || g.family.clan == null) g.family.clan = 50;
      if (!g.family.clanFavor) { g.family.clanFavor = {}; (Game.GREAT_CLANS || []).forEach(t => { g.family.clanFavor[t.key] = rand(t.favor0[0], t.favor0[1]); }); }
      if (!g.clanRec) g.clanRec = {};
      if (g.steward === undefined) g.steward = null;
      if (g.sowPlan === undefined) g.sowPlan = null;
      if (!g.priceHist) g.priceHist = { land: [], rice: [], wheat: [], veg: [], fruit: [] };
      if (!g.trends) { g.trends = {}; Object.keys(Game.SHOP_TYPES).forEach(k => { g.trends[k] = 1; }); }
      if (!g.bank) g.bank = { deposit: 0, loan: 0 };
      if (!g.history) g.history = [];
      if (!g.family.history || !g.family.history.length) g.family.history = g.history;
      else if (g.family.history.length && !g.history.length) g.history = g.family.history;
      if (!g.spouse) g.pregnancy = null;   /* 旧档无配偶则无身孕 */
      g.locked = false;   /* 读档自动开锁：此前若卡死在此处，进来即恢复 */
      if (g.pendingEvent && !g.char.alive) g.pendingEvent = null;
      /* 旧档说亲对象补字段：缺stats/apt/traits的一律补齐，免得人物卡渲染崩掉连带人际族亲空白 */
      if (Game.decoratePerson) {
        const fixCand = (c) => {
          if (!c) return;
          if (!c.stats) c.stats = { 体力: 50, 智力: 50, 武力: 50, 魅力: 60 };
          ["体力", "智力", "武力", "魅力"].forEach(k => { if (c.stats[k] == null) c.stats[k] = 50; });
          try { Game.decoratePerson(c, null, null, false); } catch (e) {}
        };
        fixCand(g.candidate);
        (g.candidates || []).forEach(fixCand);
      }
      if (g.char) g.char.corruption = 0;   /* 清廉版：旧档贪渎一笔勾销 */
      /* 生育率与嗣位迁移：旧档人人补生育率，新档嗣位默认空 */
      if (g.heirId === undefined) g.heirId = null;
      /* 生月迁移：旧档人人补一个生月（随机），年龄保持不变，此后按生月长岁 */
      if (Game.decoratePerson) {
        const ensureBm = (x) => { if (x && x.bm == null) { try { Game.decoratePerson(x, null, null, false); } catch (e) { x.bm = 1 + Math.floor(Math.random() * 12); } } };
        ensureBm(g.char); ensureBm(g.spouse);
        (g.children || []).forEach(ch => { ensureBm(ch); if (ch.spouse) ensureBm(ch.spouse); });
        (g.contacts || []).forEach(ensureBm);
        (g.royalKids || []).forEach(ensureBm);
      }
      if (Game.decoratePerson) {
        [g.char, g.spouse].forEach(x => { if (x && x.fertility == null && !x.infertile) { try { Game.decoratePerson(x, null, null, false); } catch (e) {} } });
        (g.children || []).forEach(ch => {
          if (ch.fertility == null && !ch.infertile) { try { Game.decoratePerson(ch, null, null, false); } catch (e) {} }
          if (ch.spouse && ch.spouse.fertility == null && !ch.spouse.infertile) { try { Game.decoratePerson(ch.spouse, null, null, false); } catch (e) {} }
        });
      }
      /* 迁移旧档：单一产业折算为一间铺号 */
      if (g.business && !g.shops) {
        const map = { "古董商": "antique", "丝绸商": "silk", "畜牧业": "butcher" };
        const type = map[g.business.name] || "pastry";
        g.shops = [{ id: "s" + Date.now(), type, fame: 50, months: 0, lastProfit: g.business.lastProfit || 0 }];
        delete g.business;
      }
      if (!g.shops) g.shops = [];
      if (!g.house) g.house = { rooms: 3 };
      if (!g.granary) g.granary = { rice: 0, wheat: 0, veg: 0, fruit: 0 };
      if (!g.landUse) g.landUse = { rent: g.land || 0, rice: 0, wheat: 0, veg: 0, fruit: 0 };
      if (!g.market) g.market = { rice: 0.8, wheat: 0.6, veg: 0.25, fruit: 0.9 };
      if (Game.migrateFields) Game.migrateFields(g);   /* 旧档补在田作物，纳入农时 */
      /* 旧档补父母名：有parentId按生父查，无则按称谓推（子辈归现任家主，余者不详） */
      (g.children || []).forEach(ch => {
        if (ch.fatherName === undefined) {
          if (ch.parentId) {
            const pp = (g.children || []).find(x => x.id === ch.parentId);
            if (pp) {
              ch.fatherName = pp.gender === "男" ? pp.name : ((pp.spouse && pp.spouse.joined) ? pp.spouse.name : "不详");
              ch.motherName = pp.gender === "女" ? pp.name : ((pp.spouse && pp.spouse.joined) ? pp.spouse.name : "不详");
            } else { ch.fatherName = "不详"; ch.motherName = "不详"; }
          } else if (ch.relation === "子" || ch.relation === "女" || !ch.relation) {
            ch.fatherName = g.char.gender === "男" ? g.char.name : ((g.spouse && g.spouse.name) || "不详");
            ch.motherName = g.char.gender === "女" ? g.char.name : ((g.spouse && g.spouse.name) || "不详");
          } else if (ch.relation === "兄" || ch.relation === "弟" || ch.relation === "姊" || ch.relation === "妹") {
            const prev = (g.history && g.history.length) ? g.history[g.history.length - 1] : null;
            ch.fatherName = (prev && prev.name) || "不详";
            ch.motherName = (prev && prev.spouse) || "不详";
          } else { ch.fatherName = ch.fatherName || "不详"; ch.motherName = ch.motherName || "不详"; }
        }
        if (ch.fatherName === undefined) ch.fatherName = "不详";
        if (ch.motherName === undefined) ch.motherName = "不详";
      });
      if (g.char && g.char.fatherName === undefined) {
        g.char.fatherName = (g.gen <= 1) ? "不知道" : ((g.history && g.history.length && g.history[g.history.length-1].name) || "不详");
        g.char.motherName = (g.gen <= 1) ? "不知道" : ((g.history && g.history.length && g.history[g.history.length-1].spouse) || "不详");
      }
      /* 旧档族人补职业、功名字段，并补先天资质与禀赋 */
      if (g.char && Game.decoratePerson) Game.decoratePerson(g.char, null, null, false);
      (g.children || []).forEach(ch => {
        /* 旧档已出嫁女迁出户口：不再计口粮月耗、不承祧 */
        if (ch.gender === "女" && ch.married && !ch.palace && !ch.uxori && !ch.out) ch.out = "married";
        if (ch.title === undefined) ch.title = null;
        if (ch.job === undefined && ch.alive && ch.age >= 16) ch.job = Game.pickJob ? Game.pickJob(ch) : "farmhand";
        if (Game.decoratePerson && ch.alive) Game.decoratePerson(ch, g.char, g.spouse, false);
        delete ch.talent;   /* 旧版 0~2 资质字段废弃 */
      });
      if (g.spouse) {
        if (g.spouse.title === undefined) g.spouse.title = null;
        if (g.spouse.favor === undefined || g.spouse.favor == null) g.spouse.favor = 65;
        if (g.spouse.job === undefined) g.spouse.job = Game.pickJob ? Game.pickJob(g.spouse) : "farmhand";
        if (Game.decoratePerson) Game.decoratePerson(g.spouse, null, null, false);
        delete g.spouse.talent;
      }
      if (g.char) delete g.char.talent;
      /* 旧档家主补营生，子女补职业 */
      if (g.char && !g.char.office && !g.char.job && Game.pickJob) g.char.job = Game.pickJob(g.char);
      Game.G = g;
      return g;
    } catch (e) { return null; }
  };
  Game.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };
  Game.clearSave = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  };

  /* ---------- 存档导入导出（换手机/备份，base64单行码） ---------- */
  Game.exportSave = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return "";
      return btoa(unescape(encodeURIComponent(raw)));
    } catch (e) { return ""; }
  };
  Game.importSave = function (code) {
    try {
      code = (code || "").trim().replace(/\s+/g, "");
      if (!code) return { ok: false, msg: "请先粘贴存档码。" };
      const raw = decodeURIComponent(escape(atob(code)));
      const g = JSON.parse(raw);
      if (!g || g.version !== 1 || !g.char || !g.surname) return { ok: false, msg: "存档码不对，读不出来。" };
      try { localStorage.setItem(SAVE_KEY, raw); } catch (e) {}
      const loaded = Game.load();
      if (!loaded) return { ok: false, msg: "存档太旧或已损坏，读不出来。" };
      return { ok: true };
    } catch (e) { return { ok: false, msg: "存档码不对，读不出来。" }; }
  };

  /* ---------- 家族最佳纪录 ---------- */
  Game.getBest = function () {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || null; } catch (e) { return null; }
  };
  Game.recordBest = function (summary) {
    try {
      const old = Game.getBest();
      const score = (s) => (s.gen || 0) * 1000 + (s.peakRep || 0);
      if (!old || score(summary) > score(old)) {
        localStorage.setItem(BEST_KEY, JSON.stringify(summary));
      }
    } catch (e) {}
  };
})();
