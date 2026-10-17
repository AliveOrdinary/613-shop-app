// The mechanical inspection checklist, following the K&K form 613 provided.
// Keys are stored in the database: rename labels freely, but never change a key.

export type InspectionStatus = "ok" | "attention" | "urgent" | "na";
export type InspectionResult = { status: InspectionStatus; note?: string };
export type InspectionResults = Record<string, InspectionResult>;

export const STATUS_LABEL: Record<InspectionStatus, string> = { ok: "OK", attention: "Attention", urgent: "Urgent", na: "N/A" };
export const STATUS_HINT: Record<InspectionStatus, string> = {
  ok: "Good condition",
  attention: "Needs attention",
  urgent: "Safety concern, act promptly",
  na: "Not applicable or not checked",
};

export const SECTIONS: { key: string; title: string; items: { key: string; label: string }[] }[] = [
  {
    key: "engine",
    title: "Engine and fluids",
    items: [
      { key: "oil_level", label: "Engine oil level / condition" },
      { key: "oil_leaks", label: "Engine oil leaks" },
      { key: "coolant_level", label: "Coolant level / condition" },
      { key: "coolant_hoses", label: "Coolant leaks / hoses" },
      { key: "trans_fluid", label: "Transmission fluid / leaks (if accessible)" },
      { key: "brake_fluid", label: "Brake fluid level" },
      { key: "ps_fluid", label: "Power steering fluid / leaks (if equipped)" },
      { key: "belts_hoses", label: "Belts and visible engine hoses" },
      { key: "air_filter", label: "Air filter condition" },
      { key: "exhaust", label: "Exhaust system / visible leaks" },
    ],
  },
  {
    key: "brakes",
    title: "Brakes and suspension",
    items: [
      { key: "front_pads", label: "Front brake pads / shoes" },
      { key: "rear_pads", label: "Rear brake pads / shoes" },
      { key: "rotors", label: "Brake rotors / drums" },
      { key: "brake_lines", label: "Brake lines / hoses" },
      { key: "parking_brake", label: "Parking brake operation" },
      { key: "shocks", label: "Shocks / struts" },
      { key: "ball_joints", label: "Ball joints / control arms" },
      { key: "tie_rods", label: "Tie rods / steering components" },
      { key: "wheel_bearings", label: "Wheel bearings / abnormal play" },
      { key: "cv_boots", label: "CV boots / axles (if equipped)" },
    ],
  },
  {
    key: "tires",
    title: "Tires and wheels",
    items: [
      { key: "front_tires", label: "Front tire condition" },
      { key: "rear_tires", label: "Rear tire condition" },
      { key: "tread_depth", label: "Tread depth measured" },
      { key: "tire_pressure", label: "Tire pressure checked" },
      { key: "uneven_wear", label: "Uneven tire wear" },
      { key: "rim_damage", label: "Wheel / rim damage" },
      { key: "wheel_nuts", label: "Wheel nuts / visible concerns" },
      { key: "spare", label: "Spare tire / repair kit (if equipped)" },
    ],
  },
  {
    key: "electrical",
    title: "Battery and electrical",
    items: [
      { key: "battery", label: "Battery condition / connections" },
      { key: "battery_test", label: "Battery test (if required)" },
      { key: "charging", label: "Alternator / charging system" },
      { key: "headlights", label: "Headlights / high beams" },
      { key: "brake_lights", label: "Brake lights / tail lights" },
      { key: "signals", label: "Turn signals / hazard lights" },
      { key: "wipers", label: "Windshield wipers / washers" },
      { key: "warning_lights", label: "Dashboard warning lights" },
      { key: "obd_scan", label: "OBD-II scan (if required)" },
    ],
  },
  {
    key: "road",
    title: "General condition and road test",
    items: [
      { key: "start_idle", label: "Engine starting / idle" },
      { key: "noise_vibration", label: "Abnormal engine noise / vibration" },
      { key: "trans_operation", label: "Transmission operation" },
      { key: "steering", label: "Steering operation" },
      { key: "brake_operation", label: "Brake operation" },
      { key: "hvac", label: "HVAC / heating / air conditioning" },
      { key: "windshield", label: "Windshield / visible damage" },
      { key: "underbody", label: "Visible underbody damage / leaks" },
      { key: "road_test", label: "Road test completed (if authorized)" },
    ],
  },
];

export const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);

export const DISCLAIMER =
  "This is a general maintenance and mechanical condition checklist, not an Ontario Safety Standards Certificate inspection. Only items actually inspected are marked.";

export function summarize(results: InspectionResults) {
  const count = { ok: 0, attention: 0, urgent: 0, na: 0, unchecked: 0 };
  for (const item of ALL_ITEMS) {
    const s = results[item.key]?.status;
    if (s) count[s]++;
    else count.unchecked++;
  }
  return { ...count, total: ALL_ITEMS.length, done: ALL_ITEMS.length - count.unchecked };
}
