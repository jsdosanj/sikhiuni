// Workshops — hands-on "how it is actually made" references, migrated from the
// sister project sikhi.io. Rendered by
// src/pages/departments/martial-arts/workshop/[slug].astro; getStaticPaths maps
// this array, so adding a workshop here adds a route.
//
// The first is the Wootz Workshop — the real metallurgy behind Sikh shastar,
// which is why it lives with the Department of Martial Arts (Shastar Vidya).
// Content is Sikhi.io's original synthesis of the factual/technical material
// from four "Knife Steel Nerds" (Larrin Thomas) videos; every figure is a lab
// record, not a claim. Nothing doctrinal here — this is materials science.

export interface WBlock {
  kind?: 'prose' | 'list' | 'steps' | 'defs' | 'table';
  body?: string[];
  items?: string[];
  steps?: { label: string; body: string }[];
  defs?: { term: string; detail: string }[];
  table?: { caption?: string; cols: string[]; rows: string[][] };
}
export interface WModule {
  id: string;
  n: string;
  title: string;
  summary: string;
  blocks: WBlock[];
}
export interface Workshop {
  slug: string;
  title: string;
  kicker: string;
  standfirst: string;
  intro: string[];
  source: { label: string; url: string; note: string };
  modules: WModule[];
}

const wootz: Workshop = {
  slug: 'wootz',
  title: 'The Wootz Workshop',
  kicker: 'Workshop 01 · the metallurgy behind the shastar',
  standfirst: 'Wootz is one melt of one material. Its pattern forms inside it, not between layers — and the numbers are the whole story.',
  intro: [
    'For centuries the blades of the Punjab were forged from wootz — a crucible steel poured as small "cakes", then forged out, whose watered pattern comes from carbide banding in the microstructure rather than from folding different steels together. It looks like pattern-welded Damascus and has almost nothing else in common with it.',
    'This workshop is the field record for making it: the recipe, what the analysis says is in it, how it is heat-treated, how it actually performs against modern steel, and the separate craft of pattern-welding for a shop that might teach either. Open a module to read the detail.',
  ],
  source: {
    label: 'Compiled by Sikhi.io',
    url: 'https://sikhi.io/wootz',
    note: 'from four Knife Steel Nerds (Larrin Thomas) videos — transcripts plus on-screen composition tables and test-result charts. Presented as a technical reference for shastar-making research; the figures are lab measurements, not marketing.',
  },
  modules: [
    {
      id: 'primer',
      n: '01',
      title: 'Five ideas the rest of the page rests on',
      summary: 'What steel is, what the hard particles in it are, the one tradeoff that drives every decision, what heat treatment does, and why this is not the Damascus most people have heard of.',
      blocks: [
        {
          kind: 'defs',
          defs: [
            { term: 'Steel is iron plus a little carbon', detail: 'Pure iron is soft and cannot be hardened by heating. Add a small amount of carbon and the same metal can be made file-hard or spring-soft depending entirely on how it is heated and cooled. Ordinary knife steel runs around 0.8% carbon. Wootz runs 1.59% — roughly double, and that excess is the whole story.' },
            { term: 'The extra carbon becomes hard particles', detail: 'Carbon the steel cannot dissolve forms carbides: hard, ceramic-like specks scattered through softer metal, like grit set in cement. The metal holds them; they do the cutting and resist wear. They are also brittle. The pattern in a wootz blade is not a picture of carbides — it is carbides, in bands.' },
            { term: 'Hard and tough are opposites', detail: 'Hardness resists denting and wear; toughness resists cracking. Push one up and the other usually falls. Almost every number in this workshop is somebody choosing a point on that line — and wootz is deliberately parked near the hard end, which is why it holds an edge well and chips more readily than a modern simple steel.' },
            { term: 'Heat treatment is two moves', detail: 'Quench: heat the blade, then cool it suddenly, trapping it in a very hard, very brittle state called martensite. Then temper: reheat it gently to give back some toughness. Quenched but untempered, a blade is essentially glass. Cool it too slowly and you get pearlite instead, and it never hardens at all.' },
            { term: 'This is not the Damascus you have seen', detail: 'Pattern-welded Damascus stacks two or more different steels and forge-welds them; its pattern comes from the boundaries between materials. Wootz is one melt of one material, and its pattern forms inside it. They look alike and have almost nothing else in common.' },
          ],
        },
      ],
    },
    {
      id: 'formula',
      n: '02',
      title: 'The living formula — charge → furnace → cycling → banding → blade',
      summary: 'The crafting process, verified against ancient composition (the Spencer Sandison method).',
      blocks: [
        {
          kind: 'steps',
          steps: [
            { label: 'Charge', body: 'Into the crucible: electrolytic iron flake (a high-purity iron source) and pig iron (high-carbon, higher-impurity — the historical intermediate product of smelting ore with coke), plus a small addition of ferro-niobium as the carbide-forming element, standing in for the trace vanadium found in the original ancient ore. The crucible is topped with green glass to form a protective slag layer, then sealed.' },
            { label: 'Furnace', body: 'Held at roughly 2900 °F until the charge fully melts, then the crucible is slow-cooled so the steel solidifies as an ingot. It is then held at a high "roast" temperature before forging begins.' },
            { label: 'Cycling', body: 'During forging the steel goes through repeated thermal cycles. Overheat it and every carbide dissolves and re-precipitates evenly — the pattern is lost. Hold it at an intermediate temperature instead and the carbides coarsen in the niobium-rich regions and shrink in the carbide-lean regions.' },
            { label: 'Banding', body: 'More thermal cycles means more pronounced banding means a stronger pattern. The very high carbon content helps here: it widens the two-phase temperature region, making it easier to thermal-cycle without fully dissolving the carbides.' },
            { label: 'Blade', body: 'Forged thin at the edge and thick at the spine, the blade hardens more readily near the edge than at the spine — the same effect that forms a hamon, and the reason a smith working a partially-forged blade can use a shorter, gentler soak than a flat lab coupon needs.' },
          ],
        },
      ],
    },
    {
      id: 'composition',
      n: '03',
      title: 'What is actually in it',
      summary: 'The verified composition of this reconstruction, by optical emission spectroscopy and LECO combustion analysis.',
      blocks: [
        {
          kind: 'table',
          table: {
            caption: 'Measured composition, weight %',
            cols: ['C', 'Mn', 'Si', 'Nb', 'P', 'S'],
            rows: [['1.59', '0.18', '0.13', '0.03', '0.13', '0.007']],
          },
        },
        {
          kind: 'list',
          items: [
            '1.59% carbon — right around the ~1.5% average measured across tested ancient wootz blades.',
            'Manganese (raised to about 0.8% in a later batch) is needed for hardenability: a near-zero-manganese first batch could not be hardened in oil at all.',
            'The phosphorus and silicon impurities (~0.13% each) most likely come from the pig iron, and the phosphorus level is consistent with measurements from genuine ancient blades.',
          ],
        },
      ],
    },
    {
      id: 'heat-treatment',
      n: '04',
      title: 'Heat treatment — quench and temper',
      summary: 'Wootz has very low hardenability; the margins for error are narrow.',
      blocks: [
        {
          kind: 'list',
          items: [
            'A water quench was required. Oil quenching produced inconsistent hardness with pearlite forming — visible as dark banded regions and black spots in the fracture surface. Pearlite is soft and brittle; full martensite is the goal.',
            'As-quenched hardness in testing: about 67.5 Rockwell C.',
            'A 450 °F temper brought it to roughly 60–61 Rc — the balance point between hardness and toughness for a steel this high in carbon. Going hotter risks tempered martensite embrittlement.',
            'A forged blade hardens more easily at its thin edge than at its thick spine, so a smith working a real blade profile can use a shorter, less rigorous soak (around 1425 °F for 6 minutes in the maker’s own practice) than a lab hardness coupon needs.',
          ],
        },
      ],
    },
    {
      id: 'performance',
      n: '05',
      title: 'How it actually performs',
      summary: 'Lab-tested, against modern steels — the honest picture.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Toughness is relatively poor compared with modern low-alloy steels at the same hardness — driven by the impurity content from the pig iron and small-batch process, the very high carbon, and the banded carbide structure itself (banded carbides are worse for toughness than evenly distributed ones at the same volume fraction).',
            'Edge retention on the CATRA slicing test roughly matched a standard 52100 low-alloy steel — a good result for a steel that is essentially plain high-carbon plus a trace carbide former, helped by both the high carbide volume and the banding.',
            'Modern reconstructions can reach 56–62 Rc cleanly. Many genuine ancient blades likely never fully hardened at all — reliable quench-and-temper was not available anciently and the steel’s own low hardenability compounds that — so real ancient wootz was probably softer and less durable than a well-made modern reconstruction.',
            'There is no credible evidence that exotic claims (carbon nanotubes and the like) improved ancient wootz’s real-world performance beyond what the carbide and impurity chemistry already explains.',
          ],
        },
      ],
    },
    {
      id: 'pattern-welded',
      n: '06',
      title: 'Not the Damascus you have seen — pattern-welded, cross-referenced',
      summary: 'A separate technique. The transferable craft facts for a shop that might teach forge-welded Damascus too.',
      blocks: [
        {
          kind: 'prose',
          body: [
            'Carbon is an interstitial element and diffuses fast during forge-welding — it equalizes across layers regardless of starting composition, so a "high-carbon plus low-carbon" pairing does not end up with a hard layer and a soft layer from carbon alone. The visible contrast after etching comes instead from substitutional elements — chromium, molybdenum, nickel, manganese — which diffuse far more slowly and stay segregated.',
          ],
        },
        {
          kind: 'list',
          items: [
            'Forge-welding temperature is commonly 2300–2350 °F for simple eutectoid steels (1084/15N20); steels above ~1.2% carbon need a lower weld temperature (~2150–2200 °F) with a longer soak, because higher carbon lowers the grain-boundary melting point and the billet can crumble.',
            'More manganese etches darker; more nickel gives a brighter, more resistant-looking layer (the mechanism appears galvanic rather than the nickel itself resisting acid). Chromium forms a tenacious oxide ordinary flux cannot remove, which is why stainless steels are notoriously hard to forge-weld.',
            'A ladder pattern (layers waved so they cross the edge) measurably improves slicing edge retention over straight layering — but reduces longitudinal toughness, because it also creates preferential crack paths along the rolling direction.',
            'Toughness of a two-steel combination is controlled by the less tough of the two — a "weakest-link" effect. Pairing a tough steel with a less-tough one does not meaningfully raise the combination.',
            'A genuine hard/soft-layer cutting effect (a serration-like edge from differential wear) was confirmed in testing, but only with steel plus pure nickel, or two steels of very different hardenability — not with typical high-carbon pairings, where carbon equalizes and both layers end up equally hard.',
          ],
        },
      ],
    },
    {
      id: 'glossary',
      n: '07',
      title: 'Glossary',
      summary: 'The terms the field notes assume you already know.',
      blocks: [
        {
          kind: 'defs',
          defs: [
            { term: 'Carbon', detail: 'The element that makes iron into steel. A small interstitial atom that lets the metal be hardened by heat; too much and the excess forms carbides.' },
            { term: 'Carbide', detail: 'A hard, brittle, ceramic-like compound of carbon with iron (or a carbide-former like niobium, vanadium, chromium). Carbides do the cutting and resist wear; banded carbides give wootz its pattern.' },
            { term: 'Martensite', detail: 'The very hard, very brittle structure formed when hot steel is cooled suddenly (quenched), trapping carbon in place. Tempering softens it back to something usable.' },
            { term: 'Pearlite', detail: 'The soft, layered structure that forms when steel is cooled too slowly. Undesirable in a blade — it means the steel never hardened.' },
            { term: 'Quench', detail: 'Cooling hot steel suddenly — in water, oil or air — to lock in martensite. Wootz needs a water quench.' },
            { term: 'Temper', detail: 'Gently reheating quenched steel (here, ~450 °F) to trade a little hardness back for toughness.' },
            { term: 'Hardenability', detail: 'How readily a steel forms martensite on quenching, and how deep. Wootz has very low hardenability — hence the water quench and the thin-edge / thick-spine effect.' },
            { term: 'Pattern-welded Damascus', detail: 'A different technique: two or more steels forge-welded in a stack, the pattern coming from the boundaries between them. Not wootz.' },
          ],
        },
      ],
    },
  ],
};

export const workshops: Workshop[] = [wootz];
export const workshopBySlug = (slug: string): Workshop | undefined =>
  workshops.find((w) => w.slug === slug);
