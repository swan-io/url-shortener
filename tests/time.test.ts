import { expect, test } from "vitest";
import { parseDuration } from "../src/utils/time";

const parse = (value: string | undefined) => {
  const duration = parseDuration(value);

  if (duration != null) {
    return {
      milliseconds: duration.milliseconds(),
      seconds: duration.seconds(),
      minutes: duration.minutes(),
      hours: duration.hours(),
      days: duration.days(),
      weeks: duration.weeks(),
      months: duration.months(),
      years: duration.years(),
    };
  }
};

test("duration is correctly parsed", () => {
  expect(parse(undefined)).toBe(undefined);

  expect(parse("1 hour")).toStrictEqual({
    milliseconds: 0,
    seconds: 0,
    minutes: 0,
    hours: 1,
    days: 0,
    weeks: 0,
    months: 0,
    years: 0,
  });

  expect(parse("2w")).toStrictEqual({
    milliseconds: 0,
    seconds: 0,
    minutes: 0,
    hours: 0,
    days: 14,
    weeks: 2,
    months: 0,
    years: 0,
  });

  expect(parse(" 1.5  months ")).toStrictEqual({
    milliseconds: 0,
    seconds: 0,
    minutes: 0,
    hours: 5,
    days: 15,
    weeks: 6,
    months: 1,
    years: 0,
  });
});
