# LLMUID — Identifiers Designed for LLM Pipelines

> Identifiers that resist hallucination, survive repeated LLM copying, and
> repair themselves when damaged — or fail honestly when they can't.

By Philippe Paquet

This document is the design specification: it describes *what* the scheme
guarantees and *why*, independent of any language or library. The
implementations live in their own repositories — [llmuid-php][php],
[llmuid-python][python] and [llmuid-javascript][javascript] — and are graded
against the conformance vectors in [`vectors/`](vectors/), which live here
beside the specification because they belong to no single language.

[php]: https://github.com/philippelyp/llmuid-php
[python]: https://github.com/philippelyp/llmuid-python
[javascript]: https://github.com/philippelyp/llmuid-javascript

## Purpose

LLMUID is an identifier scheme for systems where identifiers must pass through
large language models — read, copied, and re-emitted across many prompt hops.
LLMs are an unreliable transcription channel with failure modes unlike any
traditional transport, and no conventional identifier scheme is designed for
them. LLMUID is designed so that fabricated identifiers are detectable,
common damage is repairable, and everything else fails loudly instead of
misrouting silently.

## The damage model

Understanding how LLMs damage identifiers dictates the entire design.

**Damage arrives in token-sized bursts, not characters.** Models emit text in
tokens covering a few characters each, so a single slip corrupts a short
contiguous run. A **damage event** is one such token-level slip, of four
kinds: a substituted token (a burst of a few wrong characters), a duplicated
token, a dropped token, or a transposition of adjacent material.
Substitutions are by far the most common, followed by deletions, then
duplications; transpositions are rare and mostly enter via humans or OCR in
the loop.

**Damage is bimodal.** Almost all identifiers arrive pristine. A small
fraction arrive with exactly one slip. A far smaller fraction arrive heavily
mangled — the model lost its lock mid-copy, or a pipeline stage rewrote the
text wholesale. Almost nothing arrives in between: two or three independent
honest slips in one short identifier is vanishingly unlikely, so
multi-event damage almost always signals the untrustworthy regime.

**Delimiter damage is constant and separate.** Punctuation is the most
"corrected" part of any string: hyphens are swapped for dashes or
underscores, stripped entirely, spaced, doubled, or moved. This happens far
more often than payload damage and must be planned for as routine.

**Two threats sit outside transcription noise.** Models *fabricate*
plausible-looking identifiers when a pattern invites completion, and they
occasionally *substitute* one genuine identifier for another seen elsewhere
in context. The second is the most dangerous failure of all, because the
result is well-formed and no amount of per-identifier robustness can catch
it alone.

## The identifier

An LLMUID is a fixed-length string of symbols drawn from a restricted
alphabet: digits and consonants only, uppercase only, with visually ambiguous
characters excluded. The symbols are grouped by a delimiter into short, fixed
chunks. Most symbols carry a random payload; a small fixed number are check
symbols computed from the payload.

Example shape: `K7-M3-XR-9D-Q2`

Each property answers the damage model directly:

- **Random payload** — sequential or patterned identifiers invite models to
  invent the "next" one. Randomness removes the pattern to extrapolate. It
  has a second consequence: the set of issued identifiers is vanishingly
  sparse in the space of possible strings, which is what later makes repair
  reliable.
- **Check symbols** — a fabricated identifier fails validation with very
  high probability, making invention mechanically detectable without
  consulting any external system.
- **No vowels, no lowercase, no lookalikes** — identifiers can never spell
  words (so they inject no concepts into prompts), can never be case-folded
  into a different identifier, and can never be misread across ambiguous
  glyphs.
- **Fixed length, fixed grouping** — any insertion, deletion, or truncation
  changes the length and is detectable on sight, and every identifier in a
  text is extractable with a single trivial pattern.
- **Short and chunked** — short opaque strings chunked into small groups are
  what LLMs copy most faithfully, and each identifier costs only a handful
  of tokens, so thousands fit in one prompt.
- **Group size aligned to model tokenization** — since damage arrives in
  token-sized bursts, aligning chunk boundaries with typical token
  boundaries makes one damage event correspond to one damaged chunk rather
  than several.
- **Delimiters carry no information** — because delimiter damage is routine,
  no payload bit, check bit, or parsing decision may depend on delimiter
  presence, position, count, or character. Delimiters exist only to help the
  model chunk its output. Writing is strict — one canonical rendering;
  reading is liberal — every degraded delimiter form is accepted.

