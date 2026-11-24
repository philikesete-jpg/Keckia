import React, { useEffect, useRef, useState } from "react";
import { FileUp, FileText, Printer } from "lucide-react";
import { api } from "../../lib/api";
import { itineraryFileText } from "../../lib/itineraryFile";
import {
  blankTraveller,
  normalize,
  tripLabels,
  parseItinerary,
  offsetDate,
  type Property,
  type Traveller,
  type TripInput,
  type TripResult,
  type TripDay,
} from "../../../shared/tripPreparation";
import { BRAND } from "../../../shared/brand";

type Client = {
  id: string;
  fullName: string;
  passportNumber?: string;
  nationality?: string;
  passportExpiry?: string;
  dateOfBirth?: string;
  gender?: string;
  occupation?: string;
};
type Car = {
  id: string;
  name: string;
  capacity?: number;
  plateNumber?: string;
  status: string;
};
type Saved = {
  id: string;
  input: TripInput;
  result: TripResult;
  state: "Draft" | "Filed";
  version: string;
};
type Listing = { id: string; name: string; title: string; state: string };
const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900";
const button =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50";
const primary =
  "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const fresh = (): TripInput => ({
  title: "",
  entry: "",
  flight: "",
  rooms: "",
  text: "",
  fileName: "",
  days: [],
  travellers: [blankTraveller()],
});
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function printDraft(title: string, body: string, ref: string) {
  const win = window.open("", "_blank");
  if (!win) throw Error("Allow the print window and try again.");
  win.opener = null;
  const d = win.document;
  d.title = title;
  const style = d.createElement("style");
  style.textContent =
    "@page{margin:20mm}body{font:12pt/1.5 Georgia,serif;color:#182633;max-width:760px;margin:24px auto}h1{font-size:20pt}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}small{font:10pt sans-serif}";
  d.head.append(style);
  for (const [tag, value] of [
    ["small", BRAND.legalName + " · " + ref + " · Draft for review"],
    ["h1", title],
    ["pre", body],
  ]) {
    const el = d.createElement(tag);
    el.textContent = value;
    d.body.append(el);
  }
  win.focus();
  win.print();
}
export function TripPreparationDesk({
  hotels,
  clients,
  vehicles,
  onFiled,
}: {
  hotels: Property[];
  clients: Client[];
  vehicles: Car[];
  onFiled: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [input, setInput] = useState<TripInput>(fresh),
    [id, setId] = useState(() => crypto.randomUUID() as string);
  const [version, setVersion] = useState(""),
    [result, setResult] = useState<TripResult>(),
    [filed, setFiled] = useState(false);
  const [items, setItems] = useState<Listing[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [arrival, setArrival] = useState("");
  const [selected, setSelected] = useState("");
  const preview = useRef<HTMLDivElement>(null);
  const list = async () =>
    setItems((await api.get<{ rows: Listing[] }>("trip-desk/list")).rows);
  useEffect(() => {
    if (open) list().catch((e) => setMessage(e.message));
  }, [open]);
  const update = (patch: Partial<TripInput>) => {
    setInput((v) => ({ ...v, ...patch }));
    setResult(undefined);
    setMessage("");
  };
  const day = (i: number, patch: Partial<TripDay>) =>
    update({
      days: input.days.map((d, n) => (n === i ? { ...d, ...patch } : d)),
    });
  const person = (i: number, patch: Partial<Traveller>) =>
    update({
      travellers: input.travellers.map((t, n) =>
        n === i ? { ...t, ...patch } : t,
      ),
    });
  function matchClient(i: number) {
    const traveller = input.travellers[i];
    const matches = clients.filter(
      (c) =>
        normalize(c.fullName) === normalize(traveller.name) &&
        !c.id.startsWith("trav-auto-"),
    );
    if (matches.length !== 1) return;
    const c = matches[0];
    const known = {
      passport: c.passportNumber,
      nationality: c.nationality,
      birth: c.dateOfBirth,
      expiry: c.passportExpiry,
      sex: c.gender,
      occupation: c.occupation,
    };
    const filled = Object.fromEntries(
      Object.entries(known).filter(
        ([k, v]) => v && !traveller[k as keyof Traveller],
      ),
    );
    if (Object.keys(filled).length) person(i, filled);
  }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    } finally {
      setBusy(false);
    }
  };
  function populate(saved: Saved) {
    setId(saved.id);
    setVersion(saved.version);
    setInput(saved.input);
    setResult(saved.result);
    setFiled(saved.state === "Filed");
    setArrival(saved.input.days[0]?.date || "");
  }
  function reset() {
    setId(crypto.randomUUID());
    setInput(fresh());
    setVersion("");
    setFiled(false);
    setResult(undefined);
    setMessage("");
    setArrival("");
    setSelected("");
  }
  function readProgram(text: string, fileName: string) {
    const days = parseItinerary(text, hotels, arrival);
    update({
      ...Object.fromEntries(
        Object.entries(tripLabels(text)).filter(
          ([k]) => !input[k as keyof TripInput],
        ),
      ),
      text,
      fileName,
      days,
    });
    setMessage(
      days.length
        ? "Review each route and overnight against the uploaded programme."
        : "Text loaded. Add dated itinerary days below or use Day 1, Day 2 headings and read the programme again.",
    );
  }
  async function action(kind: "preview" | "draft" | "file") {
    if (kind === "preview") {
      const out = await api.post<TripResult>("trip-desk/preview", {
        id,
        input,
      });
      setResult(out);
      setTimeout(
        () =>
          preview.current?.scrollIntoView({
            block: "start",
            behavior: "smooth",
          }),
        0,
      );
      return;
    }
    const saved = await api.post<Saved>("trip-desk/" + kind, {
      id,
      input,
      version,
      fingerprint: result?.fingerprint,
    });
    populate(saved);
    setSelected(saved.id);
    setMessage(
      kind === "draft"
        ? "Draft saved. Reopen it here to finish preparation."
        : "Filed. The tour assignment, visa draft, hotel requests and permit request are saved in their desks.",
    );
    await list();
    if (kind === "file") await onFiled();
  }
  const fields: [keyof Traveller, string, string][] = [
    ["name", "Full passport name", "text"],
    ["nationality", "Nationality", "text"],
    ["passport", "Passport number", "text"],
    ["birth", "Date of birth", "date"],
    ["expiry", "Passport expiry", "date"],
    ["sex", "Sex on passport", "text"],
    ["occupation", "Occupation", "text"],
  ];
  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <FileUp size={21} /> Itinerary preparation
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Prepare visa and permit letters, request hotel rooms and assign the
            trip crew.
          </p>
        </div>
        <button className={primary} onClick={() => setOpen(!open)}>
          {open ? "Close preparation" : "Open trip preparation"}
        </button>
      </div>
      {open && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <L label="Saved trips">
              <select
                className={field}
                disabled={busy}
                value={selected}
                onChange={(e) => {
                  const key = e.target.value;
                  if (key)
                    void run(async () => {
                      const r = await api.get<Saved>("trip-desk/" + key);
                      populate(r);
                      setSelected(key);
                      setMessage("Trip opened.");
                    });
                }}
              >
                <option value="">Choose a saved trip</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.title || i.id.slice(0, 8)} · {i.state}
                  </option>
                ))}
              </select>
            </L>
            <button className={button} disabled={busy} onClick={reset}>
              New trip
            </button>
          </div>
          {!filed && (
            <fieldset disabled={busy} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <L label="Itinerary file">
                  <input
                    className={field}
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f)
                        void run(async () =>
                          readProgram(await itineraryFileText(f), f.name),
                        );
                    }}
                  />
                </L>
                <L label="Arrival date for numbered days">
                  <input
                    type="date"
                    className={field}
                    value={arrival}
                    onChange={(e) => setArrival(e.target.value)}
                  />
                </L>
              </div>
              <L
                label={
                  input.fileName
                    ? "Source itinerary · " + input.fileName
                    : "Paste or edit itinerary text"
                }
              >
                <textarea
                  className={field}
                  rows={4}
                  value={input.text}
                  placeholder={
                    "Day 1 – Asmara\nOvernight: Crystal Hotel\nDay 2 – Massawa\nOvernight: Grand Dahlak Hotel"
                  }
                  onChange={(e) => update({ text: e.target.value })}
                />
              </L>
              <button
                type="button"
                className={button}
                disabled={!input.text}
                onClick={() =>
                  void run(async () => readProgram(input.text, input.fileName))
                }
              >
                Read days and hotels from text
              </button>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["title", "Trip title"],
                    ["entry", "Port of entry"],
                    ["flight", "Arrival flight or overland details"],
                    ["rooms", "Room count, room types and meal basis"],
                  ] as const
                ).map(([k, label]) => (
                  <L key={k} label={label}>
                    <input
                      className={field}
                      value={input[k]}
                      onChange={(e) => update({ [k]: e.target.value })}
                    />
                  </L>
                ))}
              </div>
              <h3 className="font-semibold">Traveller manifest</h3>
              {input.travellers.map((t, i) => (
                <div
                  key={i}
                  className="space-y-3 rounded-xl border border-slate-200 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>
                      {i ? "Traveller " + (i + 1) : "Lead client"}
                    </strong>
                    <select
                      className={button}
                      aria-label={"Load CRM traveller " + (i + 1)}
                      value=""
                      onChange={(e) => {
                        const c = clients[Number(e.target.value)];
                        if (c?.id.startsWith("trav-auto-")) {
                          person(i, blankTraveller(c.fullName));
                          setMessage(
                            "This legacy automated profile needs identity details checked against the passport.",
                          );
                        } else if (c)
                          person(i, {
                            name: c.fullName,
                            nationality: c.nationality || "",
                            passport: c.passportNumber || "",
                            expiry: c.passportExpiry || "",
                            birth: c.dateOfBirth || "",
                            sex: c.gender || "",
                            occupation: c.occupation || "",
                          });
                      }}
                    >
                      <option value="">Use an existing client</option>
                      {clients.map((c, j) => (
                        <option key={j} value={j}>
                          {c.fullName} · {c.id.slice(-6)}
                        </option>
                      ))}
                    </select>
                    {i > 0 && (
                      <button
                        className={button}
                        onClick={() =>
                          update({
                            travellers: input.travellers.filter(
                              (_, n) => n !== i,
                            ),
                          })
                        }
                      >
                        Remove traveller
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {fields.map(([k, label, type]) => (
                      <L key={k} label={label}>
                        <input
                          type={type}
                          className={field}
                          value={t[k]}
                          onBlur={
                            k === "name" ? () => matchClient(i) : undefined
                          }
                          onChange={(e) => person(i, { [k]: e.target.value })}
                        />
                      </L>
                    ))}
                  </div>
                </div>
              ))}
              <button
                className={button}
                onClick={() =>
                  update({
                    travellers: [...input.travellers, blankTraveller()],
                  })
                }
              >
                Add traveller
              </button>
              <h3 className="font-semibold">Route and overnights</h3>
              {input.days.map((d, i) => (
                <div
                  key={i}
                  className="grid items-end gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[9.5rem_1fr_1fr_auto]"
                >
                  <L label={"Day " + (i + 1)}>
                    <input
                      type="date"
                      className={field}
                      value={d.date}
                      onChange={(e) => day(i, { date: e.target.value })}
                    />
                  </L>
                  <L label="Route or stops">
                    <input
                      className={field}
                      value={d.route}
                      onChange={(e) => day(i, { route: e.target.value })}
                    />
                  </L>
                  {i === input.days.length - 1 ? (
                    <span className="text-sm text-slate-600">
                      Departure day
                    </span>
                  ) : (
                    <L label="Overnight">
                      <select
                        className={field}
                        value={d.lodging === "hotel" ? d.hotelId : d.lodging}
                        onChange={(e) => {
                          const v = e.target.value;
                          day(
                            i,
                            ["camp", "unknown", "other"].includes(v)
                              ? { lodging: v, hotelId: "" }
                              : { lodging: "hotel", hotelId: v },
                          );
                        }}
                      >
                        <option value="unknown">Choose overnight</option>
                        <option value="camp">Camping</option>
                        <option value="other">Private stay / other</option>
                        {hotels.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} · {h.city}
                          </option>
                        ))}
                      </select>
                    </L>
                  )}
                  <button
                    className={button}
                    aria-label={"Remove day " + (i + 1)}
                    onClick={() =>
                      update({ days: input.days.filter((_, n) => n !== i) })
                    }
                  >
                    Remove
                  </button>
                  {i < input.days.length - 1 && d.lodging === "hotel" && (
                    <div className="sm:col-span-4">
                      <L label="Room and meal request for this night (optional override)">
                        <input
                          className={field}
                          value={d.rooms || ""}
                          placeholder={
                            input.rooms || "Use trip rooming request"
                          }
                          onChange={(e) => day(i, { rooms: e.target.value })}
                        />
                      </L>
                    </div>
                  )}
                </div>
              ))}
              <button
                className={button}
                onClick={() =>
                  update({
                    days: [
                      ...input.days,
                      {
                        date: input.days.length
                          ? offsetDate(input.days.at(-1)!.date, 1)
                          : arrival,
                        route: "",
                        hotelId: "",
                        lodging: "unknown",
                      },
                    ],
                  })
                }
              >
                Add itinerary day
              </button>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">
                  Vehicle selection and verified dispatch details
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <L label="Vehicle preference">
                    <select
                      className={field}
                      value={input.vehicleId || ""}
                      onChange={(e) =>
                        update({
                          vehicleId: e.target.value,
                          verifiedSeats: "",
                          verifiedPlate: "",
                        })
                      }
                    >
                      <option value="">
                        Automatically assign an available vehicle
                      </option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {v.capacity || "Unverified"} seats
                        </option>
                      ))}
                    </select>
                  </L>
                  {input.vehicleId && (
                    <>
                      <L label="Verified total seats if missing in fleet">
                        <input
                          className={field}
                          type="number"
                          min="1"
                          max="150"
                          value={input.verifiedSeats || ""}
                          onChange={(e) =>
                            update({ verifiedSeats: e.target.value })
                          }
                        />
                      </L>
                      <L label="Verified plate if missing in fleet">
                        <input
                          className={field}
                          value={input.verifiedPlate || ""}
                          onChange={(e) =>
                            update({ verifiedPlate: e.target.value })
                          }
                        />
                      </L>
                    </>
                  )}
                </div>
              </details>
            </fieldset>
          )}
          {result && (
            <div
              ref={preview}
              className="space-y-3 border-t border-slate-200 pt-4"
            >
              <h3 className="font-semibold">
                {filed ? "Filed trip" : "Trip preview"} · {result.reference}
              </h3>
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                {Object.entries(result.allocation).map(([k, v]) => (
                  <div className="rounded-lg bg-slate-100 p-3" key={k}>
                    <strong className="capitalize">{k}</strong>
                    <div>{v || "Awaiting assignment"}</div>
                  </div>
                ))}
              </div>
              {!!result.missing.length && (
                <div className="rounded-lg bg-amber-50 p-3 text-sm">
                  <strong>Details to complete</strong>
                  <ul className="ml-5 list-disc">
                    {result.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!filed &&
                result.driverId &&
                result.missing.includes(
                  "Driver licence number in staff record",
                ) && (
                  <L
                    label={
                      "Verified driving licence for " + result.allocation.driver
                    }
                  >
                    <input
                      className={field}
                      defaultValue=""
                      onBlur={(e) => {
                        if (e.target.value.trim())
                          update({
                            licenceDriverId: result.driverId,
                            verifiedLicence: e.target.value.trim(),
                          });
                      }}
                    />
                  </L>
                )}
              {result.documents.map((d, i) => (
                <details
                  key={i}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <summary className="cursor-pointer text-sm font-semibold">
                    <FileText className="mr-2 inline" size={16} />
                    {d.title}
                  </summary>
                  <pre className="my-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {d.body}
                  </pre>
                  <button
                    className={button}
                    onClick={() => {
                      try {
                        printDraft(d.title, d.body, result.reference);
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                    }}
                  >
                    <Printer size={15} className="mr-1 inline" /> Print draft /
                    save PDF
                  </button>
                </details>
              ))}
            </div>
          )}
          {!filed && (
            <div className="flex flex-wrap gap-2">
              <button
                className={primary}
                disabled={busy}
                onClick={() => void run(() => action("preview"))}
              >
                Preview documents and assignments
              </button>
              <button
                className={button}
                disabled={busy}
                onClick={() => void run(() => action("draft"))}
              >
                Save working draft
              </button>
              {result && !result.missing.length && (
                <button
                  className={primary}
                  disabled={busy}
                  onClick={() => void run(() => action("file"))}
                >
                  Assign resources and file drafts
                </button>
              )}
            </div>
          )}
          <p role="status" className="text-sm text-slate-700">
            {busy ? "Working…" : message}
          </p>
        </div>
      )}
    </section>
  );
}
