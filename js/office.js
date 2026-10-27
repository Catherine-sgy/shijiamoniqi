/* ============================================================
 * 百年宗谱 · 仕途系统
 * 政绩（merit）+ 两方清望（士绅/百姓）：当清官，靠政绩民望升迁
 * 宗族事归宗族情分（族亲页）：祭祖寿宴皆添宗族情分
 * 断案差事：选项带胜算与立场，按属性、关系加成判成败
 * ============================================================ */
(function () {
  "use strict";
  const Game = window.Game;
  const { rand, clamp, pick, chance } = Game.U;

  const RELS = [];   /* 官场人际已删：唯政绩论升迁 */
  Game.REL_DEFS = RELS;
  Game.REL_NAME = RELS.reduce((m, r) => { m[r.key] = r.name; return m; }, {});

  const START_REL = 50;   /* 关系已删，仅宗族情分另计 */

  Game.freshRel = function () {
    return {};
  };

  /* 升迁所需政绩：品秩越高，所积越厚 */
  Game.PROMO_MERIT = function (grade) { return 50 + grade * 6; };

  /* 旧档 / 族人授官补全仕途字段 */
  Game.ensureOfficeState = function (g) {
    const o = g.char && g.char.office;
    if (!o) return;
    if (typeof o.merit !== "number") o.merit = 0;
    o.rel = {};
  };

  const rep = (n) => {
    const fam = Game.G.family;
    fam.reputation = Math.max(0, fam.reputation + n);
    fam.peakReputation = Math.max(fam.peakReputation, fam.reputation);
  };
  const relOf = (g) => g.char.office.rel;
  Game.adjustRel = function (g, delta) {
    const r = relOf(g);
    Object.keys(delta || {}).forEach(k => {
      if (k === "kin") {   /* 亲族事归宗族情分（族亲页） */
        g.family.clan = clamp((g.family.clan == null ? 50 : g.family.clan) + delta[k], 0, 100);
        return;
      }
      if (typeof r[k] === "number") r[k] = clamp(r[k] + delta[k], 0, 100);
    });
  };

  /* ---------------- 月度：关系向中回归 + 一方祸福 ---------------- */
  function driftRel(g) {
    /* 官场人际已删，无需回弹 */
  }

  /* 每月至多触发一桩关系祸福；cond 成立且掷中 p 方发生 */
  /* 官场人际事件已删：每月只看政绩 */
  const FACTION_TICKS = [];

  Game.officeMonthly = function (g) {
    Game.ensureOfficeState(g);
    if (!g.char.office) return;
    driftRel(g);
    for (const t of FACTION_TICKS) {
      if (t.cond(g) && chance(t.p)) {
        const r = t.run(g);
        if (r) Game.log(r.t, r.c);
        break;
      }
    }
  };


  /* ---------------- 断案 / 差事事件 ----------------
   * p：基础胜算；stat 为主属性（断案看智力，剿捕看武力，劝说看魅力），属性越高胜算越高
   * win/lose：{ merit, rep, money, rel:{}, log, cls } */
  const CASES = [
    { id: "murder", track: "civil", w: 6,
      title: "枯井疑尸",
      text: "城中枯井捞出一具无名男尸，尸亲指认富户赵某谋财害命，赵却大呼冤枉，供词反复。",
      options: [
        { label: "亲诣勘验，依证据细鞫（看智力）", p: 0.62, stat: "智力",
          win:  { merit: 13, rep: 6, rel: { people: 7, gentry: -2 }, log: "凭勘验所得真凶伏法，阖城称明，政绩、民望俱增。", cls: "good" },
          lose: { merit: 1, rep: -3, rel: { people: -3 }, log: "线索断绝，拖延成积案，物议纷纷。", cls: "bad" } },
        { label: "严刑取供，早日结案（看武力）", p: 0.55, stat: "武力",
          win:  { merit: 7, rep: -2, rel: { people: -4 }, log: "三木之下即刻招认，案牍速结，上官喜你干练，民间却有惨刻之议。", cls: "" },
          lose: { merit: -4, rep: -7, rel: { people: -8 }, log: "屈打成招，后真凶他处落网，上司行文申饬。", cls: "bad" } },
        { label: "退回谢礼，秉公论断（拒贿守正 · 看智力）", p: 0.62, stat: "智力",
          win:  { merit: 8, rep: 5, rel: { gentry: -4, people: 6 }, log: "谢礼原封退回，依律剖断，真凶伏法。士绅虽失了颜面，民间却传你不受贿赂。", cls: "good" },
          lose: { merit: -3, rep: 2, rel: { gentry: -5 }, log: "铁面论断，富户怀恨，往后办事掣肘渐多。", cls: "bad" } }
      ] },
    { id: "taxarrears", track: "civil", w: 6,
      title: "豪右逋赋",
      text: "本县几大姓连年拖欠赋税，反将田产诡寄飞洒于贫户，小民苦不堪言。",
      options: [
        { label: "按亩清丈，严惩首恶（看智力）", p: 0.58, stat: "智力",
          win:  { merit: 14, rep: 5, money: 20, rel: { people: 9, gentry: -10 }, log: "清出隐田万顷，逋赋足额，百姓呼为父母。", cls: "good" },
          lose: { merit: -3, rep: -2, rel: { gentry: -8, people: 3 }, log: "豪右联名抗粮、上京钻营，反劾你「扰民滋事」。", cls: "bad" } },
        { label: "宽限时日，婉劝士绅纳粮（看魅力）", p: 0.58, stat: "魅力",
          win:  { merit: 6, rel: { gentry: 6, people: -3 }, log: "士绅感念体面，陆续完纳，上下相安。", cls: "" },
          lose: { merit: -2, rel: { gentry: 1, people: -4 }, log: "大户一味拖延，赋税仍亏，考成难免受拖累。", cls: "bad" } },
        { label: "摊于阖县，限期追比（看武力）", p: 0.72, stat: "武力",
          win:  { merit: 5, rel: { people: -7 }, log: "赋税如期征足，然鞭扑盈庭，民有菜色。", cls: "" },
          lose: { merit: -5, rep: -6, rel: { people: -10 }, log: "追比太急，贫户逃亡过半，户口大减。", cls: "bad" } }
      ] },
    { id: "famine-relief", track: "civil", w: 5,
      title: "属邑告灾",
      text: "辖下连月不雨，禾苗尽槁，流民渐聚县城。开仓放粮的文书往返尚需时日。",
      options: [
        { label: "便宜开仓，先发后闻（看智力 · 担罪）", p: 0.6, stat: "智力",
          win:  { merit: 10, rep: 8, rel: { people: 10, gentry: -3 }, log: "全活饥民无算，监司原其专擅之罪而嘉其仁。", cls: "good" },
          lose: { merit: -6, rep: 2, rel: { people: 5 }, log: "擅动仓廪被参，幸民颂其德，薄罪留任。", cls: "bad" } },
        { label: "严守成例，候旨再赈", p: 0.8,
          win:  { merit: 3, rel: { people: -5 }, log: "公文往来月余，虽无过失，路已多有饿殍。", cls: "" },
          lose: { merit: -4, rep: -5, rel: { people: -9 }, log: "等候批文期间流民骚动，朝廷责你赈济无方。", cls: "bad" } },
        { label: "劝士绅输粟赈灾（看魅力）", p: 0.52, stat: "魅力",
          win:  { merit: 8, rep: 4, rel: { gentry: 6, people: 5 }, log: "富户在你劝导下开仓平粜，官民两济。", cls: "good" },
          lose: { merit: -1, rel: { gentry: -3, people: -2 }, log: "士绅吝粟，应者寥寥，赈灾形同虚设。", cls: "bad" } }
      ] },
    { id: "clan-feud", track: "civil", w: 4,
      title: "两姓械斗",
      text: "境内两大族争一处山场，聚众持械相斗，已有死伤，族人亦携礼登门求你照应。",
      options: [
        { label: "执法不阿，严惩双方首恶（看武力）", p: 0.6, stat: "武力",
          win:  { merit: 11, rep: 4, rel: { people: 4, kin: -8, gentry: -3 }, log: "兵到擒魁，剖断山场，积斗遂息，惟本族怪你不近亲情。", cls: "good" },
          lose: { merit: -3, rel: { kin: -6, people: -3 }, log: "两姓恃众拒捕，险些激成大变。", cls: "bad" } },
        { label: "谢绝请托，秉公剖断（拒贿守正 · 看智力）", p: 0.58, stat: "智力",
          win:  { merit: 8, rep: 4, rel: { kin: -4, people: 5, gentry: 2 }, log: "说项原封退回，依山场旧契剖断，两姓具服。族中虽有人嘀咕，外间赞你不徇私。", cls: "good" },
          lose: { merit: -2, rep: 2, rel: { kin: -6 }, log: "铁面剖断，两姓都不讨好，族中颇有怨言。", cls: "bad" } },
        { label: "请乡绅耆老居中调解（看魅力）", p: 0.58, stat: "魅力",
          win:  { merit: 6, rel: { gentry: 5, people: 2 }, log: "化干戈为玉帛，两姓具结息讼。", cls: "" },
          lose: { merit: 0, rel: { gentry: -2 }, log: "调解不成，械斗复起，还得用兵弹压。", cls: "bad" } }
      ] },

    { id: "kin-plea", w: 5,
      title: "亲族请托",
      text: "表叔为一桩盐案登门求你通融，言称一笔写不出两个姓氏，宗族长辈亦在旁说情。",
      options: [
        { label: "退回谢礼，依法论断（拒贿守正 · 看智力）", p: 0.62, stat: "智力",
          win:  { merit: 6, rep: 5, rel: { kin: -3, people: 5, gentry: 3 }, log: "谢礼原封退回，表叔依律论罪。族中虽有人嘀咕，外间却赞你大义不徇私。", cls: "good" },
          lose: { merit: -2, rep: 2, rel: { kin: -6 }, log: "铁面无私，表叔衔恨，族中几房颇有怨言。", cls: "bad" } },
        { label: "晓以国法，赠银而不许（看魅力）", p: 0.72, stat: "魅力",
          win:  { merit: 4, rep: 3, rel: { kin: 4, people: 2 }, log: "自掏俸银接济，却不改一字卷宗，族中人也敬你公私分明。", cls: "good" },
          lose: { merit: 0, rel: { kin: -7 }, log: "表叔愤愤而去，骂你「一朝得意便不认亲」。", cls: "bad" } }
      ] },
    { id: "bandit-campaign", track: "military", w: 6,
      title: "巨匪据山",
      text: "一伙剧盗盘踞山砦，屡败官军，劫掠行旅，上峰限期剿平。",
      options: [
        { label: "选锋夜袭，强攻捣巢（看武力）", p: 0.6, stat: "武力",
          win:  { merit: 15, rep: 7, money: 15, rel: { people: 6, gentry: 2 }, log: "一战破砦，擒斩匪首，捷报朝廷，议功行赏。", cls: "good" },
          lose: { merit: -6, rep: -3, log: "仰攻失利，损兵折将，朝廷切责。", cls: "bad" } },
        { label: "围而不攻，招抚归顺（看智力）", p: 0.58, stat: "智力",
          win:  { merit: 9, rep: 3, rel: { people: 4 }, log: "断其粮道，匪众内讧出降，兵不血刃而定。", cls: "good" },
          lose: { merit: -3, rel: { people: -3 }, log: "匪众诈降，突围复叛，地方反受其害。", cls: "bad" } },
        { label: "诿过邻境，按兵自保", p: 0.5,
          win:  { merit: -2, rel: { people: -6, gentry: -3 }, log: "匪患推给邻封，你境暂保无事，清议却讥你养寇。", cls: "bad" },
          lose: { merit: -8, rep: -5, rel: { people: -5 }, log: "坐视匪势坐大，终以玩寇罪名被参。", cls: "bad" } }
      ] },
    { id: "mutiny-pay", track: "military", w: 4,
      title: "营兵哗饷",
      text: "边营已三月未发军饷，军心浮动，几个什长暗地鼓噪，哗变只在旦夕。",
      options: [
        { label: "先借官绅之银发饷，再据实申报（看魅力）", p: 0.58, stat: "魅力",
          win:  { merit: 12, rep: 4, money: -10, rel: { people: 6, gentry: 5 }, log: "军心得安，又据实陈奏，朝廷嘉你应变，所借如数拨还。", cls: "good" },
          lose: { merit: -3, money: -10, rel: { gentry: -3 }, log: "借来的银子杯水车薪，士绅又催还，左右为难。", cls: "bad" } },
        { label: "诛一儆百，以军令弹压（看武力）", p: 0.55, stat: "武力",
          win:  { merit: 6, rel: { people: -5 }, log: "立斩鼓噪者三人，营中肃然，到底隐患未除。", cls: "" },
          lose: { merit: -10, rep: -6, rel: { people: -8 }, log: "弹压激变，乱兵夜焚营门，几成大患。", cls: "bad" } }
      ] },
    /* —— 新增：为民实事，多攒政绩 —— */
    { id: "dike-works", track: "civil", w: 5,
      title: "修堤御水",
      text: "汛期将至，境内江堤多处残破，往年每遇大水便淹没良田无数。",
      options: [
        { label: "亲勘水势，定工督修（看智力）", p: 0.6, stat: "智力",
          win:  { merit: 12, rep: 6, log: "堤固水顺，安澜无虞，百姓立碑记你的功绩。", cls: "good" },
          lose: { merit: -3, rep: -2, log: "工段估算有误，险段遗漏，汛后只得补修。", cls: "bad" } },
        { label: "捐俸倡修，劝众共举（看魅力）", p: 0.58, stat: "魅力",
          win:  { merit: 10, rep: 7, money: -15, log: "你先捐一年俸银，阖县响应，堤成之日万人相庆。", cls: "good" },
          lose: { merit: -2, money: -15, log: "俸银捐了，应者寥寥，工程草草收场。", cls: "bad" } },
        { label: "虚报完工，粉饰考成", p: 0.7,
          win:  { merit: 2, log: "文书上堤工「一律完固」，侥幸汛期水小，蒙混过关。", cls: "" },
          lose: { merit: -10, rep: -8, log: "大水一到残堤尽溃，田庐漂没，上司严参你欺饰。", cls: "bad" } }
      ] },
    { id: "farm-drive", track: "civil", w: 5,
      title: "劝课农桑",
      text: "开春在即，去年灾后多有荒田，牛种俱缺，农户无力下种。",
      options: [
        { label: "逐乡劝耕，借给牛种（看魅力）", p: 0.6, stat: "魅力",
          win:  { merit: 11, rep: 6, money: -10, log: "官借牛种、贷发籽粒，秋后丰收，家家有余粮。", cls: "good" },
          lose: { merit: -2, money: -10, log: "借出的牛种多被转卖，劝耕成了空文。", cls: "bad" } },
        { label: "清丈荒田，招垦均分（看智力）", p: 0.58, stat: "智力",
          win:  { merit: 12, rep: 5, log: "荒田尽数入册，流民授田安业，赋额反增。", cls: "good" },
          lose: { merit: -4, rep: -2, log: "丈量引发田界纠纷，招垦之事一拖再拖。", cls: "bad" } }
      ] },
    { id: "village-school", track: "civil", w: 4,
      title: "兴办社学",
      text: "乡间子弟多失学，几个老秀才联名请你出面办一所社学。",
      options: [
        { label: "聘请名师，定学规课读（看智力）", p: 0.6, stat: "智力",
          win:  { merit: 10, rep: 7, log: "社学开讲，弦歌之声遍于乡野，教化大行。", cls: "good" },
          lose: { merit: -2, log: "所聘名师徒有虚名，学童散去大半。", cls: "bad" } },
        { label: "捐俸置学田，以赡师生（看魅力）", p: 0.58, stat: "魅力",
          win:  { merit: 9, rep: 6, money: -20, log: "学田岁入足以供束脩膏火，寒门子弟也能读书。", cls: "good" },
          lose: { merit: -1, money: -20, log: "学田被经手人侵吞，查办时已无从追回。", cls: "bad" } }
      ] },
    { id: "locust-fight", track: "civil", w: 5,
      title: "飞蝗蔽日",
      text: "邻县蝗蝻已经起飞，遮天蔽日而来，本县秋粮危在旦夕。",
      options: [
        { label: "悬赏捕打，身先士卒（看武力）", p: 0.6, stat: "武力",
          win:  { merit: 12, rep: 6, money: -8, log: "你亲率丁壮设网捕打，三日而蝗尽，秋粮保全。", cls: "good" },
          lose: { merit: -5, rep: -3, log: "蝗群势大，捕打不及，田禾被啃去大半。", cls: "bad" } },
        { label: "调度有方，掘壕设防（看智力）", p: 0.58, stat: "智力",
          win:  { merit: 11, rep: 5, log: "深壕御道、火燎烟熏，蝗不敢落，全县独收。", cls: "good" },
          lose: { merit: -4, log: "调度稍迟，蝗已落地，补救为时已晚。", cls: "bad" } }
      ] },
    { id: "cold-case", track: "civil", w: 4,
      title: "陈年冤狱",
      text: "一老妇击鼓鸣冤：其子十年前以盗罪问斩，她坚称儿子冤枉，历年上告无门。",
      options: [
        { label: "调卷复勘，还无辜清白（看智力）", p: 0.55, stat: "智力",
          win:  { merit: 13, rep: 8, log: "真凶认罪伏法，十年冤狱昭雪，老妇哭拜，你名动一方。", cls: "good" },
          lose: { merit: -3, rep: -2, log: "旧卷残缺难考，只得维持原判，老妇哭声令人不忍。", cls: "bad" } },
        { label: "发还州县重审", p: 0.75,
          win:  { merit: 3, log: "案子推回原衙门，不出错也不立功。", cls: "" },
          lose: { merit: -4, rep: -3, log: "推诿之状传出，清议讥你不肯担当。", cls: "bad" } }
      ] },
    { id: "plague-relief", track: "civil", w: 4,
      title: "时疫流行",
      text: "城外流民中起了时疫，已蔓延进城，药铺的药材一夜涨了三倍。",
      options: [
        { label: "设厂施药，隔离救治（看智力）", p: 0.6, stat: "智力",
          win:  { merit: 12, rep: 7, money: -12, log: "分厂收治、施药防疫，旬日疫情平息，百姓感恩。", cls: "good" },
          lose: { merit: -5, rep: -2, money: -12, log: "隔离稍有疏漏，疫情蔓延，费尽气力才压住。", cls: "bad" } },
        { label: "平价发药，亲慰病坊（看魅力）", p: 0.58, stat: "魅力",
          win:  { merit: 10, rep: 8, money: -10, log: "你亲入病坊慰问，奸商不敢居奇，民心大定。", cls: "good" },
          lose: { merit: -2, rep: 2, money: -10, log: "药材终究不济，虽得民心，病亡仍多。", cls: "bad" } }
      ] }
  ];

  function runOption(g, l, opt) {
    if (!g.char.office) return;            /* 弹窗期间官身已变（如岁考），安全放弃 */
    Game.ensureOfficeState(g);
    let p = typeof opt.p === "function" ? opt.p(g) : opt.p;
    const o = g.char.office;
    /* 人情加成已删：唯才是举 */
    if (opt.stat) p += ((g.char.stats[opt.stat] || 50) - 50) * 0.008;   /* 本事说了算 */
const _raw = chance(clamp(p, 0.05, 0.97)) ? opt.win : opt.lose;
    const res = Object.assign({}, _raw);
    if (res.rel) res.rel = Object.assign({}, res.rel);
    /* 清廉版：差事办砸足额承担，不再有宫中递话从轻 */
    if (typeof res.merit === "number") o.merit = Math.max(0, o.merit + res.merit);
    if (typeof res.rep === "number") rep(res.rep);
    if (typeof res.money === "number") g.money = Math.max(0, g.money + res.money);
    if (res.rel) Game.adjustRel(g, res.rel);
    l(res.log, res.cls || "");
  }

  Game.rollOfficeCase = function (g) {
    Game.ensureOfficeState(g);
    if (!g.char.office) return null;
    if (!chance(0.34)) return null;
    const track = g.char.office.track;
    const pool = CASES.filter(c => !c.track || c.track === track);
    if (!pool.length) return null;
    const total = pool.reduce((s, c) => s + (c.w || 5), 0);
    let r = Math.random() * total;
    let chosen = pool[0];
    for (const c of pool) { r -= (c.w || 5); if (r <= 0) { chosen = c; break; } }
    return {
      career: true,
      build: () => ({
        title: chosen.title,
        text: chosen.text,
        choices: chosen.options.map(opt => ({
          label: opt.label,
          act: (l) => runOption(g, l, opt)
        }))
      })
    };
  };

  /* ---------------- 岁末考绩：政绩 + 奥援定升迁 ---------------- */
  /* 子弟考课：与家主同阈值 PROMO_MERIT；政绩岁积、达标迁转，阈值一模一样 */
  Game.npcOfficeReview = function (g, ch) {
    if (!ch || !ch.alive || ch.out || !ch.office || ch.palace) return;
    const o = ch.office;
    if (typeof o.merit !== "number") o.merit = 0;
    if (ch.age >= 65) {
      ch.office = null;
      Game.log(`${ch.relation || "族人"}${ch.name}年老致仕，告老还乡，阖家设宴饯行。`, "");
      return;
    }
    const ab = (o.track === "civil" ? ch.stats.智力 : ch.stats.武力) || 50;
    o.merit += Math.max(1, Math.round((ab - 50) / 8) + rand(2, 6));
    o.yg = (o.yg || 0) + 1;   /* 现任品级年数：刚迁转者不贬 */
    const thr = Game.PROMO_MERIT(o.grade);
    const top = Game.GRADES.length - 1;
    if (o.merit >= thr && o.grade < top) {
      /* 奥援：家声显赫、或乃父在朝高位，方得迁转——与家主同理 */
      const support = (g.family.reputation >= 150) || (g.char.office && g.char.office.grade >= 4) || chance(0.35);
      if (support) {
        o.grade += 1; o.merit = Math.max(0, o.merit - thr); o.yg = 0;
        rep(3);
        const posts = o.track === "civil" ? Game.CIVIL_POSTS : Game.MILITARY_POSTS;
        Game.log(`吏部考绩：${ch.relation || "族人"}${ch.name}政绩卓异，擢升${Game.GRADES[o.grade]}${posts[o.grade]}，阖家欢喜。`, "good");
      }
      return;
    }
    if (o.yg >= 3 && o.merit < thr * 0.4 && chance(0.15)) {
      const posts = o.track === "civil" ? Game.CIVIL_POSTS : Game.MILITARY_POSTS;
      if (o.grade > 0 && chance(0.6)) {
        o.grade -= 1; rep(-2);
        Game.log(`考绩下下：${ch.relation || "族人"}${ch.name}左迁为${Game.GRADES[o.grade]}${posts[o.grade]}。`, "bad");
      } else {
        ch.office = null; rep(-4);
        Game.log(`${ch.relation || "族人"}${ch.name}考绩不堪，罢官归家。`, "bad");
      }
    }
  };
  Game.officeAnnualReview = function (g) {
    Game.ensureOfficeState(g);
    const c = g.char, o = c.office;
    const posts = o.track === "civil" ? Game.CIVIL_POSTS : Game.MILITARY_POSTS;
    /* 罢官后同月若尚有未决差事，一并撤下 */
    const dismissCase = () => { if (g.pendingEvent && g.pendingEvent.career) { g.pendingEvent = null; g.locked = false; } };


    const thr = Game.PROMO_MERIT(o.grade);
    const top = Game.GRADES.length - 1;


    if (o.merit >= thr && o.grade < top) {
      const ng = o.grade + 1;
      Game.appoint(o.track, ng);
      g.char.office.merit = Math.max(0, o.merit - thr);
      rep(8);
      Game.log(`三年考绩，政绩卓异，擢升${Game.GRADES[ng]}${posts[ng]}。`, "good");
      return;
    }

    if (o.merit < thr * 0.4 && chance(0.5)) {
      if (o.grade > 0) {
        const ng = o.grade - 1;
        Game.appoint(o.track, ng); rep(-5);
        Game.log(`考绩下下，左迁为${Game.GRADES[ng]}${posts[ng]}。`, "bad");
      } else {
        c.office = null; rep(-10); dismissCase();
        Game.log("考绩罢软，奉旨革职，冠带闲住。", "bad");
      }
      return;
    }
    Game.log(`岁末考绩，政绩${o.merit}/${thr}，仍任${Game.GRADES[o.grade]}${posts[o.grade]}。`, "");
  };
})();