### Scheme version 1

The properties above are the design intent; interoperability requires exact
parameters. Scheme version 1 fixes them:

- **Alphabet — 29 symbols, a prime count:** the digits `0–9` and the
  consonants `B C D F G H J K M N P Q R S T V W X Z`. Excluded: the vowels
  and `Y`, so identifiers can never spell words, and `L`, which is visually
  ambiguous with `1` and `I`. (`I`, `O`, and `U` are excluded twice over —
  as vowels and as lookalikes of `1`, `0`, and `V`.)
- **Symbol values:** digits map to their numeric values `0–9`; the letters
  map, in the order listed, to `10–28`. This mapping is what the
  check-symbol arithmetic operates on.
- **Length:** 10 symbols — 8 random payload symbols followed by 2 check
  symbols.
- **Canonical rendering:** five groups of 2 symbols joined by the ASCII
  hyphen-minus: `K7-M3-XR-9D-Q2`.
- **Context derivation:** when check symbols are bound to a context, the two
  required sum values of the check-symbol code (below) are derived from it.
  The context is canonicalized over its UTF-8 bytes — bytes from the set
  space, tab, line feed, carriage return, NUL and vertical tab trimmed from
  either end, ASCII letters lowercased, every interior run of space, tab,
  line feed, carriage return, form feed or vertical tab collapsed to one
  space — and a context that canonicalizes to the empty byte string, no
  context at all included, fixes both required values at zero. Any other
  canonical form is hashed with SHA-256; the first eight bytes of the
  digest, read as two big-endian 32-bit words and reduced modulo 29, are
  the required values — the first word for the plain sum, the second for
  the position-weighted sum.
- **Versioning:** these parameters form one versioned unit. A change to any
  of them — alphabet, length, split, grouping — is a new scheme version
  with freshly re-derived guarantees, never a configuration option. In
  particular: the prime alphabet size and the tokenization-aligned group
  size are load-bearing, and the identifier length is a safety margin, not
  slack for a future optimization to harvest.

## Emitting identifiers

The write path is short but not optional. Identifiers are always emitted in
canonical rendering, wrapped in a consistent quoting mark (backticks, in
Markdown-flavored prompts) that signals *opaque literal, not prose*. Every
prompt that carries identifiers also carries a standing instruction: strings
matching this pattern must be copied character for character, never
abbreviated, never invented. And identifiers are only ever created by
minting — no component, human or model, composes one by hand.

The instruction is reinforcement, not a guarantee: models follow it
imperfectly. Its purpose is to lower the damage rate; the validation layers
are what make the remaining damage safe, and the checksum doubles as the
audit of how well the instruction held.

## The damage contract

**Any single damage event is silently repaired. Anything more is a failure.**

Repair means matching a damaged candidate against the registry of issued
identifiers by edit distance — counting substitutions, insertions,
deletions, and adjacent transpositions as one operation each, a measure that
natively handles all four event types. Under scheme version 1 the radius has
an exact value: a substituted, duplicated, or dropped token touches at most
two symbols, and a transposition costs one, so **one damage event costs at
most 2 edit operations, and the single-event radius is edit distance 2.**
That one constant is the contract's entire tunable surface. Under this
contract:

- A candidate within edit distance 2 of exactly one issued identifier
  is repaired, silently and unconditionally. Because the issued set is so
  sparse, the chance that damage lands a candidate nearer to the *wrong*
  identifier is negligible at this radius.
- Any candidate further away is a **hard failure** — flagged, never guessed
  at, regardless of how confident a guess might look.

### Why this contract

It is shaped by the bimodal damage distribution. The single-event budget
captures essentially all honest noise, while everything beyond it is
overwhelmingly the mangled regime — where a repair would be a plausible
wrong answer, the one outcome the system must never produce. The contract
turns that boundary into an invariant: **every repaired identifier differed
from its source by one localized slip.** Downstream systems can rely on it
absolutely, and the implementation reduces to one distance threshold with no
special cases.

### Operational requirements the contract imposes

- **A defined failure path.** Tightening repair does not reduce damage; it
  reclassifies it. The system embedding LLMUID must know what it does when
  validation fails — typically retry, re-fetch from the source of truth, or
  drop the item. If failure has no answer, the strict contract is not safe.
