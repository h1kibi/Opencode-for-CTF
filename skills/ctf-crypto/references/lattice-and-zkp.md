# Lattice / HNP / ZKP Triage

## Triggers

Load this reference only when the challenge exposes a bounded algebraic leak or a transcript-level proof weakness, for example:

- many noisy modular relations, short secrets, partial nonce bits, or unusually small errors;
- ECDSA/DSA signatures sharing a key with biased or partially known nonces;
- LCG/PRNG outputs with truncated bits or a small hidden state;
- subset-sum/knapsack instances with a plausible density or low-dimensional structure;
- LWE/Ring-LWE/Module-LWE samples with unusually small noise or a deliberately weak dimension;
- commitment/proof transcripts where a challenge is reused, predictable, malleable, or not bound to the statement.

A word such as “lattice” is not sufficient evidence. First inventory dimensions, moduli, leak bounds, sample count, noise model, and the exact verifier.

## First Safe Checks

1. Normalize every equation and record modulus, signedness, endian, and unknown bounds.
2. Test cheap eliminations first: repeated nonce, direct linear algebra, gcd/shared factors, exact small-root bounds, and a toy instance.
3. Estimate whether the instance is actually small enough. Do not launch LLL/BKZ because a library is available.
4. Preserve the challenge verifier and define the expected success predicate before solving.

## Attack Selection

| Shape | First bounded route | Main failure signal |
| --- | --- | --- |
| ECDSA/DSA partial nonce or biased nonce | HNP formulation, then LLL/BKZ; use Babai/CVP for bounded recovery | too few samples, wrong leak alignment, or bounds larger than claimed |
| Small modular errors / hidden short vector | lattice embedding; compare reduced vectors against known bounds | no vector satisfies all original equations |
| Subset-sum / knapsack | density check, meet-in-the-middle for small n, then lattice only if justified | density or dimension makes the embedding meaningless |
| Truncated LCG / linear PRNG | derive modular inequalities and solve a bounded system; use lattice only after state/bounds are proven | output truncation or modulus was mis-modeled |
| LWE / Ring-LWE / Module-LWE | identify scheme parameters and noise distribution; test toy recovery or known weak parameter attack | normal parameters with no challenge-specific weakness |
| Fiat-Shamir / ZKP transcript | check transcript binding, challenge derivation, commitment reuse, response consistency, and subgroup/domain checks | forged transcript fails the native verifier |

Use LLL for a moderate integer basis, BKZ only when dimension/quality requires it, and Babai/CVP only after the target vector and norm assumptions are explicit. Record lattice dimension, block size, scaling, determinant/orthogonality assumptions, and candidate residuals.

## HNP / Signature Notes

For each signature, write the exact relation (for example `s*k = h + r*x mod q`) and mark which bits of `k` are known. Never silently treat a nonce prefix as a suffix, or signed bounds as unsigned. Reconstruct the public-key verification equation independently; a recovered private key is still only a candidate until a signature or challenge oracle accepts it.

## ZKP / Transcript Notes

Check whether the challenge is derived from the exact statement, commitment, domain separator, and transcript. Look for challenge reuse, omitted fields, malleable serialization, missing subgroup checks, and response equations that do not bind to the same commitment. A transcript that “looks valid” is not proof: replay it through the supplied verifier and compare rejection behavior with a minimally mutated control transcript.

## Evidence and Stop Rules

Keep a ledger containing equations, parameter source, bounds, solver settings, candidate residuals, and verifier output. Stop and pivot to `ctf-rev`, `ctf-misc`, or `ctf-forensics` when the decisive weakness is runtime parsing, protocol state, or artifact extraction rather than mathematics. Stop when the instance is underdetermined, parameters are normal, or success depends on guessed flag formatting.

## Flag Boundary

Classify recovered text through `ctf-common/references/flag-identification-rules.md`. A lattice vector, private key, hash, plaintext fragment, or verifier-looking transcript is an `untrusted_hint` or `flag_candidate` until an independent exact/file/service oracle passes. Do not write `agent_flag.txt` from a solver printout alone.
