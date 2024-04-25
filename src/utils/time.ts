import { Dict } from "@swan-io/boxed";
import dayjs from "dayjs";
import duration, { DurationUnitType } from "dayjs/plugin/duration";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(duration);

const deriveUnion = <T extends PropertyKey>(object: Record<T, null>) => {
  const array = Dict.keys(object);
  const set = new Set(array);
  const is = (value: unknown): value is T => set.has(value as T);
  return { array, set, is };
};

// https://day.js.org/docs/en/durations/creating#list-of-all-available-units
const units = deriveUnion({
  milliseconds: null,
  seconds: null,
  minutes: null,
  hours: null,
  days: null,
  weeks: null,
  months: null,
  years: null,

  millisecond: null,
  second: null,
  minute: null,
  hour: null,
  day: null,
  week: null,
  month: null,
  year: null,

  ms: null, // milliseconds
  s: null, // seconds
  m: null, // minutes
  h: null, // hours
  d: null, // days
  D: null, // days
  w: null, // weeks
  M: null, // months
  y: null, // years
} satisfies Record<DurationUnitType, null>);

const regExp = new RegExp(`^(\\d+(?:\\.\\d+)?) *(${units.array.join("|")})$`);

export const parseDuration = (value: string | undefined) => {
  const match = value?.trim().match(regExp);

  if (match != null) {
    const number = Number(match[1]);
    const unit = match[2];

    if (Number.isFinite(number) && units.is(unit)) {
      return dayjs.duration(number, unit);
    }
  }
};