- **Per-hop validation.** The single-event budget holds per validated
  segment. Identifiers must be validated and re-emitted canonically at every
  pipeline hop under the system's control, so damage never accumulates
  across hops.
- **Telemetry falls out for free.** Single-event repairs indicate gradual
  channel degradation (contexts too long, too many identifiers, model
  change). Failures indicate a systematic pipeline fault, because honest
  noise almost never produces multi-event damage. The two streams separate
  the two causes cleanly.

## Validation and repair, step by step

The read path applies the contract in four layers, each with one job:

1. **Normalization.** Uppercase the candidate — ASCII case folding only,
   since full Unicode folding can conjure alphabet symbols out of
   codepoints no alphabet symbol produced — and strip every character not
   in the alphabet. All delimiter and wrapping damage costs nothing from
   this point on. Extraction from surrounding text is deliberately liberal —
   degraded forms must be *found* before they can be repaired — and the
   later layers filter any false candidates this admits.
2. **Length routing.** The normalized string's length routes the candidate;
   it does not by itself reject. At exactly canonical length, the checksum
   applies next. Within two symbols of canonical length — one token's worth
   long or short, meaning an insertion or deletion occurred — the checksum
   is skipped: it is a positional code, meaningless when symbols have
   shifted, and the candidate goes directly to registry repair. Beyond that
   window, the damage exceeds the single-event budget by construction and
   the candidate is a hard failure. Length deviation is itself diagnostic:
   it reveals which damage type occurred. Groups are always derived by
   counting symbol positions, never by splitting on delimiters.
3. **Checksum.** For canonical-length candidates only. A pass, confirmed by
   a registry membership lookup, accepts the identifier — the common,
   pristine case. The membership lookup is deliberate: the checksum rejects
   fabrications with very high probability, but a small residual of
   fabricated or mangled strings will satisfy it by chance, and the registry
   is the final authority on what exists. A checksum failure falls through
   to registry repair rather than rejecting: the damage was a substitution,
   or an insertion and deletion that happen to restore the length while
   shifting the symbols between them.
4. **Registry repair.** The authoritative layer: find the nearest issued
   identifier by edit distance, and accept only if exactly one lies within
   the single-event radius of 2. Before accepting, the match's check
   symbols are re-verified under the context of the *current* resolution.
   This step is essential and easy to overlook: a genuine identifier
   swapped into the wrong role fails the context-bound checksum — but
   without re-verification here, it would fall through to repair, match
   itself in the registry at distance zero, and be silently accepted,
   defeating the swap defense through the back door. A context mismatch is
   therefore its own failure kind — wrong context — never a repair.
   Anything else outside the radius, or ambiguous within it, is a hard
   failure.

Registry repair is not a single named algorithm but a composition of three
standard, well-studied components. The distance metric is
**Damerau-Levenshtein distance** — in its restricted form, optimal string
alignment — which prices substitutions, insertions, deletions, and adjacent
transpositions at one operation each, matching the four damage event types
exactly. The search is **fixed-radius nearest-neighbor search in a metric
space**: a linear scan at small scale, with standard accelerating
structures (BK-trees, length bucketing, n-gram prefiltering) available
behind the registry interface at larger scale — the same machinery as a
spell-checker, with the registry as the dictionary. The acceptance rule is
**bounded-distance decoding with unique decoding** from coding theory:
accept only when exactly one codeword lies within the radius, and report
failure otherwise — deliberately chosen over maximum-likelihood decoding,
which always picks the nearest match and therefore guesses. The underlying
safety argument — randomly drawn identifiers in a vast space are far apart
with overwhelming probability — is the classical random-coding argument.
The composition is specific to this design; every ingredient is textbook
material, and these are the terms to search for.

## The check-symbol code

The check symbols are a **minimum-distance-3 Reed-Solomon-style code** over
the 29-symbol alphabet. Because the alphabet size is prime, the field
arithmetic is ordinary modular arithmetic: the two check symbols are chosen
so that two sums of all the identifier's symbols — one plain, one weighted
by distinct nonzero position indices — both come out to a required value
modulo 29. Scheme version 1 fixes the weights of the second sum as the
symbol positions 1 through 10.

### Why this code

