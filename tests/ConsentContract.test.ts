import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, principalCV, buffCV, listCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_TRIAL_ID = 101;
const ERR_INVALID_CONSENT_HASH = 102;
const ERR_INVALID_DATA_SCOPE = 103;
const ERR_INVALID_EXPIRATION = 108;
const ERR_INVALID_CONDITION = 109;
const ERR_CONSENT_ALREADY_EXISTS = 105;
const ERR_CONSENT_NOT_FOUND = 106;
const ERR_INVALID_STATUS = 107;
const ERR_AUTHORITY_NOT_VERIFIED = 110;
const ERR_INVALID_PARTICIPANT = 111;
const ERR_INVALID_RESEARCHER = 112;
const ERR_EXPIRATION_PASSED = 117;
const ERR_MAX_CONSENTS_EXCEEDED = 120;
const ERR_INVALID_SCOPE_LENGTH = 115;
const ERR_INVALID_HASH_LENGTH = 116;
const ERR_INVALID_UPDATE = 119;

interface Consent {
  participant: string;
  trialId: number;
  consentHash: Uint8Array;
  timestamp: number;
  active: boolean;
  dataScope: string;
  expiration: number;
  conditions: string[];
}

interface AccessLog {
  consentId: number;
  researcher: string;
  accessTimestamp: number;
  granted: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ConsentContractMock {
  state: {
    nextConsentId: number;
    maxConsents: number;
    authorityContract: string | null;
    revocationContract: string;
    auditLoggerContract: string;
    rewardDistributionContract: string;
    consentFee: number;
    consents: Map<number, Consent>;
    consentsByParticipant: Map<string, number>;
    accessLogs: Map<number, AccessLog>;
  } = {
    nextConsentId: 0,
    maxConsents: 100000,
    authorityContract: null,
    revocationContract: "SP000000000000000000002Q6VF78",
    auditLoggerContract: "SP000000000000000000002Q6VF78",
    rewardDistributionContract: "SP000000000000000000002Q6VF78",
    consentFee: 10,
    consents: new Map(),
    consentsByParticipant: new Map(),
    accessLogs: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1PARTICIPANT";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextConsentId: 0,
      maxConsents: 100000,
      authorityContract: null,
      revocationContract: "SP000000000000000000002Q6VF78",
      auditLoggerContract: "SP000000000000000000002Q6VF78",
      rewardDistributionContract: "SP000000000000000000002Q6VF78",
      consentFee: 10,
      consents: new Map(),
      consentsByParticipant: new Map(),
      accessLogs: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1PARTICIPANT";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setConsentFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.consentFee = newFee;
    return { ok: true, value: true };
  }

  grantConsent(
    trialId: number,
    consentHash: Uint8Array,
    dataScope: string,
    expiration: number,
    conditions: string[]
  ): Result<number> {
    if (this.state.nextConsentId >= this.state.maxConsents) return { ok: false, value: ERR_MAX_CONSENTS_EXCEEDED };
    if (trialId <= 0) return { ok: false, value: ERR_INVALID_TRIAL_ID };
    if (consentHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH_LENGTH };
    if (!dataScope || dataScope.length > 100) return { ok: false, value: ERR_INVALID_SCOPE_LENGTH };
    if (expiration <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRATION };
    if (conditions.length > 10) return { ok: false, value: ERR_INVALID_CONDITION };
    if (this.caller === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PARTICIPANT };
    const key = `${this.caller}-${trialId}`;
    if (this.state.consentsByParticipant.has(key)) return { ok: false, value: ERR_CONSENT_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.consentFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextConsentId;
    const consent: Consent = {
      participant: this.caller,
      trialId,
      consentHash,
      timestamp: this.blockHeight,
      active: true,
      dataScope,
      expiration,
      conditions,
    };
    this.state.consents.set(id, consent);
    this.state.consentsByParticipant.set(key, id);
    this.state.nextConsentId++;
    return { ok: true, value: id };
  }

  getConsent(id: number): Consent | null {
    return this.state.consents.get(id) || null;
  }

  updateConsent(id: number, newDataScope: string, newExpiration: number, newConditions: string[]): Result<boolean> {
    const consent = this.state.consents.get(id);
    if (!consent) return { ok: false, value: false };
    if (consent.participant !== this.caller) return { ok: false, value: false };
    if (!consent.active) return { ok: false, value: false };
    if (!newDataScope || newDataScope.length > 100) return { ok: false, value: false };
    if (newExpiration <= this.blockHeight) return { ok: false, value: false };
    if (newConditions.length > 10) return { ok: false, value: false };

    const updated: Consent = {
      ...consent,
      dataScope: newDataScope,
      expiration: newExpiration,
      conditions: newConditions,
      timestamp: this.blockHeight,
    };
    this.state.consents.set(id, updated);
    return { ok: true, value: true };
  }

  revokeConsent(id: number): Result<boolean> {
    const consent = this.state.consents.get(id);
    if (!consent) return { ok: false, value: false };
    if (consent.participant !== this.caller) return { ok: false, value: false };
    if (!consent.active) return { ok: false, value: false };

    const updated: Consent = {
      ...consent,
      active: false,
      timestamp: this.blockHeight,
    };
    this.state.consents.set(id, updated);
    return { ok: true, value: true };
  }

  verifyConsent(id: number, researcher: string): Result<boolean> {
    const consent = this.state.consents.get(id);
    if (!consent) return { ok: false, value: false };
    if (researcher === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    if (!consent.active) return { ok: false, value: false };
    if (this.blockHeight >= consent.expiration) return { ok: false, value: ERR_EXPIRATION_PASSED };

    const logId = this.state.accessLogs.size;
    const log: AccessLog = {
      consentId: id,
      researcher,
      accessTimestamp: this.blockHeight,
      granted: true,
    };
    this.state.accessLogs.set(logId, log);
    return { ok: true, value: true };
  }

  getConsentCount(): Result<number> {
    return { ok: true, value: this.state.nextConsentId };
  }

  checkConsentExistence(participant: string, trialId: number): Result<boolean> {
    const key = `${participant}-${trialId}`;
    return { ok: true, value: this.state.consentsByParticipant.has(key) };
  }
}

describe("ConsentContract", () => {
  let contract: ConsentContractMock;

  beforeEach(() => {
    contract = new ConsentContractMock();
    contract.reset();
  });

  it("grants consent successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(0);
    const result = contract.grantConsent(1, hash, "health-data", 100, ["anon"]);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const consent = contract.getConsent(0);
    expect(consent?.trialId).toBe(1);
    expect(consent?.dataScope).toBe("health-data");
    expect(consent?.active).toBe(true);
    expect(contract.stxTransfers).toEqual([{ amount: 10, from: "ST1PARTICIPANT", to: "ST2AUTH" }]);
  });

  it("rejects duplicate consent", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(0);
    contract.grantConsent(1, hash, "health-data", 100, ["anon"]);
    const result = contract.grantConsent(1, hash, "other-data", 200, ["public"]);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CONSENT_ALREADY_EXISTS);
  });

  it("rejects without authority", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.grantConsent(1, hash, "health-data", 100, ["anon"]);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid trial id", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(0);
    const result = contract.grantConsent(0, hash, "health-data", 100, ["anon"]);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TRIAL_ID);
  });

  it("rejects invalid hash length", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(31).fill(0);
    const result = contract.grantConsent(1, hash, "health-data", 100, ["anon"]);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH_LENGTH);
  });

  it("updates consent successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(0);
    contract.grantConsent(1, hash, "old-data", 100, ["old"]);
    const result = contract.updateConsent(0, "new-data", 200, ["new"]);
    expect(result.ok).toBe(true);
    const consent = contract.getConsent(0);
    expect(consent?.dataScope).toBe("new-data");
    expect(consent?.expiration).toBe(200);
    expect(consent?.conditions).toEqual(["new"]);
  });

  it("rejects update for non-existent consent", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.updateConsent(99, "new-data", 200, ["new"]);
    expect(result.ok).toBe(false);
  });

  it("rejects update by non-participant", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(0);
    contract.grantConsent(1, hash, "health-data", 100, ["anon"]);
    contract.caller = "ST3OTHER";
    const result = contract.updateConsent(0, "new-data", 200, ["new"]);
    expect(result.ok).toBe(false);
  });

  it("revokes consent successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(0);
    contract.grantConsent(1, hash, "health-data", 100, ["anon"]);
    const result = contract.revokeConsent(0);
    expect(result.ok).toBe(true);
    const consent = contract.getConsent(0);
    expect(consent?.active).toBe(false);
  });

  it("rejects revoke for non-existent", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.revokeConsent(99);
    expect(result.ok).toBe(false);
  });

  it("verifies consent successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(0);
    contract.grantConsent(1, hash, "health-data", 100, ["anon"]);
    const result = contract.verifyConsent(0, "ST4RESEARCHER");
    expect(result.ok).toBe(true);
    const log = contract.state.accessLogs.get(0);
    expect(log?.researcher).toBe("ST4RESEARCHER");
    expect(log?.granted).toBe(true);
  });

  it("rejects verify for expired consent", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(0);
    contract.grantConsent(1, hash, "health-data", 100, ["anon"]);
    contract.blockHeight = 101;
    const result = contract.verifyConsent(0, "ST4RESEARCHER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_EXPIRATION_PASSED);
  });

  it("sets consent fee successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setConsentFee(20);
    expect(result.ok).toBe(true);
    expect(contract.state.consentFee).toBe(20);
  });

  it("returns correct consent count", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(0);
    contract.grantConsent(1, hash, "data1", 100, ["c1"]);
    contract.grantConsent(2, hash, "data2", 200, ["c2"]);
    const result = contract.getConsentCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks consent existence correctly", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(0);
    contract.grantConsent(1, hash, "health-data", 100, ["anon"]);
    const result = contract.checkConsentExistence("ST1PARTICIPANT", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkConsentExistence("ST1PARTICIPANT", 2);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects grant with max consents exceeded", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.state.maxConsents = 1;
    const hash = new Uint8Array(32).fill(0);
    contract.grantConsent(1, hash, "data1", 100, ["c1"]);
    const result = contract.grantConsent(2, hash, "data2", 200, ["c2"]);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_CONSENTS_EXCEEDED);
  });
});