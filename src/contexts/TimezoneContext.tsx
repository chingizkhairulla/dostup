import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import {
  WorldTimezone,
  WORLD_TIMEZONES,
  getTimezoneById,
  detectBrowserTimezone,
  ensureUserTimezoneDetected,
  convertSlotToUserTimezone,
  convertUserTimeToSlotTime,
  BASE_PLATFORM_OFFSET,
  DEFAULT_TIMEZONE_ID,
} from "@/lib/timezones";

export interface FormattedSlotTime {
  date: string;
  startTime: string;
  endTime: string;
  timeRange: string;
}

interface TimezoneContextValue {
  timezone: WorldTimezone;
  userCity: string;
  setTimezone: (tz: WorldTimezone | string, customCity?: string) => void;
  formatSlotTime: (date: string, startTime: string, endTime?: string) => FormattedSlotTime;
  convertSlotToUser: (date: string, time: string) => { date: string; time: string };
  convertUserToSlot: (date: string, time: string) => { date: string; time: string };
  baseOffset: number;
}

const TimezoneContext = createContext<TimezoneContextValue | undefined>(undefined);

export const TimezoneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [timezone, setTimezoneState] = useState<WorldTimezone>(() => {
    return ensureUserTimezoneDetected();
  });

  const [userCity, setUserCityState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("app_user_city");
      if (saved) return saved;
    }
    const detected = ensureUserTimezoneDetected();
    return detected.city.split(",")[0].trim();
  });

  const setTimezone = useCallback((tz: WorldTimezone | string, customCity?: string) => {
    const resolved = typeof tz === "string" ? getTimezoneById(tz) : tz;
    setTimezoneState({ ...resolved });
    const targetCity = customCity || resolved.city.split(",")[0].trim();
    setUserCityState(targetCity);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("app_user_timezone", resolved.id);
        localStorage.setItem("app_user_city", targetCity);
      }
    } catch {
      // ignore
    }
  }, []);

  const convertSlotToUser = useCallback(
    (date: string, time: string) => {
      return convertSlotToUserTimezone(date, time, timezone.offset, BASE_PLATFORM_OFFSET);
    },
    [timezone.offset]
  );

  const convertUserToSlot = useCallback(
    (date: string, time: string) => {
      return convertUserTimeToSlotTime(date, time, timezone.offset, BASE_PLATFORM_OFFSET);
    },
    [timezone.offset]
  );

  const formatSlotTime = useCallback(
    (date: string, startTime: string, endTime?: string): FormattedSlotTime => {
      if (!startTime) {
        return { date, startTime: "", endTime: "", timeRange: "" };
      }
      const convertedStart = convertSlotToUserTimezone(date, startTime, timezone.offset, BASE_PLATFORM_OFFSET);
      const convertedEnd = endTime
        ? convertSlotToUserTimezone(date, endTime, timezone.offset, BASE_PLATFORM_OFFSET)
        : { date: convertedStart.date, time: "" };

      return {
        date: convertedStart.date,
        startTime: convertedStart.time,
        endTime: convertedEnd.time,
        timeRange: convertedEnd.time ? `${convertedStart.time} – ${convertedEnd.time}` : convertedStart.time,
      };
    },
    [timezone.offset]
  );

  const value = useMemo(
    () => ({
      timezone,
      userCity,
      setTimezone,
      formatSlotTime,
      convertSlotToUser,
      convertUserToSlot,
      baseOffset: BASE_PLATFORM_OFFSET,
    }),
    [timezone, userCity, setTimezone, formatSlotTime, convertSlotToUser, convertUserToSlot]
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
};

export const useTimezone = (): TimezoneContextValue => {
  const ctx = useContext(TimezoneContext);
  if (!ctx) {
    const defaultTz = getTimezoneById(DEFAULT_TIMEZONE_ID);
    return {
      timezone: defaultTz,
      userCity: defaultTz.city.split(",")[0].trim(),
      setTimezone: () => {},
      formatSlotTime: (date, startTime, endTime) => {
        const s = startTime?.slice(0, 5) || "";
        const e = endTime?.slice(0, 5) || "";
        return {
          date,
          startTime: s,
          endTime: e,
          timeRange: e ? `${s} – ${e}` : s,
        };
      },
      convertSlotToUser: (date, time) => ({ date, time: time?.slice(0, 5) || "" }),
      convertUserToSlot: (date, time) => ({ date, time: time?.slice(0, 5) || "" }),
      baseOffset: BASE_PLATFORM_OFFSET,
    };
  }
  return ctx;
};