The checksum's job description dictates the choice. A canonical-length
candidate that passes the checksum is accepted, so **any damage the checksum
misses at canonical length becomes a silently accepted corrupted string** —
the one outcome the system exists to prevent. The question is therefore:
what can a single damage event do to a canonical-length string? Exactly two
things: substitute one token (a burst of up to two adjacent symbols, given
token-aligned grouping) or transpose adjacent material. Both are errors of
at most two symbols — and a distance-3 code detects **all** one- and
two-symbol errors unconditionally, not probabilistically. Every
single-event corruption at canonical length is guaranteed to be caught and
routed to repair; nothing the contract covers can slip through as pristine.

Against fabrication, both sums must hold simultaneously, so an invented
string passes at roughly 1 in 841 — and the registry membership lookup
closes that residual.

Three properties of the construction are load-bearing:

- **Context binding is native.** Binding an identifier to its slot, role,
  or parent means deriving the two required sum values from that context
  instead of using fixed ones. Same arithmetic, same guarantees, and an
  identifier resolved under the wrong context fails validation — the
  swap defense costs nothing extra. The derivation must be deterministic
  over a canonical encoding of the context, applied identically at mint
  and at resolve: two components that spell the same context differently
  have, in effect, two different contexts. Scheme version 1 fixes the
  encoding and the derivation exactly, above.
- **The prime alphabet size is what makes the code trivial.** With a prime
  number of symbols, the field arithmetic is plain modular arithmetic. The
  alphabet and the code must therefore be changed together or not at all: an
  "improved" alphabet of 30 or 32 symbols would silently destroy the
  arithmetic this code rests on.
- **Correction capability exists but is unused.** Distance 3 could correct
  one symbol without the registry. The design deliberately leaves this
  dormant — registry repair is the workhorse — but the capability costs
  nothing and remains available if a no-registry validation point ever
  becomes a requirement.

## The registry

The registry — the set of all identifiers ever minted — is **append-only**.
Identifiers are never removed: resolution must give the same answer for the
same text no matter when it runs, and emitted text containing an identifier
can outlive any decision to stop using it. Retiring an identifier is an
application-level state — "no longer active" — not a registry operation; a
retired identifier still resolves, and the application decides what that
resolution means.

**Minting enforces separation.** Each newly drawn identifier is checked
against the registry: if it lies within twice the repair radius — edit
distance 4 or less — of any existing identifier, it is discarded and
redrawn. Random draws in a space of hundreds of billions make such a
collision vanishingly rare, so the check almost never triggers. Its value is
what it converts: the sparsity argument stops being a statistical
expectation and becomes an enforced invariant — no two issued identifiers
are ever close enough for one damage event to make a candidate ambiguous
between them, or to carry a candidate out of its origin's radius and into
another's. Mis-repair within the contract is then ruled out by
construction, not merely improbable.

**Capacity and scaling.** The payload space holds 29⁸ — roughly five
hundred billion — possible identifiers, and the scheme is comfortable from
thousands to millions issued. Repair safety degrades only logarithmically as
the registry grows, and the separation invariant holds regardless of size.
If a deployment ever grows to where mint-time redraws become frequent, the
remedy is one additional payload symbol — a factor of 29 in space — adopted
as a new scheme version.

## Known limit: valid-identifier substitution

The wrong-identifier swap from the damage model — a genuine, checksum-passing,
registered identifier in the wrong place — passes every layer above, because
nothing about the string itself is wrong. Where this matters, check symbols
should be bound to context (the slot, role, or parent the identifier belongs
to), so a valid identifier pasted into the wrong role fails validation. This
converts the worst silent error into a detectable one. Note that the defense
is only as strong as its weakest layer: the re-verification step inside
registry repair is what keeps a wrong-context identifier from being
"repaired" back to itself after failing the checksum — bind the checksum
without that step, and the swap defense is quietly bypassed.

## Non-goals

LLMUID is **not a security mechanism**. The random payload makes identifiers
statistically unguessable, but not cryptographically so, and the check
symbols are public arithmetic anyone can compute. Identifiers must never be
used as secrets, capabilities, or bearer tokens, and possession of a valid
identifier must never grant authority. The adversary in this design is a
hallucinating model, not an attacker; authentication and authorization
belong to other layers, and nothing here substitutes for them.

## Alternatives considered

Several natural-looking alternatives were evaluated and rejected. The
reasoning is recorded here because most of them look attractive at first
glance — if you're about to propose one of these, this section explains
what it runs into.

- **UUIDs.** Long (~15–20 tokens each), no error detection, monotonous hex in
  which single-symbol drift is invisible, and so common in training data that
  models fabricate plausible ones freely. Fails every design goal.
