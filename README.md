# 🩺 Tokenized Consent Management for Clinical Trials

Welcome to a revolutionary Web3 solution for managing patient consent in clinical trials! This project uses the Stacks blockchain and Clarity smart contracts to enable participants to grant, revoke, and monetize their consent for data sharing in an immutable, transparent, and secure manner. By tokenizing consent, participants earn rewards for contributing data, while researchers gain verifiable access, solving real-world issues like consent fraud, data privacy breaches, and inefficient incentive structures in healthcare research.

## ✨ Features

🔒 Immutable consent records with cryptographic proofs  
💰 Earn fungible tokens (e.g., via SIP-010) for data sharing participation  
🔄 Revoke consent at any time with on-chain enforcement  
📊 Track and audit data access history transparently  
🧑‍⚕️ Register clinical trials and participants securely  
✅ Verify consent status instantly for compliance  
🚫 Prevent unauthorized data access through smart contract logic  
📈 Governance for system updates and token economics  

## 🛠 How It Works

This system involves 8 interconnected Clarity smart contracts to handle various aspects of consent management, token rewards, and access control. Here's a high-level overview:

### Key Smart Contracts
1. **ParticipantRegistry.clar**: Registers participants with unique IDs, stores hashed personal info, and verifies eligibility for trials.
2. **TrialRegistry.clar**: Allows trial administrators to register new clinical trials, including metadata like trial ID, description, and required data types.
3. **ConsentContract.clar**: Manages consent granting—participants call functions to approve data sharing for specific trials, linking to timestamps and conditions.
4. **RevocationContract.clar**: Handles immutable revocations; once revoked, access is permanently blocked via on-chain flags.
5. **TokenContract.clar**: Implements a SIP-010 fungible token for rewards (e.g., "ConsentTokens"), including minting, burning, and transfer functions.
6. **RewardDistribution.clar**: Distributes tokens to participants based on data sharing milestones, triggered by oracles or admin verifications.
7. **DataAccessContract.clar**: Enforces access rules—researchers query to check consent status before accessing off-chain data, with on-chain logging.
8. **AuditLogger.clar**: Logs all actions (consents, revocations, accesses) for transparency and compliance audits.

**For Participants**  
- Register via ParticipantRegistry with your wallet address and hashed ID.  
- Browse registered trials in TrialRegistry.  
- Grant consent using ConsentContract, specifying the trial and data scope.  
- Earn tokens automatically via RewardDistribution when data is shared (e.g., confirmed by trial admins).  
- Revoke anytime with RevocationContract—immutable and instant.  

**For Researchers/Trial Admins**  
- Register a trial in TrialRegistry.  
- Query DataAccessContract to verify participant consent before using data.  
- Use AuditLogger to generate compliance reports.  
- Distribute rewards through RewardDistribution for active participants.  

**For Verifiers/Auditors**  
- Call functions in AuditLogger or ConsentContract to view immutable histories.  
- Verify token earnings and revocations on-chain.  

This setup ensures privacy (data stays off-chain, only consents are tokenized), compliance with regulations like GDPR/HIPAA through immutability, and fair incentives, reducing dropout rates in trials. Deploy on Stacks for Bitcoin-secured transactions!