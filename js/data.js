/* ============================================================
 * 百年宗谱 · 静态数据与配置
 * ============================================================ */
(function () {
  "use strict";
  const Game = window.Game || (window.Game = {});
  Game.VERSION = "2026.10.27-清廉版";

  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
  const chance = (p) => Math.random() < p;
  Game.U = { rand, pick, clamp, chance };

  /* ---------- 姓氏与名字 ---------- */
  Game.SURNAMES = ["赵","钱","孙","李","周","吴","郑","王","冯","陈","褚","卫","蒋","沈","韩","杨",
    "朱","秦","尤","许","何","吕","施","张","孔","曹","严","华","金","魏","陶","姜",
    "戚","谢","邹","喻","柏","水","窦","章","云","苏","潘","葛","奚","范","彭","郎"];

  Game.MALE_GIVEN = ["书","远","彦","谦","珩","琮","昭","穆","昀","柏","松","砚","澄","济","怀",
    "景","崇","允","嘉","承","明","孝","文","廷","宗","元","伯","仲","肃","恭","宽","信",
    "敏","惠","达","德","修","齐","治","平","安","宁","卿","臣","儒","卿","麟","凤","鹤"];

  Game.FEMALE_GIVEN = ["婉","云","淑","慧","兰","瑶","萱","蕙","静","琳","薇","芷","若","昭",
    "巧","缃","纨","颦","眉","蕊","桃","荷","菊","梅","雪","月","琴","棋","书","画",
    "珍","珠","璎","珞","婵","娟","嫣","然","宜","容","婉","卿","芷","汀","蘅","茉","莺","燕"];

  Game.SPOUSE_TITLE = {
    male: { spouse: "妻", marry: "娶妻", childSon: "子", childDau: "女" },
    female: { spouse: "夫", marry: "招赘", childSon: "子", childDau: "女" }
  };

  /* ---------- 媒婆 ---------- */
  Game.MATCHMAKERS = [
    { name: "街头王婆", fee: 5,  quality: 0, gift: 15,  desc: "来者不拒，所荐多有瑕疵" },
    { name: "城中周媒", fee: 20, quality: 1, gift: 60,  desc: "门户相当，偶有才貌双全者" },
    { name: "高门官媒", fee: 60, quality: 2, gift: 160, desc: "往来缙绅，所荐皆门第中人" }
  ];

  /* ---------- 行业铺号 ----------
   * cost: 开办本金；base: 每铺月流水区间；upkeep: 每铺月用度
   * vol:  流水波动度；口碑越高，流水越丰、盘价越高
   */
  Game.SHOP_TYPES = {
    antique:   { name: "古董铺", cost: 120, base: [12, 34], upkeep: 6, vol: 0.55, tag: "珍玩古器", desc: "三年不开张，开张吃三年" },
    silk:      { name: "丝绸铺", cost: 80,  base: [9, 22],  upkeep: 4, vol: 0.30, tag: "绫罗绸缎", desc: "南来北往，做的是富户生意" },
    eatery:    { name: "餐饮馆", cost: 65,  base: [9, 19],  upkeep: 4, vol: 0.25, tag: "酒菜饭食", desc: "炉火不熄，最忙在饭点" },
    teahouse:  { name: "茶馆",   cost: 55,  base: [7, 16],  upkeep: 3, vol: 0.22, tag: "茶水闲话", desc: "三教九流汇聚，口碑生财" },
    pastry:    { name: "糕点铺", cost: 40,  base: [6, 15],  upkeep: 2, vol: 0.18, tag: "四时糕点", desc: "新鲜热络，薄利多销" },
    butcher:   { name: "肉铺",   cost: 30,  base: [5, 12],  upkeep: 2, vol: 0.15, tag: "牛羊鸡鸭", desc: "晨起宰杀，日日有进项" }
  };
  /* 铺面不设死限，而以阖族功名官身定「商事之额」：
     白丁小家本可开 SHOP_CAP_BASE 间；族中每有一人功名、官身，便累加其额度 */
  Game.SHOP_CAP_BASE = 2;
  /* 每个功名在身者贡献的铺面数 */
  Game.TITLE_SHOP_CAP = {
    xiucai: 1, wuxiucai: 1,
    juren: 2, wujuren: 2, gongshi: 2,
    jinshi: 3, wujinshi: 3
  };
  /* 现任官员按品级档，在功名之外另加的铺面数（grade 0=正九品 … 16=正一品） */
  Game.officeShopCap = (grade) =>
    grade >= 13 ? 9 : grade >= 9 ? 6 : grade >= 5 ? 4 : grade >= 3 ? 3 : 2;

  /* ---------- 科举 ----------
   * month: 仅该月可考（null = 随时）；needTitle: 需已有功名
   */
  Game.EXAMS = [
    { track: "civil", key: "xiucai",  name: "童试", title: "秀才", fee: 2,  month: null, need: null,      threshold: 55, rep: 15, desc: "县府院三试，取中即为生员" },
    { track: "civil", key: "juren",   name: "乡试", title: "举人", fee: 10, month: 8,   need: "xiucai",  threshold: 70, rep: 40, desc: "八月秋闱，三年一次" },
    { track: "civil", key: "gongshi", name: "会试", title: "贡士", fee: 30, month: 3,   need: "juren",   threshold: 80, rep: 55, desc: "春闱入京，礼部主持" },
    { track: "civil", key: "jinshi",  name: "殿试", title: "进士", fee: 0,  month: 3,   need: "gongshi", threshold: 0,  rep: 80, desc: "天子亲策，同年三月连试" },
    { track: "military", key: "wuxiucai", name: "武童试", title: "武秀才", fee: 2,  month: null, need: null,      threshold: 55, rep: 12, desc: "弓马技勇，取中武生员" },
    { track: "military", key: "wujuren",  name: "武乡试", title: "武举人", fee: 10, month: 9,  need: "wuxiucai", threshold: 70, rep: 35, desc: "九月武科秋闱" },
    { track: "military", key: "wujinshi", name: "武会试", title: "武进士", fee: 30, month: 4,  need: "wujuren",  threshold: 80, rep: 70, desc: "兵部主持，骑射策论" }
  ];

  /* 品级 0=正九品 … 16=正一品；track 取职衔名 */
  Game.GRADES = [
    "正九品","从八品","正八品","从七品","正七品","从六品","正六品","从五品","正五品",
    "从四品","正四品","从三品","正三品","从二品","正二品","从一品","正一品"
  ];
  Game.CIVIL_POSTS = [
    "县丞","州判","府知事","知县","京县知县","通判","六部主事","知州","员外郎",
    "知府","道台","参政","按察使","布政使","巡抚","尚书","大学士"
  ];
  Game.MILITARY_POSTS = [
    "把总","千总","守备","守御所千总","都司","游击","参将","副将","总兵",
    "都督佥事","都督同知","五军都督","副将军","镇边将军","大将军","枢密使","太尉"
  ];

  /* 月俸（两） */
  Game.SALARY = (gi) => 8 + gi * 3;

  /* ---------- 族学西席（外访） ----------
   * gift: 延聘聘金；stipend: 每月束脩；skill: 学力区间
   * needRep / needLand: 延请门槛
   */
  Game.TEACHERS = [
    { kind: "xiucai", name: "落第秀才", gift: 10, stipend: 3, skill: [38, 58],
      needRep: 0, needLand: 0, desc: "屡试不第的老童生，八股娴熟，束脩低廉" },
    { kind: "jinshi", name: "致仕进士", gift: 30, stipend: 8, skill: [62, 84],
      needRep: 110, needLand: 0, desc: "翰林出身，年高致仕归里，非有声望之家不就" },
    { kind: "mingsu", name: "乡野名宿", gift: 20, stipend: 6, skill: [50, 72],
      needRep: 0, needLand: 15, desc: "隐居不仕的饱学老者，喜庄田清静，无田难致" }
  ];

  /* ---------- 女官体系（女儿入宫两条路） ----------
   * 宫女线：送入宫为小宫女，逐年考课晋升，28岁放出归家
   * 妃嫔线：选秀入宫为秀女，凭姿容晋位，高位者荫家（加商额） */
  Game.PALACE_MAID_RANKS = [
    { name: "小宫女", salary: 2 },
    { name: "掌灯宫女", salary: 3 },
    { name: "司寝宫女", salary: 4 },
    { name: "尚宫", salary: 6 },
    { name: "尚仪", salary: 8 }
  ];
  Game.PALACE_CONSORT_RANKS = [
    { name: "秀女", salary: 5 },
    { name: "答应", salary: 6 },
    { name: "常在", salary: 8 },
    { name: "贵人", salary: 12 },
    { name: "嫔", salary: 16, shopCap: 1 },
    { name: "妃", salary: 25, shopCap: 2 }
  ];
  Game.PALACE_RELEASE_AGE = 28;   /* 宫女年至二十八放出归家 */
  Game.palaceSalary = function (p) {
    if (!p || !p.palace) return 0;
    const ranks = p.palace.track === "consort" ? Game.PALACE_CONSORT_RANKS : Game.PALACE_MAID_RANKS;
    return (ranks[p.palace.grade] || {}).salary || 0;
  };
  Game.palaceName = function (p) {
    if (!p || !p.palace) return "";
    const ranks = p.palace.track === "consort" ? Game.PALACE_CONSORT_RANKS : Game.PALACE_MAID_RANKS;
    return (ranks[p.palace.grade] || {}).name || "";
  };

  /* ---------- 田庄掌柜（雇工自动播种，月领工钱，另有增产） ---------- */
  Game.STEWARDS = [
    { kind: "honest", name: "本分庄户", wage: 2, bonus: 0, needRep: 0,
      desc: "老实肯干，按你的播种计划下种，不偷懒也不多事" },
    { kind: "veteran", name: "老把式", wage: 4, bonus: 0.08, needRep: 20,
      desc: "种了三十年地，看天看土有一手，收成+8%" },
    { kind: "shrewd", name: "精明庄头", wage: 7, bonus: 0.15, needRep: 60,
      desc: "调理佃户、积肥看水样样精，收成+15%，声望六十方肯来" }
  ];

  /* ---------- 高门世家（固定五姓，旧时王谢堂前燕） ----------
   * 阖族共用一个好感，每月-2（比寻常往来难维持）
   * 高门子弟天赋更佳；娶其女聘礼极重，嫁女过去要倒贴嫁妆、却添声望 */
  Game.GREAT_CLANS = [
    { key: "wang", name: "琅琊王氏", motto: "书圣家风", tilt: "智", surname: "王", family: [120, 150], favor0: [10, 25], desc: "书圣之后，代代三槐，子弟多俊彦" },
    { key: "xie", name: "陈郡谢氏", motto: "风流隽永", tilt: "魅", surname: "谢", family: [110, 140], favor0: [10, 25], desc: "东山风流，淝水之誉，子弟多风流" },
    { key: "zheng", name: "荥阳郑氏", motto: "经学传家", tilt: "衡", surname: "郑", family: [100, 130], favor0: [12, 28], desc: "经学传家，孝友著闻，子弟多端方" },
    { key: "lu", name: "范阳卢氏", motto: "幽燕气骨", tilt: "武", surname: "卢", family: [100, 130], favor0: [12, 28], desc: "幽燕气骨，文武兼资，子弟多英武" },
    { key: "cui", name: "清河崔氏", motto: "清河望族", tilt: "体", surname: "崔", family: [95, 125],  favor0: [15, 30], desc: "清河望族，婚宦两盛，子弟多康健" }
  ];

  /* ---------- 门第 ---------- */
  Game.RANKS = [
    { key: "baiding", name: "白丁",     rep: 0,   need: null },
    { key: "gengdu",  name: "耕读之家", rep: 40,  need: null },
    { key: "shen",    name: "乡绅",     rep: 100, need: "xiucai" },
    { key: "wangzu",  name: "望族",     rep: 220, need: "juren" },
    { key: "mingmen", name: "名门",     rep: 380, need: "jinshi2" },
    { key: "shijia",  name: "世家",     rep: 600, need: "topgrade" }
  ];

  /* ---------- 百业营生（无功名成年族人的出路，月俸两） ----------
   * 按 stat 达到 need 即可充任，取可任中月俸最高者 */
  Game.JOBS = [
    /* 薪俸只够一己糊口、略贴家计，断非家族财源；兴家还看田租、商事与功名 */
    { key: "farmhand", name: "务农帮工", salary: 1 },
    { key: "clerk",    name: "商铺伙计", salary: 1, stat: "魅力", need: 35 },
    { key: "artisan",  name: "作坊工匠", salary: 2, stat: "体力", need: 55 },
    { key: "yamen",    name: "衙门差役", salary: 2, stat: "武力", need: 50 },
    { key: "tutor",    name: "私塾蒙师", salary: 3, stat: "智力", need: 60 },
    { key: "account",  name: "账房先生", salary: 3, stat: "智力", need: 55 },
    { key: "escort",   name: "镖局镖师", salary: 4, stat: "武力", need: 65 },
    { key: "merchant", name: "行商坐贾", salary: 4, stat: "魅力", need: 72 },
    { key: "master",   name: "武学教头", salary: 4, stat: "武力", need: 75 },
    { key: "steward",  name: "缙绅管家", salary: 5, stat: "智力", need: 65 },
    { key: "advisor",  name: "州县师爷", salary: 6, stat: "智力", need: 78 }
  ];

  /* ---------- 农时、作物与田亩 ----------
   * 田分五种用途：佃租收银，余四种须依农时播种、到期方获。
   * 作物按熟制定播月 sow 与对应收月 harvest（按下标一一对应，可跨年）；
   * yield: 每亩每熟产粮（斗，平年）；seed: 每亩每熟种子工本（两）；
   * price: 平市价（两/斗）；perennial: 多年林木，种一岁而岁岁可收。
   * 一岁一熟至三熟不等，故田利有时节、青黄不接。 */
  Game.CROPS = [
    { key: "rice",  name: "水稻", yield: 3.6, seed: 0.25, price: 0.8, perennial: false,
      seasons: [{ sow: [1, 2, 3], harvest: [9, 10, 11] }],
      desc: "春种秋收，一岁一熟，合家主粮（雇工费高，薄利）" },
    { key: "wheat", name: "麦作", yield: 2.0, seed: 0.15, price: 0.6, perennial: false,
      seasons: [{ sow: [3, 4], harvest: [7, 8] }, { sow: [9, 10], harvest: [4, 5] }],
      desc: "耐旱薄收，岁可两熟，次粮也" },
    { key: "veg",   name: "蔬菜", yield: 1.6, seed: 0.12, price: 0.25, perennial: false,
      seasons: [{ sow: [2, 3], harvest: [5, 6] }, { sow: [5, 6], harvest: [8, 9] }, { sow: [8, 9], harvest: [11, 12] }],
      desc: "园圃轮作，岁可三熟，佐餐不可缺（利薄）" },
    { key: "fruit", name: "果木", yield: 4.5, seed: 0.6, price: 0.9, perennial: true,
      seasons: [{ sow: [2, 3], harvest: [8, 9] }],
      desc: "桃李枣柿，栽种经年，岁一采获（前两年无收）" }
  ];
  Game.cropInfo = function (key) { return Game.CROPS.find(c => c.key === key) || null; };

  /* 佃租之田：不自耕，招佃分收，夏（六月）、秋（十一月）两季缴租；每亩两季共约 0.8 两 */
  Game.RENT_HARVEST = [
    { month: 6,  perMu: 0.3 },
    { month: 11, perMu: 0.5 }
  ];

  Game.LAND_USES = [
    { key: "rent", name: "佃租之田", kind: "silver", desc: "招佃耕种，夏、秋两季收白银租" }
  ].concat(Game.CROPS.map(c => ({ key: c.key, name: c.name + "之田", kind: c.key, price: c.price, desc: c.desc })));
  Game.FOOD_KEYS = ["rice", "wheat", "veg", "fruit"];
  Game.FOOD_NAME = { rice: "米", wheat: "麦", veg: "菜", fruit: "果" };

  /* ---------- 宅邸（卡家族上限，须一级级营造） ---------- */
  Game.MANORS = [
    { key: "hut",      name: "茅舍",   maxRooms: 5,  cost: 0,    needRep: 0,   upkeep: 0,  maxRank: 1, desc: "茅檐土炕，遮风挡雨" },
    { key: "tile",     name: "瓦房",   maxRooms: 8,  cost: 120,  needRep: 40,  upkeep: 2,  maxRank: 2, desc: "青砖黛瓦，门有榆柳" },
    { key: "courtyard",name: "四合院", maxRooms: 12, cost: 300,  needRep: 100, upkeep: 5,  maxRank: 3, desc: "两进院落，粉墙影壁" },
    { key: "mansion",  name: "深宅大院", maxRooms: 20, cost: 800,  needRep: 220, upkeep: 12, maxRank: 4, desc: "雕梁画栋，宾客盈门" },
    { key: "palace",   name: "侯府",   maxRooms: 30, cost: 2000, needRep: 380, upkeep: 25, maxRank: 5, desc: "朱门石狮，气象巍峨" }
  ];
  Game.manorInfo = function (key) {
    return Game.MANORS.find(m => m.key === key) || Game.MANORS[0];
  };

  /* ---------- 宅院：每间房住两人 ---------- */
  Game.ROOM_CAP = 2;
  Game.buildRoomCost = (rooms) => 25 + rooms * 18;
  Game.HOUSE_KEEP_PER_ROOM = 0.6;   /* 每间厢房每月修缮洒扫 */

  /* ---------- 赋税徭役（每月计征） ---------- */
  Game.TAX = {
    landPerMu: 0.07,     /* 每亩田赋 */
    shopRate: 0.15,      /* 铺面盈利抽解一成半，亏则不征 */
    adultPoll: 0.4       /* 成丁每人丁银 */
  };
  Game.SHOP_STAFF_BASE = 2;         /* 每间铺面每月伙计工钱 */
  Game.SHOP_STAFF_FAME_EXTRA = 1;    /* 口碑70以上老伙计加饷 */
  Game.FARM_LABOR_PER_MU = 0.35;    /* 自耕每亩雇工下种看护 */
  Game.OFFICE_SOCIAL_BASE = 3;      /* 为官迎来送往底数 */
  Game.OFFICE_SOCIAL_PER_GRADE = 0.8; /* 每品级迎来送往递增 */

  /* ---------- 祭祖大典（花钱换声望+祖佑） ---------- */
  /* ---------- 寺庙祈福（求贵子、结奇缘）：稀有词条倍率、天赋加成、易孕，千两法会另有奇人来投 ---------- */
  Game.PRAYERS = [
    { key: "incense", name: "敬香", cost: 50, months: 6, tier: 1,
      desc: "香火一炷，子嗣易得贵相（稀有词条×10、天赋+5、易孕）" },
    { key: "oil", name: "添油", cost: 200, months: 12, tier: 2,
      desc: "长明灯添油，福泽一年（稀有词条×30、天赋+10、易孕）" },
    { key: "grand", name: "千两法会", cost: 1000, months: 12, tier: 3,
      desc: "千两办水陆法会（稀有词条×100、天赋+15、易孕、声望+10，并有奇人来投）" }
  ];
  Game.PRAY_TIER_MUL = [1, 10, 30, 100];
  Game.PRAY_TIER_APT = [0, 5, 10, 15];
  Game.PRAY_TIER_BIRTH = [0, 0.01, 0.02, 0.03];
  Game.RITES = [
    { key: "small", name: "家祭", cost: 20, rep: 6, buffMonths: 3,
      desc: "猪羊酒果，告慰列祖，祖佑三月（收成+10%）" },
    { key: "grand", name: "大祭", cost: 80, rep: 18, buffMonths: 6,
      desc: "遍请族人，大宴三日，祖佑半年（收成+10%、科举+6、受孕+3%）" },
    { key: "splendid", name: "盛祭修谱", cost: 200, rep: 45, buffMonths: 12, needRep: 100,
      desc: "重修祠堂、续写族谱，祖佑一年（收成+15%、科举+10、受孕+5%）" }
  ];

  /* ---------- 远贸商队（高风险高回报） ----------
   * months: 在途月数；outcomes 由 engine 结算 */
  Game.CARAVANS = [
    { key: "small", name: "近路小商队", cost: 60, months: 3,
      desc: "贩布匹茶叶至邻省，三月而还，十有八九小赚，偶或折本" },
    { key: "big", name: "远路大商队", cost: 150, months: 5,
      desc: "骆驼大队走口外，五月而还，或暴利或血本无归" },
    { key: "sea", name: "出海香料船", cost: 300, months: 8, needRep: 100,
      desc: "与海商合股出洋，八月而还，声望不足百无人敢接，成则一夜巨富，败则片板不还" }
  ];

  /* 无功名官身、仅有功名者的月廪银（两）；中举者多由大挑授官领官俸 */
  Game.TITLE_STIPEND = {
    xiucai: 2, juren: 6, gongshi: 6, jinshi: 0,
    wuxiucai: 2, wujuren: 6, wujinshi: 0
  };

  /* ---------- 门第日用（声望阈值已抬高，爬升更慢） ----------
   * 门第越高，衣用礼数、仆从排场越费钱；按每人每月计
   * rep 取家族鼎盛声望定档 */
  Game.LIVING_TIERS = [
    { rep: 0,   name: "寒门白丁", adult: 1.0, child: 0.5 },
    { rep: 60,  name: "耕读齐民", adult: 1.6, child: 0.8 },
    { rep: 160, name: "乡绅门第", adult: 2.6, child: 1.2 },
    { rep: 350, name: "一方望族", adult: 4.0, child: 1.8 },
    { rep: 600, name: "名门贵第", adult: 5.5, child: 2.4 },
    { rep: 1000, name: "诗礼世家", adult: 7.5, child: 3.0 }
  ];

  /* ---------- 医馆三档：贵者愈速 ---------- */
  Game.DOCTORS = [
    { key: "itinerant", name: "游方郎中", fee: 5, cure: 0.6,
      desc: "铃医过境，药到病除全凭运气，便宜" },
    { key: "local", name: "城中坐堂", fee: 12, cure: 0.85,
      desc: "百年老号，望闻问切，十拿九稳" },
    { key: "master", name: "杏林圣手", fee: 30, cure: 0.97, needRep: 120,
      desc: "太医院致仕，非望族不请，妙手回春还补身子" }
  ];

  /* ---------- 寿宴三档（整寿50/60/70/80声望1.5倍） ---------- */
  Game.BANQUETS = [
    { key: "family", name: "家宴小酌", cost: 30, rep: 8,
      desc: "阖家小聚，邻里道贺，收贺礼回血" },
    { key: "public", name: "大开筵席", cost: 100, rep: 20,
      desc: "遍邀亲友乡绅，热闹三日，名声大振" },
    { key: "grand", name: "千叟盛宴", cost: 300, rep: 45, needRep: 160,
      desc: "非乡绅不敢举，阖县来贺，福寿双全" }
  ];

  /* ---------- 捐纳（花钱买出身，清流侧目） ---------- */
  Game.DONATIONS = [
    { key: "jian", name: "捐例监", cost: 120,
      desc: "纳粟入监，得监生虚衔视同秀才，可应乡试，只是清议鄙之" },
    { key: "office", name: "捐县丞", cost: 600, needRep: 200, needTitle: "xiucai",
      desc: "纳银六百，由吏部铨选补正九品县丞，需秀才出身并声望200" }
  ];

  /* ---------- 游学三档（一年只许游一次） ---------- */
  Game.TOURS = [
    { key: "near", name: "近县游学", cost: 25, minAge: 6, maxAge: 15,
      desc: "访邻县书院，三月而还，学问小进" },
    { key: "far", name: "名山游学", cost: 80, minAge: 8, maxAge: 15,
      desc: "遍览名山大川，访隐者高士，脱胎换骨，或改怠惰之习" },
    { key: "capital", name: "京师游学", cost: 200, minAge: 10, maxAge: 15, needRep: 100,
      desc: "入京观国学、拜大儒，声望百家方可成行，或有机缘开悟" }
  ];

  /* ---------- 人际往来：可结识的身份池 ---------- */
  Game.CONTACT_TYPES = [
    { key: "humble", name: "寒门子弟", needRep: 0, family: [10, 35], favor0: [25, 45], desc: "市井布衣，性情质朴" },
    { key: "common", name: "齐民子女", needRep: 20, family: [30, 60], favor0: [20, 40], desc: "耕读之家，知书识礼" },
    { key: "gentry", name: "缙绅子弟", needRep: 90, family: [60, 95], favor0: [15, 35], desc: "书香门第，天赋更佳" },
    { key: "official", name: "官宦子弟", needRep: 160, family: [85, 120], favor0: [10, 30], desc: "簪缨之后，眼界颇高" },
    { key: "royal", name: "皇亲贵胄", needRep: 220, family: [110, 160], favor0: [5, 20], desc: "天潢贵胄，可遇不可求" }
  ];

  /* ---------- 字辈（世代排行） ---------- */
  Game.GEN_CHARS = ["承","德","永","继","光","昭","显","扬","振","家","声","贻","谋","燕","翼","钟","毓","贤","良","克"];
  /* 字辈诗预设：通天谱为孔孟颜曾御赐五十字，其余为民间通用；亦可自填整首 */
  Game.GEN_POEMS = [
    { name: "通天谱·御赐五十字", chars: "希言公彦承宏闻贞尚衍兴毓传继广昭宪庆繁祥令德维垂佑钦绍念显扬建道敦安定懋修肇彝常裕文焕景瑞永锡世绪昌" },
    { name: "忠孝传家", chars: "忠孝传家远诗书继世长" },
    { name: "仁义礼智", chars: "仁义礼智信温良恭俭让" }
  ];
  Game.nextGenChar = function (cur) {
    const poem = window.Game.G && window.Game.G.family && window.Game.G.family.genPoem;
    if (poem) {
      const arr = poem.split("");
      const i = arr.indexOf(cur);
      if (i >= 0) return arr[(i + 1) % arr.length];   /* 诗尽则循环 */
    }
    const seq = Game.GEN_CHARS;
    const i = seq.indexOf(cur);
    if (i >= 0 && i < seq.length - 1) return seq[i + 1];
    return seq[Math.floor(Math.random() * seq.length)];
  };

  /* ---------- 行动文案 ---------- */
  Game.ACTION_INFO = {
    study:   { label: "读书明理", hint: "智力+，体力-" },
    martial: { label: "习练弓马", hint: "武力+，体力-" },
    social:  { label: "游学会友", hint: "魅力+，耗银钱" },
    rest:    { label: "静养体魄", hint: "体力+" },
    charity: { label: "行善积德", hint: "散财，声望+" },
    work:    { label: "督工买卖", hint: "本月租利与铺面流水、口碑加成" },
    office:  { label: "勤于政务", hint: "年末考核有望" },
    idle:    { label: "寻常度日", hint: "略作休养" }
  };
})();
