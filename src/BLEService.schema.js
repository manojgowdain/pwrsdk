import { z } from "zod";

// ==========================
// Zod Schemas for BLEService
// ==========================

// Raw BLE payload: "HR,SPO2,TEMP_C,BATTERY,STEPS"
// Validated as a comma-separated string of exactly 5 numeric fields,
// each within a physiologically/device-sane range, before any
// downstream math (unit conversion, calories, distance) runs on it.
export const RawPayloadSchema = z
  .string()
  .trim()
  .refine((val) => val.split(",").length === 5, {
    message: "Payload must contain exactly 5 comma-separated fields",
  });

export const HealthReadingSchema = z.object({
  hr: z.number().finite().min(0).max(300),
  spo2: z.number().finite().min(0).max(100),
  tempC: z.number().finite().min(-20).max(60),
  battery: z.number().finite().min(0).max(100),
  steps: z.number().finite().min(0),
});

// Output shape returned to callers via monitorHealthMetrics's callback.
export const HealthMetricsSchema = z.object({
  heartRate: z.number(),
  spo2: z.number(),
  temperature: z.object({
    celsius: z.number(),
    fahrenheit: z.number(),
    kelvin: z.number(),
  }),
  battery: z.number(),
  steps: z.number(),
  calories: z.number(),
  distance: z.number(),
  // raw: z.string(),
});

export const DeviceIdSchema = z.string().min(1, "deviceId must be a non-empty string");

export const DeviceObjectSchema = z
  .object({
    connect: z.function(),
  })
  .passthrough();

// react-native-ble-plx expects base64-encoded characteristic writes.
export const Base64Schema = z
  .string()
  .min(1, "Command must be a non-empty base64 string")
  .regex(/^[A-Za-z0-9+/]+=*$/, "Command must be valid base64");

export const CharacteristicUUIDSchema = z
  .string()
  .min(1, "characteristicUUID must be a non-empty string");