// AuditLogger.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, principalCV, some, none } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 300;
const ERR_INVALID_EVENT_TYPE = 301;
const ERR_INVALID_PAYLOAD = 302;
const ERR_INVALID_SOURCE = 309;
const ERR_MAX_LOGS_EXCEEDED = 310;
const ERR_INVALID_CONSENT_ID = 305;
const ERR_INVALID_TRIAL_ID = 306;

interface AuditLog {
  eventType: string;
  consentId: number | null;
  trialId: number | null;
  participant: string | null;
  researcher: string | null;
  sourceContract: string;
  payload: string;
  timestamp: number | null;
  blockHeight: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AuditLoggerMock {
  state: {
    nextLogId: number;
    maxLogs: number;
    consentContract: string;
    revocationContract: string;
    rewardContract: string;
    auditLogs: Map<number, AuditLog>;
    logsByConsent: Map<number, number[]>;
    logsByParticipant: Map<string, number[]>;
    logsByResearcher: Map<string, number[]>;
  } = {
    nextLogId: 0,
    maxLogs: 1000000,
    consentContract: "ST1CONSENT",
    revocationContract: "ST1REVOCATION",
    rewardContract: "ST1REWARD",
    auditLogs: new Map(),
    logsByConsent: new Map(),
    logsByParticipant: new Map(),
    logsByResearcher: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1CONSENT";
  blockTime: number = 1700000000;

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextLogId: 0,
      maxLogs: 1000000,
      consentContract: "ST1CONSENT",
      revocationContract: "ST1REVOCATION",
      rewardContract: "ST1REWARD",
      auditLogs: new Map(),
      logsByConsent: new Map(),
      logsByParticipant: new Map(),
      logsByResearcher: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1CONSENT";
    this.blockTime = 1700000000;
  }

  setConsentContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.consentContract) return { ok: false, value: false };
    this.state.consentContract = contract;
    return { ok: true, value: true };
  }

  setRevocationContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.consentContract) return { ok: false, value: false };
    this.state.revocationContract = contract;
    return { ok: true, value: true };
  }

  setRewardContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.consentContract) return { ok: false, value: false };
    this.state.rewardContract = contract;
    return { ok: true, value: true };
  }

  logEvent(
    eventType: string,
    consentId: number | null,
    trialId: number | null,
    participant: string | null,
    researcher: string | null,
    payload: string
  ): Result<number> {
    if (this.state.nextLogId >= this.state.maxLogs) return { ok: false, value: ERR_MAX_LOGS_EXCEEDED };
    if (!eventType || eventType.length > 50) return { ok: false, value: ERR_INVALID_EVENT_TYPE };
    if (payload.length > 500) return { ok: false, value: ERR_INVALID_PAYLOAD };
    if (![this.state.consentContract, this.state.revocationContract, this.state.rewardContract].includes(this.caller))
      return { ok: false, value: ERR_INVALID_SOURCE };
    if (consentId !== null && consentId <= 0) return { ok: false, value: ERR_INVALID_CONSENT_ID };
    if (trialId !== null && trialId <= 0) return { ok: false, value: ERR_INVALID_TRIAL_ID };

    const id = this.state.nextLogId;
    const log: AuditLog = {
      eventType,
      consentId,
      trialId,
      participant,
      researcher,
      sourceContract: this.caller,
      payload,
      timestamp: this.blockTime,
      blockHeight: this.blockHeight,
    };
    this.state.auditLogs.set(id, log);

    if (consentId !== null) {
      const list = this.state.logsByConsent.get(consentId) || [];
      if (list.length < 100) {
        this.state.logsByConsent.set(consentId, [...list, id]);
      }
    }
    if (participant !== null) {
      const list = this.state.logsByParticipant.get(participant) || [];
      if (list.length < 200) {
        this.state.logsByParticipant.set(participant, [...list, id]);
      }
    }
    if (researcher !== null) {
      const list = this.state.logsByResearcher.get(researcher) || [];
      if (list.length < 200) {
        this.state.logsByResearcher.set(researcher, [...list, id]);
      }
    }

    this.state.nextLogId++;
    return { ok: true, value: id };
  }

  getLog(id: number): AuditLog | null {
    return this.state.auditLogs.get(id) || null;
  }

  getLogsByConsent(consentId: number): number[] {
    return this.state.logsByConsent.get(consentId) || [];
  }

  getLogsByParticipant(participant: string): number[] {
    return this.state.logsByParticipant.get(participant) || [];
  }

  getLogsByResearcher(researcher: string): number[] {
    return this.state.logsByResearcher.get(researcher) || [];
  }

  getLogCount(): Result<number> {
    return { ok: true, value: this.state.nextLogId };
  }
}

