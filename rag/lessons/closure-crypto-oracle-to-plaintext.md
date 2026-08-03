# closure-crypto-oracle-to-plaintext

## Trigger
- A cryptographic oracle, structural weakness, partial key recovery, parameter failure, or decoding primitive is confirmed.

## Why it looks promising
- The challenge is no longer about broad vulnerability discovery; it is about finishing the math or protocol extraction.

## What usually goes wrong
- The solver keeps collecting side facts instead of finishing the cheapest attack that yields plaintext, key material, or a forgeable message.

## Better question
- What is the minimal remaining unknown between the current primitive and a decodable/forgeable final artifact?

## First corrective probe
- Write the smallest working solve skeleton and validate one intermediate invariant or recovered chunk.

## Closure queue
1. plaintext or key recovery completion
2. message/flag formatting
3. forged response or token generation
4. one protocol replay if interactive
5. clean solver verification

## Stop rule
- Once the oracle/weakness is real, stop broad reconnaissance and finish the attack.