- **Sequential or structured identifiers.** Maximally hallucinatable — the
  model completes the pattern.
- **Word-based encodings** (mnemonic word lists, adjective-noun schemes).
  Human-friendly, but words inject semantic content into prompts and invite
  the model to "improve" them.
- **Exotic Unicode delimiters or wrappers.** Tokenize inconsistently and are
  mangled by intermediate text systems. Plain ASCII only.
- **Delimiter-dependent parsing.** Splitting on delimiters, or validating
  delimiter positions, was rejected: delimiter damage is the most frequent
  damage of all and must cost nothing. Delimiters are presentation.
- **A two-event repair budget** (silent repair of one event, confidence-
  checked repair of two). Workable, but the two-event corner required either
  longer identifiers, a stronger correcting code, or a threshold carve-out —
  each hiding its safety assumption somewhere fragile (a length margin a
  future optimization could harvest; rarely-executed correction code coupled
  to tokenizer behavior; fine print in the contract). The traffic it
  additionally repairs is on the order of one identifier in a hundred
  thousand, and skews toward the untrustworthy mangled regime anyway. The
  strict single-event contract plus a cheap failure path delivers a stronger
  guarantee at lower complexity.
- **Offline multi-token error correction** (stronger algebraic codes). Only
  justified when identifiers must be repaired with no registry access. The
  correction path executes so rarely that its bugs ship unnoticed, and its
  guarantees are coupled to tokenizer behavior that changes across model
  versions. This trade-off only makes sense if your architecture requires a
  validation point with no registry access — and even then, only paired with
  continuous corruption-injection testing to keep the rarely-exercised
  correction path honest.
- **Classic check-digit algorithms for the check symbols** (Damm, Verhoeff,
  Luhn). Designed for human transcription errors and built around a single
  check symbol, so fabricated identifiers pass at roughly 1 in 29 — far too
  weak — and none extends cleanly to two check symbols with proven
  guarantees. They solve a smaller problem than this one.
- **Generic modulus checksums for the check symbols** (ISO 7064-style,
  IBAN's approach). Comparable fabrication resistance, but no guarantee of
  detecting all two-symbol bursts — the one guarantee the fast-accept path
  depends on, since a substituted token corrupts two adjacent symbols. The
  chosen code is strictly stronger at identical cost.
- **CRC for the check symbols.** Bit-oriented, while the damage model is
  symbol- and token-oriented over a 29-symbol alphabet. Mapping symbols to
  bits destroys the burst-alignment guarantees the format was designed
  around. Wrong granularity.
- **Truncated cryptographic MAC for the check symbols.** Attractive because
  context binding falls out trivially, but a MAC detects everything only
  *probabilistically* — a two-symbol burst would pass at the same 1-in-841
  rate as random garbage, instead of never. That trades away the one
  guaranteed detection property for adversarial resistance the threat model
  does not need: the adversary is a hallucinating model, not a cryptanalyst.
- **Accepting on checksum pass without registry confirmation.** Faster by
  one lookup, but leaves a roughly 1-in-841 residual where a fabricated or
  mangled string is accepted as pristine. The registry is the final
  authority on what exists; the checksum's role is to reject most garbage
  cheaply and separate "fabricated" from "damaged" in telemetry, not to
  have the last word.
- **Repair beyond the budget when confidence looks high.** Rejected. A
  heavily damaged string that happens to sit near one issued identifier is
  exactly the case most likely to be a wrong-identifier swap or a rewrite.
  "Detected failure" is never traded for "plausible answer."

## Design goals (summary)

- Fabrication is hard and mechanically detectable.
- Verbatim survival across many model hops is maximized.
- Identifiers carry no linguistic meaning.
- Thousands fit in a single prompt at acceptable token cost.
- Damage is assumed to arrive in token-sized bursts.
- One damage event repairs silently; anything more fails, honestly.
- Delimiters and wrapping are presentation only; reading is liberal,
  writing is strict.
- Well-formed identifiers in the wrong role are detectable via context
  binding.
- Identifiers survive ordinary text pipelines, not just the model.
- Validation and canonical re-emission happen at every controllable hop.
- The registry is append-only, and minting enforces a minimum separation
  that makes mis-repair impossible by construction.
- Scheme parameters are versioned as a single unit, never configured.
- Identifiers are not secrets: LLMUID is not a security mechanism.