describe("AuditLogger", () => {
  let contract: AuditLoggerMock;

  beforeEach(() => {
    contract = new AuditLoggerMock();
    contract.reset();
  });

  it("logs event successfully from consent contract", () => {
    const result = contract.logEvent("consent-granted", 1, 10, "ST1P", null, "hash:abc123");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const log = contract.getLog(0);
    expect(log?.eventType).toBe("consent-granted");
    expect(log?.consentId).toBe(1);
    expect(log?.participant).toBe("ST1P");
    expect(log?.sourceContract).toBe("ST1CONSENT");
  });

  it("indexes logs by consent id", () => {
    contract.logEvent("consent-granted", 1, 10, "ST1P", null, "data");
    contract.logEvent("consent-updated", 1, 10, "ST1P", null, "updated");
    const list = contract.getLogsByConsent(1);
    expect(list).toEqual([0, 1]);
  });

  it("indexes logs by participant", () => {
    contract.logEvent("consent-granted", 1, 10, "ST1P", null, "data");
    contract.logEvent("consent-revoked", 2, 20, "ST1P", null, "revoked");
    const list = contract.getLogsByParticipant("ST1P");
    expect(list).toEqual([0, 1]);
  });

  it("indexes logs by researcher", () => {
    contract.caller = "ST1REVOCATION";
    contract.logEvent("access-denied", 1, 10, null, "ST3R", "blocked");
    const list = contract.getLogsByResearcher("ST3R");
    expect(list).toEqual([0]);
  });

  it("rejects unauthorized source", () => {
    contract.caller = "ST9HACKER";
    const result = contract.logEvent("hack", 1, 10, "ST1P", null, "malicious");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SOURCE);
  });

  it("rejects invalid event type", () => {
    const longType = "a".repeat(51);
    const result = contract.logEvent(longType, 1, 10, "ST1P", null, "data");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EVENT_TYPE);
  });

  it("rejects payload too long", () => {
    const longPayload = "x".repeat(501);
    const result = contract.logEvent("event", 1, 10, "ST1P", null, longPayload);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PAYLOAD);
  });

  it("caps index lists at limits", () => {
    for (let i = 0; i < 105; i++) {
      contract.logEvent("event", 1, 10, "ST1P", null, `entry ${i}`);
    }
    const list = contract.getLogsByConsent(1);
    expect(list.length).toBe(100);
  });

  it("sets contracts successfully", () => {
    contract.setConsentContract("ST2NEW");
    expect(contract.state.consentContract).toBe("ST2NEW");
  });

  it("rejects unauthorized contract setter", () => {
    contract.caller = "ST9HACKER";
    const result = contract.setConsentContract("ST2NEW");
    expect(result.ok).toBe(false);
  });

  it("returns correct log count", () => {
    contract.logEvent("a", 1, 10, "P1", null, "1");
    contract.logEvent("b", 2, 20, "P2", null, "2");
    const result = contract.getLogCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("handles null optionals correctly", () => {
    const result = contract.logEvent("access", null, null, null, "ST3R", "view");
    expect(result.ok).toBe(true);
    const log = contract.getLog(0);
    expect(log?.consentId).toBe(null);
    expect(log?.researcher).toBe("ST3R");
  });

  it("rejects max logs exceeded", () => {
    contract.state.maxLogs = 1;
    contract.logEvent("a", 1, 10, "P1", null, "1");
    const result = contract.logEvent("b", 2, 20, "P2", null, "2");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_LOGS_EXCEEDED);
  });
});