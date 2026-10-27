/* ============================================================
 * 百年宗谱 · 先天资质与禀赋词条
 * 资质 aptitude：四维各 1~100，决定该项「学习 / 成长倍率」（=天赋/100）
 * 词条 traits：与生俱来，可遗传、可罕见突变；同组互斥
 * ============================================================ */
(function () {
  "use strict";
  const Game = window.Game || (window.Game = {});
  const { rand, clamp, chance } = Game.U;

  const STATS = ["体力", "智力", "武力", "魅力"];

  /* 天赋即成长倍率：60→0.6，90→0.9；留 0.15 下限免得庸才寸步不进 */
  Game.aptOf = function (p, key) { return (p && p.apt && p.apt[key]) || 50; };
  Game.aptMul = function (p, key) { return clamp(Game.aptOf(p, key) / 100, 0.15, 1.2); };

  /* ============================================================
   * 词条表
   * group: 互斥组（同组只留 power 最高者）；rarity 越高越稀有
   * inherit: 不写则按稀有度 r1=.5 r2=.4 r3=.3 r4=.2
   * mutate: 自然降生概率（稀有者多为万分之一）；spawn: 寻常禀赋的随机概率
   * born(p): 出生即改写属性；growth: 各项成长倍率
   * ============================================================ */
  Game.TRAITS = [
    /* ---- 性情 ---- */
    { key: "diligent", name: "勤劳", group: "temper", rarity: 1, power: 1, spawn: 0.14,
      growth: { 体力: 1.08, 智力: 1.08, 武力: 1.08, 魅力: 1.08 },
      desc: "夙兴夜寐，凡事肯下笨功夫，进境稳而不辍。" },
    { key: "lazy", name: "怠惰", group: "temper", rarity: 1, power: -1, bad: true, spawn: 0.08,
      growth: { 体力: 0.85, 智力: 0.82, 武力: 0.82, 魅力: 0.9 },
      desc: "好逸恶劳，诸事提不起劲，长进总要慢人一截。" },

    /* ---- 天资 ---- */
    { key: "prodigy", name: "天赋异禀", group: "wit", rarity: 3, power: 30, mutate: 1 / 3000,
      growth: { 体力: 1.2, 智力: 1.3, 武力: 1.2, 魅力: 1.2 },
      born: p => { STATS.forEach(k => add(p, k, 6)); },
      desc: "生而神明，四维皆有过人之资，万中无一。" },
    { key: "quickmind", name: "过目成诵", group: "wit", rarity: 1, power: 10, spawn: 0.035,
      growth: { 智力: 1.28 }, born: p => add(p, "智力", 8),
      desc: "读书一目十行、过目不忘，治学事半功倍。" },
    { key: "dull", name: "鲁钝", group: "wit", rarity: 1, power: -10, bad: true, spawn: 0.05,
      growth: { 智力: 0.62 }, born: p => add(p, "智力", -10),
      desc: "天资昏钝，经书读十遍仍如隔云雾。" },

    /* ---- 体魄 / 勇力 ---- */
    { key: "hercules", name: "力拔山兮", group: "physique", rarity: 4, power: 40, mutate: 1 / 3000,
      growth: { 体力: 1.28, 武力: 1.3 }, born: p => { add(p, "体力", 32); add(p, "武力", 26); },
      desc: "生而膂力惊人，扛鼎拔山，世之虎臣，万中无一。" },
    { key: "mighty", name: "力能扛鼎", group: "physique", rarity: 3, power: 30, mutate: 1 / 3000,
      growth: { 体力: 1.18, 武力: 1.2 }, born: p => { add(p, "体力", 20); add(p, "武力", 16); },
      desc: "筋骨奇伟，力能扛鼎，舞刀弄棒一学便会。" },
    { key: "strong", name: "孔武有力", group: "physique", rarity: 1, power: 10, spawn: 0.05,
      growth: { 体力: 1.08, 武力: 1.1 }, born: p => { add(p, "体力", 10); add(p, "武力", 8); },
      desc: "天生一把好力气，身子结实，弓马易成。" },
    { key: "frail", name: "体弱多病", group: "physique", rarity: 1, power: -10, bad: true, spawn: 0.05,
      growth: { 体力: 0.72, 武力: 0.8 }, born: p => add(p, "体力", -14),
      sick: 1.8,
      desc: "胎里不足，自幼汤药不离，气力难养。" },

    /* ---- 容貌（同组互斥，极美者与丑陋不两立） ---- */
    { key: "stunning",
      name: { 男: "潘安再世", 女: "倾国倾城" }, group: "looks", rarity: 4, power: 40, mutate: 1 / 3000,
      growth: { 魅力: 1.18 }, born: p => add(p, "魅力", 34),
      desc: "容色照人，见者无不心折，真乃倾国之姿，万中无一。" },
    { key: "handsome",
      name: { 男: "英俊潇洒", 女: "明艳动人" }, group: "looks", rarity: 2, power: 20, spawn: 0.008,
      growth: { 魅力: 1.12 }, born: p => add(p, "魅力", 22),
      desc: "眉目如画、气度翩翩，远近皆称好人物。" },
    { key: "fair",
      name: { 男: "眉目清朗", 女: "小家碧玉" }, group: "looks", rarity: 1, power: 10, spawn: 0.045,
      growth: { 魅力: 1.06 }, born: p => add(p, "魅力", 12),
      desc: "五官端正、清秀可人，自有一段可亲之处。" },
    { key: "ugly", name: "貌陋", group: "looks", rarity: 1, power: -20, bad: true, spawn: 0.025,
      growth: { 魅力: 0.5 }, born: p => add(p, "魅力", -16),
      desc: "生来貌寝，修饰亦难增色；养取魅力更是事倍功半。" }
  ];

  Game.TRAIT_MAP = {};
  Game.TRAITS.forEach(t => { Game.TRAIT_MAP[t.key] = t; });

  function add(p, k, v) { p.stats[k] = clamp((p.stats[k] || 30) + v, 5, 96); }
  Game.traitName = function (key, gender) {
    const d = Game.TRAIT_MAP[key];
    if (!d) return key;
    return typeof d.name === "string" ? d.name : (d.name[gender || "男"] || d.name.男);
  };
  Game.traitDef = key => Game.TRAIT_MAP[key] || null;
  Game.hasTrait = function (p, key) { return !!(p && p.traits && p.traits.indexOf(key) >= 0); };

  const inheritP = d => d.inherit != null ? d.inherit : (0.6 - d.rarity * 0.1);

  /* 掷一人的词条：先承父母（按稀有度，越罕越不易承），再看自然降生 / 突变 */
  function rollTraits(a, b) {
    const picked = {};   // group -> key
    const loose = [];    // 无组词条
    function admit(key, fromInherit) {
      const d = Game.TRAIT_MAP[key];
      if (!d) return;
      if (d.group) {
        const old = picked[d.group];
        if (!old || Game.TRAIT_MAP[old].power < d.power) picked[d.group] = key;
      } else if (loose.indexOf(key) < 0) loose.push(key);
    }
    Game.TRAITS.forEach(d => {
      /* 遗传：父母各自独立掷承袭（非百分百），双亲同有则机会叠加 */
      let inherited = false;
      if (a && Game.hasTrait(a, d.key) && chance(inheritP(d))) inherited = true;
      if (!inherited && b && Game.hasTrait(b, d.key) && chance(inheritP(d))) inherited = true;
      if (inherited) admit(d.key, true);
      /* 自然降生：稀有词条三千取一（原万中取一），寻常禀赋按 spawn；寺庙祈福加成稀有 */
      let pNat = d.mutate != null ? d.mutate : (d.rarity >= 3 ? 0 : (d.spawn || 0));
      if (d.mutate != null && Game.G && Game.G.blessing && Game.G.blessing.months > 0) {
        const mul = (Game.PRAY_TIER_MUL || [])[Game.G.blessing.tier] || 1;
        pNat *= mul;
      }
      if (pNat > 0 && chance(Math.min(0.5, pNat))) admit(d.key, false);
    });
    return Object.values(picked).concat(loose);
  }

  /* 掷一项天赋（1~100），常人居中，英才与驽钝皆少见 */
  function rollApt() {
    /* 祈福所生天赋另有加成（+5/+10/+15），封顶100 */
    const bonus = (Game.G && Game.G.blessing && Game.G.blessing.months > 0)
      ? ((Game.PRAY_TIER_APT || [])[Game.G.blessing.tier] || 0) : 0;
    const cap = v => Math.min(100, v + bonus);
    const r = Math.random();
    if (r < 0.05) return cap(rand(82, 98));
    if (r < 0.18) return cap(rand(68, 82));
    if (r < 0.82) return cap(rand(40, 70));
    if (r < 0.95) return cap(rand(22, 42));
    return cap(rand(8, 24));
  }

  /* 为一个 stats 已 roll 好的人补全天赋、词条；applyBorn 时一并应用出生禀赋
     （新生与开家用 true，旧档迁移补字段用 false，免得给成年人凭空涨属性） */
  /* 生育率 1~100：人人有之，隐于体质；受孕看夫妻双方，难产可伤之 */
  Game.rollFertility = function () {
    let f = rand(20, 90);
    const r = Math.random();
    if (r < 0.05) f = rand(1, 19);
    else if (r < 0.10) f = rand(91, 100);
    return f;
  };
  Game.fertilityOf = function (p) {
    if (!p) return 50;
    if (p.infertile) return 0;
    if (p.fertility == null) return 50;
    return p.fertility;
  };
  Game.fertilityWord = function (p) {
    const f = Game.fertilityOf(p);
    if (p && p.infertile) return "难有孕";
    if (f >= 85) return "极易得子";
    if (f >= 65) return "旺盛";
    if (f >= 40) return "平常";
    if (f >= 25) return "偏弱";
    return "艰难";
  };
  /* 生月 1~12：年龄按年月算，逢生月满一岁；寿宴须生辰月办 */
  Game.birthTxt = function (p) {
    if (!p) return "";
    const bm = p.bm || 1;
    return p.bornY != null ? `生于第${p.bornY}年${bm}月` : `${bm}月生人`;
  };
  Game.decoratePerson = function (p, a, b, applyBorn) {
    if (!p) return p;
    if (p.bm == null) p.bm = rand(1, 12);
    if (p.fertility == null && !p.infertile) p.fertility = Game.rollFertility();
    if (applyBorn == null) applyBorn = true;
    if (!p.apt) {
      p.apt = {};
      STATS.forEach(k => { p.apt[k] = rollApt(); });
    }
    if (!p.traits) p.traits = rollTraits(a || null, b || null);
    if (applyBorn) {
      (p.traits || []).forEach(key => {
        const d = Game.TRAIT_MAP[key];
        if (d && d.born) d.born(p);
      });
    }
    return p;
  };

  /* 一次属性成长：先乘天赋倍率，再乘所有相关词条倍率，结算并 clamp */
  Game.gainStat = function (p, key, base, hi) {
    if (!p || !p.stats) return 0;
    let mul = Game.aptMul(p, key);
    (p.traits || []).forEach(tk => {
      const d = Game.TRAIT_MAP[tk];
      if (d && d.growth && d.growth[key]) mul *= d.growth[key];
    });
    const inc = Math.round(base * mul);
    p.stats[key] = clamp((p.stats[key] || 0) + inc, 0, hi == null ? 100 : hi);
    return inc;
  };

  /* 家主疾病率受「体弱多病」之类词条影响 */
  Game.sickMul = function (p) {
    let m = 1;
    (p && p.traits || []).forEach(k => { const d = Game.TRAIT_MAP[k]; if (d && d.sick) m *= d.sick; });
    return m;
  };

  /* 出生时值得在日志里昭告一声的禀赋（稀有方报，寻常不扰） */
  Game.notableBirthTraits = function (p) {
    return (p.traits || []).map(Game.traitDef).filter(d => d && d.rarity >= 2);
  };
})();
