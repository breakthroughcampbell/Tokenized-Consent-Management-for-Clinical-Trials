(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-CONSENT-ID u201)
(define-constant ERR-CONSENT-NOT-FOUND u202)
(define-constant ERR-ALREADY-REVOKED u203)
(define-constant ERR-INVALID-REASON u204)
(define-constant ERR-INVALID-TIMESTAMP u205)
(define-constant ERR-CONSENT-CONTRACT-MISSING u206)
(define-constant ERR-REVOKE-FAILED u207)
(define-constant ERR-INVALID-RESEARCHER u208)
(define-constant ERR-INVALID-STATUS u209)
(define-constant ERR-MAX-REVOCATIONS-EXCEEDED u210)
(define-constant ERR-INVALID-REASON-LENGTH u211)
(define-constant ERR-LOG-ENTRY-FAILED u212)

(define-data-var next-revocation-id uint u0)
(define-data-var max-revocations uint u50000)
(define-data-var consent-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var audit-logger-contract principal 'SP000000000000000000002Q6VF78)

(define-map revocations
  uint
  {
    consent-id: uint,
    participant: principal,
    reason: (string-ascii 200),
    timestamp: uint,
    revoked-by: principal,
    status: bool
  }
)

(define-map revocations-by-consent
  uint
  uint)

(define-map revocation-logs
  uint
  {
    revocation-id: uint,
    researcher: principal,
    access-denied: bool,
    log-timestamp: uint
  }
)

(define-read-only (get-revocation (id uint))
  (map-get? revocations id)
)

(define-read-only (get-revocation-by-consent (consent-id uint))
  (map-get? revocations-by-consent consent-id)
)

(define-read-only (is-revoked (consent-id uint))
  (match (map-get? revocations-by-consent consent-id)
    rev-id (ok (get status (unwrap-panic (map-get? revocations rev-id))))
    (err u0))
)

(define-private (validate-consent-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-CONSENT-ID))
)

(define-private (validate-reason (reason (string-ascii 200)))
  (if (and (> (len reason) u0) (<= (len reason) u200))
      (ok true)
      (err ERR-INVALID-REASON-LENGTH))
)

(define-private (validate-participant (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-consent-contract (contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get consent-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set consent-contract contract)
    (ok true)
  )
)

(define-public (set-audit-logger (contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get consent-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set audit-logger-contract contract)
    (ok true)
  )
)

(define-public (revoke-consent
  (consent-id uint)
  (reason (string-ascii 200))
)
  (let (
        (next-id (var-get next-revocation-id))
        (current-max (var-get max-revocations))
        (participant tx-sender)
      )
    (asserts! (< next-id current-max) (err ERR-MAX-REVOCATIONS-EXCEEDED))
    (try! (validate-consent-id consent-id))
    (try! (validate-reason reason))
    (try! (validate-participant participant))
    (asserts! (is-none (map-get? revocations-by-consent consent-id)) (err ERR-ALREADY-REVOKED))
    (let ((consent-result (contract-call? (var-get consent-contract) get-consent consent-id)))
      (match consent-result
        consent
          (begin
            (asserts! (is-eq (get participant consent) participant) (err ERR-NOT-AUTHORIZED))
            (asserts! (get active consent) (err ERR-INVALID-STATUS))
            (map-set revocations next-id
              {
                consent-id: consent-id,
                participant: participant,
                reason: reason,
                timestamp: block-height,
                revoked-by: participant,
                status: true
              }
            )
            (map-set revocations-by-consent consent-id next-id)
            (var-set next-revocation-id (+ next-id u1))
            (try! (contract-call? (var-get consent-contract) revoke-consent consent-id))
            (print { event: "consent-revoked", consent-id: consent-id, revocation-id: next-id })
            (ok next-id)
          )
        (err ERR-CONSENT-NOT-FOUND)
      )
    )
  )
)

(define-public (check-revocation-status (consent-id uint) (researcher principal))
  (let ((revocation (map-get? revocations-by-consent consent-id)))
    (match revocation
      rev-id
        (let ((rev (unwrap-panic (map-get? revocations rev-id))))
          (map-set revocation-logs (len (map-get? revocation-logs))
            {
              revocation-id: rev-id,
              researcher: researcher,
              access-denied: true,
              log-timestamp: block-height
            }
          )
          (print { event: "access-denied-revoked", consent-id: consent-id })
          (err u1)
        )
      (ok u0))
  )
)

(define-public (get-revocation-count)
  (ok (var-get next-revocation-id))
)