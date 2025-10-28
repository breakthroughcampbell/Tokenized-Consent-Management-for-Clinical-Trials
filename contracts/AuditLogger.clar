;; AuditLogger.clar

(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-INVALID-EVENT-TYPE u301)
(define-constant ERR-INVALID-PAYLOAD u302)
(define-constant ERR-INVALID-TIMESTAMP u303)
(define-constant ERR-LOG-ENTRY-FAILED u304)
(define-constant ERR-INVALID-CONSENT-ID u305)
(define-constant ERR-INVALID-TRIAL-ID u306)
(define-constant ERR-INVALID-RESEARCHER u307)
(define-constant ERR-INVALID-PARTICIPANT u308)
(define-constant ERR-INVALID-SOURCE u309)
(define-constant ERR-MAX-LOGS-EXCEEDED u310)
(define-constant ERR-INVALID-METADATA u311)

(define-data-var next-log-id uint u0)
(define-data-var max-logs uint u1000000)
(define-data-var consent-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var revocation-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var reward-contract principal 'SP000000000000000000002Q6VF78)

(define-map audit-logs
  uint
  {
    event-type: (string-ascii 50),
    consent-id: (optional uint),
    trial-id: (optional uint),
    participant: (optional principal),
    researcher: (optional principal),
    source-contract: principal,
    payload: (string-ascii 500),
    timestamp: uint,
    block-height: uint
  }
)

(define-map logs-by-consent
  uint
  (list 100 uint)
)

(define-map logs-by-participant
  principal
  (list 200 uint)
)

(define-map logs-by-researcher
  principal
  (list 200 uint)
)

(define-read-only (get-log (id uint))
  (map-get? audit-logs id)
)

(define-read-only (get-logs-by-consent (consent-id uint))
  (default-to (list) (map-get? logs-by-consent consent-id))
)

(define-read-only (get-logs-by-participant (participant principal))
  (default-to (list) (map-get? logs-by-participant participant))
)

(define-read-only (get-logs-by-researcher (researcher principal))
  (default-to (list) (map-get? logs-by-researcher researcher))
)

(define-private (validate-event-type (type (string-ascii 50)))
  (if (and (> (len type) u0) (<= (len type) u50))
      (ok true)
      (err ERR-INVALID-EVENT-TYPE))
)

(define-private (validate-payload (payload (string-ascii 500)))
  (if (<= (len payload) u500)
      (ok true)
      (err ERR-INVALID-PAYLOAD))
)

(define-private (validate-source (source principal))
  (if (or 
        (is-eq source (var-get consent-contract))
        (is-eq source (var-get revocation-contract))
        (is-eq source (var-get reward-contract))
      )
      (ok true)
      (err ERR-INVALID-SOURCE))
)

(define-private (validate-consent-id (id (optional uint)))
  (match id
    val (if (> val u0) (ok true) (err ERR-INVALID-CONSENT-ID))
    (ok true))
)

(define-private (validate-trial-id (id (optional uint)))
  (match id
    val (if (> val u0) (ok true) (err ERR-INVALID-TRIAL-ID))
    (ok true))
)

(define-private (validate-principal-opt (p (optional principal)))
  (match p
    val (if (not (is-eq val 'SP000000000000000000002Q6VF78)) (ok true) (err ERR-INVALID-PARTICIPANT))
    (ok true))
)

(define-public (set-consent-contract (contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get consent-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set consent-contract contract)
    (ok true)
  )
)

(define-public (set-revocation-contract (contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get consent-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set revocation-contract contract)
    (ok true)
  )
)

(define-public (set-reward-contract (contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get consent-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set reward-contract contract)
    (ok true)
  )
)

(define-public (log-event
  (event-type (string-ascii 50))
  (consent-id (optional uint))
  (trial-id (optional uint))
  (participant (optional principal))
  (researcher (optional principal))
  (payload (string-ascii 500))
)
  (let (
        (next-id (var-get next-log-id))
        (current-max (var-get max-logs))
        (source tx-sender)
      )
    (asserts! (< next-id current-max) (err ERR-MAX-LOGS-EXCEEDED))
    (try! (validate-event-type event-type))
    (try! (validate-payload payload))
    (try! (validate-source source))
    (try! (validate-consent-id consent-id))
    (try! (validate-trial-id trial-id))
    (try! (validate-principal-opt participant))
    (try! (validate-principal-opt researcher))
    (map-set audit-logs next-id
      {
        event-type: event-type,
        consent-id: consent-id,
        trial-id: trial-id,
        participant: participant,
        researcher: researcher,
        source-contract: source,
        payload: payload,
        timestamp: (get-block-info? time u0),
        block-height: block-height
      }
    )
    (match consent-id
      cid
        (let ((current-list (default-to (list) (map-get? logs-by-consent cid))))
          (map-set logs-by-consent cid (try! (as-max-len? (append current-list next-id) u100)))
        )
      (begin true)
    )
    (match participant
      p
        (let ((current-list (default-to (list) (map-get? logs-by-participant p))))
          (map-set logs-by-participant p (try! (as-max-len? (append current-list next-id) u200)))
        )
      (begin true)
    )
    (match researcher
      r
        (let ((current-list (default-to (list) (map-get? logs-by-researcher r))))
          (map-set logs-by-researcher r (try! (as-max-len? (append current-list next-id) u200)))
        )
      (begin true)
    )
    (var-set next-log-id (+ next-id u1))
    (print { event: "audit-logged", log-id: next-id, type: event-type })
    (ok next-id)
  )
)

(define-public (get-log-count)
  (ok (var-get next-log-id))
)