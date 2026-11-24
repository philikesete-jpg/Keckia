export interface Traveller {
  name: string;
  passport: string;
  nationality: string;
  birth: string;
  expiry: string;
  sex: string;
  occupation: string;
}
export interface TripDay {
  date: string;
  route: string;
  hotelId: string;
  lodging: string;
  rooms?: string;
}
export interface TripInput {
  title: string;
  entry: string;
  flight: string;
  rooms: string;
  text: string;
  fileName: string;
  travellers: Traveller[];
  days: TripDay[];
  vehicleId?: string;
  verifiedSeats?: string;
  verifiedPlate?: string;
  licenceDriverId?: string;
  verifiedLicence?: string;
}
export interface Property {
  id: string;
  name: string;
  city: string;
}
export interface TripDocument {
  title: string;
  body: string;
}
export interface TripResult {
  reference: string;
  documents: TripDocument[];
  missing: string[];
  allocation: { guide: string; driver: string; vehicle: string };
  driverId?: string;
  saved?: boolean;
  fingerprint?: string;
}
export const blankTraveller = (name = ""): Traveller => ({
  name,
  passport: "",
  nationality: "",
  birth: "",
  expiry: "",
  sex: "",
  occupation: "",
});
export const normalize = (s: string) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s + "T00:00:00Z")) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
export function offsetDate(start: string, days: number) {
  if (!validDate(start)) return "";
  return new Date(Date.parse(start + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
const monthNames = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
function extractDate(text: string) {
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return validDate(iso) ? iso : "";
  const match =
    text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})\b/) ||
    text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (!match) return "";
  const [, a, b, year] = match;
  const [day, month] = /^\d/.test(a) ? [a, b] : [b, a];
  const n = monthNames.indexOf(month.toLowerCase().slice(0, 3)) + 1;
  const date =
    year + "-" + String(n).padStart(2, "0") + "-" + day.padStart(2, "0");
  return validDate(date) ? date : "";
}
export function parseItinerary(
  text: string,
  properties: Property[],
  arrival = "",
): TripDay[] {
  const groups: { n: number; lines: string[] }[] = [];
  for (const line of text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const day = line.match(
      /^\s*(?:[-*#]+\s*)?(?:day|giorno|jour)\s*(\d{1,3})\b/i,
    );
    const dated = /^(?:\d{4}-\d\d-\d\d|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/.test(
      line,
    );
    if (
      day ||
      (dated && !groups.at(-1)?.lines.every((s) => /^day\s+\d+\s*$/i.test(s)))
    )
      groups.push({
        n: day ? Number(day[1]) : groups.length + 1,
        lines: [line],
      });
    else if (groups.length) groups.at(-1)!.lines.push(line);
  }
  const anchor = groups.find((g) => extractDate(g.lines[0]));
  const start =
    arrival ||
    (anchor ? offsetDate(extractDate(anchor.lines[0]), 1 - anchor.n) : "");
  if (groups.length > 120)
    throw new Error("Split programmes longer than 120 days before import.");
  const days = groups.map((g) => {
    const first = g.lines[0];
    // Keep every stop, including villages, islands and transfer points outside the catalogue.
    const route = g.lines
      .filter(
        (l) =>
          !/^(?:overnight|accommodation|hotel|stay|lodging|pernottamento|nuitée|rooms|rooming)\s*[:–-]/i.test(
            l,
          ),
      )
      .join(" ")
      .replace(/^(?:[-*#]+\s*)?(?:day|jour|giorno)\s*\d+\b/i, "")
      .replace(/\b\d{4}-\d{2}-\d{2}\b/, "")
      .replace(/^[\s:–—-]+/, "")
      .trim();
    const night = g.lines
      .slice()
      .reverse()
      .find((line) =>
        /\b(overnight|accommodation|lodging|pernottamento|nuitée)\b/i.test(
          line,
        ),
      );
    const known = (s: string) =>
      properties.filter((h) => {
        const base = normalize(h.name);
        const short = base.replace(/\b(hotel|international)\b/g, "").trim();
        return [
          base,
          ...(short.length > 3 &&
          !["central", "palace", "park", "star", "africa", "keren"].includes(
            short,
          )
            ? [short]
            : []),
        ].some((term) => (" " + normalize(s) + " ").includes(" " + term + " "));
      });
    const lodgingLine =
      night ||
      g.lines.find((line) =>
        /^(?:hotel|stay|check.in|lodging)\s*[:–-]/i.test(line),
      ) ||
      "";
    const candidates = lodgingLine ? known(lodgingLine) : [];
    const hotel = candidates.length === 1 ? candidates[0] : undefined;
    return {
      date: extractDate(first) || offsetDate(start, g.n - 1),
      route,
      hotelId: hotel?.id || "",
      lodging: hotel
        ? "hotel"
        : night && /\b(camp|camping|tent)\b/i.test(night)
          ? "camp"
          : "unknown",
    };
  });
  const last = groups.at(-1);
  if (
    last &&
    (days.at(-1)?.lodging === "hotel" ||
      days.at(-1)?.lodging === "camp" ||
      last.lines.some((line) =>
        /\b(?:overnight|pernottamento|accommodation|lodging)\s*[:–-]/i.test(
          line,
        ),
      )) &&
    !last.lines.some((line) => /no overnight|no accommodation/i.test(line))
  ) {
    if (days.length === 120)
      throw new Error("Include the final checkout within the 120-day limit.");
    days.push({
      date: offsetDate(days.at(-1)!.date, 1),
      route: "",
      hotelId: "",
      lodging: "unknown",
    });
  }
  return days;
}
// Only copy explicitly labelled trip details. Names and passport data come from the traveller manifest.
export function tripLabels(text: string): Partial<TripInput> {
  const labels: Record<string, keyof TripInput> = {
    "port of entry": "entry",
    "entry port": "entry",
    "arrival flight": "flight",
    "arrival details": "flight",
    rooming: "rooms",
    rooms: "rooms",
    "room request": "rooms",
    "trip title": "title",
    "tour title": "title",
  };
  const values: Partial<
    Record<"entry" | "flight" | "rooms" | "title", string>
  > = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^:]{3,24}):\s*(.{1,250})$/);
    if (!m) continue;
    const key = labels[m[1].toLowerCase()] as keyof typeof values;
    if (key && !values[key]) values[key] = m[2].trim();
  }
  return values;
}
export function hotelStays(days: TripDay[]) {
  const stays: {
    hotelId: string;
    start: string;
    end: string;
    nights: number;
    rooms: string;
  }[] = [];
  for (let i = 0; i < days.length - 1; i++) {
    const d = days[i],
      next = days[i + 1];
    if (d.lodging !== "hotel" || !d.hotelId) continue;
    const prev = stays.at(-1);
    if (
      prev?.hotelId === d.hotelId &&
      prev.end === d.date &&
      prev.rooms === (d.rooms || "")
    ) {
      prev.end = next.date;
      prev.nights++;
    } else
      stays.push({
        hotelId: d.hotelId,
        start: d.date,
        end: next.date,
        nights: 1,
        rooms: d.rooms || "",
      });
  }
  return stays;
}
export const canPrepareTrip = (role: string) =>
  ["CEO", "OPERATIONS", "TOUR_OPS"].includes(role);
