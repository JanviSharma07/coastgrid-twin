// Plain-language "you may face this -> do this" guidance used across the app.
// Every action is standard utility practice; no costs or outcomes are invented.

export const SOLUTIONS = {
  flood: {
    icon: "Waves",
    color: "#38bdf8",
    title: "Rising sea + storm surge",
    face: "Sea water reaches the transformer and switchgear during a cyclone. The substation trips, equipment is damaged, and power stays off until it dries out. In Michaung, one 230 kV substation took six days.",
    why: "The sea is higher every decade, the land is sinking in places, and a cyclone adds 1–2 m of surge on top.",
    actions: [
      "Raise the equipment plinth above the projected storm water level, or move the site to higher ground",
      "Until then: flood walls or barriers around the yard, sealed cable trenches and dewatering pumps",
      "Keep spares (breakers, relays) stored above the flood line",
    ],
    when: "Before the year the site first floods; temporary barriers before the next monsoon",
  },
  waves: {
    icon: "Wind",
    color: "#22d3ee",
    title: "High waves and rough sea",
    face: "Waves over 2.5 m push extra water and spray onto the shore, flooding the lowest coastal sites first and coating equipment in salt.",
    why: "Strong onshore winds from a storm out at sea build waves even before landfall.",
    actions: [
      "Check INCOIS high-wave alerts daily during the season",
      "Inspect and seal the lowest coastal substations first",
      "Wash insulators after the sea calms down",
    ],
    when: "1–3 days before forecast rough sea",
  },
  heat: {
    icon: "ThermometerSun",
    color: "#fb923c",
    title: "Heat and humid sea air",
    face: "Transformers run hotter and can carry less load safely. Overheating ages insulation and causes trips during peak demand.",
    why: "Marine heatwaves and humid sea air keep coastal nights warm, so equipment never cools down.",
    actions: [
      "Check transformer cooling fans, oil levels and radiators before summer",
      "Shift load away from the hottest transformers during heat spells",
      "Plan cooling upgrades for sites scored high on heat stress",
    ],
    when: "Before summer, and whenever the forecast hits coastal heat-wave levels",
  },
  salt: {
    icon: "Sparkles",
    color: "#a78bfa",
    title: "Salt spray and corrosion",
    face: "A salty film on insulators turns conductive when it gets wet with dew or drizzle. That causes flashovers and trips. Steel structures rust faster.",
    why: "Wind from the sea carries salt inland; sites within about 3 km of the shore get the most.",
    actions: [
      "Wash or clean insulators on a schedule (more often after storms)",
      "Replace porcelain with salt-resistant polymer (silicone) insulators",
      "Use anti-corrosion coatings on structures and enclosures",
    ],
    when: "Every year, plus after every storm",
  },
  sinking: {
    icon: "TrendingDown",
    color: "#c084fc",
    title: "Land sinking",
    face: "The ground under the site slowly drops, so a plinth that is safe today becomes too low years earlier than sea level alone suggests.",
    why: "Mostly from pumping groundwater. Parts of Chennai sink by up to about 3 cm a year (2025 satellite study).",
    actions: [
      "Survey the site level again every few years",
      "Add the sinking rate when deciding how high to raise a plinth",
      "Support city groundwater-recharge measures near the site",
    ],
    when: "At every site survey and before any plinth design",
  },
  rain: {
    icon: "CloudRain",
    color: "#60a5fa",
    title: "Heavy rain and waterlogging",
    face: "Streets and low substation yards fill with rain water even without a sea surge. Michaung's outages were mostly from rain floods.",
    why: "IMD 'heavy' rain is 64.5 mm or more in a day; Chennai's drains cannot clear that fast.",
    actions: [
      "Clear drains and cable trenches before the season",
      "Keep pumps fuelled at low-lying sites",
      "Switch off waterlogged equipment in a planned way rather than letting it trip",
    ],
    when: "Before the monsoon, and the day before forecast heavy rain",
  },
  wind: {
    icon: "Tornado",
    color: "#f472b6",
    title: "Gale-force wind",
    face: "Gusts over 62 km/h bring down trees, poles and lines, mostly on the distribution network.",
    why: "Cyclones and strong monsoon spells bring gale-force gusts.",
    actions: [
      "Trim trees near lines before the season",
      "Pre-position poles, conductors and crews outside flood zones",
      "Restore hospital and water-supply feeders first after the storm",
    ],
    when: "1–3 days before forecast gales",
  },
};

// Which threats apply to one asset (from its risk row + properties)
export function assetThreats(p, r) {
  const t = [];
  if (r.flood_score >= 0.3 || (r.flood_year && r.flood_year <= 2100)) t.push("flood");
  if ((p.dist_coast_km ?? 99) <= 2) t.push("waves");
  if (r.salt_score >= 0.3) t.push("salt");
  if (r.heat_score >= 0.3) t.push("heat");
  if ((p.subsidence_mm_yr ?? 0) > 0) t.push("sinking");
  if (!t.length) t.push("rain");
  return t;
}
