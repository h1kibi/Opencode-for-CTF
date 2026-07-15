# Failure: Coppersmith without bounds

- family: failure
- category: crypto
- trigger: lattice/Coppersmith route is proposed, but exact polynomial form, small-root assumptions, or unknown bounds are not written down
- misleading signal: challenge looks advanced enough that advanced algebra feels automatically justified
- wrong behavior: jumps into Sage/lattice implementation before proving that the target unknown is actually small enough and the polynomial model is correct
- damage: burns time on mathematically respectable but strategically invalid branches
- correction rule: state the exact polynomial, unknown, and numerical bounds before any lattice implementation
- better next probe: write the precondition table and test whether the small-root assumptions are even plausible for the real parameter sizes
