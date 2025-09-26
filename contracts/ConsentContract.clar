(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-TRIAL-ID u101)
(define-constant ERR-INVALID-CONSENT-HASH u102)
(define-constant ERR-INVALID-DATA-SCOPE u103)
(define-constant ERR-INVALID-TIMESTAMP u104)
(define-constant ERR-CONSENT-ALREADY-EXISTS u105)
(define-constant ERR-CONSENT-NOT-FOUND u106)
(define-constant ERR-INVALID-STATUS u107)
(define-constant ERR-INVALID-EXPIRATION u108)
(define-constant ERR-INVALID-CONDITION u109)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u110)
(define-constant ERR-INVALID-PARTICIPANT u111)
(define-constant ERR-INVALID-RESEARCHER u112)
(define-constant ERR-ACCESS-DENIED u113)
(define-constant ERR-LOG-FAILED u114)
(define-constant ERR-INVALID-SCOPE-LENGTH u115)
(define-constant ERR-INVALID-HASH-LENGTH u116)
(define-constant ERR-EXPIRATION-PASSED u117)
(define-constant ERR-CONDITION-NOT-MET u118)
(define-constant ERR-INVALID-UPDATE u119)
(define-constant ERR-MAX-CONSENTS-EXCEEDED u120)

(define-data-var next-consent-id uint u0)
(define-data-var max-consents uint u100000)
(define-data-var authority-contract (optional principal) none)
(define-data-var revocation-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var audit-logger-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var reward-distribution-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var consent-fee uint u10)

(define-map consents
  uint
  {
    participant: principal,
    trial-id: uint,
    consent-hash: (buff 32),
    timestamp: uint,
    active: bool,
    data-scope: (string-ascii 100),
    expiration: uint,
    conditions: (list 10 (string-ascii 50))
  }
)

(define-map consents-by-participant
  { participant: principal, trial-id: uint }
  uint)

(define-map access-logs
  uint
  {
    consent-id: uint,
    researcher: principal,
    access-timestamp: uint,
    granted: bool
  }
)

(define-read-only (get-consent (id uint))
  (map-get? consents id)
)

(define-read-only (get-access-log (id uint))
  (map-get? access-logs id)
)

(define-read-only (is-consent-registered (participant principal) (trial-id uint))
  (is-some (map-get? consents-by-participant { participant: participant, trial-id: trial-id }))
)

(define-private (validate-trial-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-TRIAL-ID))
)

(define-private (validate-consent-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH-LENGTH))
)

(define-private (validate-data-scope (scope (string-ascii 100)))
  (if (and (> (len scope) u0) (<= (len scope) u100))
      (ok true)
      (err ERR-INVALID-SCOPE-LENGTH))
)

(define-private (validate-expiration (exp uint))
  (if (> exp block-height)
      (ok true)
      (err ERR-INVALID-EXPIRATION))
)

(define-private (validate-conditions (conds (list 10 (string-ascii 50))))
  (if (<= (len conds) u10)
      (ok true)
      (err ERR-INVALID-CONDITION))
)

(define-private (validate-participant (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-PARTICIPANT))
)

(define-private (validate-researcher (r principal))
  (if (not (is-eq r 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-RESEARCHER))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-participant contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-consent-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set consent-fee new-fee)
    (ok true)
  )
)

(define-public (set-max-consents (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-consents new-max)
    (ok true)
  )
)

(define-public (grant-consent
  (trial-id uint)
  (consent-hash (buff 32))
  (data-scope (string-ascii 100))
  (expiration uint)
  (conditions (list 10 (string-ascii 50)))
)
  (let (
        (next-id (var-get next-consent-id))
        (current-max (var-get max-consents))
        (authority (var-get authority-contract))
        (participant tx-sender)
      )
    (asserts! (< next-id current-max) (err ERR-MAX-CONSENTS-EXCEEDED))
    (try! (validate-trial-id trial-id))
    (try! (validate-consent-hash consent-hash))
    (try! (validate-data-scope data-scope))
    (try! (validate-expiration expiration))
    (try! (validate-conditions conditions))
    (try! (validate-participant participant))
    (asserts! (not (is-consent-registered participant trial-id)) (err ERR-CONSENT-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get consent-fee) tx-sender authority-recipient))
    )
    (map-set consents next-id
      {
        participant: participant,
        trial-id: trial-id,
        consent-hash: consent-hash,
        timestamp: block-height,
        active: true,
        data-scope: data-scope,
        expiration: expiration,
        conditions: conditions
      }
    )
    (map-set consents-by-participant { participant: participant, trial-id: trial-id } next-id)
    (var-set next-consent-id (+ next-id u1))
    (print { event: "consent-granted", id: next-id })
    (ok next-id)
  )
)

(define-public (update-consent
  (consent-id uint)
  (new-data-scope (string-ascii 100))
  (new-expiration uint)
  (new-conditions (list 10 (string-ascii 50)))
)
  (let ((consent (map-get? consents consent-id)))
    (match consent
      c
        (begin
          (asserts! (is-eq (get participant c) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (get active c) (err ERR-INVALID-STATUS))
          (try! (validate-data-scope new-data-scope))
          (try! (validate-expiration new-expiration))
          (try! (validate-conditions new-conditions))
          (map-set consents consent-id
            (merge c
              {
                data-scope: new-data-scope,
                expiration: new-expiration,
                conditions: new-conditions,
                timestamp: block-height
              }
            )
          )
          (print { event: "consent-updated", id: consent-id })
          (ok true)
        )
      (err ERR-CONSENT-NOT-FOUND)
    )
  )
)

(define-public (revoke-consent (consent-id uint))
  (let ((consent (map-get? consents consent-id)))
    (match consent
      c
        (begin
          (asserts! (is-eq (get participant c) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (get active c) (err ERR-INVALID-STATUS))
          (map-set consents consent-id
            (merge c { active: false, timestamp: block-height })
          )
          (print { event: "consent-revoked", id: consent-id })
          (ok true)
        )
      (err ERR-CONSENT-NOT-FOUND)
    )
  )
)

(define-public (verify-consent (consent-id uint) (researcher principal))
  (let ((consent (map-get? consents consent-id)))
    (match consent
      c
        (begin
          (try! (validate-researcher researcher))
          (asserts! (get active c) (err ERR-INVALID-STATUS))
          (asserts! (< block-height (get expiration c)) (err ERR-EXPIRATION-PASSED))
          (map-set access-logs (len (map-get? access-logs)) ;; simplified log id
            {
              consent-id: consent-id,
              researcher: researcher,
              access-timestamp: block-height,
              granted: true
            }
          )
          (print { event: "consent-verified", id: consent-id })
          (ok true)
        )
      (err ERR-CONSENT-NOT-FOUND)
    )
  )
)

(define-public (get-consent-count)
  (ok (var-get next-consent-id))
)

(define-public (check-consent-existence (participant principal) (trial-id uint))
  (ok (is-consent-registered participant trial-id))
)