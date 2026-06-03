import { config as loadEnv } from "dotenv";

let loaded = false;

/**
 * Load .env then .env.local (the latter overrides). Calling more than once
 * is a no-op. .env.local should hold secrets and is gitignored.
 */
export function loadEnvOnce(): void {
  if (loaded) return;
  loadEnv();
  loadEnv({ path: ".env.local", override: true });
  loaded = true;
}

export type PersonaEnv = {
  name: string;
  email: string;
  password: string;
  webId: string;
};

export type RuntimeEnv = {
  issuer: string;
  roomUrl: string;
  personaA: PersonaEnv;
  personaB: PersonaEnv;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Required env var missing: ${name}`);
  return v;
}

export function readEnv(): RuntimeEnv {
  loadEnvOnce();
  return {
    issuer: required("NEXT_PUBLIC_SOLID_ISSUER"),
    roomUrl: required("NEXT_PUBLIC_ROOM_URL"),
    personaA: {
      name: process.env.NEXT_PUBLIC_PERSONA_A_NAME ?? "Persona A",
      email: required("PERSONA_A_EMAIL"),
      password: required("PERSONA_A_PASSWORD"),
      webId: required("PERSONA_A_WEBID"),
    },
    personaB: {
      name: process.env.NEXT_PUBLIC_PERSONA_B_NAME ?? "Persona B",
      email: required("PERSONA_B_EMAIL"),
      password: required("PERSONA_B_PASSWORD"),
      webId: required("PERSONA_B_WEBID"),
    },
  };
}
