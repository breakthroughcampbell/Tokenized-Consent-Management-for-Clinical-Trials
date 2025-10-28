// RevocationContract.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, principalCV, stringAsciiCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 200;
const ERR_INVALID_CONSENT_ID = 201;
const ERR_CONSENT_NOT_FOUND = 202;
const ERR_ALREADY_REVOKED = 203;
const ERR_INVALID_REASON_LENGTH = 211;
const ERR_MAX_REVOCATIONS_EXCEEDED = 210;

interface Revocation {
  consentId: number;
  participant: string;
  reason: string;
  timestamp: number;
  revokedBy: string;
  status: boolean;
}

interface RevocationLog {
  revocationId: number;
  researcher: string;
  accessDenied: boolean;
  logTimestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ConsentContractStub {
  consents: Map<number, any> = new Map();
  activeStatus: Map<number, boolean> = new Map();

  getConsent(id: number): any {
    return this.consents.get(id) || null;
  }

  revokeConsent(id: number): Result<boolean> {
    if (!this.consents.has(id)) return { ok: false, value: false };
    this.activeStatus.set(id, false);
    return { ok: true, value: true };
  }

  setConsent(id: number, data: any) {
    this.consents.set(id, data);
    this.activeStatus.set(id, true);
  }
}

class RevocationContractMock {
  state: {
    nextRevocationId: number;
    maxRevocations: number;
    consentContract: string;
    auditLoggerContract: string;
    revocations: Map<number, Revocation>;
    revocationsByConsent: Map<number, number>;
    revocationLogs: Map<number, RevocationLog>;
  } = {
    nextRevocationId: 0,
    maxRevocations: 50000,
    consentContract: "ST1CONSENT",
    auditLoggerContract: "ST1AUDIT",
    revocations: new Map(),
    revocationsByConsent: new Map(),
    revocationLogs: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1PARTICIPANT";
  consentStub: ConsentContractStub;

  constructor() {
    this.consentStub = new ConsentContractStub();
    this.reset();
  }

  reset() {
    this.state = {
      nextRevocationId: 0,
      maxRevocations: 50000,
      consentContract: "ST1CONSENT",
      auditLoggerContract: "ST1AUDIT",
      revocations: new Map(),
      revocationsByConsent: new Map(),
      revocationLogs: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1PARTICIPANT";
    this.consentStub = new ConsentContractStub();
  }

  setConsentContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.consentContract) return { ok: false, value: false };
    this.state.consentContract = contract;
    return { ok: true, value: true };
  }

  revokeConsent(consentId: number, reason: string): Result<number> {
    if (this.state.nextRevocationId >= this.state.maxRevocations) return { ok: false, value: ERR_MAX_REVOCATIONS_EXCEEDED };
    if (consentId <= 0) return { ok: false, value: ERR_INVALID_CONSENT_ID };
    if (!reason || reason.length > 200) return { ok: false, value: ERR_INVALID_REASON_LENGTH };
    if (this.state.revocationsByConsent.has(consentId)) return { ok: false, value: ERR_ALREADY_REVOKED };
    if (this.caller === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_NOT_AUTHORIZED };

    const consent = this.consentStub.getConsent(consentId);
    if (!consent) return { ok: false, value: ERR_CONSENT_NOT_FOUND };
    if (consent.participant !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.consentStub.activeStatus.get(consentId)) return { ok: false, value: ERR_NOT_AUTHORIZED };

    const id = this.state.nextRevocationId;
    const revocation: Revocation = {
      consentId,
      participant: this.caller,
      reason,
      timestamp: this.blockHeight,
      revokedBy: this.caller,
      status: true,
    };
    this.state.revocations.set(id, revocation);
    this.state.revocationsByConsent.set(consentId, id);
    this.state.nextRevocationId++;

    this.consentStub.revokeConsent(consentId);
    return { ok: true, value: id };
  }

  checkRevocationStatus(consentId: number, researcher: string): Result<number> {
    const revId = this.state.revocationsByConsent.get(consentId);
    if (!revId) return { ok: true, value: 0 };

    const logId = this.state.revocationLogs.size;
    const log: RevocationLog = {
      revocationId: revId,
      researcher,
      accessDenied: true,
      logTimestamp: this.blockHeight,
    };
    this.state.revocationLogs.set(logId, log);
    return { ok: false, value: 1 };
  }

  getRevocationCount(): Result<number> {
    return { ok: true, value: this.state.nextRevocationId };
  }
}

describe("RevocationContract", () => {
  let contract: RevocationContractMock;

  beforeEach(() => {
    contract = new RevocationContractMock();
    contract.reset();
  });

  it("revokes consent successfully", () => {
    contract.consentStub.setConsent(1, { participant: "ST1PARTICIPANT", active: true });
    const result = contract.revokeConsent(1, "Withdrew participation");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const revocation = contract.state.revocations.get(0);
    expect(revocation?.reason).toBe("Withdrew participation");
    expect(revocation?.status).toBe(true);
  });

  it("rejects already revoked consent", () => {
    contract.consentStub.setConsent(1, { participant: "ST1PARTICIPANT", active: true });
    contract.revokeConsent(1, "First reason");
    const result = contract.revokeConsent(1, "Second reason");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_REVOKED);
  });

  it("rejects non-existent consent", () => {
    const result = contract.revokeConsent(99, "Reason");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CONSENT_NOT_FOUND);
  });

  it("rejects unauthorized participant", () => {
    contract.consentStub.setConsent(1, { participant: "ST2OTHER", active: true });
    const result = contract.revokeConsent(1, "Reason");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("allows access if not revoked", () => {
    const result = contract.checkRevocationStatus(1, "ST3RESEARCHER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
  });

  it("sets consent contract successfully", () => {
    contract.caller = "ST1CONSENT";
    const result = contract.setConsentContract("ST2NEW");
    expect(result.ok).toBe(true);
    expect(contract.state.consentContract).toBe("ST2NEW");
  });

  it("rejects unauthorized contract setter", () => {
    const result = contract.setConsentContract("ST2NEW");
    expect(result.ok).toBe(false);
  });

  it("returns correct revocation count", () => {
    contract.consentStub.setConsent(1, { participant: "ST1PARTICIPANT", active: true });
    contract.consentStub.setConsent(2, { participant: "ST1PARTICIPANT", active: true });
    contract.revokeConsent(1, "Reason 1");
    contract.revokeConsent(2, "Reason 2");
    const result = contract.getRevocationCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects max revocations exceeded", () => {
    contract.state.maxRevocations = 1;
    contract.consentStub.setConsent(1, { participant: "ST1PARTICIPANT", active: true });
    contract.revokeConsent(1, "First");
    const result = contract.revokeConsent(2, "Second");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_REVOCATIONS_EXCEEDED);
  });
});